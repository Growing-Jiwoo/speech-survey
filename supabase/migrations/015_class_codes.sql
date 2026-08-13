-- 015_class_codes.sql — 학급 코드 발급(관리자) + 코드 기반 세션 생성 (스펙 2026-08-13).
-- 세션 생성 시 코드의 학급 정보를 sessions 컬럼에 비정규화 복사한다 — 읽기 경로 무변경,
-- 코드를 나중에 고쳐도 이미 만든 세션은 검사 당시 값 유지(임상 기록 관점).
-- ⚠️ 파괴적: sessions에 not null 컬럼 추가·examiner_type 제거 — 배포 전 DB 전체 리셋 전제
--    (사용자 확정 2026-08-13). 리셋 없이 기존 행이 있는 DB에는 적용할 수 없다.
create table if not exists class_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- 6자리, 혼동 문자(0·O·1·I·L) 제외 대문자+숫자
  school_region text not null,
  school_id text not null,
  school_name text not null,
  grade int not null check (grade between 1 and 6),
  class_no int not null check (class_no between 0 and 99),   -- 0 = 단일학급(반 없음)
  teacher_name text not null,
  teacher_phone text,                   -- 하이픈 없는 숫자만 저장(스키마가 정규화)
  teacher_email text,
  check (teacher_phone is not null or teacher_email is not null),
  created_at timestamptz not null default now()
);
alter table class_codes enable row level security;  -- 정책 없음 = anon 전면 차단(기존 관례)

-- 세션이 있는 코드는 지울 수 없다(restrict) — 관리자 화면도 세션 0건에만 삭제 버튼을 낸다.
alter table sessions add column if not exists class_code_id uuid not null references class_codes(id) on delete restrict;
alter table sessions add column if not exists child_no int not null check (child_no between 1 and 99);
alter table sessions drop column if exists examiner_type;
