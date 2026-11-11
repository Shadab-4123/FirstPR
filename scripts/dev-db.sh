#!/usr/bin/env bash
# Runs a project-local Postgres cluster on port 5433 (no sudo, no Docker needed).
# Usage: scripts/dev-db.sh start|stop|status
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(cd "$(dirname "$0")/.." && pwd)/.pgdata"
PORT="${PGPORT_DEV:-5433}"

case "${1:-start}" in
  start)
    if [ ! -d "$DATA" ]; then
      "$PGBIN/initdb" -D "$DATA" -U firstpr --auth=trust -E UTF8 >/dev/null
      echo "Initialized cluster in $DATA"
    fi
    "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k $DATA -c listen_addresses=localhost" -l "$DATA/server.log" -w start
    for db in firstpr firstpr_test; do
      psql -h localhost -p "$PORT" -U firstpr -d postgres -tc "select 1 from pg_database where datname='$db'" | grep -q 1 \
        || psql -h localhost -p "$PORT" -U firstpr -d postgres -qc "create database $db"
    done
    echo "Postgres ready on localhost:$PORT (databases: firstpr, firstpr_test)"
    ;;
  stop)   "$PGBIN/pg_ctl" -D "$DATA" -m fast stop ;;
  status) "$PGBIN/pg_ctl" -D "$DATA" status ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 1 ;;
esac
