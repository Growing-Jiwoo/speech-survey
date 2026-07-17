-- 008_guardian_consent.sql — 법정대리인 동의 확인 기록(개인정보보호법 제22조의2).
-- 검사자(교사)가 시작 화면에서 "법정대리인 서면 동의를 받았음"을 체크한 시각을 세션에 남긴다.
-- 동의 확인 의무 이행의 감사 증적 — 서면 동의서 원본은 학교가 별도 보관한다
-- (docs/consent/guardian-consent-form.md 참고).
-- 기존 행은 null(도입 전 수집분)로 남는다. 재실행 안전.

alter table sessions add column if not exists guardian_consented_at timestamptz;
