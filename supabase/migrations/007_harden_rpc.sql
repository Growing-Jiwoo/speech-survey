-- 007_harden_rpc.sql — record_login_failure RPC 하드닝(방어 심층).
-- 현재도 anon 키가 클라이언트에 노출되지 않고 login_attempts에 RLS 정책이 없어 실악용은
-- 불가하지만, 원칙대로 좁혀 둔다:
--   1) EXECUTE 권한 회수 — service role 경유 호출(서버 라우트)만 허용.
--   2) search_path 고정 — 함수 내부 참조가 다른 스키마의 동명 객체로 바꿔치기되는 것 방지.
-- 재실행 안전. Supabase SQL Editor에서 직접 실행할 것 (005·006 실행 이후).

revoke execute on function record_login_failure(text, bigint) from public, anon, authenticated;

alter function record_login_failure(text, bigint) set search_path = public;
