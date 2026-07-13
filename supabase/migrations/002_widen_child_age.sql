-- 앱 검증(lib/validate.ts validAge)이 나이 3~19 제한을 1~999로 완화했으나
-- 이 체크 제약은 그대로 남아, 나이 20 이상 세션 생성이 DB에서 거부되고 있었다.
alter table sessions drop constraint sessions_child_age_check;
alter table sessions add constraint sessions_child_age_check check (child_age between 1 and 999);
