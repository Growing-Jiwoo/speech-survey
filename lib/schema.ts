import { z } from 'zod'
import { REGION_NAMES } from './schools'

/** 이름: 완성형 한글·영문만, 단어 사이 단일 공백, 1~30자. (호출 전 trim·연속공백 정규화 전제) */
export const NAME_RE = /^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$/
const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MONTH_MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // YY만으로 윤년 판단 불가 → 2월 29 허용

export const nameSchema = z.string().min(1).max(30).regex(NAME_RE)

export const birthYmdSchema = z.string().regex(/^\d{6}$/).refine(v => {
  const mm = Number(v.slice(2, 4)), dd = Number(v.slice(4, 6))
  if (mm < 1 || mm > 12) return false
  return dd >= 1 && dd <= MONTH_MAX_DAY[mm - 1]
})

export const gradeSchema = z.number().int().min(1).max(6)
export const classNoSchema = z.number().int().min(1).max(99)
export const genderSchema = z.enum(['남', '여'])
export const contactSchema = z.string().min(1).max(60).refine(v => PHONE_RE.test(v) || EMAIL_RE.test(v))

/** 문자열 정규화: trim + 연속 공백 1칸 (기존 라우트 cleanStr와 동일 규칙). */
const cleaned = z.string().transform(s => s.trim().replace(/\s+/g, ' '))

/** POST /api/sessions 바디. 문자열 필드는 정규화 후 규칙 검증(파싱 결과가 서버 저장값). */
export const sessionCreateSchema = z.object({
  region: z.string().refine(r => REGION_NAMES.includes(r)),
  schoolId: cleaned.pipe(z.string().min(1)),
  schoolName: cleaned.pipe(z.string().min(1).max(100)),
  birthYmd: birthYmdSchema,
  grade: gradeSchema,
  classNo: classNoSchema,
  gender: genderSchema,
  name: cleaned.pipe(nameSchema),
  teacherName: cleaned.pipe(nameSchema),
  teacherContact: contactSchema,
})

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>
