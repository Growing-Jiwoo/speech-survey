import { describe, it, expect } from 'vitest'
import {
  hitsCeiling, readingCeilingHit, writingCeilingHit, visiblePages, canAdvance,
  keepImplementedWriting, requiredWritingCodes, isWritingWrong, CEILING_N,
} from '@/lib/survey-flow'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const g1 = itemsFor(formForGrade(1))
const g2 = itemsFor(formForGrade(2))

describe('hitsCeiling (앞 N개 연속 오반응)', () => {
  it('앞 3개가 모두 오반응이면 중단', () => {
    expect(hitsCeiling([true, true, true, false, false])).toBe(true)
  })
  it('앞 3개 중 하나라도 정반응이면 중단 아님', () => {
    expect(hitsCeiling([true, false, true])).toBe(false)
    expect(hitsCeiling([false, true, true])).toBe(false)
    expect(hitsCeiling([true, true, false])).toBe(false)
  })
  it('4번째부터 3연속 오반응은 중단 아님 (검사지는 "첫 3개")', () => {
    expect(hitsCeiling([false, false, false, true, true, true])).toBe(false)
  })
  it('아직 3개를 채점하지 않았으면 중단 아님', () => {
    expect(hitsCeiling([true, true])).toBe(false)
    expect(hitsCeiling([true, true, undefined])).toBe(false)
    expect(hitsCeiling([])).toBe(false)
  })
  it('n=1이면 첫 항목만 본다 (쓰기 중단 규칙 — 양식 무관)', () => {
    expect(hitsCeiling([true, false, false], 1)).toBe(true)
    expect(hitsCeiling([false, true, true], 1)).toBe(false)
    expect(hitsCeiling([undefined], 1)).toBe(false)
  })
  it('임계값은 3', () => {
    expect(CEILING_N).toBe(3)
  })
})

describe('readingCeilingHit (낱말 해독 의미 낱말)', () => {
  it('rw01~03 모두 오반응 → 중단', () => {
    expect(readingCeilingHit(g1, { rw01: false, rw02: false, rw03: false })).toBe(true)
    expect(readingCeilingHit(g2, { rw01: false, rw02: false, rw03: false })).toBe(true)
  })
  it('하나라도 정반응이면 계속', () => {
    expect(readingCeilingHit(g1, { rw01: false, rw02: true, rw03: false })).toBe(false)
  })
  it('미채점이면 계속', () => {
    expect(readingCeilingHit(g1, {})).toBe(false)
  })
})

describe('isWritingWrong — 무엇이 오반응인가', () => {
  it('0점(한 어절도 못 씀)만 오반응이다', () => {
    expect(isWritingWrong(0)).toBe(true)
    expect(isWritingWrong(1)).toBe(false)
    expect(isWritingWrong(2)).toBe(false)
  })
  it('미채점은 판정하지 않는다 (중단으로 보지 않는다)', () => {
    expect(isWritingWrong(undefined)).toBeUndefined()
  })
})

describe('writingCeilingHit — 1번 문항 하나로 판정 (담당자 확정)', () => {
  it('G1: 1번 낱말(ww01)만 0점이면 중단 — 2·3번은 보지 않는다', () => {
    expect(writingCeilingHit(g1, { ww01: 0 })).toBe(true)
    expect(writingCeilingHit(g1, { ww01: 1 })).toBe(false)
    expect(writingCeilingHit(g1, { ww01: 1, ww02: 0, ww03: 0 })).toBe(false)
    expect(writingCeilingHit(g1, {})).toBe(false)
  })
  it('G2: 첫 문장 하나만 0점이면 중단', () => {
    expect(writingCeilingHit(g2, { sw01: 0 })).toBe(true)
    // 두 어절 중 하나라도 맞혔으면 오반응이 아니다(1점은 오반응 아님 — 담당자 확정) → 계속
    expect(writingCeilingHit(g2, { sw01: 1 })).toBe(false)
    expect(writingCeilingHit(g2, { sw01: 2 })).toBe(false)
    expect(writingCeilingHit(g2, {})).toBe(false)
  })
  it('둘째 문항이 0점이어도 중단이 아니다 ("첫 문항" 규칙)', () => {
    expect(writingCeilingHit(g2, { sw01: 2, sw02: 0 })).toBe(false)
    expect(writingCeilingHit(g1, { ww01: 1, ww02: 0 })).toBe(false)
  })
})

describe('visiblePages — 연습 실시 여부 (검사자가 마이크 확인 뒤 고른다)', () => {
  it('연습을 건너뛰면 연습 페이지가 빠진다 (나머지 순서는 그대로)', () => {
    expect(visiblePages(g1, { practice: false }).map(p => p.code)).toEqual([
      'p_rw_meaning', 'p_rw_meaning_mark', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_ww', 'p_cl',
    ])
  })
  it('연습을 실시하면(또는 값이 없으면) 연습 페이지가 첫 페이지다', () => {
    expect(visiblePages(g1, { practice: true })[0].code).toBe('p_practice_rw')
    expect(visiblePages(g1, {})[0].code).toBe('p_practice_rw')
  })
})

