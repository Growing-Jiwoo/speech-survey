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

  try {
    const converted = await toAzureFormat(bytes, mime)
    const sttText = await transcribeShortAudio(converted.data, converted.contentType)
    const responseId = await getOrCreateResponse(sessionId, questionId)
    const attemptId = await insertAttempt({ responseId, attemptNo, sttText, audioPath, durationSec })
    return NextResponse.json({ sttText, attemptId })
  } catch (e) {
    return NextResponse.json(
      { error: `음성 변환에 실패했어요. 다시 시도해 주세요. (${(e as Error).message})`, audioPath },
      { status: 502 })
  }
}
