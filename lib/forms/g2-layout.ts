// lib/forms/g2-layout.ts — KODYS-G2 검사지 좌표.
// scripts/extract-form-layout.mjs 가 assets/forms/kodys-g2.pdf 에서 뽑은 값이다.
// 검사지가 개정되면 손으로 고치지 말고 스크립트를 다시 돌려 통째로 교체한다.
//   node scripts/extract-form-layout.mjs assets/forms/kodys-g2.pdf 친구 고춘
// (2번째 인자는 학년이 아니라 **낱말 해독 의미/무의미 행의 첫 낱말**이다. G2는 낱말 쓰기가
//  없어 뒤 두 인자를 생략한다 — 생략하면 스크립트가 낱말 쓰기 없는 양식으로 본다.)
// G1과 같은 PowerPoint 템플릿이지만 머리글 블록이 통째로 3.0pt 위로 밀려 있다
// (머리글 가로선 G1 702.1·729.9 → G2 705.1·733.0). 좌표를 G1에서 복사하지 말 것.
import type { SheetLayout } from './layout'

export const G2_LAYOUT: SheetLayout = {
  pdf: 'forms/kodys-g2.pdf',
  pageWidth: 540,
  pageHeight: 780,

  header: {
    baselineY: 715.5,
    school:    { lo: 164.0, hi: 214.5 },
    grade:     { lo: 214.5, hi: 265.0 },
    childName: { lo: 265.0, hi: 318.5 },
    birth:     { lo: 318.5, hi: 377.8 },
    testedAt:  { lo: 377.8, hi: 444.0 },
    examiner: {
      teacher: { cx: 460.0, rx: 15.5 },
      expert:  { cx: 494.6, rx: 17.5 },
      cy: 718.3,
    },
  },

  // 검사지 본문은 전부 10pt다(텍스트 레이어 실측). 스탬프도 같은 크기를 쓴다.
  fontSize: 10,

  // 낱말 해독: 의미 7 + 무의미 7, 셀 56 × 25.5 등간격. 낱말 베이스라인 626.6 − 칸 617.5 = 9.1
  wordReading: { x0: 128, dx: 56, w: 56, h: 25.5, rows: [617.5, 592.0], perRow: 7, baselineDy: 9.1 },

  readScores: {
    meaning:  { slashX: 157.9, baselineY: 578.9 },
    nonsense: { slashX: 324.7, baselineY: 578.9 },
    total:    { slashX: 482.3, baselineY: 578.9 },
  },
  sentenceScores: [
    { slashX: 487.3, baselineY: 486.2 },
    { slashX: 487.3, baselineY: 457.9 },
    { slashX: 487.3, baselineY: 429.5 },
    { slashX: 484.3, baselineY: 388.4 },
  ],
  sentenceTotal: { slashX: 482.8, baselineY: 351.6 },

  // 문장 쓰기: 5문항이 2열로 놓인다(1·2·3 왼쪽, 4·5 오른쪽). 각 행에 「0 1 2」가 인쇄돼 있어
  // 빈칸을 채우는 대신 획득 점수에 동그라미를 친다.
  // 숫자 중심은 600dpi 실측: 왼쪽 열 0/1/2 = 230.2 / 241.6 / 253.0 (간격 11.37),
  // 오른쪽 열은 정확히 +248.6(칸 x 213.9 → 462.5). 숫자 세로 범위는 베이스라인 +0 ~ +7.6.
  writing: {
    kind: 'sentence',
    choices: {
      colCx: [241.72, 490.42],
      dx: 11.37,
      cy: 3.8,
      rx: 5.6,
      ry: 5.8,
      rows: [
        { col: 0, baselineY: 264.3 },
        { col: 0, baselineY: 245.1 },
        { col: 0, baselineY: 225.9 },
        { col: 1, baselineY: 264.3 },
        { col: 1, baselineY: 245.1 },
      ],
    },
    total: { slashX: 486.7, baselineY: 206.4 },
  },

  checklist: {
    // 600dpi 실측: 네모 x 169.56~176.28, y(베이스라인 115.8 행) 115.44~122.16 → 한 변 6.7
    boxCx: 172.92,
    boxDy: 3.06,
    boxSize: 6.7,
    // 값은 각 행 텍스트의 베이스라인. CHECKLIST_AREAS의 code와 같은 키를 쓴다
    // — 화면과 인쇄물이 같은 영역 코드를 공유한다.
    rows: { none: 115.8, cognition: 93.6, language: 71.5, speech: 49.3, attention: 27.2 },
  },
}
