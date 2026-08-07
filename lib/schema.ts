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
/** 반 번호. 0은 "단일학급(반 없음)" — 학년당 한 학급인 학교를 위해 010에서 허용.
 *  화면 드롭다운은 20까지만 제공하지만(app/page.tsx의 MAX_CLASS_NO), DB·스키마는 넓게 두어
 *  나중에 범위를 늘릴 때 마이그레이션이 필요 없게 한다. */
export const classNoSchema = z.number().int().min(0).max(99)
export const genderSchema = z.enum(['남', '여'])

/** 담임 연락처 — 전화·이메일을 각각 받고 둘 중 하나만 있으면 된다(담당자 확정).
 *  빈 문자열 = 미입력. 공백만 입력한 칸도 trim 후 미입력으로 본다. */
const optionalContact = z.string().max(60).default('').transform(s => s.trim())

/** 폼에서 칸별로 검사할 때 쓰는 단일 필드 스키마(빈 값 허용 안 함) */
export const phoneSchema = z.string().regex(PHONE_RE)
export const emailSchema = z.string().regex(EMAIL_RE)

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
  teacherPhone: optionalContact,
  teacherEmail: optionalContact,
  // 만 14세 미만 아동 — 법정대리인 서면 동의를 확인했다는 검사자 체크(개인정보보호법 제22조의2).
  // true 리터럴만 허용: 미체크(false/누락) 상태로는 세션 생성 자체가 불가능하다.
  guardianConsent: z.literal(true),
})
  .refine(d => d.teacherPhone !== '' || d.teacherEmail !== '',
    { path: ['teacherPhone'], message: '전화번호나 이메일 중 하나는 입력해 주세요.' })
  .refine(d => d.teacherPhone === '' || PHONE_RE.test(d.teacherPhone),
    { path: ['teacherPhone'], message: '전화번호 형식이 올바르지 않습니다.' })
  .refine(d => d.teacherEmail === '' || EMAIL_RE.test(d.teacherEmail),
    { path: ['teacherEmail'], message: '이메일 형식이 올바르지 않습니다.' })

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>
