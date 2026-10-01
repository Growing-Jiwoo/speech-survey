// lib/upload.ts — 녹음 업로드 요청(정상 업로드·재시도 공통 사용)
import type { Recording } from '@/hooks/useRecorder'

/**
 * 결과. `retry`는 **다시 보내면 될 수도 있는** 실패(연결 끊김·5xx)다. 4xx는 다시 보내도 같은 답이라 재시도 버튼을
 * 보이면 선생님이 끝없이 누른다 — 401(검사를 시작한 지 24시간이 지남)·409(이미 제출된 검사)는 이 검사를 더 진행할 수
 * 없다는 뜻이고(`fatal`), 400·413(한 화면 10번 상한·파일 문제)은 그 녹음만 저장할 수 없다는 뜻이다.
 */
export interface UploadResult { ok: boolean; status: number; retry: boolean; fatal: 'expired' | 'submitted' | null }

export async function uploadRecording(params: {
  sessionId: string; sessionToken: string; itemCode: string; attemptNo: number; rec: Recording
}): Promise<UploadResult> {
  const { sessionId, sessionToken, itemCode, attemptNo, rec } = params
  const fd = new FormData()
  fd.set('audio', rec.blob, 'audio')
  fd.set('sessionId', sessionId)
  fd.set('sessionToken', sessionToken)
  fd.set('itemCode', itemCode)
  fd.set('attemptNo', String(attemptNo))
  fd.set('durationSec', rec.durationSec.toFixed(2))
  try {
    const res = await fetch('/api/recordings', { method: 'POST', body: fd })
    return classifyUpload(res.status)
  } catch {
    return { ok: false, status: 0, retry: true, fatal: null }
  }
}

/** 상태 코드 → 결과 분류(순수 함수 — 테스트가 본다). 0은 연결 실패. */
export function classifyUpload(status: number): UploadResult {
  if (status >= 200 && status < 300) return { ok: true, status, retry: false, fatal: null }
  if (status === 401) return { ok: false, status, retry: false, fatal: 'expired' }
  if (status === 409) return { ok: false, status, retry: false, fatal: 'submitted' }
  const retry = status === 0 || status === 429 || status >= 500
  return { ok: false, status, retry, fatal: null }
}
