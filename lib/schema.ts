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

/** 필수 이메일 + trim. 엑셀·메일 클라이언트에서 그대로 붙여넣으면 앞뒤 공백이 따라오기 쉬운데
 *  EMAIL_RE는 완전 앵커라 trim 없이는 그 공백만으로 거부된다 — applySchema에서 이메일은
 *  승인 코드를 받는 유일한 경로라 이 오탐이 특히 치명적이라 별도로 둔다. */
const requiredEmail = z.string().max(60)
  .transform(s => s.trim())
  .pipe(z.string().regex(EMAIL_RE, '이메일 형식이 올바르지 않습니다.'))

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

/** PATCH /api/admin/sessions/[id] 바디 — 검사자가 잘못 입력한 **아동 식별값**만 고친다.
 *
 *  학급 정보(학년·반·학교·담임)가 여기 없는 것은 빠뜨린 게 아니라 **의도**다:
 *  - `grade`는 `formForGrade(grade)`로 문항·배점·쓰기 과제 종류를 정한다. 저장된 점수는
 *    그 양식의 문항 코드(`ww01`…)로 쌓여 있어, 학년을 바꾸면 존재하지 않는 문항을 가리키게
 *    되고 결과지·검사지 PDF가 다른 양식으로 다시 그려진다.
 *  - 학교·반·담임은 검사 당시 값을 보존하려고 일부러 비정규화 복사한 것이라, 여기서 고치면
 *    그 취지가 무너진다.
 *  학급 코드를 통째로 잘못 골랐다면 아이가 다른 검사지로 검사받은 것이므로 기록이 무효다 —
 *  수정이 아니라 삭제 후 재검사가 맞다. 서버는 이 스키마로 **화이트리스트**를 강제한다.
 *  (사용자 확정 2026-08-15) */
export const sessionEditSchema = z.object({
  childNo: childNoSchema,
  name: cleaned.pipe(nameSchema),
  gender: genderSchema,
  birthYmd: birthYmdSchema,
})
export type SessionEditInput = z.infer<typeof sessionEditSchema>

/** 학급 코드 발급 폼의 공통 필드. refine이 걸리면 extend가 안 되므로 객체를 분리해 둔다 —
 *  관리자 직접 발급(classCodeCreateSchema)과 교사 신청(applySchema)이 공유한다. */
const classCodeFields = z.object({
  region: z.string().refine(r => REGION_NAMES.includes(r)),
  schoolId: cleaned.pipe(z.string().min(1)),
  schoolName: cleaned.pipe(z.string().min(1).max(100)),
  grade: gradeSchema,
  classNo: classNoSchema,
  teacherName: cleaned.pipe(nameSchema),
  teacherPhone: optionalPhone,
  teacherEmail: optionalEmail,
})

/** POST /api/admin/codes 바디 — 학급 코드 발급 폼. */
export const classCodeCreateSchema = classCodeFields
  .refine(d => d.teacherPhone !== '' || d.teacherEmail !== '',
    { path: ['teacherPhone'], message: '전화번호나 이메일 중 하나는 입력해 주세요.' })
export type ClassCodeCreateInput = z.infer<typeof classCodeCreateSchema>

/** 신청 명단 한 줄 — sessions의 같은 컬럼과 동일 규칙(제약이 어긋나면 복사가 실패한다). */
export const rosterChildSchema = z.object({
  childNo: childNoSchema,
  name: cleaned.pipe(nameSchema),
  gender: genderSchema,
  birthYmd: birthYmdSchema,
})
export type RosterChildInput = z.infer<typeof rosterChildSchema>

/** POST /api/apply 바디 — 교사 신청. 직접 발급과 달리 **이메일이 필수**다:
 *  승인 메일이 유일한 코드 전달 경로라서다(신청 완료 화면은 코드를 보여주지 않는다 — 스펙). */
export const applySchema = classCodeFields.extend({
  teacherEmail: requiredEmail,
  // .max(99)는 child_no 범위(1~99)+중복 검사로 보면 도달 불가능해 보이지만, zod는 array().max()를
  // refine보다 먼저 평가한다 — 수천 행짜리 잘못된 파일이 Set 중복 검사를 돌기 전에 여기서 바로 끊긴다.
  roster: z.array(rosterChildSchema).min(1, '학생을 한 명 이상 등록해 주세요.').max(99)
    .refine(r => new Set(r.map(c => c.childNo)).size === r.length,
      '같은 번호가 두 번 있습니다.'),
})
export type ApplyInput = z.infer<typeof applySchema>

/** POST /api/sessions/verify-code 바디 */
export const verifyCodeSchema = z.object({ code: classCodeSchema, childNo: childNoSchema })
