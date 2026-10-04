#!/usr/bin/env bash
#
# Applies pending migrations to the server's database, through an SSH tunnel.
#
#   npm run db:migrate:remote            # dry run — says what would happen
#   npm run db:migrate:remote -- --apply # back up, then apply
#
# The scripts in this directory cannot run on the server: the deploy ships only
# `build/` and there is no `npm install` there. So the tunnel exists to run the
# *tested* code path — `drizzle-kit migrate`, the same one the local database
# takes — against production, rather than hand-writing SQL that nothing covers.
#
# Two gotchas are baked in below. The control-socket path has to be short, since
# a Unix socket path is capped at 108 bytes and a scratch directory blows past
# it; and the password out of `.env` is URL-encoded before going into a
# connection string, because a `@` or `/` in it silently truncates the host.
#
# `--apply` takes a `mariadb-dump` first. Restoring is
# `mariadb --skip-ssl -u<user> -p<pw> <db> < <dump>` on the server — note the
# `--skip-ssl`, which the CLI needs through the tunnel and mysql2 does not.
set -euo pipefail

HOST="${DEPLOY_HOST:-digital}"
APP="${DEPLOY_PATH:-/home/admin/apps/stock-management}"
DUMPS="${DEPLOY_DUMPS:-/home/admin/apps/stock-management-deploy}"
SOCKET="$HOME/.ssh/ctl-migrate-$$"
PORT="${TUNNEL_PORT:-13308}"

APPLY=0
CHECK=0
while [ $# -gt 0 ]; do
	case "$1" in
	--apply) APPLY=1 ;;
	--check) CHECK=1 ;;
	*)
		echo "unknown option: $1" >&2
		exit 2
		;;
	esac
	shift
done

say() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }

cleanup() { ssh -S "$SOCKET" -O exit "$HOST" >/dev/null 2>&1 || true; }
trap cleanup EXIT

say "Opening a tunnel to $HOST"
ssh -f -N -M -S "$SOCKET" -L "$PORT:127.0.0.1:3306" "$HOST"
echo "   127.0.0.1:$PORT → $HOST:3306"

# The server's DATABASE_URL, with its host swapped for the tunnel. The .env is
# read on the box and never copied here.
REMOTE_URL="$(ssh -S "$SOCKET" "$HOST" "grep '^DATABASE_URL' '$APP/.env' | cut -d= -f2- | tr -d '\"'")"
DB_USER="$(printf '%s' "$REMOTE_URL" | sed 's|.*mysql://||;s|:.*||')"
DB_PASS="$(printf '%s' "$REMOTE_URL" | sed 's|.*mysql://[^:]*:||;s|@.*||')"
DB_NAME="$(printf '%s' "$REMOTE_URL" | sed 's|.*/||;s|?.*||')"
DB_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")"
export DATABASE_URL="mysql://$DB_USER:$DB_ENC@127.0.0.1:$PORT/$DB_NAME"

say "What the server has now"
if [ "$CHECK" = 1 ]; then
	node scripts/migration-status.mjs --check
else
	node scripts/migration-status.mjs
fi

if [ "$APPLY" != 1 ]; then
	say "Dry run — nothing was changed"
	echo "   Re-run with --apply to back up and migrate."
	exit 0
fi

say "Backing up first"
TS="$(date +%Y%m%d-%H%M%S)"
ssh -S "$SOCKET" "$HOST" "mkdir -p '$DUMPS' && mariadb-dump --skip-ssl -u'$DB_USER' -p'$DB_PASS' '$DB_NAME' > '$DUMPS/$DB_NAME-before-migrate-$TS.sql'"
ssh -S "$SOCKET" "$HOST" "ls -lh '$DUMPS/$DB_NAME-before-migrate-$TS.sql'"

say "Applying"
npx drizzle-kit migrate

say "Done"
echo "   Rollback: ssh $HOST \"mariadb --skip-ssl -u$DB_USER -p'<password>' $DB_NAME < $DUMPS/$DB_NAME-before-migrate-$TS.sql\""
echo "   The app reads the database live — no restart needed."
