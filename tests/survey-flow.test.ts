import { describe, it, expect } from 'vitest'
import { visiblePages, canAdvance } from '@/lib/survey-flow'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const g1 = itemsFor(formForGrade(1))
const g2 = itemsFor(formForGrade(2))

describe('visiblePages — 연습 실시 여부 (검사자가 마이크 확인 뒤 고른다)', () => {
  it('연습을 건너뛰면 연습 페이지가 빠진다 (나머지 순서는 그대로)', () => {
    expect(visiblePages(g1, { practice: false }).map(p => p.code)).toEqual([
      'p_rw_meaning', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_ww', 'p_cl',
    ])
  })
  it('연습을 실시하면(또는 값이 없으면) 연습 페이지가 첫 페이지다', () => {
    expect(visiblePages(g1, { practice: true })[0].code).toBe('p_practice_rw')
    expect(visiblePages(g1, {})[0].code).toBe('p_practice_rw')
  })
})

describe('canAdvance ([다음] 버튼 활성화 조건)', () => {
  const empty = { writing: {}, checklist: [] }

  it('현장 채점이 아닌 낱말 해독 페이지는 writing/checklist와 무관하게 항상 진행 가능', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_rw_meaning')!, empty)).toBe(true)
  })

  it('문장 읽기 페이지는 writing/checklist와 무관하게 항상 진행 가능', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_rs01')!, empty)).toBe(true)
  })

  it('낱말 쓰기 페이지: 전부 선택하면 진행 가능', () => {
    const page = g1.pageByCode.get('p_ww')!
    const allWritten = Object.fromEntries(page.items.map(i => [i.code, 1]))
    expect(canAdvance(g1, page, { ...empty, writing: allWritten })).toBe(true)
  })

  it('낱말 쓰기 페이지: 일부만 선택하면 진행 불가', () => {
    const page = g1.pageByCode.get('p_ww')!
    const firstOne = Object.fromEntries(page.items.slice(0, 1).map(i => [i.code, 1]))
    expect(canAdvance(g1, page, { ...empty, writing: firstOne })).toBe(false)
  })

  it('문장 쓰기 페이지(G2): 5문항 전부 입력해야 진행 가능', () => {
    const page = g2.pageByCode.get('p_sw')!
    expect(canAdvance(g2, page, { ...empty, writing: { sw01: 2 } })).toBe(false)
    const all = Object.fromEntries(page.items.map(i => [i.code, 2]))
    expect(canAdvance(g2, page, { ...empty, writing: all })).toBe(true)
  })

  it('체크리스트 페이지: 1개 이상 선택하면 진행 가능', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_cl')!, { ...empty, checklist: ['none'] })).toBe(true)
  })

  it('체크리스트 페이지: 아무것도 선택하지 않으면 진행 불가', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_cl')!, empty)).toBe(false)
  })
})

// 쓰기 중단(규칙 ②) 폐기는 사용자 확정(2026-08-13)이고 담당자 재확인이 없다 —
// 담당자가 규칙 ②를 되살리라고 하면 이 describe의 전제부터 바뀐다.
describe('canAdvance — 쓰기는 전 문항 입력이 완료 조건이다 (중단 규칙 ② 폐기, 사용자 확정 2026-08-13)', () => {
  const wwPage = (f: typeof g1) => f.pages.find(p => p.section === f.writingSection)!
  it('G1: 1번이 0점이어도 나머지를 다 입력해야 진행 가능', () => {
    const partial = { ww01: 0 }
    expect(canAdvance(g1, wwPage(g1), { writing: partial, checklist: [] })).toBe(false)
    const all = Object.fromEntries(g1.writingItems.map(i => [i.code, 0]))
    expect(canAdvance(g1, wwPage(g1), { writing: all, checklist: [] })).toBe(true)
  })
  it('G2: 첫 문장이 0점이어도 5문항 전부 입력해야 진행 가능', () => {
    expect(canAdvance(g2, wwPage(g2), { writing: { sw01: 0 }, checklist: [] })).toBe(false)
    const all = Object.fromEntries(g2.writingItems.map(i => [i.code, 0]))
    expect(canAdvance(g2, wwPage(g2), { writing: all, checklist: [] })).toBe(true)
  })
})
