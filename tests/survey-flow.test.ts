import { describe, it, expect } from 'vitest'
import {
  hitsCeiling, readingCeilingHit, writingCeilingHit, visiblePages, canAdvance,
  requiredWritingCodes, CEILING_N,
} from '@/lib/survey-flow'
import { pageByCode } from '@/lib/items'

const codes = (marks: Record<string, boolean>) => visiblePages({ marks }).map(p => p.code)

describe('hitsCeiling (앞 3개 연속 오반응)', () => {
  it('앞 3개가 모두 오반응이면 중단', () => {
    expect(hitsCeiling([false, false, false, true, true])).toBe(true)
  })
  it('앞 3개 중 하나라도 정반응이면 중단 아님', () => {
    expect(hitsCeiling([false, true, false])).toBe(false)
    expect(hitsCeiling([true, false, false])).toBe(false)
    expect(hitsCeiling([false, false, true])).toBe(false)
  })
  it('4번째부터 3연속 오반응은 중단 아님 (검사지는 "첫 3개")', () => {
    expect(hitsCeiling([true, true, true, false, false, false])).toBe(false)
  })
  it('아직 3개를 채점하지 않았으면 중단 아님', () => {
    expect(hitsCeiling([false, false])).toBe(false)
    expect(hitsCeiling([false, false, undefined])).toBe(false)
    expect(hitsCeiling([])).toBe(false)
  })
  it('임계값은 3', () => {
    expect(CEILING_N).toBe(3)
  })
})

describe('readingCeilingHit (낱말 해독 의미 낱말)', () => {
  it('rw01~03 모두 오반응 → 중단', () => {
    expect(readingCeilingHit({ rw01: false, rw02: false, rw03: false })).toBe(true)
  })
  it('하나라도 정반응이면 계속', () => {
    expect(readingCeilingHit({ rw01: false, rw02: true, rw03: false })).toBe(false)
  })
  it('미채점이면 계속', () => {
    expect(readingCeilingHit({})).toBe(false)
  })
})

describe('writingCeilingHit (낱말 쓰기 의미 낱말)', () => {
  it('ww01~03 모두 못 씀 → 중단', () => {
    expect(writingCeilingHit({ ww01: false, ww02: false, ww03: false })).toBe(true)
  })
  it('하나라도 쓸 수 있으면 계속', () => {
    expect(writingCeilingHit({ ww01: false, ww02: false, ww03: true })).toBe(false)
  })
})

describe('visiblePages (중단 규칙 반영한 진행 페이지)', () => {
  it('중단 없으면 전체 페이지', () => {
    expect(codes({})).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_meaning_mark', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_ww', 'p_cl',
    ])
  })

  it('낱말 해독 중단 시 문장·쓰기를 뺀다 (무의미 낱말은 계속 — 검사지 명시)', () => {
    expect(codes({ rw01: false, rw02: false, rw03: false })).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_meaning_mark', 'p_rw_nonsense', 'p_cl',
    ])
  })

  it('중단되어도 검사자 체크리스트는 남는다 (아동 과제가 아니라 검사자 관찰 기록 — 가정 A1)', () => {
    expect(codes({ rw01: false, rw02: false, rw03: false })).toContain('p_cl')
  })
})

describe('requiredWritingCodes (낱말 쓰기에서 실제로 요구되는 문항 코드)', () => {
  const page = pageByCode.get('p_ww')!

  it('중단 아니면 주어진 문항 전체의 코드를 요구', () => {
    expect(requiredWritingCodes(page.items, {})).toEqual(new Set(page.items.map(i => i.code)))
  })

  it('중단 걸리면 ww01~03만 요구 — items 배열을 뒤섞거나 걸러도 결과는 동일 (코드 기반, 위치 기반 아님)', () => {
    const writing = { ww01: false, ww02: false, ww03: false }
    expect(requiredWritingCodes(page.items, writing)).toEqual(new Set(['ww01', 'ww02', 'ww03']))
    // 의도적으로 순서를 뒤집고 일부만 남긴 배열을 넘겨도(위치 기반이었다면 결과가 달라졌을 것) 동일해야 한다.
    const reorderedSubset = [...page.items].reverse().slice(0, 4)
    expect(requiredWritingCodes(reorderedSubset, writing)).toEqual(new Set(['ww01', 'ww02', 'ww03']))
  })
})

