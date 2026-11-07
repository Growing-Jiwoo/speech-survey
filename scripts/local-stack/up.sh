#!/usr/bin/env bash
# scripts/local-stack/up.sh — Postgres 17(54329) + PostgREST(54321) + 게이트웨이(54320)를 백그라운드로 띄운다.
# 처음이면 DB를 만들고 bootstrap.sql → supabase/migrations/[0-9]*.sql(번호 순, 고치지 않고)을 적용한다.
# 이미 떠 있으면 건너뛰고, 지금 체크아웃된 브랜치에 아직 적용 안 된 마이그레이션 파일이 있으면 그것만 적용한다.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
load_env

[ -x "$PG_BIN/initdb" ] || die "Postgres 17 바이너리가 없다: $PG_BIN (brew install postgresql@17)"
[ -x "$POSTGREST_BIN" ] || die "PostgREST가 없다: $POSTGREST_BIN (brew install postgrest)"

# ── 1. Postgres ──
fresh=0
if [ ! -f "$PGDATA_DIR/PG_VERSION" ]; then
  log "DB 초기화: $PGDATA_DIR"
  "$PG_BIN/initdb" -D "$PGDATA_DIR" -U postgres --auth=trust -E UTF8 --locale=C >"$LOG_DIR/initdb.log" 2>&1 \
    || die "initdb 실패 — $LOG_DIR/initdb.log"
  fresh=1
fi
if "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" status >/dev/null 2>&1; then
  log "Postgres 이미 실행 중 (127.0.0.1:$PG_PORT)"
else
  # TCP(127.0.0.1)만 연다 — 유닉스 소켓을 만들지 않아 다른 Postgres와 소켓 파일이 겹치지 않는다
  # LC_ALL=C — 셸 로캘이 맞지 않으면 postmaster가 「became multithreaded during startup」으로 죽는다
  LC_ALL=C "$PG_BIN/pg_ctl" -D "$PGDATA_DIR" -l "$LOG_DIR/postgres.log" -w \
    -o "-p $PG_PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" start >/dev/null \
    || die "Postgres 시작 실패 — $LOG_DIR/postgres.log"
  log "Postgres 시작 (127.0.0.1:$PG_PORT)"
fi

# ── 2. bootstrap + 마이그레이션 ──
if [ "$fresh" = 1 ] || [ "$(psql_local -tAc "select to_regclass('local_stack.migrations') is null")" = "t" ]; then
  log "bootstrap.sql 적용(Supabase 역할·storage.buckets 흉내)"
  psql_local -1 -f "$STACK_DIR/bootstrap.sql"
fi
applied_any=0
for f in $(ls "$MIGRATIONS_DIR"/[0-9]*.sql | sort); do
  name="$(basename "$f")"
  done_already="$(psql_local -tAc "select 1 from local_stack.migrations where file = '$name'")"
  [ "$done_already" = "1" ] && continue
  log "마이그레이션 적용: $name"
  # 파일 하나를 한 트랜잭션으로 — 실패하면 기록도 남지 않는다
  { cat "$f"; printf "\ninsert into local_stack.migrations(file) values ('%s');\n" "$name"; } \
    | psql_local -1 -f - >"$LOG_DIR/migrate-$name.log" 2>&1 \
    || { cat "$LOG_DIR/migrate-$name.log" >&2; die "마이그레이션 실패: $name"; }
  applied_any=1
done
[ "$applied_any" = 1 ] || log "새로 적용할 마이그레이션 없음 ($(psql_local -tAc 'select count(*) from local_stack.migrations')개 적용됨)"

# ── 3. PostgREST ──
cat >"$RUN_DIR/postgrest.conf" <<EOF
# up.sh가 매번 다시 쓴다
db-uri = "postgres://authenticator@127.0.0.1:$PG_PORT/postgres"
db-schemas = "public,storage"
db-anon-role = "anon"
db-max-rows = 1000
db-channel-enabled = true
server-host = "127.0.0.1"
server-port = $PGRST_PORT
jwt-secret = "$LOCAL_JWT_SECRET"
log-level = "warn"
EOF
chmod 600 "$RUN_DIR/postgrest.conf"
if pid_alive "$RUN_DIR/postgrest.pid"; then
  log "PostgREST 이미 실행 중 — 스키마 다시 읽기"
  psql_local -c "notify pgrst, 'reload schema'"
else
  nohup "$POSTGREST_BIN" "$RUN_DIR/postgrest.conf" >>"$LOG_DIR/postgrest.log" 2>&1 &
  echo $! >"$RUN_DIR/postgrest.pid"
  wait_http "http://127.0.0.1:$PGRST_PORT/" PostgREST
  log "PostgREST 시작 (127.0.0.1:$PGRST_PORT, db-max-rows 1000)"
fi

# ── 4. 게이트웨이 ──
if pid_alive "$RUN_DIR/gateway.pid"; then
  log "게이트웨이 이미 실행 중 (127.0.0.1:$GATEWAY_PORT)"
else
  GATEWAY_PORT=$GATEWAY_PORT PGRST_PORT=$PGRST_PORT LOCAL_STACK_DATA="$DATA_DIR" \
    nohup node "$STACK_DIR/gateway.mjs" >>"$LOG_DIR/gateway.log" 2>&1 &
  echo $! >"$RUN_DIR/gateway.pid"
  wait_http "http://127.0.0.1:$GATEWAY_PORT/__local/health" 게이트웨이
  log "게이트웨이 시작 (http://127.0.0.1:$GATEWAY_PORT)"
fi

log "준비 완료. 앱: scripts/local-stack/app.sh start  (http://localhost:$APP_PORT)"
