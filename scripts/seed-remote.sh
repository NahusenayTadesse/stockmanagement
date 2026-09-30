#!/usr/bin/env bash
#
# Loads the demo businesses into the server's database, through an SSH tunnel.
#
#   npm run db:seed:remote            # adds whichever of the two stores is missing
#   npm run db:seed:remote -- --fresh # removes both and builds them again
#
# Same reasoning as migrate-remote.sh: the server has no node_modules, so the
# tested seed (`scripts/seed.ts`) runs here against the tunnelled database. The
# tunnel lands on 127.0.0.1, which the seed treats as local, so no override is
# needed. Run the migrations first — the seed writes into the tables they make.
set -euo pipefail

HOST="${DEPLOY_HOST:-digital}"
APP="${DEPLOY_PATH:-/home/admin/apps/stock-management}"
SOCKET="$HOME/.ssh/ctl-seed-$$"
PORT="${TUNNEL_PORT:-13309}"

say() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }
cleanup() { ssh -S "$SOCKET" -O exit "$HOST" >/dev/null 2>&1 || true; }
trap cleanup EXIT

say "Opening a tunnel to $HOST"
ssh -f -N -M -S "$SOCKET" -L "$PORT:127.0.0.1:3306" "$HOST"

REMOTE_URL="$(ssh -S "$SOCKET" "$HOST" "grep '^DATABASE_URL' '$APP/.env' | cut -d= -f2- | tr -d '\"'")"
DB_USER="$(printf '%s' "$REMOTE_URL" | sed 's|.*mysql://||;s|:.*||')"
DB_PASS="$(printf '%s' "$REMOTE_URL" | sed 's|.*mysql://[^:]*:||;s|@.*||')"
DB_NAME="$(printf '%s' "$REMOTE_URL" | sed 's|.*/||;s|?.*||')"
DB_ENC="$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$DB_PASS")"
export DATABASE_URL="mysql://$DB_USER:$DB_ENC@127.0.0.1:$PORT/$DB_NAME"

say "Seeding $HOST:$DB_NAME"
npx tsx --tsconfig scripts/tsconfig.json scripts/seed.ts --yes "$@"

say "Done"
echo "   The permissions table is synced on the first request after a boot, so restart the app:"
echo "   ssh $HOST \"kill -TERM \\\$(pgrep -u admin -f '$APP/[s]erver\.js')\""
