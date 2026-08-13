// lib/forms/g2.ts — KODYS-G2 (초등 2학년) 검사지 정의.
//
// 원본: assets/forms/kodys-g2.pdf (담당자 배포 「초등 2학년 선별검사 양식（가안）」)
// ── 이 파일은 원본 검사지를 옮겨 적은 사본일 뿐이다. ─────────────────────────
// 코드와 검사지가 다르면 **언제나 검사지가 옳다.** 코드에 맞춰 검사지를 해석하지 말고,
// 검사지에 맞춰 코드를 고친다. 아동은 검사지의 낱말이 아니라 이 배열의 낱말을 읽게 되므로,
// 여기가 틀리면 검사 자체가 다른 검사가 된다.
// 무의미 낱말(고춘·삭핌·찬축·닺고·구말·앍아·딻아)은 뜻이 없어 오타가 눈에 띄지 않는다.
// 대조는 tests/forms.test.ts의 SHEET_G2가 글자 단위로 자동 검증한다.
//
// ⚠️ 아직 **가안**이다. 확정본을 받으면 assets/forms/kodys-g2.pdf를 교체하고
//    scripts/extract-form-layout.mjs를 다시 돌려 g2-layout.ts를 통째로 갱신한다.
//
// G1과의 구조적 차이: 쓰기 과제가 낱말 쓰기가 아니라 **문장 쓰기**다.
// 문항마다 O/X가 아니라 어절 수(0~2)로 채점한다.
import type { SurveyForm } from './index'
import { G2_LAYOUT } from './g2-layout'

export const G2: SurveyForm = {
  id: 'KODYS-G2',
  title: 'KODYS - G2',
  subtitle: 'Korean Dyslexia Screening Test',
  grades: [2],
  readMeaning: ['친구', '무엇', '작품', '친척', '젖다', '닮다', '짧은'],
  readNonsense: ['고춘', '삭핌', '찬축', '닺고', '구말', '앍아', '딻아'],
  sentences: [
    '오늘 부모님께서 학교에 오셔서 담임 선생님과 인사하셨어요.',
    '바자회를 열어서 오랫동안 사용하지 않은 물건을 팔기로 결심했어요.',
    '승엽이는 수업시간에 수학 문제를 풀었고 친구들 앞에서 발표도 했어요.',
    '체험학습으로 넓은 경기장을 방문했습니다.\n조명이 밝아서 경기장 전체를 들여다볼 수 있었습니다.',
  ],
  // 검사지에는 어절이 두 칸으로 나뉘어 인쇄돼 있다(「집 으 로」「와 요」) — 어절마다 1점이라
  // 칸을 나눈 것이고, 문항 자체는 한 문장이다. 배점(0~2)은 어절 수에서 자동으로 유도된다.
  writing: {
    kind: 'sentence',
    sentences: ['집으로 와요', '글씨를 씁니다', '냄새를 맡다', '책상이 넓어요', '뛰지 않아요'],
  },
  limits: { wordSec: 30, sentenceSec: 40 },
  // 임시값. G1의 비율을 그대로 옮겼다(문장 읽기 만점이 36→35라 23→22).
  passMark: { wordReading: 9, sentenceReading: 22, writing: 6 },
  layout: G2_LAYOUT,
}
