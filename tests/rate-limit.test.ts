import { describe, it, expect } from 'vitest'
import { rateLimitDecision } from '@/lib/db'

const WINDOW = 3600_000 // 1시간
const MAX = 3
const T0 = 1_000_000_000_000 // 고정 기준 시각(ms)

describe('rateLimitDecision (고정 윈도우 판정)', () => {
  it('기록 없음(첫 요청) → 허용, count=1, 윈도우 시작=now', () => {
    expect(rateLimitDecision(T0, null, MAX, WINDOW)).toEqual({
      allowed: true, nextCount: 1, windowStartMs: T0,
    })
  })
  it('윈도우 내 · 상한 미만 → 허용, count 증가, 윈도우 시작 유지', () => {
    const existing = { windowStartMs: T0, count: 1 }
    expect(rateLimitDecision(T0 + 1000, existing, MAX, WINDOW)).toEqual({
      allowed: true, nextCount: 2, windowStartMs: T0,
    })
  })
  it('윈도우 내 · 상한 도달 → 차단(count 그대로)', () => {
    const existing = { windowStartMs: T0, count: MAX }
    expect(rateLimitDecision(T0 + 1000, existing, MAX, WINDOW)).toEqual({
      allowed: false, nextCount: MAX, windowStartMs: T0,
    })
  })
  it('윈도우 경과 → 새 윈도우로 리셋(count=1, 윈도우 시작=now)', () => {
    const existing = { windowStartMs: T0, count: MAX }
    const now = T0 + WINDOW + 1
    expect(rateLimitDecision(now, existing, MAX, WINDOW)).toEqual({
      allowed: true, nextCount: 1, windowStartMs: now,
    })
  })
  it('윈도우 경계(정확히 windowMs 경과)는 경과로 간주해 리셋', () => {
    const existing = { windowStartMs: T0, count: MAX }
    const now = T0 + WINDOW // now - start === windowMs → withinWindow=false
    expect(rateLimitDecision(now, existing, MAX, WINDOW)).toMatchObject({
      allowed: true, nextCount: 1, windowStartMs: now,
    })
  })
})
