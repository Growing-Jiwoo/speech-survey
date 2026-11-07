-- ════════════════════════════════════════════════════════════════════
-- 009: 학급 명단 빼기·되살리기 · 검사 중 명단 추가 (2026-11-05)
-- 계획: docs/superpowers/plans/2026-11-05-coordinator-1105-followups.md 「A」
-- 전학 간 아이를 명단에서 빼고 검사 기록은 남기는 것은 담당자 확정(2026-11-06, 답장에 대한 회신 원문 「오케이 고마워!!」)이고,
-- 담임·관리자 둘 다 · 되살리기 · 직접 입력할 때 명단에 추가는 사용자가 정했다.
-- **코드 배포보다 먼저 실행할 것** — 새 코드는 명단을 읽을 때 이 두 컬럼을 읽는다. 재실행 안전.
-- ════════════════════════════════════════════════════════════════════

-- 뺀 시각. null = 명단에 있음. 행을 지우지 않는다 — 되살리기는 이 값을 비우는 것이고, 검사 기록(sessions)은
-- 명단이 아니라 학급 코드에 붙어 있어 빼도 그대로 남는다. 번호는 학급 안에서 unique라 뺀 자리에 새 아이를
-- 넣을 때는 그 행을 새 값으로 덮어 되살린다(lib/db addRosterChild).
alter table class_roster add column if not exists removed_at timestamptz;

-- 이 아이의 법정대리인 동의 확인 시각. null = 신청 때 함께 올라온 아이 — 확인은 class_codes.applied_at이다.
-- 검사 중에 추가한 아이(직접 입력 + 「명단에 추가」 체크)는 그 체크를 누른 시각이 들어간다.
alter table class_roster add column if not exists consented_at timestamptz;

notify pgrst, 'reload schema';
