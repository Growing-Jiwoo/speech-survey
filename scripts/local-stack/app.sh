#!/usr/bin/env bash
# scripts/local-stack/app.sh — 앱을 로컬 스택에 붙여 띄운다(http://localhost:3100).
#
#   app.sh start   사본 동기화 → next build → next start(백그라운드, 로그 .data/logs/app.log)   ← 운영과 같은 prod 빌드(CSP 엄격)
#   app.sh dev     사본 동기화 → next dev(포그라운드, Ctrl+C로 끝)
#   app.sh stop    백그라운드 앱 중지
#   app.sh sync    사본 동기화만
#
# 왜 사본에서 돌리나: 저장소 루트에는 운영을 가리키는 .env.local이 있고, Next는 작업 폴더의 .env*를 자동으로 읽는다.
# 이미 설정된 환경변수는 .env 파일이 덮어쓰지 않지만(@next/env — process.env에 키가 있으면 건너뜀), 우리가 모르는 키는
# 채워질 수 있다. 그래서 저장소를 사본 폴더(lib.sh APP_DIR — 저장소 밖)로 복사하되 **.env\* 파일은 아예 복사하지 않는다**(rsync가 열지도 않는다).
# 덤으로 루트의 .next·next-env.d.ts·CLAUDE.md(next dev가 다시 쓴다)를 건드리지 않는다.
# 서버 프로세스에는 fetch-guard.mjs가 먼저 실려 localhost 밖 요청을 막고 Resend를 가짜로 돌린다.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

sync_app() {
  mkdir -p "$APP_DIR"
  # 소스 동기화 — git이 보는 파일(추적 + 무시되지 않은 새 파일, 커밋 안 된 변경 포함)만 옮긴다.
  # .gitignore·.git/info/exclude로 무시되는 것(.env*·node_modules·.next·private/·임시 하네스 등)은 이름 목록만 뽑아 제외한다.
  local ex="$RUN_DIR/sync-exclude.txt"
  { echo '/.git'; echo '/scripts/local-stack/'; echo '.env*'
    git -C "$REPO_DIR" ls-files -oi --exclude-standard --directory | sed 's#^#/#'
  } >"$ex"
  # --delete-excluded: 예전에 옮겨졌다가 이제 무시되는 파일도 사본에서 지운다. 사본 쪽 node_modules·빌드 캐시만 보호(P)
  rsync -a --delete --delete-excluded \
    --filter='P /node_modules/' --filter='P /.next/' --filter='P /public/pdfjs-wasm/' --filter='P /.node_modules.lock-sha' \
    --exclude-from="$ex" "$REPO_DIR/" "$APP_DIR/"
  # 안전 확인: 사본에 .env 파일이 하나라도 있으면 멈춘다
  if find "$APP_DIR" -maxdepth 1 -name '.env*' | grep -q .; then die "사본에 .env 파일이 있다 — 중단"; fi
  # node_modules — APFS 복제(cp -c: 디스크를 거의 안 쓴다). package-lock.json이 바뀌었을 때만 다시 복제
  local want have=""
  want="$(shasum "$REPO_DIR/package-lock.json" | cut -d' ' -f1)"
  [ -f "$APP_DIR/.node_modules.lock-sha" ] && have="$(cat "$APP_DIR/.node_modules.lock-sha")"
  if [ ! -d "$APP_DIR/node_modules" ] || [ "$want" != "$have" ]; then
    [ -d "$REPO_DIR/node_modules" ] || die "저장소에 node_modules가 없다 — 먼저 저장소 루트에서 npm install"
    log "node_modules 복제(APFS clone) — 처음 한 번은 1분쯤 걸린다"
    rm -rf "$APP_DIR/node_modules"
    cp -cR "$REPO_DIR/node_modules" "$APP_DIR/node_modules"
    echo "$want" >"$APP_DIR/.node_modules.lock-sha"
  fi
  log "사본 동기화: $APP_DIR ($(git -C "$REPO_DIR" branch --show-current) @ $(git -C "$REPO_DIR" rev-parse --short HEAD), 커밋 안 된 변경 포함)"
}

# 앱 프로세스 환경: 이 폴더의 env 파일 값 + 안전장치. VERCEL 계열은 지운다.
run_env() {
  env -u VERCEL -u VERCEL_ENV -u VERCEL_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--import=$STACK_DIR/fetch-guard.mjs ${NODE_OPTIONS:-}" \
    "$@"
}

check_stack() {
  curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$GATEWAY_PORT/__local/health" \
    || die "스택이 안 떠 있다 — 먼저 scripts/local-stack/up.sh"
}

cmd="${1:-start}"
case "$cmd" in
  sync) load_env; sync_app ;;
  start)
    load_env; check_stack
    stop_pidfile "$RUN_DIR/app.pid" 앱
    sync_app
    log "next build (로그: $LOG_DIR/app-build.log)"
    ( cd "$APP_DIR" && run_env sh -c 'node scripts/copy-pdfjs-wasm.mjs && node_modules/.bin/next build' ) >"$LOG_DIR/app-build.log" 2>&1 \
      || { tail -40 "$LOG_DIR/app-build.log" >&2; die "빌드 실패"; }
    cd "$APP_DIR"
    # env → nohup → node가 차례로 exec하므로 $!가 곧 next 서버 pid다
    run_env nohup node_modules/.bin/next start -p "$APP_PORT" -H 127.0.0.1 >>"$LOG_DIR/app.log" 2>&1 &
    echo $! >"$RUN_DIR/app.pid"
    cd - >/dev/null
    wait_http "http://127.0.0.1:$APP_PORT/" 앱
    log "앱 시작: http://localhost:$APP_PORT  (관리자 /admin, 로그 $LOG_DIR/app.log)"
    ;;
  dev)
    load_env; check_stack; sync_app
    cd "$APP_DIR" && run_env sh -c "node scripts/copy-pdfjs-wasm.mjs && exec node_modules/.bin/next dev -p $APP_PORT -H 127.0.0.1"
    ;;
  stop) stop_pidfile "$RUN_DIR/app.pid" 앱 ;;
  *) die "사용법: app.sh start|dev|stop|sync" ;;
esac
