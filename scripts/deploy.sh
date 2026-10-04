#!/usr/bin/env bash
#
# Ships build/ to the server, keeping the last few builds to roll back to.
#
# The whole procedure lives here rather than in a README list, because the two
# steps that are easy to skip are the two that hurt: `verify:build`, which is
# the only thing standing between a green build and half the app returning 500,
# and the backup, which is the difference between a ten-second rollback and a
# rebuild under pressure.
#
#   npm run deploy              # build, verify, back up, ship, restart, check
#   npm run deploy -- --dry-run # say what would happen, touch nothing
#   npm run deploy -- --skip-build
#
# The server holds no node_modules: build/ must be self-contained, which is what
# verify:build enforces. Environment variables are managed by hand on the server
# and are deliberately not touched here — a deploy script that rewrites .env is
# a deploy script that can take the site down with a typo in a secret.
#
# Pending migrations are checked before shipping; readiness verifies schema compatibility.
set -euo pipefail

HOST="${DEPLOY_HOST:-digital}"
APP="${DEPLOY_PATH:-/home/admin/apps/stock-management}"
SERVICE="stock-management"
PORT="${DEPLOY_PORT:-3020}"
# How many previous builds to keep. Each is a hardlink copy, so a backup that
# shares every file with the live build costs almost nothing; only the files a
# deploy actually changed occupy their own blocks.
KEEP="${DEPLOY_KEEP:-2}"

DRY_RUN=0
SKIP_BUILD=0
for arg in "$@"; do
	case "$arg" in
	--dry-run) DRY_RUN=1 ;;
	--skip-build) SKIP_BUILD=1 ;;
	*)
		echo "unknown option: $arg" >&2
		exit 2
		;;
	esac
done

say() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }
run() {
	if [ "$DRY_RUN" = 1 ]; then
		printf '   would run: %s\n' "$*"
	else
		"$@"
	fi
}

[ "$KEEP" -ge 1 ] || {
	echo "DEPLOY_KEEP must be at least 1 — something has to be left to roll back to" >&2
	exit 2
}

# ---------------------------------------------------------------- preflight
say "Checking $HOST is reachable"
ssh -o BatchMode=yes -o ConnectTimeout=15 "$HOST" "test -d '$APP'" ||
	{
		echo "cannot reach $HOST, or $APP is missing" >&2
		exit 1
	}
echo "   ok"

# ---------------------------------------------------------------- build
if [ "$SKIP_BUILD" = 1 ]; then
	say "Skipping build (--skip-build)"
	[ -f build/handler.js ] || {
		echo "build/ has no handler.js — nothing to ship" >&2
		exit 1
	}
else
	say "Building"
	run npm run build
fi

# Always, even with --skip-build: the check is cheap and the failure it catches
# is silent in production.
say "Verifying the bundle is self-contained"
run npm run verify:build

say "Checking schema compatibility before replacing the running build"
run npm run db:migrate:remote -- --check

# ---------------------------------------------------------------- back up
TS="$(date +%Y%m%d-%H%M%S)"
say "Backing up the running build as build.bak.$TS"
# cp -al is a hardlink copy: near-instant, and near-zero disk for files the next
# deploy does not replace. The first deploy has nothing to back up.
run ssh "$HOST" "cd '$APP' && { [ -d build ] && cp -al build 'build.bak.$TS' || echo '   (no build yet — first deploy)'; }"

# ---------------------------------------------------------------- prune
#
# After the backup, not before, so the count includes the one just made.
#
# Sorted by name, which is why every backup is `build.bak.<timestamp>` and
# nothing else: the timestamps sort lexicographically, but only while the prefix
# is identical. A one-off `build.bak-deploy-...` sorts *before* every
# `build.bak....` whatever its date — `-` is 0x2D and `.` is 0x2E — so it would
# have been read as the newest and kept forever while real backups aged out
# around it.
say "Keeping the newest $KEEP backup(s)"
#
# Only `build.bak.*` is pruned. Anything else that looks like a backup is
# reported and left alone: deleting a directory this script did not create, on
# the strength of a name that merely resembles one, is not a risk worth taking
# to save a few megabytes.
# shellcheck disable=SC2029
run ssh "$HOST" "cd '$APP' && \
	ls -1d build.bak.* 2>/dev/null | sort -r | tail -n +$((KEEP + 1)) | while read -r d; do echo \"   removing \$d\"; rm -rf -- \"\$d\"; done; \
	echo \"   kept: \$(ls -1d build.bak.* 2>/dev/null | sort -r | tr '\n' ' ')\"; \
	for d in build.bak-* build.broken; do [ -e \"\$d\" ] && echo \"   note: \$d is not named build.bak.<timestamp>, so it is left alone — remove it by hand when you are done with it\"; done; true"

