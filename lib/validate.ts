/** 이름: 완성형 한글·영문만, 단어 사이 단일 공백, 1~30자.
 *  호출 측에서 trim + 연속공백 정규화 후 넘길 것 (클라이언트는 IME 조합 중 개입 금지). */
export const NAME_RE = /^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$/

export function validName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 30 && NAME_RE.test(name)
}

/** 나이: 정수 1~999 (숫자 1~3자리). 기존 3~19 범위 제한은 폐기됨. */
export function validAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isInteger(age) && age >= 1 && age <= 999
}
