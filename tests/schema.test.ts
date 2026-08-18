import { describe, it, expect } from 'vitest'
import {
  sessionCreateSchema, phoneSchema, classCodeSchema, childNoSchema, classCodeCreateSchema,
  applySchema, rosterChildSchema,
} from '@/lib/schema'

describe('sessionCreateSchema — 코드 기반 (스펙 2026-08-13)', () => {
  const VALID = { code: 'K7M2P9', childNo: 3, name: '김도연', gender: '남', birthYmd: '190101', guardianConsent: true }
  it('유효 입력 통과 + 코드 대문자 정규화', () => {
    const d = sessionCreateSchema.parse({ ...VALID, code: 'k7m2p9' })
    expect(d.code).toBe('K7M2P9')
  })
  it('학급 정보 필드는 스키마에 없다 — 보내도 벗겨진다', () => {
    const d = sessionCreateSchema.parse({ ...VALID, schoolName: '위조초', grade: 6 })
    expect(d).not.toHaveProperty('schoolName')
    expect(d).not.toHaveProperty('grade')
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

  // classNo/grade/optionalEmail은 sessionCreateSchema에서 **빠지면서**(학급 정보를 서버가
  // 코드에서 복사하도록 바뀜) 유일한 zod 레벨
  // 테스트가 없어졌다 — classCodeCreateSchema를 통해 여전히 살아 있는 코드이므로 여기서 보강한다.
  it('classNo: 0(단일학급·반 없음)은 통과, 범위 밖은 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, classNo: 0 }).success).toBe(true)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, classNo: -1 }).success).toBe(false)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, classNo: 100 }).success).toBe(false)
  })
  it('grade 경계값 — 1·6은 통과, 0·7은 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, grade: 1 }).success).toBe(true)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, grade: 6 }).success).toBe(true)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, grade: 0 }).success).toBe(false)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, grade: 7 }).success).toBe(false)
  })
  it('teacherEmail 형식이 틀리면 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherPhone: '', teacherEmail: 'not-an-email' }).success).toBe(false)
  })
})

describe('rosterChildSchema — 명단 한 줄', () => {
  const ok = { childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' }
  it('정상 행을 통과시킨다', () => {
    expect(rosterChildSchema.safeParse(ok).success).toBe(true)
  })
  it.each([
    ['번호 0', { ...ok, childNo: 0 }],
    ['번호 100', { ...ok, childNo: 100 }],
    ['이름에 숫자', { ...ok, name: '김서아1' }],
    ['성별 남자(정규화 전 값)', { ...ok, gender: '남자' }],
    ['생년월일 8자리', { ...ok, birthYmd: '20190304' }],
  ])('%s 는 거부한다', (_label, bad) => {
    expect(rosterChildSchema.safeParse(bad).success).toBe(false)
  })
})

describe('applySchema — 신청 폼', () => {
  const base = {
    region: '서울특별시교육청', schoolId: 'S001', schoolName: '서울예시초',
    grade: 1, classNo: 2, teacherName: '김담임',
    teacherPhone: '', teacherEmail: 'teacher@school.kr',
    roster: [
      { childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' },
      { childNo: 2, name: '이도윤', gender: '남', birthYmd: '190122' },
    ],
  }
  it('정상 신청을 통과시킨다', () => {
    expect(applySchema.safeParse(base).success).toBe(true)
  })
  it('이메일이 없으면 거부한다 — 승인 메일이 유일한 코드 전달 경로다', () => {
    expect(applySchema.safeParse({ ...base, teacherEmail: '' }).success).toBe(false)
  })
  it('명단이 비면 거부한다', () => {
    expect(applySchema.safeParse({ ...base, roster: [] }).success).toBe(false)
  })
  it('명단 100행은 거부한다 (child_no 범위 99와 일치)', () => {
    const roster = Array.from({ length: 100 }, (_, i) =>
      ({ childNo: i + 1, name: '김서아', gender: '여', birthYmd: '190304' }))
    expect(applySchema.safeParse({ ...base, roster }).success).toBe(false)
  })
  it('[REGRESSION] 같은 번호가 두 번 있으면 거부한다', () => {
    const dup = { ...base, roster: [base.roster[0], { ...base.roster[1], childNo: 1 }] }
    expect(applySchema.safeParse(dup).success).toBe(false)
  })
})
