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
