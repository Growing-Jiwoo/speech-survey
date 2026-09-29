-- ════════════════════════════════════════════════════════════════════
-- 005: 문장 읽기유창성 — 문장별 읽은 시간(초)
--
-- 왜: 문장 읽기유창성 총점이 「정확하게 읽은 어절 수 합 ÷ 읽은 시간 합」(어절/초)으로 바뀌었다
-- (담당자 확정 2026-09-29). 시간은 관리자가 녹음을 듣고 문장마다 직접 넣는다 — 녹음 길이로
-- 채우지 않는다(담당자 원문: "녹음된 초를 넣기에는 정확하지가 않을 것 같아서").
--
-- 왜 sentence_scores에 열을 붙이지 않고 테이블을 따로 두나:
-- · 어절 수와 시간은 **따로 입력된다.** 채점자가 시간을 먼저 넣으면 `sentence_scores.words`가
--   NOT NULL이라 그 시간을 담을 행이 없다 — 자동 저장이 그 입력을 버리게 된다.
-- · sentence_scores에는 이미 문장 쓰기 점수(sw..)가 섞여 있다. 문장 읽기(rs..)에만 뜻이 있는
--   열을 붙이면 그 혼재가 한 겹 더 늘어난다.
--
-- item_code는 문장 읽기유창성 문항(rs01~rs04)만 들어온다 — 저장 라우트가 양식의 문항 코드로 거른다.
-- 녹음이 없는 문장의 시간은 저장하지 않는다(채점 시 제한 시간으로 고정·파생된다, lib/scoring.ts
-- withUnrecordedFixed). 그래서 저장되는 값은 언제나 0보다 크다.
-- numeric(4,1): 0.1초 단위. 저장 라우트가 소수 한 자리까지만 받는다.
--
-- ⚠️ 적용 순서: **이 SQL을 코드 배포보다 먼저 실행할 것.** 새 코드는 결과지·결과보고서를 만들 때
-- 이 테이블을 읽으므로, 테이블이 없는 DB에 새 코드가 붙으면 관리자 결과지·결과보고서 PDF·교사
-- 결과지가 전부 실패한다. 테이블만 먼저 있는 것은 무해하다(지금 코드는 이 테이블을 모른다).
-- 재실행 안전: 이미 있으면 건너뛴다.
-- ════════════════════════════════════════════════════════════════════

create table if not exists sentence_times (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  item_code  text not null,                       -- rs01~rs04
  seconds    numeric(4,1) not null check (seconds > 0),
  unique (session_id, item_code)
);

alter table sentence_times enable row level security;  -- 정책 없음 = anon 전면 차단(001 관례)

-- session_id 조회·세션 삭제 cascade는 위 unique(session_id, item_code)의 인덱스가 맡는다
-- (선두 열이 session_id) — 별도 인덱스를 두지 않는다.
