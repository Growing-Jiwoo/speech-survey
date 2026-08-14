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
 *  화면 드롭다운은 20까지만 제공하지만(components/admin/CodeIssuer.tsx의 MAX_CLASS_NO), DB·스키마는 넓게 두어
 *  나중에 범위를 늘릴 때 마이그레이션이 필요 없게 한다. */
export const classNoSchema = z.number().int().min(0).max(99)
export const genderSchema = z.enum(['남', '여'])

/** 학급 코드 알파벳 — 혼동 문자(0·O·1·I·L) 제외 31자. 발급(lib/class-code)과 입력 검증이 공유. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LEN = 6
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`)

/** 학급 코드 — 입력은 소문자·양끝 공백을 허용하고 대문자로 정규화해 검증한다. */
export const classCodeSchema = z.string().max(20)
  .transform(s => s.trim().toUpperCase())
  .pipe(z.string().regex(CODE_RE))

/** 아동 번호(학급 내 출석 번호). 중복 생성은 막지 않는다 — 스펙 "중복 검사 경고". */
export const childNoSchema = z.number().int().min(1).max(99)

/** 폼에서 칸별로 검사할 때 쓰는 단일 필드 스키마(빈 값 허용 안 함).
 *  전화번호는 하이픈 유무 모두 입력받되 저장값은 하이픈을 뗀다(사용자 확정 2026-08-13). */
export const phoneSchema = z.string()
  .transform(s => s.trim())
  .pipe(z.string().regex(PHONE_RE))
  .transform(s => s.replace(/-/g, ''))
export const emailSchema = z.string().regex(EMAIL_RE)

/** 발급 폼·세션 생성 폼의 선택 연락처 칸. 빈 문자열 = 미입력. 전화는 검증 후 하이픈을 뗀다. */
const optionalPhone = z.string().max(60).default('')
  .transform(s => s.trim())
  .refine(s => s === '' || PHONE_RE.test(s), '전화번호 형식이 올바르지 않습니다.')
  .transform(s => s.replace(/-/g, ''))
const optionalEmail = z.string().max(60).default('')
  .transform(s => s.trim())
  .refine(s => s === '' || EMAIL_RE.test(s), '이메일 형식이 올바르지 않습니다.')

/** 문자열 정규화: trim + 연속 공백 1칸 (기존 라우트 cleanStr와 동일 규칙). */
const cleaned = z.string().transform(s => s.trim().replace(/\s+/g, ' '))

/** POST /api/sessions 바디 — 학급 정보는 받지 않는다(서버가 코드에서 복사 — 스펙). */
export const sessionCreateSchema = z.object({
  code: classCodeSchema,
  childNo: childNoSchema,
  name: cleaned.pipe(nameSchema),
  gender: genderSchema,
  birthYmd: birthYmdSchema,
  // 만 14세 미만 아동 — 법정대리인 서면 동의를 확인했다는 검사자 체크(개인정보보호법 제22조의2).
  guardianConsent: z.literal(true),
})
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>

/** POST /api/admin/codes 바디 — 학급 코드 발급 폼. */
export const classCodeCreateSchema = z.object({
  region: z.string().refine(r => REGION_NAMES.includes(r)),
  schoolId: cleaned.pipe(z.string().min(1)),
  schoolName: cleaned.pipe(z.string().min(1).max(100)),
  grade: gradeSchema,
  classNo: classNoSchema,
  teacherName: cleaned.pipe(nameSchema),
  teacherPhone: optionalPhone,
  teacherEmail: optionalEmail,
}).refine(d => d.teacherPhone !== '' || d.teacherEmail !== '',
  { path: ['teacherPhone'], message: '전화번호나 이메일 중 하나는 입력해 주세요.' })
export type ClassCodeCreateInput = z.infer<typeof classCodeCreateSchema>

/** POST /api/sessions/verify-code 바디 */
export const verifyCodeSchema = z.object({ code: classCodeSchema, childNo: childNoSchema })
