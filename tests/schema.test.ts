import { describe, it, expect } from 'vitest'
import {
  sessionCreateSchema, phoneSchema, classCodeSchema, childNoSchema, classCodeCreateSchema,
} from '@/lib/schema'

const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
  name: '김도연', teacherName: '박선생', teacherPhone: '010-1234-5678', teacherEmail: '',
  examinerType: 'teacher',
  guardianConsent: true, // 법정대리인 서면 동의 확인(필수 — 제22조의2)
}

describe('sessionCreateSchema', () => {
  it('유효 입력 파싱 성공', () => {
    expect(sessionCreateSchema.safeParse(VALID).success).toBe(true)
  })
  it('이름 앞뒤·연속 공백 정규화', () => {
    const r = sessionCreateSchema.safeParse({ ...VALID, name: '  Mary   Jane ' })
    expect(r.success && r.data.name).toBe('Mary Jane')
  })
  it('학교명 앞뒤 공백 정규화', () => {
    const r = sessionCreateSchema.safeParse({ ...VALID, schoolName: '  서울신구초등학교 ' })
    expect(r.success && r.data.schoolName).toBe('서울신구초등학교')
  })
  it('guardianConsent는 true 리터럴만 허용(false·누락·truthy 문자열 거부)', () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, guardianConsent: false }).success).toBe(false)
    expect(sessionCreateSchema.safeParse({ ...VALID, guardianConsent: 'true' }).success).toBe(false)
    const { guardianConsent: _omitted, ...withoutConsent } = VALID
    expect(sessionCreateSchema.safeParse(withoutConsent).success).toBe(false)
  })
  it('미등록 지역 거부', () =>
    expect(sessionCreateSchema.safeParse({ ...VALID, region: '화성교육청' }).success).toBe(false))
  it('학년 범위 밖 거부', () =>
    expect(sessionCreateSchema.safeParse({ ...VALID, grade: 7 }).success).toBe(false))
  it('본문이 객체가 아니면 거부', () =>
    expect(sessionCreateSchema.safeParse(null).success).toBe(false))
})

describe('반(classNo) — 단일학급 0 허용', () => {
  it('0은 단일학급(반 없음)으로 허용된다', () =>
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 0 }).success).toBe(true))
  it('1~99는 허용된다', () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 1 }).success).toBe(true)
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 99 }).success).toBe(true)
  })
  it('음수·100 이상·소수는 거부된다', () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: -1 }).success).toBe(false)
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 100 }).success).toBe(false)
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 1.5 }).success).toBe(false)
  })
})

describe('담임 연락처 — 전화/이메일 분리, 둘 중 하나 필수', () => {
  it('전화만 입력해도 통과', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '010-1234-5678', teacherEmail: '' }).success).toBe(true))
  it('이메일만 입력해도 통과', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '', teacherEmail: 'teacher@school.kr' }).success).toBe(true))
  it('둘 다 입력해도 통과', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '010-1234-5678', teacherEmail: 'teacher@school.kr' }).success).toBe(true))
  it('둘 다 비면 거부 — 하나는 반드시 필요하다', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '', teacherEmail: '' }).success).toBe(false))
  it('전화 형식이 틀리면 거부', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '1234', teacherEmail: '' }).success).toBe(false))
  it('이메일 형식이 틀리면 거부', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '', teacherEmail: 'not-an-email' }).success).toBe(false))
  it('공백만 입력한 칸은 미입력으로 본다', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '   ', teacherEmail: '' }).success).toBe(false))
  it('앞뒤 공백은 정리되고 하이픈은 제거되어 파싱된다', () => {
    const r = sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '  010-1234-5678  ', teacherEmail: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.teacherPhone).toBe('01012345678')
  })
  it('sessionCreateSchema도 전화 하이픈을 떼어 파싱한다', () => {
    const d = sessionCreateSchema.parse({ ...VALID, teacherPhone: '010-1234-5678' })
    expect(d.teacherPhone).toBe('01012345678')
  })
})

describe('전화번호 정규화 — 하이픈 제거 저장 (사용자 확정 2026-08-13)', () => {
  it('하이픈 있는 입력이 통과하고 파싱 결과에서 하이픈이 빠진다', () => {
    expect(phoneSchema.parse('010-1234-5678')).toBe('01012345678')
    expect(phoneSchema.parse('01012345678')).toBe('01012345678')
  })
  it('형식이 틀리면 거부', () => {
    expect(phoneSchema.safeParse('12-3456-7890').success).toBe(false)
    expect(phoneSchema.safeParse('010-12-5678').success).toBe(false)
  })
})

describe('classCodeSchema — 6자리 학급 코드', () => {
  it('소문자·양끝 공백은 대문자로 정규화된다', () => {
    expect(classCodeSchema.parse(' k7m2p9 ')).toBe('K7M2P9')
  })
  it('혼동 문자(0·O·1·I·L)는 거부', () => {
    for (const c of ['K7M2P0', 'K7M2PO', 'K7M2P1', 'K7M2PI', 'K7M2PL'])
      expect(classCodeSchema.safeParse(c).success).toBe(false)
  })
  it('6자가 아니면 거부', () => {
    expect(classCodeSchema.safeParse('K7M2P').success).toBe(false)
    expect(classCodeSchema.safeParse('K7M2P9A').success).toBe(false)
  })
})

describe('childNoSchema — 아동 번호 1~99', () => {
  it('경계값', () => {
    expect(childNoSchema.safeParse(1).success).toBe(true)
    expect(childNoSchema.safeParse(99).success).toBe(true)
    expect(childNoSchema.safeParse(0).success).toBe(false)
    expect(childNoSchema.safeParse(100).success).toBe(false)
    expect(childNoSchema.safeParse(1.5).success).toBe(false)
  })
})

describe('classCodeCreateSchema — 학급 코드 발급 폼', () => {
  const VALID_CODE_FORM = {
    region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
    grade: 1, classNo: 2, teacherName: '김담임',
    teacherPhone: '010-1234-5678', teacherEmail: '',
  }
  it('유효 입력 통과 + 전화 하이픈 제거', () => {
    const d = classCodeCreateSchema.parse(VALID_CODE_FORM)
    expect(d.teacherPhone).toBe('01012345678')
  })
  it('전화·이메일 둘 다 비면 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherPhone: '', teacherEmail: '' }).success).toBe(false)
  })
  it('이메일만 입력해도 통과', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherPhone: '', teacherEmail: 't@school.kr' }).success).toBe(true)
  })
  it('전화 형식이 틀리면 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherPhone: '12345' }).success).toBe(false)
  })
})

describe('검사자 구분(examinerType)', () => {
  it("'teacher'와 'expert'만 허용한다", () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, examinerType: 'teacher' }).success).toBe(true)
    expect(sessionCreateSchema.safeParse({ ...VALID, examinerType: 'expert' }).success).toBe(true)
  })
  it('그 외 값·누락은 거부한다 (검사지 헤더의 필수 구분란)', () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, examinerType: '기타' }).success).toBe(false)
    const { examinerType: _omit, ...without } = VALID
    expect(sessionCreateSchema.safeParse(without).success).toBe(false)
  })
})
