-- ════════════════════════════════════════════════════════════════════
-- 003: 교사 신청(pending 코드) + 학급 명단
-- 스펙: docs/superpowers/specs/2026-08-18-teacher-apply-and-roster-design.md
-- ⚠️ 운영 DB에는 2026-08-18에 이미 적용됨(RLS 포함). 새 환경 셋업 시에만 실행할 것.
-- ════════════════════════════════════════════════════════════════════

-- 신청 경로가 pending으로 생성하고 승인이 active로 바꾼다.
-- default 'active'라 기존 행·관리자 직접 발급은 동작이 변하지 않는다.
alter table class_codes add column status text not null default 'active'
  check (status in ('pending', 'active'));
alter table class_codes add column applied_at timestamptz;  -- 신청 시각(직접 발급은 null)

-- 학급 명단. 제약은 sessions의 같은 컬럼과 동일 규칙 — 명단→세션 복사가 어긋날 수 없다.
-- on delete cascade: 거절(코드 행 삭제) 즉시 아동 실명 명단도 함께 사라진다(PII).
create table class_roster (
  id            uuid primary key default gen_random_uuid(),
  class_code_id uuid not null references class_codes(id) on delete cascade,
  child_no      int  not null check (child_no between 1 and 99),
  child_name    text not null,
  gender        text not null check (gender in ('남','여')),
  birth_ymd     char(6) not null check (birth_ymd ~ '^[0-9]{6}$'),
  unique (class_code_id, child_no)
);
alter table class_roster enable row level security;  -- 정책 없음 = anon 전면 차단(001 관례)
