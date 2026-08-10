// lib/survey-flow.ts — 검사 진행 흐름 규칙(검사지의 중단 규칙 포함). 순수 함수만 둔다.
// 검사지 근거:
//  ① 낱말 해독 의미 낱말 첫 3개 연속 오반응 → 문장 읽기유창성·쓰기 과제를 실시하지 않는다.
//  ② 쓰기 과제 중단 — 규칙이 양식마다 다르다:
//     · 낱말 쓰기(G1): 의미 낱말 첫 3개 연속 오반응 시 중단
//     · 문장 쓰기(G2): **첫 문장** 오반응 시 중단
// ※ 가정 A1: ②로 중단되어도 검사자 체크리스트는 진행한다(아동 과제가 아니라 검사자 관찰 기록).
// ※ ①과 ②는 서로 다른 방식으로 구현된다: ①은 visiblePages()가 페이지 자체를 제거하고,
//   ②는 쓰기 화면이 직접 남은 문항을 잠그는 방식이다(requiredWritingCodes 참고).
import type { FormItems, SurveyItem } from './items'

/** 중단 판정 개수 — "첫 N개 연속 오반응" */
export const CEILING_N = 3

/**
 * 문항 순서대로 나열한 **오반응 여부**에서 중단을 판정한다.
 * 앞 n개가 "모두 채점되었고 모두 오반응"일 때만 참 — 미채점(undefined)은 중단으로 보지 않는다.
 */
export function hitsCeiling(wrong: (boolean | undefined)[], n = CEILING_N): boolean {
  const head = wrong.slice(0, n)
  return head.length === n && head.every(w => w === true)
}

/** 낱말 해독 의미 낱말 기준 중단 여부 (규칙 ①) */
export function readingCeilingHit(f: FormItems, marks: Partial<Record<string, boolean>>): boolean {
  return hitsCeiling(f.meaningReadCodes.map(c => (marks[c] === undefined ? undefined : marks[c] === false)))
}

/**
 * 쓰기 과제의 "오반응" — **한 어절도 맞히지 못한 것(0점)**.
 *
 * ⚠️ G2 검사지의 "첫 문장 오반응 시 검사를 중단합니다"는 문항 배점이 0·1·2인데도
 * 무엇을 오반응으로 볼지 적어 두지 않았다(가안). 두 어절 중 하나라도 맞혔다면 반응이
 * 있었던 것으로 보아 중단하지 않는 쪽 — 즉 **덜 중단하는 쪽** 으로 해석한다. 중단은
 * 이후 과제를 아예 실시하지 않게 만드는 결정이라, 애매하면 계속하는 편이 안전하다.
 * 담당자가 "1점도 오반응"이라고 회신하면 이 함수만 바꾸면 된다.
 */
export const isWritingWrong = (score: number | undefined): boolean | undefined =>
  score === undefined ? undefined : score === 0

/** 이 양식에서 중단 규칙 ②의 판정 대상이 되는 문항 코드와 개수 */
function writingCeilingRule(f: FormItems): { codes: string[]; n: number } {
  // 낱말 쓰기는 의미 낱말 첫 3개, 문장 쓰기는 첫 문장 하나가 판정 대상이다.
  return f.writingSection === 'word_writing'
    ? { codes: f.meaningWriteCodes, n: CEILING_N }
    : { codes: f.writingItems.map(i => i.code), n: 1 }
}

/** 쓰기 과제 중단 여부 (규칙 ②).
 *  ⚠️ visiblePages에는 반영하지 않는다 — 이 규칙은 페이지를 빼는 대신 쓰기 화면이
 *  직접 남은 문항을 잠그는 방식으로 구현된다(requiredWritingCodes). 잘못 연결하지 말 것. */
export function writingCeilingHit(f: FormItems, writing: Partial<Record<string, number>>): boolean {
  const { codes, n } = writingCeilingRule(f)
  return hitsCeiling(codes.map(c => isWritingWrong(writing[c])), n)
}

/**
 * 쓰기 과제에서 실제로 응답이 요구되는 문항 코드 집합.
 * 중단 규칙 ②에 걸리면 판정에 쓰인 앞 n개만 요구하고, 그렇지 않으면 페이지의 모든 문항을 요구한다.
 * 쓰기 화면의 잠금·다음 버튼 활성화(canAdvance)·검토 화면의 완료 집계가 모두 이 함수 하나로
 * "요구되는 문항"을 판정해, 배열 위치가 아닌 문항 코드로 안전하게 동작한다.
 */
export function requiredWritingCodes(
  f: FormItems, items: SurveyItem[], writing: Partial<Record<string, number>>,
): Set<string> {
  if (!writingCeilingHit(f, writing)) return new Set(items.map(i => i.code))
  const { codes, n } = writingCeilingRule(f)
  return new Set(codes.slice(0, n))
}

export interface FlowState {
  marks: Partial<Record<string, boolean>>
  writing: Partial<Record<string, number>>
  checklist: string[]
}

/** 진행 상태에서 실제로 실시할 페이지 목록. 중단 규칙 ①에 걸리면 문장·쓰기 페이지가 빠진다. */
export function visiblePages(f: FormItems, s: Pick<FlowState, 'marks'>) {
  if (!readingCeilingHit(f, s.marks)) return f.pages
  // 낱말 해독과 검사자 체크리스트만 남긴다 — 쓰기 과제의 섹션 이름이 양식마다 다르므로
  // "무엇을 빼는가"가 아니라 "무엇을 남기는가"로 적는다(새 양식에서 빠뜨릴 여지를 없앤다).
  return f.pages.filter(p => p.section === 'word_reading' || p.section === 'checklist')
}

/**
 * 현재 페이지에서 [다음]을 누를 수 있는지 — 페이지 종류별 완료 조건.
 * 낱말 해독 현장 채점: 전부 표시. 쓰기: 전부 입력(단, 중단 규칙에 걸리면 앞 n개만).
 * 체크리스트: 1개 이상 선택.
 * (녹음 문항 자체의 완료 여부는 이 함수가 판단하지 않는다 — 호출부에서 busy로 이미 잠겨 있다.)
 */
export function canAdvance(f: FormItems, page: FormItems['pages'][number], s: FlowState): boolean {
  const markDone = page.items.every(i => s.marks[i.code] !== undefined)
  const writingDone = [...requiredWritingCodes(f, page.items, s.writing)]
    .every(code => s.writing[code] !== undefined)
  return (page.code !== 'p_rw_meaning_mark' || markDone)
    && (page.section !== f.writingSection || writingDone)
    && (page.section !== 'checklist' || s.checklist.length > 0)
}
