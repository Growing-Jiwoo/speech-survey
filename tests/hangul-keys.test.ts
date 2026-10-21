import { describe, it, expect } from 'vitest'
import { hasHangul, qwertyFromHangul } from '@/lib/hangul-keys'

describe('qwertyFromHangul — 한글 자판으로 친 학급 코드를 영문 자리로', () => {
  // 코드 K7RM4Q를 한글 자판으로 치면 K→ㅏ, R+M→그(입력기가 합친다), Q→ㅂ
  it('합쳐진 음절을 풀어 자리로 옮긴다', () => expect(qwertyFromHangul('ㅏ7그4ㅂ').toUpperCase()).toBe('K7RM4Q'))
  it('자모만 친 경우', () => expect(qwertyFromHangul('ㅂㅁㅂㅁ33').toUpperCase()).toBe('QAQA33'))
  it('받침 있는 음절(ㅂ+ㅏ+ㅁ = 밤)', () => expect(qwertyFromHangul('밤').toUpperCase()).toBe('QKA'))
  it('겹받침·겹모음은 두 자리로(값 = ㄱ+ㅏ+ㅄ → RKQT, 과 → RHK)', () => {
    expect(qwertyFromHangul('값').toUpperCase()).toBe('RKQT')
    expect(qwertyFromHangul('과').toUpperCase()).toBe('RHK')
  })
  it('Shift 자모(ㅃ·ㄲ)도 같은 자리', () => expect(qwertyFromHangul('ㅃㄲ').toUpperCase()).toBe('QR'))
  it('영문·숫자·공백은 그대로', () => expect(qwertyFromHangul(' K7RM4Q ')).toBe(' K7RM4Q '))
  it('hasHangul', () => { expect(hasHangul('ㅏ7')).toBe(true); expect(hasHangul('K7')).toBe(false) })
})
