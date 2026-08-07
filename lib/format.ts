// lib/format.ts — 표시용 포맷 공용 헬퍼(순수 함수).
export const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * 초 → "m:ss". null·NaN·음수는 '—'(길이 미상)로 표기한다.
 * 오디오 플레이어의 시간 표시와 결과지의 녹음 길이 컬럼이 공유한다.
 */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
  return `${Math.floor(sec / 60)}:${pad2(Math.floor(sec % 60))}`
}

/** 학년·반 표기. 반 0은 "단일학급(반 없음)" — 학년당 한 학급인 학교를 위해 010에서 허용했다. */
export function gradeClassLabel(grade: number, classNo: number): string {
  return classNo === 0 ? `${grade}학년 단일학급` : `${grade}-${classNo}`
}

/** 담임 연락처 표기. 전화·이메일을 분리 저장하기 전(010 이전) 수집분은 legacy 한 칸에만 값이 있다. */
export function contactLabel(
  phone: string | null | undefined,
  email: string | null | undefined,
  legacy?: string | null,
): string {
  const parts = [phone, email].filter((v): v is string => !!v)
  if (parts.length > 0) return parts.join(' · ')
  return legacy || '연락처 없음'
}

/** 검사지 헤더의 "교사 / 전문가" 구분 표기. 011 이전 수집분(examiner_type=null)은 '기록 없음'. */
export function examinerLabel(t: string | null | undefined): string {
  return t === 'expert' ? '전문가' : t === 'teacher' ? '교사' : '기록 없음'
}