# ---------------------------------------------------------------- ship
say "Syncing build/ to $HOST:$APP/build/"
if [ "$DRY_RUN" = 1 ]; then
	rsync -az --delete --dry-run --stats build/ "$HOST:$APP/build/" | grep -E 'files transferred|deleted' || true
else
	rsync -az --delete build/ "$HOST:$APP/build/"
fi

# ---------------------------------------------------------------- restart
#
# SIGTERM rather than `systemctl restart`, which would ask for a password the
# deploying user does not have. The unit is Restart=always with RestartSec=3 and
# server.js closes cleanly on SIGTERM, so systemd brings it straight back.
#
# The pattern names this app's server.js, so the other Node apps the box runs as
# `admin` are left alone; the bracket in "[s]erver" keeps it from matching the
# shell that ssh started to run it — without it the kill takes down its own
# session, ssh exits 255, and a successful restart reports as a failure.
say "Restarting $SERVICE"
run ssh "$HOST" "kill -TERM \$(pgrep -u admin -f '$APP/[s]erver\.js') 2>/dev/null || true"

if [ "$DRY_RUN" = 1 ]; then
	say "Dry run — nothing was changed"
	exit 0
fi

# ---------------------------------------------------------------- verify
say "Waiting for it to come back"
for i in $(seq 1 20); do
	sleep 2
	if ssh "$HOST" "curl -sf --max-time 5 http://127.0.0.1:$PORT/health/ready" 2>/dev/null | grep -q '"status":"ok"'; then
		echo "   healthy after $((i * 2))s"
		HEALTHY=1
		break
	fi
	printf '   ...%ss\n' "$((i * 2))"
done

if [ "${HEALTHY:-0}" != 1 ]; then
	echo
	echo "✗ $SERVICE did not report healthy." >&2
	echo "  Logs:     ssh $HOST 'journalctl -u $SERVICE -n 50 --no-pager'" >&2
	echo "  Rollback: ssh $HOST \"cd '$APP' && mv build build.broken && cp -al build.bak.$TS build && kill -TERM \\\$(pgrep -u admin -f '$APP/[s]erver\.js')\"" >&2
	exit 1
fi

# Loopback only proves the public surface: session cookies are Secure, so a
# sign-in over plain http silently fails and every dashboard route answers 303.
# Anything involving a session has to be checked through the real origin.
ORIGIN="$(ssh "$HOST" "grep -E '^ORIGIN=' '$APP/.env' | cut -d= -f2- | tr -d '\"'" 2>/dev/null || true)"
if [ -n "$ORIGIN" ]; then
	say "Checking the public surface over $ORIGIN"
	for path in / /login /health /health/ready; do
		code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$ORIGIN$path" || echo 000)"
		printf '   %-10s %s\n' "$path" "$code"
		[ "$code" = 200 ] || exit 1
	done
	echo
	if [ -n "${DEPLOY_SMOKE_EMAIL:-}" ] && [ -n "${DEPLOY_SMOKE_PASSWORD:-}" ]; then
		SMOKE_ORIGIN="$ORIGIN" node scripts/smoke.mjs
	else
		echo "   Authenticated smoke check not configured: set DEPLOY_SMOKE_EMAIL and DEPLOY_SMOKE_PASSWORD." >&2
		exit 1
	fi
fi

say "Deployed"
echo "   Rollback: ssh $HOST \"cd '$APP' && mv build build.broken && cp -al build.bak.$TS build && kill -TERM \\\$(pgrep -u admin -f '$APP/[s]erver\.js')\""
