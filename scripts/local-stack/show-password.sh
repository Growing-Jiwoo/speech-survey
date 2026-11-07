#!/usr/bin/env bash
# scripts/local-stack/show-password.sh — 이 PC의 로컬 관리자 비밀번호를 보인다(.env.local-stack — gen-env.mjs가 만든 값).
set -euo pipefail
. "$(dirname "$0")/lib.sh"
[ -f "$ENV_FILE" ] || die "아직 env 파일이 없다 — 먼저 scripts/local-stack/up.sh"
pw="$(sed -n "s/^LOCAL_ADMIN_PASSWORD='\(.*\)'$/\1/p" "$ENV_FILE")"
[ -n "$pw" ] || die "env 파일에 LOCAL_ADMIN_PASSWORD가 없다(옛 형식) — reset.sh --new-secrets로 다시 만든다"
echo "로컬 관리자 비밀번호: $pw"
