import { describe, it, expect } from 'vitest'
import { hitsCeiling, readingCeilingHit, writingCeilingHit, visiblePages, CEILING_N } from '@/lib/survey-flow'

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
