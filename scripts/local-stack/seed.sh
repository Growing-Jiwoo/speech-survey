#!/usr/bin/env bash
# scripts/local-stack/seed.sh — 시험용 활성 학급 코드 TEST23(명단 3명)을 넣는다. 여러 번 돌려도 안전(이미 있으면 그대로).
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
psql_local -f "$STACK_DIR/seed.sql"
psql_local -c "select c.code, c.status, c.school_name, c.grade, c.class_no, count(r.*) as roster
               from class_codes c left join class_roster r on r.class_code_id = c.id
               where c.code = 'TEST23' group by c.id"
