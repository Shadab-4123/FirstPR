#!/usr/bin/env bash
# Run the k6 load test against a local API on the 200k-issue bench database.
#
#   perf/load/run.sh after                  # indexes as in production
#   perf/load/run.sh before off             # same data, search indexes dropped first
#
# The API runs like production (one uvicorn process, INFO logs), pinned to a single
# CPU core so a 16-core laptop doesn't flatter it. k6 runs on the other cores.
# Needs scripts/dev-db.sh running, the bench DB seeded (perf/bench_queries.py --seed),
# backend/.venv, and k6 on PATH (or K6=/path/to/k6).
set -euo pipefail

LABEL=${1:?usage: run.sh LABEL [on|off]}
INDEXES=${2:-on}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PORT=${PORT:-8765}
K6=${K6:-k6}
BENCH_DATABASE_URL=${BENCH_DATABASE_URL:-postgresql+psycopg://firstpr@localhost:5433/firstpr_bench}
OUT="$ROOT/perf/load/results"
mkdir -p "$OUT"

cd "$ROOT/backend"
# shellcheck disable=SC1091
source .venv/bin/activate
BENCH_DATABASE_URL=$BENCH_DATABASE_URL python ../perf/load/indexes.py "$INDEXES"

DATABASE_URL=$BENCH_DATABASE_URL LOG_LEVEL=INFO \
  taskset -c 0 uvicorn app.main:app --port "$PORT" >"$OUT/$LABEL.api.log" 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT

for _ in $(seq 50); do
  curl -sf "http://localhost:$PORT/api/v1/health" >/dev/null && break
  sleep 0.2
done
curl -sf "http://localhost:$PORT/api/v1/health" >/dev/null || { echo "API didn't start"; exit 1; }

cd "$ROOT"
taskset -c 1-$(($(nproc) - 1)) "$K6" run --quiet \
  -e BASE_URL="http://localhost:$PORT" -e LABEL="$LABEL" -e OUT_DIR="$OUT" \
  perf/load/search.js
