-- 004_login_attempts.sql — 관리자 로그인 무차별 대입 방어(레이트리밋)용 테이블.
-- 인메모리 방식은 서버리스(Vercel)에서 인스턴스마다 초기화돼 무력하므로 공유 저장소(DB)로 이전.
-- Supabase SQL Editor에서 직접 실행할 것.

create table login_attempts (
  ip           text primary key,
  fail_count   int  not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table login_attempts enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근 (기존 테이블과 동일 방침).
