import { NextResponse } from 'next/server'
import { checkRateLimit, insertRecording, sessionExists, uploadRecording } from '@/lib/db'
import { audioExt } from '@/lib/audio-ext'
import { itemByCode } from '@/lib/items'
import { validUuid } from '@/lib/validate'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 5 * 1024 * 1024      // 최대 40초 opus 녹음의 수 배 여유 — 스토리지 남용 방지
const MAX_ATTEMPTS = 10                // 문항당 재녹음 상한
// 세션(=아동 1명) 단위 상한. IP 단위로 잡으면 학교 공용 IP(NAT) 뒤 학급 전체가 한 버킷을
// 공유해 정상 단체 검사가 429로 막히므로, 세션당으로 건다. (녹음 문항 18 × 재녹음 여유)
const MAX_UPLOADS_PER_SESSION_PER_HOUR = 200

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null)
  const audio = fd?.get('audio')
  const sessionId = String(fd?.get('sessionId') ?? '')
  const itemCode = String(fd?.get('itemCode') ?? '')
  const attemptNo = Number(fd?.get('attemptNo'))
  const durationSec = Number(fd?.get('durationSec') ?? 0)
  const item = itemByCode.get(itemCode)
  if (!(audio instanceof File) || !validUuid(sessionId) || !item || item.maxSec === 0
    || !Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > MAX_ATTEMPTS
    || !Number.isFinite(durationSec) || durationSec < 0)
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  if (audio.size > MAX_BYTES)
    return NextResponse.json({ error: '녹음 파일이 너무 큽니다.' }, { status: 413 })
  // 위조 sessionId(형식만 맞는 무작위 UUID)를 업로드 전에 차단 — 고아 파일 스팸 방지.
  if (!(await sessionExists(sessionId)))
    return NextResponse.json({ error: '세션 정보가 올바르지 않습니다.' }, { status: 400 })
  if (!(await checkRateLimit(`recording:${sessionId}`, MAX_UPLOADS_PER_SESSION_PER_HOUR, 3600_000)))
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 })

  const bytes = Buffer.from(await audio.arrayBuffer())
  const mime = audio.type || 'application/octet-stream'
  const audioPath = `${sessionId}/${itemCode}_${attemptNo}.${audioExt(mime)}`
  try {
    await uploadRecording(audioPath, bytes, mime)
    await insertRecording({ sessionId, itemCode, attemptNo, audioPath, durationSec })
  } catch (e) {
    console.error('녹음 저장 실패:', e) // 상세 원인은 서버 로그에만 — 클라이언트엔 일반 메시지
    return NextResponse.json({ error: '녹음 저장에 실패했습니다. 다시 시도해 주세요.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
