-- 011_scoring.sql — 관리자 채점(3단계): 문장 어절 점수 저장 + 검사자 구분.
-- ① 문장 읽기유창성은 "제한 시간 내 정확히 읽은 어절 수"라 O/X가 아닌 정수다 →
--    boolean인 reading_marks와 타입이 달라 별도 테이블에 담는다.
--    (낱말 해독 14개의 O/X는 reading_marks를 그대로 재사용한다 — 현장 채점 7개가 초기값이 된다.)
-- ② 검사지 헤더의 "교사 / 전문가" 구분을 수집한다. 도입 전 수집분은 null.
-- 비파괴적·재실행 안전(idempotent). Supabase SQL Editor에서 직접 실행할 것.

create table if not exists sentence_scores (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  item_code  text not null,          -- rs01~rs04
  words      int  not null check (words >= 0),
  unique (session_id, item_code)
);

create index if not exists sentence_scores_session_id_idx on sentence_scores(session_id);

alter table sentence_scores enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근 (001과 동일 방침).

alter table sessions add column if not exists examiner_type text
  check (examiner_type in ('teacher', 'expert'));
