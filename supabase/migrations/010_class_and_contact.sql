-- 010_class_and_contact.sql — 단일학급(반 없음) 지원 + 담임 연락처 전화/이메일 분리.
-- ① 학년당 한 학급인 학교가 많아 "반 없음"을 표현할 값이 필요하다 → class_no 0 허용.
--    범위는 넓게(0~99) 두고 화면 드롭다운만 20까지 제공한다 — 범위 조정 시 마이그레이션 불필요.
-- ② 담임 연락처를 전화·이메일 두 칸으로 나누고 둘 중 하나만 있으면 되게 한다(담당자 확정).
--    기존 teacher_contact는 도입 전 수집분 보존을 위해 남기고 not null만 푼다(관리자 화면이 폴백 표시).
-- 비파괴적·재실행 안전(idempotent). Supabase SQL Editor에서 직접 실행할 것.

-- ① 반 0 허용 (기존 1~99 행은 그대로 유효 — 범위를 넓히기만 하므로 위반 행이 생기지 않는다)
alter table sessions drop constraint if exists sessions_class_no_check;
alter table sessions add constraint sessions_class_no_check check (class_no between 0 and 99);

-- ② 연락처 분리
alter table sessions alter column teacher_contact drop not null;
alter table sessions add column if not exists teacher_phone text;
alter table sessions add column if not exists teacher_email text;

-- 새로 만들어지는 세션은 셋 중 하나는 반드시 있어야 한다.
-- not valid: 도입 전 기존 행은 teacher_contact가 채워져 있어 문제없지만, 검증 비용 없이 넘어간다.
alter table sessions drop constraint if exists sessions_teacher_contact_present;
alter table sessions add constraint sessions_teacher_contact_present
  check (teacher_phone is not null or teacher_email is not null or teacher_contact is not null) not valid;
