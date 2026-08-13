// lib/survey-flow.ts — 검사 진행 흐름 규칙. 순수 함수만 둔다.
// 중단 규칙(①·②)과 현장 채점은 2026-08-13 담당자 확정으로 폐기됐다 — 검사 화면은 수집만
// 하고, 판정·채점은 전부 관리자 결과지가 한다(스펙: docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md).
// ⚠️ 검사지에 인쇄된 중단 규칙 문구는 적용하지 않는다 — 시행 절차는 담당자 회신이 우선한다.
import type { FormItems } from './items'

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
