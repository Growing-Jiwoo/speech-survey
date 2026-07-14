// tests/audio.test.ts
import { describe, it, expect } from 'vitest'
import { MIC_MIN_PEAK, remainingSec, classifyRecorderError, RecorderError } from '@/lib/audio'

describe('MIC_MIN_PEAK', () => {
  it('0과 1 사이 단일 임계값', () => {
    expect(MIC_MIN_PEAK).toBeGreaterThan(0)
    expect(MIC_MIN_PEAK).toBeLessThan(1)
  })
})

describe('remainingSec', () => {
  it('경과 0이면 maxSec', () => expect(remainingSec(0, 30)).toBe(30))
  it('올림 규칙 (0.2초 경과 → 30초 표기 유지)', () => expect(remainingSec(200, 30)).toBe(30))
  it('중간값 올림', () => expect(remainingSec(1500, 30)).toBe(29))
  it('초과 시 0 하한', () => expect(remainingSec(40_000, 30)).toBe(0))
})

describe('classifyRecorderError', () => {
  it('권한 거부 계열 → denied', () => {
    expect(classifyRecorderError({ name: 'NotAllowedError' })).toBe('denied')
    expect(classifyRecorderError({ name: 'SecurityError' })).toBe('denied')
  })
  it('미지원 계열 → unsupported', () => {
    expect(classifyRecorderError({ name: 'NotSupportedError' })).toBe('unsupported')
  })
  it('RecorderError는 kind 그대로 전달', () => {
    expect(classifyRecorderError(new RecorderError('unsupported'))).toBe('unsupported')
  })
  it('그 외 → failed', () => {
    expect(classifyRecorderError({ name: 'NotFoundError' })).toBe('failed')
    expect(classifyRecorderError(new Error('boom'))).toBe('failed')
    expect(classifyRecorderError(undefined)).toBe('failed')
  })
})
