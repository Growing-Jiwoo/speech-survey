-- 014_drop_discontinued.sql — 중단 규칙 폐기(담당자 확정 2026-08-13).
-- 검사 중 판정·사후 판정이 모두 사라져 컬럼의 존재 이유가 없다.
-- 배포 전 DB 전체 리셋이 예정돼 있어(사용자 확정 2026-08-13) 파괴적 변경을 그대로 쓴다.
-- 재실행 안전(idempotent).
alter table sessions drop column if exists discontinued_at;