describe('requiredWritingCodes로 구현하는 낱말 쓰기 일괄 선택("모두 예"/"모두 아니오") 안전성', () => {
  // app/survey/page.tsx의 onSetAll은 v를 10문항 전체에 적용한 tentative 상태를 만들고,
  // requiredWritingCodes(page.items, tentative)가 돌려주는 코드에만 실제로 값을 반영한다.
  // 여기서는 그 tentative 병합 결과를 직접 구성해 requiredWritingCodes에 넣어 검증한다.
  const page = pageByCode.get('p_ww')!

  it('빈 상태에서 "모두 아니오": 중단이 걸려 앞 3개(의미 낱말)만 요구 — 나머지 7개는 기록되지 않아야 함', () => {
    const tentative = Object.fromEntries(page.items.map(i => [i.code, false]))
    expect(requiredWritingCodes(page.items, tentative)).toEqual(new Set(['ww01', 'ww02', 'ww03']))
  })

  it('빈 상태에서 "모두 예": 중단이 걸리지 않아 10개 전체를 요구', () => {
    const tentative = Object.fromEntries(page.items.map(i => [i.code, true]))
    expect(requiredWritingCodes(page.items, tentative)).toEqual(new Set(page.items.map(i => i.code)))
  })

  it('ww01·ww02가 이미 오반응인 상태에서 일괄 "모두 아니오": 이 클릭이 중단을 유발해도 앞 3개만 요구', () => {
    const before = { ww01: false, ww02: false }
    const tentative = { ...before, ...Object.fromEntries(page.items.map(i => [i.code, false])) }
    expect(requiredWritingCodes(page.items, tentative)).toEqual(new Set(['ww01', 'ww02', 'ww03']))
  })
})

describe('canAdvance ([다음] 버튼 활성화 조건)', () => {
  const empty = { marks: {}, writing: {}, checklist: [] }

  it('현장 채점이 아닌 낱말 해독 페이지는 marks/writing/checklist와 무관하게 항상 진행 가능', () => {
    const page = pageByCode.get('p_rw_meaning')!
    expect(canAdvance(page, empty)).toBe(true)
  })

  it('문장 읽기 페이지는 marks/writing/checklist와 무관하게 항상 진행 가능', () => {
    const page = pageByCode.get('p_rs01')!
    expect(canAdvance(page, empty)).toBe(true)
  })

  it('현장 채점 페이지: 낱말 전부 표시해야 진행 가능', () => {
    const page = pageByCode.get('p_rw_meaning_mark')!
    const allMarked = Object.fromEntries(page.items.map(i => [i.code, true]))
    expect(canAdvance(page, { ...empty, marks: allMarked })).toBe(true)
  })

  it('현장 채점 페이지: 하나라도 미채점이면 진행 불가', () => {
    const page = pageByCode.get('p_rw_meaning_mark')!
    const allButLast = Object.fromEntries(page.items.slice(0, -1).map(i => [i.code, true]))
    expect(canAdvance(page, { ...empty, marks: allButLast })).toBe(false)
  })

  it('낱말 쓰기 페이지: 전부 선택하면 진행 가능', () => {
    const page = pageByCode.get('p_ww')!
    const allWritten = Object.fromEntries(page.items.map(i => [i.code, true]))
    expect(canAdvance(page, { ...empty, writing: allWritten })).toBe(true)
  })

  it('낱말 쓰기 페이지: 중단 규칙에 걸리면 앞 3개만 선택해도 진행 가능', () => {
    const page = pageByCode.get('p_ww')!
    // ww01~03(의미 낱말) 모두 오반응 → 중단. 앞 3개(page.items 순서 기준)만 채워도 충분.
    const firstThree = Object.fromEntries(page.items.slice(0, CEILING_N).map(i => [i.code, false]))
    expect(canAdvance(page, { ...empty, writing: firstThree })).toBe(true)
  })

  it('낱말 쓰기 페이지: 중단 규칙에 안 걸리고 일부만 선택하면 진행 불가', () => {
    const page = pageByCode.get('p_ww')!
    const firstOne = Object.fromEntries(page.items.slice(0, 1).map(i => [i.code, true]))
    expect(canAdvance(page, { ...empty, writing: firstOne })).toBe(false)
  })

  it('낱말 쓰기 페이지: items 나열 순서가 바뀌어도 중단 규칙은 문항 코드(ww01~03) 기준으로 판정된다', () => {
    const page = pageByCode.get('p_ww')!
    // 의미/무의미 순서를 뒤집은 가짜 페이지 — 배열 위치 기준 판정이었다면 여기서 어긋난다.
    const reorderedPage = { ...page, items: [...page.items].reverse() }
    const writing = { ww01: false, ww02: false, ww03: false }
    expect(canAdvance(reorderedPage, { ...empty, writing })).toBe(true)
  })

  it('체크리스트 페이지: 1개 이상 선택하면 진행 가능', () => {
    const page = pageByCode.get('p_cl')!
    expect(canAdvance(page, { ...empty, checklist: ['none'] })).toBe(true)
  })

  it('체크리스트 페이지: 아무것도 선택하지 않으면 진행 불가', () => {
    const page = pageByCode.get('p_cl')!
    expect(canAdvance(page, empty)).toBe(false)
  })
})
