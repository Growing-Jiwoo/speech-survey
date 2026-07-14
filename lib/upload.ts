// lib/upload.ts — 녹음 업로드 요청(정상 업로드·재시도 공통 사용)
import type { Recording } from '@/hooks/useRecorder'

export async function uploadRecording(params: {
  sessionId: string; sessionToken: string; itemCode: string; attemptNo: number; rec: Recording
}): Promise<boolean> {
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
    return res.ok
  } catch {
    return false
  }
}
