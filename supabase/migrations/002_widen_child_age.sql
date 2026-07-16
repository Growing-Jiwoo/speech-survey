-- ⚠️ 레거시 — 실행하지 말 것: 003 이전 스키마(child_age 컬럼) 전용 마이그레이션.
-- 003_kodys_redesign.sql이 sessions를 재생성하며 child_age 컬럼을 제거했으므로,
-- 003 이후에 실행하면 "column child_age does not exist" 에러가 난다.
-- (README 셋업 순서도 001 → 003 → 004 → 005 → 006으로 002를 건너뛴다. 이력 보존용으로만 남긴다.)

-- 앱 검증(lib/validate.ts validAge)이 나이 3~19 제한을 1~999로 완화했으나
-- 이 체크 제약은 그대로 남아, 나이 20 이상 세션 생성이 DB에서 거부되고 있었다.
alter table sessions drop constraint sessions_child_age_check;
alter table sessions add constraint sessions_child_age_check check (child_age between 1 and 999);
