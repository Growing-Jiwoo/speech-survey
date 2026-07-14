export type MatchResult = 'matched' | 'mismatched' | 'unrecognized'

/** 소문자화 → NFKC 정규화 → 글자·숫자·공백 외 제거 → 공백 축약. 하이픈·구두점(수 구분자 포함)도 제거되며 자동 비교는 참고용 지표다. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compareUtterance(target: string, stt: string): MatchResult {
  if (!stt.trim()) return 'unrecognized'
  return normalize(target) === normalize(stt) ? 'matched' : 'mismatched'
}
