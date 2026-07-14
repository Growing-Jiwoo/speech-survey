import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/password'

describe('password hashing', () => {
  it('올바른 비번은 검증 통과', () => {
    const stored = hashPassword('correct-horse')
    expect(verifyPassword('correct-horse', stored)).toBe(true)
  })
  it('틀린 비번은 실패', () => {
    const stored = hashPassword('correct-horse')
    expect(verifyPassword('wrong', stored)).toBe(false)
  })
  it('같은 비번도 매번 다른 해시(랜덤 salt)', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'))
  })
  it('형식이 깨진 저장값은 예외 없이 false', () => {
    expect(verifyPassword('x', 'not-a-valid-format')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
  })
})
