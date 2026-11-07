import { describe, expect, it } from 'vitest'
import { applySeqLabel, childCode } from '@/lib/child-code'

describe('childCode', () => {
  it('신청 순번 3자리 · 출석 번호 2자리로 맞춘다', () => {
    expect(childCode(17, 3)).toBe('017-03')
    expect(childCode(1, 1)).toBe('001-01')
    expect(childCode(999, 99)).toBe('999-99')
  })

  it('자리를 넘치면 자르지 않고 그대로 늘린다', () => {
    expect(childCode(1234, 3)).toBe('1234-03')
    expect(childCode(17, 100)).toBe('017-100')
  })
})

describe('applySeqLabel', () => {
  it('[REGRESSION] 화면의 #순번은 아동 코드 앞자리와 같은 자리 수다 — 갈리면 화면 번호로 파일을 찾지 못한다', () => {
    for (const seq of [1, 17, 999, 1234]) {
      expect(applySeqLabel(seq)).toBe(`#${childCode(seq, 1).split('-')[0]}`)
    }
    expect(applySeqLabel(17)).toBe('#017')
  })
})
