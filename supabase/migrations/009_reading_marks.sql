-- 009_reading_marks.sql — 낱말 해독 의미 낱말의 검사자 현장 채점(O/X).
-- 검사지의 중단 규칙("의미 낱말 첫 3개 연속 오반응 시 문장·쓰기 미실시")은 검사 도중 판정해야 하므로,
-- 검사자가 현장에서 표시한 정반응 여부를 최종 제출 시 함께 저장한다.
-- 이 값은 관리자 채점(3단계)의 초기값이 된다.
-- 비파괴적·재실행 안전(idempotent). Supabase SQL Editor에서 직접 실행할 것.

create table if not exists reading_marks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  item_code  text not null,          -- rw01~rw07 (의미 낱말)
  correct    boolean not null,
  unique (session_id, item_code)
);

create index if not exists reading_marks_session_id_idx on reading_marks(session_id);

alter table reading_marks enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근 (001과 동일 방침).
