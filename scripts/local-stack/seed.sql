-- scripts/local-stack/seed.sql — 로컬 시험 데이터(가상 인물). 운영에 넣지 말 것.
-- 활성 학급 코드 TEST23: 부산 가남초 1학년 3반, 명단 3명. 신청을 거쳐 승인된 학급처럼 applied_at을 채운다
-- (명단 아이의 동의 확인 시각이 이 값이다 — app/api/sessions).
insert into class_codes (code, school_region, school_id, school_name, grade, class_no, teacher_name, teacher_phone, teacher_email, status, applied_at)
values ('TEST23', 'busan', 'B000002497', '가남초등학교', 1, 3, '김시험', '01000000000', 'teacher@local.test', 'active', now())
on conflict (code) do nothing;

insert into class_roster (class_code_id, child_no, child_name, gender, birth_ymd)
select c.id, v.no, v.name, v.gender, v.birth
from class_codes c,
     (values (1, '가나다', '남', '190305'), (2, '라마바', '여', '190712'), (3, '사아자', '남', '191120')) as v(no, name, gender, birth)
where c.code = 'TEST23'
on conflict (class_code_id, child_no) do nothing;
