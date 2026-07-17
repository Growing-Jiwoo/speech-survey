import { describe, it, expect, vi, afterEach } from 'vitest'
import { env } from '@/lib/env'

afterEach(() => vi.unstubAllEnvs())

describe('env — 필수 환경변수 로더', () => {
  it('설정된 값을 그대로 반환', () => {
    vi.stubEnv('TEST_ENV_KEY', 'value-1')
    expect(env('TEST_ENV_KEY')).toBe('value-1')
  })
  it('미설정이면 변수명을 담아 throw (fail-fast — 빈 키로 조용히 진행 금지)', () => {
    vi.stubEnv('TEST_ENV_KEY', '')
    expect(() => env('TEST_ENV_KEY')).toThrow(/TEST_ENV_KEY/)
  })
})
