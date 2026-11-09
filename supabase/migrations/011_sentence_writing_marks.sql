-- ════════════════════════════════════════════════════════════════════
-- 011: 문장 쓰기(G2) 어절별 O/X — sentence_scores.marks
--
-- 왜: 문장 쓰기를 문장마다 「맞힌 어절 수 0·1·2」가 아니라 **어절마다 O/X**로 채점한다(담당자 확정 2026-11-09 —
-- 원문 「어절별로 0, 1 채점하도록 해서 문장 총점이 나오도록」「'책상이'가 틀렸는지 '넓어요'가 틀렸는지 확인이 가능」,
-- 화면 시안을 본 뒤 「그렇게 해달래」, 사용자 전달). 문장 점수는 여전히 O의 개수다 — 배점·판정은 바뀌지 않는다.
--
-- marks: 어절 순서대로 O/X를 이은 글자(예 'XO' = 앞 어절 틀림). 문장 쓰기(sw..)에만 쓴다 — 문장 읽기(rs..)는 null.
-- words는 그대로 둔다(채점·결과지·PDF가 읽는 값) — 늘 marks의 O 개수와 같아야 해서 check로 묶는다.
-- 이 묶음은 옛 코드(words만 고치는 저장)가 marks와 어긋난 행을 남기지 못하게 하는 장치이기도 하다 — 어긋나면 저장이 실패한다.
-- marks가 null인 sw 행 = 이 변경 전 화면 방식으로 받은 1점 문장(어느 어절인지 근거가 없다) 또는 배포 순간 옛 탭이 낸 제출.
--
-- 기존 행 바꾸기(사용자 확정 2026-11-09 — 담당자 회신 아님. 1점 문장은 담당자가 직접 다시 채점한다는 것만 담당자 쪽 뜻):
-- · 0점 → 'XX', 2점 → 'OO'. 문장 쓰기 문항은 1·2학기 모두 문장마다 2어절이다(검사지 「0 1 2」).
-- · **스캔본 방식 검사의 1점 문장은 지운다** — 담당자가 스캔본을 보고 어절마다 다시 누른다. 그동안 그 아이는 쓰기가
--   「채점 전」이다. 운영 기준 4명·8문장(2026-11-09 조회).
-- · 화면 방식 검사의 1점 문장은 남긴다(marks null) — 그 쓰기는 검사 중 입력이 유일한 근거라 지우면 되살릴 길이 없다.
--
-- ⚠️ 적용 순서: **이 SQL을 코드 배포보다 먼저 실행할 것.** 새 코드는 sentence_scores를 읽을 때 marks를 select한다.
-- 재실행 안전: 컬럼·제약은 있으면 건너뛰고, 바꾸기는 marks가 null인 0·2점 행과 스캔본 방식의 1점 행에만 걸린다.
-- ════════════════════════════════════════════════════════════════════

alter table sentence_scores add column if not exists marks text;

update sentence_scores set marks = case words when 0 then 'XX' when 2 then 'OO' end
where item_code like 'sw%' and marks is null and words in (0, 2);

delete from sentence_scores ss using sessions s
where ss.session_id = s.id and s.writing_mode = 'scan'
  and ss.item_code like 'sw%' and ss.marks is null and ss.words = 1;

do $$ begin
  alter table sentence_scores add constraint sentence_scores_marks_check
    check (marks is null or (marks ~ '^[OX]+$' and length(replace(marks, 'X', '')) = words));
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
