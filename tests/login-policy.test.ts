import { describe, it, expect } from 'vitest'
import { GLOBAL_BACKOFF_MAX_MS, GLOBAL_BACKOFF_START, globalBackoffMs } from '@/lib/login-policy'

describe('globalBackoffMs — 전역 실패 누적 → 지연(하드 잠금 대체)', () => {
  it('임계 미만은 지연 0', () => {
    expect(globalBackoffMs(0)).toBe(0)
    expect(globalBackoffMs(GLOBAL_BACKOFF_START - 1)).toBe(0)
  })
  it('임계 도달부터 선형 증가', () => {
    expect(globalBackoffMs(GLOBAL_BACKOFF_START)).toBe(300)
    expect(globalBackoffMs(GLOBAL_BACKOFF_START + 2)).toBe(900)
  })
  it('상한(MAX)에서 포화 — 무한 증가하지 않음(자원 소모 방지)', () => {
    expect(globalBackoffMs(10_000)).toBe(GLOBAL_BACKOFF_MAX_MS)
  })
})
