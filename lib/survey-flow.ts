// lib/survey-flow.ts — 검사 진행 흐름 규칙(검사지의 중단 규칙 포함). 순수 함수만 둔다.
// 검사지 근거:
//  ① 낱말 해독 의미 낱말 첫 3개 연속 오반응 → 문장 읽기유창성·낱말 쓰기 과제를 실시하지 않는다.
//  ② 낱말 쓰기 의미 낱말 첫 3개 연속 오반응 → 검사를 중단한다.
// ※ 가정 A1: ②로 중단되어도 검사자 체크리스트는 진행한다(아동 과제가 아니라 검사자 관찰 기록).
// ※ ①과 ②는 서로 다른 방식으로 구현된다: ①은 이 파일의 visiblePages()가 페이지 자체를 제거하고,
//   ②는 낱말 쓰기 화면이 직접 남은 문항을 잠그는 방식(추후 태스크)으로 구현된다. writingCeilingHit 참고.
import { MEANING_READ_CODES, MEANING_WRITE_CODES, PAGES, type SurveyItem, type SurveyPage } from './items'

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
export function readingCeilingHit(marks: Partial<Record<string, boolean>>): boolean {
  return hitsCeiling(MEANING_READ_CODES.map(c => marks[c]))
}

/** 낱말 쓰기 의미 낱말(ww01~ww05) 기준 중단 여부.
 *  ⚠️ visiblePages에는 반영하지 않는다 — 이 규칙은 페이지를 빼는 대신 낱말 쓰기 화면이
 *  직접 남은 문항을 잠그는 방식으로 구현된다(추후 태스크). visiblePages에 잘못 연결하지 말 것. */
export function writingCeilingHit(writing: Partial<Record<string, boolean>>): boolean {
  return hitsCeiling(MEANING_WRITE_CODES.map(c => writing[c]))
}

/**
 * 낱말 쓰기에서 실제로 응답이 요구되는 문항 코드 집합.
 * 중단 규칙 ②에 걸리면 의미 낱말 앞 CEILING_N개만 요구하고, 그렇지 않으면 페이지의 모든 문항을 요구한다.
 * 낱말 쓰기 화면의 잠금(WritingPage)·다음 버튼 활성화(canAdvance)·검토 화면의 완료 집계가
 * 모두 이 함수 하나로 "요구되는 문항"을 판정해 배열 위치가 아닌 문항 코드로 안전하게 동작한다.
 */
export function requiredWritingCodes(
  items: SurveyItem[], writing: Partial<Record<string, boolean>>,
): Set<string> {
  if (writingCeilingHit(writing)) return new Set(MEANING_WRITE_CODES.slice(0, CEILING_N))
  return new Set(items.map(i => i.code))
}

/** 진행 상태에서 실제로 실시할 페이지 목록. 중단 규칙 ①에 걸리면 문장·쓰기 페이지가 빠진다. */
export function visiblePages(s: { marks: Partial<Record<string, boolean>> }): SurveyPage[] {
  if (!readingCeilingHit(s.marks)) return PAGES
  return PAGES.filter(p => p.section !== 'sentence_reading' && p.section !== 'word_writing')
}

/**
 * 현재 페이지에서 [다음]을 누를 수 있는지 — 페이지 종류별 완료 조건.
 * 낱말 해독 현장 채점: 전부 표시. 낱말 쓰기: 전부 선택(단, 중단 규칙에 걸리면 앞 3개만). 체크리스트: 1개 이상 선택.
 * (녹음 문항 자체의 완료 여부는 이 함수가 판단하지 않는다 — 호출부에서 busy로 이미 잠겨 있다.)
 */
export function canAdvance(page: SurveyPage, s: {
  marks: Partial<Record<string, boolean>>
  writing: Partial<Record<string, boolean>>
  checklist: string[]
}): boolean {
  const markDone = page.items.every(i => s.marks[i.code] !== undefined)
  // 중단 규칙 ②에 걸리면 의미 낱말 앞 3개(문항 코드 기준)만 요구한다 — 판정식은 이 파일 한 곳에만 둔다.
  const writingDone = [...requiredWritingCodes(page.items, s.writing)]
    .every(code => s.writing[code] !== undefined)
  return (page.code !== 'p_rw_meaning_mark' || markDone)
    && (page.section !== 'word_writing' || writingDone)
    && (page.section !== 'checklist' || s.checklist.length > 0)
}
