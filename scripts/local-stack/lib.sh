# scripts/local-stack/lib.sh — up/down/reset/seed/app.sh가 함께 쓰는 경로·포트·함수. 직접 실행하지 않는다(source 전용).
#
# 원칙: 운영 Supabase·Resend에 닿지 않는다.
#  - 저장소 루트의 .env.local은 **읽지 않는다**(이 스크립트들은 그 파일을 열지도, source하지도 않는다).
#  - 앱은 저장소 사본(APP_DIR — 저장소 밖, .env* 제외)에서 이 폴더의 .env.local-stack 값만으로 돈다.

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$STACK_DIR/../.." && pwd)"
DATA_DIR="$STACK_DIR/.data"
PGDATA_DIR="$DATA_DIR/pg"
LOG_DIR="$DATA_DIR/logs"
RUN_DIR="$DATA_DIR/run"
# 앱 사본은 저장소 **밖**에 둔다 — 안에 두면 루트의 `npm run lint`(eslint .)가 사본과 그 빌드 산출물(.next)까지 검사하고,
# Next가 「multiple lockfiles」로 작업 공간 루트를 저장소 루트로 잡는다.
APP_DIR="${LOCAL_STACK_APP_DIR:-$HOME/Library/Caches/speech-survey-local-stack/app}"
ENV_FILE="$STACK_DIR/.env.local-stack"
MIGRATIONS_DIR="$REPO_DIR/supabase/migrations"

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
POSTGREST_BIN="${POSTGREST_BIN:-/opt/homebrew/opt/postgrest/bin/postgrest}"

# 포트 — 기본 Postgres(5432)·Supabase CLI(5432x)·앱 dev(3000)와 겹치지 않게
PG_PORT=54329
PGRST_PORT=54321
GATEWAY_PORT=54320
APP_PORT=3100

mkdir -p "$LOG_DIR" "$RUN_DIR"

log() { printf '\033[36m[local-stack]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[local-stack] %s\033[0m\n' "$*" >&2; exit 1; }

psql_local() { "$PG_BIN/psql" -X -q -h 127.0.0.1 -p "$PG_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

# 이 폴더의 env 파일만 읽는다(없으면 gen-env.mjs가 로컬 전용 비밀값으로 만든다)
load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    log ".env.local-stack이 없어 로컬 전용 비밀값을 새로 만든다"
    node "$STACK_DIR/gen-env.mjs" "$ENV_FILE" || die "env 생성 실패"
  fi
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  # 이 스택을 가리키지 않는 SUPABASE_URL이면 멈춘다(실수로 운영 값을 넣은 경우)
  case "${SUPABASE_URL:-}" in
    "http://127.0.0.1:$GATEWAY_PORT") ;;
    *) die "SUPABASE_URL이 로컬 게이트웨이(http://127.0.0.1:$GATEWAY_PORT)가 아니다: .env.local-stack 확인" ;;
  esac
}

pid_alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_pidfile() { # $1=pid 파일 $2=이름
  if pid_alive "$1"; then
    local pid; pid="$(cat "$1")"
    pkill -TERM -P "$pid" 2>/dev/null || true   # 자식 프로세스(next 작업자 등)도
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 50); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
    kill -9 "$pid" 2>/dev/null || true
    log "$2 중지 (pid $pid)"
  fi
  rm -f "$1"
}

wait_http() { # $1=url $2=이름
  for _ in $(seq 1 100); do
    curl -s -o /dev/null --max-time 1 "$1" && return 0
    sleep 0.2
  done
  die "$2 응답 없음: $1 (로그: $LOG_DIR)"
}
