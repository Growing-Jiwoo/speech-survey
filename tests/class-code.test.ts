import { describe, expect, it } from 'vitest'
import { generateClassCode } from '@/lib/class-code'
import { CODE_ALPHABET, CODE_LEN } from '@/lib/schema'

describe('generateClassCode', () => {
  it('길이 6, 허용 알파벳만 쓴다 (혼동 문자 0·O·1·I·L 없음)', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateClassCode()
      expect(c).toHaveLength(CODE_LEN)
      for (const ch of c) expect(CODE_ALPHABET.includes(ch)).toBe(true)
    }
  })
})
