#!/usr/bin/env bash
# scripts/local-stack/reset.sh — 로컬 DB·Storage 파일·가짜 메일함을 지우고 처음부터 다시 띄운다(bootstrap + 마이그레이션 전부).
#   --seed       다시 띄운 뒤 seed.sh까지
#   --new-secrets  .env.local-stack도 지우고 비밀값을 새로 만든다(서명 키가 바뀌어 옛 세션 토큰·쿠키는 무효)
# 앱 사본(APP_DIR)과 그 빌드 캐시는 남긴다 — 다시 빌드하는 시간을 아끼려고.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

seed=0
for a in "$@"; do
  case "$a" in
    --seed) seed=1 ;;
    --new-secrets) rm -f "$ENV_FILE"; log ".env.local-stack 삭제(새로 만든다)" ;;
    *) die "모르는 옵션: $a" ;;
  esac
done

"$STACK_DIR/down.sh"
rm -rf "$PGDATA_DIR" "$DATA_DIR/storage" "$DATA_DIR/storage-meta" "$DATA_DIR/mails.json"
log "DB·Storage·메일함 삭제"
"$STACK_DIR/up.sh"
[ "$seed" = 1 ] && "$STACK_DIR/seed.sh"
exit 0
