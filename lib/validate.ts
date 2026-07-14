/** 이름: 완성형 한글·영문만, 단어 사이 단일 공백, 1~30자.
 *  호출 측에서 trim + 연속공백 정규화 후 넘길 것 (클라이언트는 IME 조합 중 개입 금지). */
export const NAME_RE = /^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$/

export function validName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 30 && NAME_RE.test(name)
}

/** 생년월일: YYMMDD 6자리. YY만으로 윤년 판단이 불가하므로 2월은 29일까지 허용. */
export function validBirthYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{6}$/.test(v)) return false
  const mm = Number(v.slice(2, 4))
  const dd = Number(v.slice(4, 6))
  if (mm < 1 || mm > 12) return false
  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1]
  return dd >= 1 && dd <= maxDay
}

export function validGrade(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 6
}

export function validClassNo(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99
}

export function validGender(v: unknown): v is '남' | '여' {
  return v === '남' || v === '여'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 담임 연락처: 전화번호(하이픈 선택) 또는 이메일. 최대 60자. */
export function validContact(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 60
    && (PHONE_RE.test(v) || EMAIL_RE.test(v))
}
