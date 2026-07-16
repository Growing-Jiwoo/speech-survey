import { describe, it, expect } from 'vitest'
import { fmtDuration, pad2 } from '@/lib/format'

describe('fmtDuration — 초 → m:ss (미상은 —)', () => {
  it('정상 값', () => {
    expect(fmtDuration(0)).toBe('0:00')
    expect(fmtDuration(5)).toBe('0:05')
    expect(fmtDuration(65)).toBe('1:05')
    expect(fmtDuration(599.9)).toBe('9:59') // 내림 — 반올림으로 초가 60이 되지 않게
  })
  it('null·NaN·음수·Infinity는 — (길이 미상 표기)', () => {
    expect(fmtDuration(null)).toBe('—')
    expect(fmtDuration(undefined)).toBe('—')
    expect(fmtDuration(Number.NaN)).toBe('—')
    expect(fmtDuration(-1)).toBe('—')
    expect(fmtDuration(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('pad2', () => {
  it('두 자리 0 패딩', () => {
    expect(pad2(3)).toBe('03')
    expect(pad2(12)).toBe('12')
  })
})
