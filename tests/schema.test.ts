import { describe, it, expect } from 'vitest'
import { sessionCreateSchema } from '@/lib/schema'

const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
  name: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
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
  it('연락처 형식 오류 거부', () =>
    expect(sessionCreateSchema.safeParse({ ...VALID, teacherContact: '1234' }).success).toBe(false))
  it('본문이 객체가 아니면 거부', () =>
    expect(sessionCreateSchema.safeParse(null).success).toBe(false))
})
