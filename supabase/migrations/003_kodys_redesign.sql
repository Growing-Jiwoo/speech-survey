-- 003_kodys_redesign.sql — 읽기 선별검사 스키마 전환.
-- ⚠️ 기존 questions/responses/attempts/sessions와 데이터를 폐기한다 (기존 수집분은 테스트 데이터).
-- Supabase SQL Editor에서 직접 실행할 것.

drop table if exists attempts;
drop table if exists responses;
drop table if exists questions;
drop table if exists sessions cascade;

create table sessions (
  id              uuid primary key default gen_random_uuid(),
  school_region   text not null,
  school_id       text not null,
  school_name     text not null,
  birth_ymd       char(6) not null check (birth_ymd ~ '^[0-9]{6}$'),
  grade           int  not null check (grade between 1 and 6),
  class_no        int  not null check (class_no between 1 and 99),
  gender          text not null check (gender in ('남','여')),
  child_name      text not null,
  teacher_name    text not null,
  teacher_contact text not null,
  checklist       text[] not null default '{}',  -- 최종 제출 시 저장 (검사자 체크리스트 영역 코드)
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz                     -- null = 미제출
);

-- 녹음 메타: 문항마다 즉시 기록. 재녹음 시 attempt_no 증가(모든 시도 보존).
create table recordings (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id),
  item_code    text not null,   -- rw01~rw14, rs01~rs04 (lib/items.ts)
  attempt_no   int  not null,
  audio_path   text not null,   -- storage: <sessionId>/<itemCode>_<attemptNo>.<ext>
  duration_sec numeric(5,2),
  created_at   timestamptz not null default now(),
  unique (session_id, item_code, attempt_no)
);

-- 낱말쓰기 예/아니오: 최종 제출 시 일괄 저장.
create table writing_answers (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id),
  item_code  text not null,     -- ww01~ww10
  can_write  boolean not null,
  unique (session_id, item_code)
);

alter table sessions        enable row level security;
alter table recordings      enable row level security;
alter table writing_answers enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근 (001과 동일 방침).
-- storage 버킷 'recordings'는 001에서 생성됨 — 그대로 사용.
