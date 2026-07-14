-- 005_public_rate_limits.sql — 공개 엔드포인트(세션 생성·녹음 업로드) IP 남용 방지용 레이트리밋.
-- 인메모리 방식은 서버리스(Vercel)에서 인스턴스마다 초기화돼 무력하므로 공유 저장소(DB)로 둔다.
-- Supabase SQL Editor에서 직접 실행할 것.

create table rate_limits (
  bucket        text primary key,  -- 예: 'session:<ip>', 'recording:<ip>'
  window_start  timestamptz not null,
  count         int not null default 1
);

alter table rate_limits enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근 (기존 테이블과 동일 방침).
