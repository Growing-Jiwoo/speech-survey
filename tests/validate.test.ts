import { describe, it, expect } from 'vitest'
import { validName, validAge } from '@/lib/validate'

describe('validName', () => {
  it('한글 이름 허용', () => expect(validName('김도연')).toBe(true))
  it('영어 이름 허용', () => expect(validName('Lucas')).toBe(true))
  it('단어 사이 단일 공백 허용', () => {
    expect(validName('김 지우')).toBe(true)
    expect(validName('Mary Jane')).toBe(true)
  })
  it('한영 혼합 허용', () => expect(validName('지우Kim')).toBe(true))
  it('숫자·특수문자 거부', () => {
    expect(validName('지우1')).toBe(false)
    expect(validName('지우!')).toBe(false)
    expect(validName('지우 😀')).toBe(false)
  })
  it('자모 단독 거부 (완성형만)', () => expect(validName('ㄱㄴ')).toBe(false))
  it('빈 문자열·공백만 거부', () => {
    expect(validName('')).toBe(false)
    expect(validName(' ')).toBe(false)
  })
  it('연속 공백·앞뒤 공백 거부 (호출 전 정규화 전제)', () => {
    expect(validName('김  지우')).toBe(false)
    expect(validName(' 김지우')).toBe(false)
  })
  it('30자 초과 거부', () => expect(validName('a'.repeat(31))).toBe(false))
  it('문자열 아니면 거부', () => expect(validName(3 as unknown)).toBe(false))
})

describe('validAge', () => {
  it('1~999 정수 허용 (기존 3~19 제한 삭제 확인)', () => {
    expect(validAge(1)).toBe(true)
    expect(validAge(20)).toBe(true)
    expect(validAge(999)).toBe(true)
  })
  it('0·음수·1000 이상 거부', () => {
    expect(validAge(0)).toBe(false)
    expect(validAge(-1)).toBe(false)
    expect(validAge(1000)).toBe(false)
  })
  it('소수·NaN·문자열 거부', () => {
    expect(validAge(8.5)).toBe(false)
    expect(validAge(NaN)).toBe(false)
    expect(validAge('8' as unknown)).toBe(false)
  })
})
