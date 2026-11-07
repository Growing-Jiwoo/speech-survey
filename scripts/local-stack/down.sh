#!/usr/bin/env bash
# scripts/local-stack/down.sh — 앱(있으면)·게이트웨이·PostgREST·Postgres를 멈춘다. 데이터(.data)는 남긴다.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

stop_pidfile "$RUN_DIR/app.pid" 앱
stop_pidfile "$RUN_DIR/gateway.pid" 게이트웨이
stop_pidfile "$RUN_DIR/postgrest.pid" PostgREST
if [ -f "$PGDATA_DIR/PG_VERSION" ] && "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
  LC_ALL=C "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" -m fast -w stop >/dev/null
  log "Postgres 중지"
fi
log "전부 내렸다"
