import { describe, it, expect } from 'vitest'
import { compareUtterance, normalize } from '@/lib/compare'

describe('normalize', () => {
  it('소문자화·구두점 제거·공백 축약', () => {
    expect(normalize('The cat sits on the mat.')).toBe('the cat sits on the mat')
    expect(normalize("  Don't   run! ")).toBe('dont run')
  })
  it('NFKC: 전각·합자 정규화', () => {
    expect(normalize('ＡＢＣ')).toBe('abc')
    expect(normalize('ﬁne')).toBe('fine')
  })
})

describe('compareUtterance', () => {
  it('대소문자·구두점 차이는 일치', () =>
    expect(compareUtterance('I like apples.', 'i like apples')).toBe('matched'))
  it('아포스트로피 유무는 일치', () =>
    expect(compareUtterance("Don't run.", 'dont run')).toBe('matched'))
  it('단어가 다르면 불일치', () =>
    expect(compareUtterance('I like apples and oranges.', 'I like apple and orange.')).toBe('mismatched'))
  it('STT 빈 값·공백만이면 인식 안 됨', () => {
    expect(compareUtterance('Hello.', '')).toBe('unrecognized')
    expect(compareUtterance('Hello.', '  ')).toBe('unrecognized')
  })
})
