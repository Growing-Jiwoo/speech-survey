// lib/survey-flow.ts — 검사 진행 흐름 규칙(중단 규칙 포함). 순수 함수만 둔다.
// 근거: 담당자 확정(2026-08-11, docs/superpowers/specs/2026-08-11-discontinue-rules-design.md).
// ⚠️ 검사지 인쇄 문구와 다르다 — 검사지가 실제 시행 절차와 다를 때는 담당자 회신이 우선한다(스펙 참고).
//  ① 낱말 해독 의미 낱말 첫 3개 연속 오반응 → 무의미 낱말·문장 읽기유창성을 실시하지 않고
//     쓰기 과제로 넘어간다. (검사지 문구는 "문장 읽기유창성과 낱말 쓰기 미실시" — 폐기됨)
//  ② 쓰기 과제 1번 문항 오반응 → 즉시 중단. 양식 무관하게 첫 문항 하나로 판정한다.
//     (검사지 G1 문구는 "의미 낱말 첫 3개" — 폐기됨)
// ※ 검사자 체크리스트는 어느 중단에서도 진행한다(아동 과제가 아니라 검사자 관찰 기록).
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
 * 확정(2026-08-11): 문항 배점이 0·1·2인 문장 쓰기에서 1점은 오반응이 아니다.
 * ⚠️ 이 답은 사용자(개발자)를 통해 받았고, 담당자 대화 로그에 원문이 남아 있지 않다.
 * 되돌아볼 일이 생기면 담당자에게 한 번 더 확인할 것 — 이 한 줄이 "중단이냐 계속이냐"를
 * 가르므로 잘못되면 이후 과제를 통째로 실시/미실시로 뒤집는다.
 */
export const isWritingWrong = (score: number | undefined): boolean | undefined =>
  score === undefined ? undefined : score === 0

/** 쓰기 과제 중단 여부 (규칙 ②) — 양식 무관하게 1번 문항 하나로 판정한다(담당자 확정).
 *  ⚠️ visiblePages에는 반영하지 않는다 — 이 규칙은 페이지를 빼는 대신 쓰기 화면이
 *  직접 남은 문항을 잠그는 방식으로 구현된다(requiredWritingCodes). 잘못 연결하지 말 것. */
export function writingCeilingHit(f: FormItems, writing: Partial<Record<string, number>>): boolean {
  return hitsCeiling(f.writingItems.slice(0, 1).map(i => isWritingWrong(writing[i.code])), 1)
}

/**
 * 쓰기 과제에서 실제로 응답이 요구되는 문항 코드 집합.
 * 중단 규칙 ②에 걸리면 판정에 쓰인 1번 문항만 요구하고, 그렇지 않으면 페이지의 모든 문항을 요구한다.
 * 중단 시에는 인자 `items`와 무관하게 **양식의 1번 문항**(`f.writingItems[0]`)을 요구한다 —
 * 넘어온 배열이 뒤섞이거나 일부만 담겨 있어도 판정이 흔들리지 않는다.
 * 쓰기 화면의 잠금·다음 버튼 활성화(canAdvance)·검토 화면의 완료 집계가 모두 이 함수 하나로
 * "요구되는 문항"을 판정해, 배열 위치가 아닌 문항 코드로 안전하게 동작한다.
 */
export function requiredWritingCodes(
  f: FormItems, items: SurveyItem[], writing: Partial<Record<string, number>>,
): Set<string> {
  if (!writingCeilingHit(f, writing)) return new Set(items.map(i => i.code))
  return new Set(f.writingItems.slice(0, 1).map(i => i.code))
}

export interface FlowState {
  marks: Partial<Record<string, boolean>>
  writing: Partial<Record<string, number>>
  checklist: string[]
}

/** 진행 상태에서 실제로 실시할 페이지 목록. 중단 규칙 ①에 걸리면 무의미 낱말·문장 페이지가 빠진다. */
export function visiblePages(f: FormItems, s: Pick<FlowState, 'marks'>) {
  if (!readingCeilingHit(f, s.marks)) return f.pages
  // 무의미 낱말은 섹션이 의미 낱말과 같아(word_reading) 섹션 필터로는 걸러지지 않는다 —
  // kind로 가른다(연습·의미·현장채점 페이지는 모두 kind가 'meaning'이다).
  // "무엇을 빼는가"가 아니라 **무엇을 남기는가**로 적는다 — 새 양식이 실시하면 안 되는
  // 페이지를 추가해도 조용히 통과하지 않는다(kind !== 'nonsense'였다면 kind: null이 통과했다).
  return f.pages.filter(p =>
    (p.section === 'word_reading' && p.kind === 'meaning')
    || p.section === f.writingSection || p.section === 'checklist')
}

/**
 * 현재 페이지에서 [다음]을 누를 수 있는지 — 페이지 종류별 완료 조건.
 * 낱말 해독 현장 채점: 전부 표시. 쓰기: 전부 입력(단, 중단 규칙에 걸리면 1번 문항만).
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
