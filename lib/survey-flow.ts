// lib/survey-flow.ts — 검사 진행 흐름 규칙. 순수 함수만 둔다.
// 중단 규칙(①·②)과 현장 채점은 2026-08-13 담당자 확정으로 폐기됐다 — 검사 화면은 수집만
// 하고, 판정·채점은 전부 관리자 결과지가 한다(스펙: docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md).
// ⚠️ 검사지에 인쇄된 중단 규칙 문구는 적용하지 않는다 — 시행 절차는 담당자 회신이 우선한다.
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

/**
 * 실제로 실시된 쓰기 답만 남긴다 — 중단 규칙 ②가 성립하면 2번 이후 문항의 값을 버린다.
 *
 * 왜 필요한가(사용자 보고 2026-08-12): 검사자가 2~5번을 먼저 채점하고 1번을 마지막에
 * 오반응으로 찍으면 중단이 성립하지만, 그때 이미 입력된 2~5번 값이 남아 제출된다.
 * 실시하지 않은 문항에 점수가 남으면 관리자 결과지가 "중단인데 9점"을 보여주고
 * 진행률 분모(1)보다 분자(10)가 커진다("낱말 쓰기 10 / 1").
 * 중단이 아니면 입력을 그대로 돌려주므로(항등) 정상 경로에는 영향이 없다.
 */
export function keepImplementedWriting<T extends number | undefined>(
  f: FormItems, writing: Record<string, T>,
): Record<string, T> {
  if (!writingCeilingHit(f, writing)) return writing
  const required = requiredWritingCodes(f, f.writingItems, writing)
  return Object.fromEntries(Object.entries(writing).filter(([code]) => required.has(code)))
}

export interface FlowState {
  writing: Partial<Record<string, number>>
  checklist: string[]
  /** 연습 페이지를 실시하는지(검사자가 마이크 확인 뒤에 고른다). 같은 아동이 반복 검사할 때
   *  매번 연습을 강요하지 않기 위한 선택이다 — false면 연습 페이지가 진행 목록에서 빠진다. */
  practice: boolean
}

/** 진행 상태에서 실제로 실시할 페이지 목록 — 연습을 건너뛰기로 했으면(practice === false)
 *  연습 페이지가 빠진다. (중단 규칙에 의한 페이지 제거는 2026-08-13 담당자 확정으로 폐기) */
export function visiblePages(f: FormItems, s: Partial<Pick<FlowState, 'practice'>>) {
  // practice가 undefined인 호출(옛 저장 상태·테스트)은 연습을 실시하는 쪽으로 본다 —
  // 빠뜨려서 연습이 사라지는 쪽보다 남는 쪽이 안전하다.
  return s.practice === false ? f.pages.filter(p => !p.practice) : f.pages
}

/**
 * 현재 페이지에서 [다음]을 누를 수 있는지 — 페이지 종류별 완료 조건.
 * 쓰기: 전 문항 입력. 체크리스트: 1개 이상 선택.
 * (녹음 문항 자체의 완료 여부는 이 함수가 판단하지 않는다 — 호출부에서 busy로 이미 잠겨 있다.)
 */
export function canAdvance(
  f: FormItems, page: FormItems['pages'][number],
  s: Omit<FlowState, 'practice'>,
): boolean {
  const writingDone = page.items.every(i => s.writing[i.code] !== undefined)
  return (page.section !== f.writingSection || writingDone)
    && (page.section !== 'checklist' || s.checklist.length > 0)
}
