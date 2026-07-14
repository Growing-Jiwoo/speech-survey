import { NextResponse } from 'next/server'
import { getOrCreateResponse, insertAttempt, uploadRecording } from '@/lib/db'
import { pickConversion, toAzureFormat } from '@/lib/audio-convert'
import { transcribeShortAudio } from '@/lib/azure-stt'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null)
  const audio = fd?.get('audio')
  const sessionId = String(fd?.get('sessionId') ?? '')
  const questionId = Number(fd?.get('questionId'))
  const orderNo = Number(fd?.get('orderNo'))
  const attemptNo = Number(fd?.get('attemptNo'))
  const durationSec = Number(fd?.get('durationSec') ?? 0)
  if (!(audio instanceof File) || !sessionId || !questionId || !orderNo || !attemptNo)
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })

  const bytes = Buffer.from(await audio.arrayBuffer())
  const mime = audio.type || 'application/octet-stream'
  const { ext } = pickConversion(mime)
  const audioPath = `${sessionId}/${orderNo}_${attemptNo}.${ext}`

  try {
    await uploadRecording(audioPath, bytes, mime) // 실패 시 STT 진행 금지
  } catch (e) {
    return NextResponse.json({ error: `녹음 저장 실패: ${(e as Error).message}` }, { status: 502 })
  }

  // STT·변환 실패는 진행을 막지 않는다 — 오디오는 저장됐고 판단은 선생님 결과지에서.
  let sttText = ''
  try {
    const converted = await toAzureFormat(bytes, mime)
    sttText = await transcribeShortAudio(converted.data, converted.contentType)
  } catch (e) {
    console.error('[transcribe] STT/변환 실패 — 빈 텍스트로 진행:', (e as Error).message)
    sttText = ''
  }
  try {
    const responseId = await getOrCreateResponse(sessionId, questionId)
    await insertAttempt({ responseId, attemptNo, sttText, audioPath, durationSec })
  } catch (e) {
    return NextResponse.json({ error: `응답 저장 실패: ${(e as Error).message}` }, { status: 502 })
  }
  // 아이 기기로 STT 결과를 보내지 않는다 (평가 비노출 — 네트워크 탭에서도 안 보이게).
  return NextResponse.json({ ok: true })
}
