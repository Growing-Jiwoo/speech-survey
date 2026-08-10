// lib/forms/g1-layout.ts — KODYS-G1 검사지 좌표.
// scripts/extract-form-layout.mjs 가 assets/forms/kodys-g1.pdf 에서 뽑은 값이다.
// 검사지가 개정되면 손으로 고치지 말고 스크립트를 다시 돌려 통째로 교체한다.
import type { SheetLayout } from './layout'

export const G1_LAYOUT: SheetLayout = {
  pdf: 'forms/kodys-g1.pdf',
  pageWidth: 540,
  pageHeight: 780,

  header: {
    baselineY: 712.5,
    school:    { lo: 165, hi: 216 },
    grade:     { lo: 216, hi: 266 },
    childName: { lo: 266, hi: 320 },
    birth:     { lo: 320, hi: 379 },
    testedAt:  { lo: 379, hi: 445 },
    examiner: {
      teacher: { cx: 461.4, rx: 15.5 },
      expert:  { cx: 496.0, rx: 17.5 },
      cy: 715.2,
    },
  },

  // 낱말 해독: 의미 7 + 무의미 7, 셀 56 × 25.5 등간격
  wordReading: { x0: 126, dx: 56, w: 56, h: 25.5, rows: [616.2, 590.7], perRow: 7 },
  // 낱말 쓰기: 의미 5 + 무의미 5, 셀 78.1 × 25.5
  wordWriting: { x0: 127.5, dx: 78.1, w: 78.1, h: 25.5, rows: [256.6, 231.1], perRow: 5 },

  readScores: {
    meaning:  { slashX: 155.9, baselineY: 577.6 },
    nonsense: { slashX: 322.7, baselineY: 577.6 },
    total:    { slashX: 486.5, baselineY: 577.6 },
  },
  writeScores: {
    meaning:  { slashX: 151.8, baselineY: 217.8 },
    nonsense: { slashX: 318.6, baselineY: 217.8 },
    total:    { slashX: 482.4, baselineY: 217.8 },
  },
  sentenceScores: [
    { slashX: 487.3, baselineY: 487.4 },
    { slashX: 487.3, baselineY: 453.4 },
    { slashX: 487.3, baselineY: 419.3 },
    { slashX: 484.3, baselineY: 372.6 },
  ],
  sentenceTotal: { slashX: 482.8, baselineY: 332.9 },

  checklist: {
    checkX: 171.5,
    // CHECKLIST_AREAS의 code와 같은 키를 쓴다 — 화면과 인쇄물이 같은 영역 코드를 공유한다.
    rows: { none: 106.9, cognition: 84.8, language: 62.7, speech: 40.6, attention: 18.5 },
  },
}
