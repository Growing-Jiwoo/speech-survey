import { describe, it, expect } from 'vitest'
import { validName, validBirthYmd, validGrade, validClassNo, validGender, validContact } from '@/lib/validate'

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

describe('validBirthYmd', () => {
  it('YYMMDD 6자리 허용', () => {
    expect(validBirthYmd('190101')).toBe(true)
    expect(validBirthYmd('191231')).toBe(true)
  })
  it('2월 29일 허용 (YY만으로 윤년 판단 불가)', () => expect(validBirthYmd('200229')).toBe(true))
  it('존재하지 않는 월·일 거부', () => {
    expect(validBirthYmd('191301')).toBe(false) // 13월
    expect(validBirthYmd('190001')).toBe(false) // 0월
    expect(validBirthYmd('190132')).toBe(false) // 32일
    expect(validBirthYmd('190100')).toBe(false) // 0일
    expect(validBirthYmd('190230')).toBe(false) // 2월 30일
    expect(validBirthYmd('190431')).toBe(false) // 4월 31일
  })
  it('자릿수·형식 오류 거부', () => {
    expect(validBirthYmd('19010')).toBe(false)
    expect(validBirthYmd('1901011')).toBe(false)
    expect(validBirthYmd('19-01-01')).toBe(false)
    expect(validBirthYmd(190101 as unknown)).toBe(false)
  })
})

describe('validGrade / validClassNo', () => {
  it('학년 1~6 정수만', () => {
    expect(validGrade(1)).toBe(true)
    expect(validGrade(6)).toBe(true)
    expect(validGrade(0)).toBe(false)
    expect(validGrade(7)).toBe(false)
    expect(validGrade(1.5)).toBe(false)
    expect(validGrade('1' as unknown)).toBe(false)
  })
  it('반 1~99 정수만', () => {
    expect(validClassNo(1)).toBe(true)
    expect(validClassNo(99)).toBe(true)
    expect(validClassNo(0)).toBe(false)
    expect(validClassNo(100)).toBe(false)
  })
})

describe('validGender', () => {
  it("'남'/'여'만 허용", () => {
    expect(validGender('남')).toBe(true)
    expect(validGender('여')).toBe(true)
    expect(validGender('male')).toBe(false)
    expect(validGender('')).toBe(false)
  })
})

describe('validContact (전화 또는 이메일)', () => {
  it('휴대폰·유선 허용 (하이픈 유무 모두)', () => {
    expect(validContact('010-1234-5678')).toBe(true)
    expect(validContact('01012345678')).toBe(true)
    expect(validContact('02-123-4567')).toBe(true)
    expect(validContact('031-1234-5678')).toBe(true)
  })
  it('이메일 허용', () => {
    expect(validContact('teacher@school.kr')).toBe(true)
    expect(validContact('a.b+c@ed.go.kr')).toBe(true)
  })
  it('형식 오류 거부', () => {
    expect(validContact('1234')).toBe(false)
    expect(validContact('연락처없음')).toBe(false)
    expect(validContact('teacher@')).toBe(false)
    expect(validContact('@school.kr')).toBe(false)
    expect(validContact('')).toBe(false)
    expect(validContact('a'.repeat(61))).toBe(false)
  })
})
