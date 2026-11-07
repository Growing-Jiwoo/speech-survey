-- scripts/local-stack/bootstrap.sql — supabase/migrations/*.sql을 **고치지 않고** 그대로 돌리기 위한 최소 Supabase 흉내.
-- 새 DB에 마이그레이션보다 먼저 한 번 실행한다(up.sh). 운영 Supabase가 미리 만들어 두는 것 중 마이그레이션이 기대는 것만 만든다.
--
--  1) 역할 anon · authenticated · service_role(BYPASSRLS) + PostgREST가 접속하는 authenticator
--     — 001이 `revoke … from public, anon, authenticated`를 하고, RLS(정책 없음)를 service_role만 지나가야 한다.
--  2) public 스키마 기본 권한 — Supabase처럼 새 표·시퀀스·함수에 세 역할 모두 권한을 준다(실제 차단은 RLS가 한다).
--  3) storage.buckets — 001·006이 버킷 행을 넣는다. 게이트웨이(gateway.mjs)가 PostgREST로 이 표를 읽어
--     버킷 존재·크기·형식 상한을 확인한다.
--  4) local_stack.migrations — up.sh가 적용한 마이그레이션 파일 이름(Supabase에는 없음, 노출 안 함).

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  owner              uuid,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  avif_autodetection boolean default false,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
-- 버킷 표는 service_role만 읽는다(게이트웨이 전용). anon에는 스키마 사용 권한도 주지 않는다.
grant usage on schema storage to service_role;
grant select on storage.buckets to service_role;

create schema local_stack;
create table local_stack.migrations (
  file       text primary key,
  applied_at timestamptz not null default now()
);
