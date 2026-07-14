import { NextResponse } from 'next/server'
import { insertRecording, uploadRecording } from '@/lib/db'
import { audioExt } from '@/lib/audio-ext'
import { itemByCode } from '@/lib/items'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 5 * 1024 * 1024 // 최대 40초 opus 녹음의 수 배 여유 — 스토리지 남용 방지
const MAX_ATTEMPTS = 10           // 문항당 재녹음 상한

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null)
  const audio = fd?.get('audio')
  const sessionId = String(fd?.get('sessionId') ?? '')
  const itemCode = String(fd?.get('itemCode') ?? '')
  const attemptNo = Number(fd?.get('attemptNo'))
  const durationSec = Number(fd?.get('durationSec') ?? 0)
  const item = itemByCode.get(itemCode)
  if (!(audio instanceof File) || !UUID_RE.test(sessionId) || !item || item.maxSec === 0
    || !Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > MAX_ATTEMPTS
    || !Number.isFinite(durationSec) || durationSec < 0)
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  if (audio.size > MAX_BYTES)
    return NextResponse.json({ error: '녹음 파일이 너무 큽니다.' }, { status: 413 })

  const bytes = Buffer.from(await audio.arrayBuffer())
  const mime = audio.type || 'application/octet-stream'
  const audioPath = `${sessionId}/${itemCode}_${attemptNo}.${audioExt(mime)}`
  try {
    await uploadRecording(audioPath, bytes, mime)
    await insertRecording({ sessionId, itemCode, attemptNo, audioPath, durationSec })
  } catch (e) {
    return NextResponse.json({ error: `녹음 저장 실패: ${(e as Error).message}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
