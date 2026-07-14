// lib/audio.ts — 녹음 공유 상수·순수 헬퍼 (테스트 가능 단위)
/** 마이크 확인 통과 및 녹음 저음 경고 공통 임계값 (peak 0~1). 실기기 튜닝 여지 있음. */
export const MIC_MIN_PEAK = 0.1

/** 남은 녹음 시간(초). 링·라벨·자동정지가 공유하는 단일 계산식. */
export function remainingSec(elapsedMs: number, maxSec: number): number {
  return Math.max(0, Math.ceil(maxSec - elapsedMs / 1000))
}

export type RecorderErrorKind = 'denied' | 'unsupported' | 'failed'

/** 녹음 시작 실패를 종류로 구분해 던지기 위한 에러. */
export class RecorderError extends Error {
  kind: RecorderErrorKind
  constructor(kind: RecorderErrorKind, message?: string) {
    super(message ?? kind)
    this.name = 'RecorderError'
    this.kind = kind
  }
}

/** DOMException 등에서 실패 종류를 판별. RecorderError는 kind를 그대로 전달. */
export function classifyRecorderError(err: unknown): RecorderErrorKind {
  if (err instanceof RecorderError) return err.kind
  const name = (err as { name?: string } | null | undefined)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotSupportedError') return 'unsupported'
  return 'failed'
}