describe('keepImplementedWriting — 중단 이후 문항의 답은 버린다 (항목 10)', () => {
  it('G1: 1번이 0점이면 2~10번 값을 버린다 (검사자가 뒤 문항을 먼저 채점한 경우)', () => {
    const entered = { ww01: 0, ww02: 1, ww03: 1, ww04: 1, ww05: 1, ww06: 1, ww07: 1, ww08: 1, ww09: 1, ww10: 1 }
    expect(keepImplementedWriting(g1, entered)).toEqual({ ww01: 0 })
  })
  it('G2: 첫 문장이 0점이면 sw01만 남는다', () => {
    expect(keepImplementedWriting(g2, { sw01: 0, sw02: 2, sw03: 1 })).toEqual({ sw01: 0 })
  })
  it('중단이 아니면 입력을 그대로 돌려준다 (정상 경로에 영향 없음)', () => {
    const entered = { ww01: 1, ww02: 0, ww03: 1 }
    expect(keepImplementedWriting(g1, entered)).toBe(entered)
    expect(keepImplementedWriting(g2, { sw01: 1, sw02: 0 })).toEqual({ sw01: 1, sw02: 0 })
  })
  it('빈 입력도 그대로 (미채점을 중단으로 보지 않는다)', () => {
    expect(keepImplementedWriting(g1, {})).toEqual({})
  })
})

describe('requiredWritingCodes (쓰기에서 실제로 요구되는 문항 코드)', () => {
  const page = g1.pageByCode.get('p_ww')!

  it('중단 아니면 주어진 문항 전체의 코드를 요구', () => {
    expect(requiredWritingCodes(g1, page.items, {})).toEqual(new Set(page.items.map(i => i.code)))
  })

  it('중단 걸리면 ww01만 요구 — items 배열을 뒤섞거나 걸러도 결과는 동일 (코드 기반, 위치 기반 아님)', () => {
    const writing = { ww01: 0 }
    expect(requiredWritingCodes(g1, page.items, writing)).toEqual(new Set(['ww01']))
    const reorderedSubset = [...page.items].reverse().slice(0, 4)
    expect(requiredWritingCodes(g1, reorderedSubset, writing)).toEqual(new Set(['ww01']))
  })

  it('G2: 첫 문장 0점이면 sw01만 요구', () => {
    const items = g2.pageByCode.get('p_sw')!.items
    expect(requiredWritingCodes(g2, items, {})).toEqual(new Set(items.map(i => i.code)))
    expect(requiredWritingCodes(g2, items, { sw01: 0 })).toEqual(new Set(['sw01']))
    expect(requiredWritingCodes(g2, items, { sw01: 1 })).toEqual(new Set(items.map(i => i.code)))
  })
})

describe('requiredWritingCodes로 구현하는 낱말 쓰기 일괄 선택("모두 예"/"모두 아니오") 안전성', () => {
  // app/survey/page.tsx의 onSetAll은 v를 10문항 전체에 적용한 tentative 상태를 만들고,
  // requiredWritingCodes(f, page.items, tentative)가 돌려주는 코드에만 실제로 값을 반영한다.
  // 여기서는 그 tentative 병합 결과를 직접 구성해 requiredWritingCodes에 넣어 검증한다.
  const page = g1.pageByCode.get('p_ww')!

  it('빈 상태에서 "모두 아니오": 중단이 걸려 1번만 요구 — 나머지 9개는 기록되지 않아야 함', () => {
    const tentative = Object.fromEntries(page.items.map(i => [i.code, 0]))
    expect(requiredWritingCodes(g1, page.items, tentative)).toEqual(new Set(['ww01']))
  })

  it('빈 상태에서 "모두 예": 중단이 걸리지 않아 10개 전체를 요구', () => {
    const tentative = Object.fromEntries(page.items.map(i => [i.code, 1]))
    expect(requiredWritingCodes(g1, page.items, tentative)).toEqual(new Set(page.items.map(i => i.code)))
  })

  it('ww01이 이미 오반응인 상태에서 일괄 "모두 아니오": 1번만 요구', () => {
    const tentative = { ww01: 0, ...Object.fromEntries(page.items.map(i => [i.code, 0])) }
    expect(requiredWritingCodes(g1, page.items, tentative)).toEqual(new Set(['ww01']))
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

  it('낱말 쓰기 페이지: 중단 규칙에 안 걸리고 일부만 선택하면 진행 불가', () => {
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

describe('canAdvance — 쓰기는 전 문항 입력이 완료 조건이다 (중단 규칙 폐기, 담당자 확정 2026-08-13)', () => {
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
