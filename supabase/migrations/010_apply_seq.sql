-- ════════════════════════════════════════════════════════════════════
-- 010: 학급 신청 순번 — class_codes.apply_seq
--
-- 왜: 아동 코드(예 `017-03` = 신청 순번 17번 학급의 3번 아이, lib/child-code.ts)의 앞자리다.
-- 엑셀 내보내기 같은 파일에 아이를 이름 없이 가리킬 값이 필요하다 — 형식(신청 순번 + 출석 번호)은 **담당자 확정
-- (2026-11-06, 「오케이!!」)**, 엑셀에는 아동 코드만 싣는 것도 담당자 확정(같은 날 「엑셀에서는 아동 코드만 있어야 할 것 같아!」).
-- 6자리 학급 코드 대신 순번을 쓰는 판단은 사용자 확정(2026-11-05) — 담당자 회신 아님. 6자리 학급 코드를 쓰지 않는 이유: 그 코드는 시작 화면에서
-- 반 명단(아동 실명)을 여는 열쇠라, 내보낸 파일에 실리면 파일을 받은 사람이 명단을 열 수 있다.
--
-- 순번은 학급 코드 행마다 하나다 — 같은 학급 코드로 1·2학기를 이어 하면 아동 코드도 이어진다. 관리자 직접 발급
-- 학급도 받는다(applied_at이 null이라 created_at 순서로 끼운다). 아동 코드 자체는 저장하지 않는다 — 출석 번호와
-- 이 순번으로 그때그때 계산한다.
--
-- 기존 행: coalesce(applied_at, created_at) 순(같으면 id 순)으로 1부터 매긴다. 새 행은 시퀀스 기본값으로
-- 그다음 번호를 받는다(앱은 이 컬럼을 넣지 않는다). 지운 학급의 번호는 다시 쓰지 않는다 — 비는 번호가 생겨도 된다.
--
-- ⚠️ 적용 순서: **이 SQL을 코드 배포보다 먼저 실행할 것.** 새 코드는 학급 코드를 읽는 모든 곳(시작 화면·관리자
-- 화면·신청·승인)에서 이 컬럼을 select한다 — 컬럼이 없으면 그 조회가 전부 500이다. 컬럼만 먼저 있는 것은 무해하다
-- (지금 코드는 이 컬럼을 모르고, insert는 기본값이 채운다).
-- 재실행 안전: 컬럼·시퀀스·인덱스는 있으면 건너뛰고, 채우기는 null인 행만 지금 최댓값 다음부터 매긴다.
-- 채우기와 기본값 설정 사이에 옛 코드의 insert가 끼어 null 행이 남으면 `set not null`에서 실패한다 — 그대로 다시 돌리면 된다.
-- ════════════════════════════════════════════════════════════════════

alter table class_codes add column if not exists apply_seq int;

-- 기존 행 채우기 — 신청(직접 발급이면 발급) 시각 순. 다시 돌리면 아직 null인 행만 지금 최댓값 다음부터 이어 붙인다.
with numbered as (
  select id, row_number() over (order by coalesce(applied_at, created_at), id) as rn
  from class_codes
  where apply_seq is null
)
update class_codes c
set apply_seq = (select coalesce(max(apply_seq), 0) from class_codes) + n.rn
from numbered n
where c.id = n.id;

-- 새 행의 번호. 컬럼에 묶어(owned by) 두어 컬럼을 지우면 시퀀스도 함께 사라진다.
create sequence if not exists class_codes_apply_seq_seq as int owned by class_codes.apply_seq;

-- 시퀀스를 지금 최댓값 뒤로 맞춘다 — 빈 표면 다음 값 1, 아니면 max + 1(다시 돌려도 같은 결과).
select setval(
  'class_codes_apply_seq_seq',
  coalesce((select max(apply_seq) from class_codes), 1),
  (select max(apply_seq) from class_codes) is not null
);

-- 앱은 service role로 insert한다 — 기본값의 nextval에는 시퀀스 사용 권한이 든다(Supabase 기본 권한이 주지만 명시해 둔다).
grant usage on sequence class_codes_apply_seq_seq to service_role;

alter table class_codes alter column apply_seq set default nextval('class_codes_apply_seq_seq');
alter table class_codes alter column apply_seq set not null;

create unique index if not exists class_codes_apply_seq_key on class_codes(apply_seq);

-- PostgREST 스키마 캐시를 바로 갱신한다(006 참고 — 없으면 수 분간 새 컬럼 조회가 500).
notify pgrst, 'reload schema';
