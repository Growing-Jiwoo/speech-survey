import { describe, it, expect } from 'vitest'
import { GLOBAL_BACKOFF_MAX_MS, GLOBAL_BACKOFF_START, LOCKED_MSG, LOCK_MS, globalBackoffMs } from '@/lib/login-policy'

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

// 잠금 문구는 「잠시 후」가 아니라 몇 분인지 말한다(2026-10-12 점검) — 숫자는 LOCK_MS에서 나와 글자와 값이 어긋나지 않는다
describe('LOCKED_MSG', () => {
  it('잠금 시간을 분으로 말한다(지금 10분)', () => {
    expect(LOCK_MS).toBe(10 * 60_000)
    expect(LOCKED_MSG).toBe('시도가 너무 많아요. 10분 뒤에 다시 시도해 주세요.')
  })
})
