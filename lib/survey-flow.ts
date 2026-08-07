// lib/survey-flow.ts — 검사 진행 흐름 규칙(검사지의 중단 규칙 포함). 순수 함수만 둔다.
// 검사지 근거:
//  ① 낱말 해독 의미 낱말 첫 3개 연속 오반응 → 문장 읽기유창성·낱말 쓰기 과제를 실시하지 않는다.
//  ② 낱말 쓰기 의미 낱말 첫 3개 연속 오반응 → 검사를 중단한다.
// ※ 가정 A1: ②로 중단되어도 검사자 체크리스트는 진행한다(아동 과제가 아니라 검사자 관찰 기록).
import { MEANING_READ_CODES, MEANING_WRITE_CODES, PAGES, type SurveyPage } from './items'

/** 중단 판정 개수 — "첫 N개 연속 오반응" */
export const CEILING_N = 3

/**
 * 문항 순서대로 나열한 정반응 여부에서 중단 여부를 판정한다.
 * 앞 N개가 "모두 채점되었고 모두 오반응"일 때만 참 — 미채점(undefined)은 중단으로 보지 않는다.
 */
export function hitsCeiling(marks: (boolean | undefined)[]): boolean {
  const head = marks.slice(0, CEILING_N)
  return head.length === CEILING_N && head.every(m => m === false)
}

/** 낱말 해독 의미 낱말(rw01~rw07) 기준 중단 여부 */
export function readingCeilingHit(marks: Record<string, boolean>): boolean {
  return hitsCeiling(MEANING_READ_CODES.map(c => marks[c]))
}

/** 낱말 쓰기 의미 낱말(ww01~ww05) 기준 중단 여부 */
export function writingCeilingHit(writing: Record<string, boolean>): boolean {
  return hitsCeiling(MEANING_WRITE_CODES.map(c => writing[c]))
}

/** 진행 상태에서 실제로 실시할 페이지 목록. 중단 규칙 ①에 걸리면 문장·쓰기 페이지가 빠진다. */
export function visiblePages(s: { marks: Record<string, boolean> }): SurveyPage[] {
  if (!readingCeilingHit(s.marks)) return PAGES
  return PAGES.filter(p => p.section !== 'sentence_reading' && p.section !== 'word_writing')
}
