-- 015_class_codes.sql — 학급 코드 발급(관리자) + 코드 기반 세션 생성 (스펙 2026-08-13).
-- 세션 생성 시 코드의 학급 정보를 sessions 컬럼에 비정규화 복사한다 — 읽기 경로 무변경,
-- 코드를 나중에 고쳐도 이미 만든 세션은 검사 당시 값 유지(임상 기록 관점).
-- ⚠️ 파괴적: sessions에 not null 컬럼 추가·examiner_type 제거 — 배포 전 DB 전체 리셋 전제
--    (사용자 확정 2026-08-13). 리셋 없이 기존 행이 있는 DB에는 적용할 수 없다.
-- 개별 구문은 재실행 안전(idempotent) — 전부 if not exists/if exists를 쓴다.
create table if not exists class_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- 6자리, 혼동 문자(0·O·1·I·L) 제외 대문자+숫자
  school_region text not null,
  school_id text not null,
  school_name text not null,
  grade int not null check (grade between 1 and 6),
  class_no int not null check (class_no between 0 and 99),   -- 0 = 단일학급(반 없음)
  teacher_name text not null,
  teacher_phone text,                   -- 저장 규약: 앱(zod)이 하이픈 제거 후 저장 — 스키마 차원의 제약(check·trigger)은 없음
  teacher_email text,
  check (teacher_phone is not null or teacher_email is not null),
  created_at timestamptz not null default now()
);
alter table class_codes enable row level security;  -- 정책 없음 = anon 전면 차단(기존 관례)

-- 세션이 있는 코드는 지울 수 없다(restrict) — 관리자 화면도 세션 0건에만 삭제 버튼을 낸다.
alter table sessions add column if not exists class_code_id uuid not null references class_codes(id) on delete restrict;
alter table sessions add column if not exists child_no int not null check (child_no between 1 and 99);
alter table sessions drop column if exists examiner_type;

-- 조회 인덱스 (005_cascade_and_indexes.sql과 같은 관례 — FK 참조 측은 Postgres가 인덱스를
-- 자동으로 만들어주지 않으므로 조회 패턴에 맞춰 직접 추가한다).
-- 복합 인덱스(class_code_id, child_no) 하나로 통일한다: 아동번호 중복 확인
-- (.eq('class_code_id', …).eq('child_no', …), 공개 API가 아동마다 호출)이 두 컬럼을 함께 쓰고,
-- 관리자 코드별 "사용 세션 수" 집계·on delete restrict 검사는 class_code_id만 써도 이 인덱스의
-- 선두 컬럼으로 커버되므로 별도 단일 인덱스를 추가할 필요가 없다.
create index if not exists sessions_class_code_id_child_no_idx on sessions(class_code_id, child_no);
