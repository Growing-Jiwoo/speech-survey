import { NextResponse } from 'next/server'
import { insertRecording, uploadRecording, countSessionRecordings, removeStorageObject } from '@/lib/db'
import { audioExt } from '@/lib/audio-ext'
import { isAllowedAudioMime, sniffAudio, safeContentType } from '@/lib/audio-validate'
import { verifySessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { itemByCode } from '@/lib/items'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 5 * 1024 * 1024   // 최대 40초 opus 녹음의 수 배 여유 — 스토리지 남용 방지
const MAX_ATTEMPTS = 10             // 문항당 재녹음 상한
const MAX_DURATION_SEC = 120        // numeric(5,2) 오버플로 방지 + 비정상 장시간 차단(현재 문항 최대 40초 대비 여유)
const MAX_PER_SESSION = 200         // 세션당 총 녹음 상한(문항 18 × 재시도 10 + 여유) — 스토리지/DB 남용 방지

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null)
  const audio = fd?.get('audio')
  const sessionId = String(fd?.get('sessionId') ?? '')
  const sessionToken = String(fd?.get('sessionToken') ?? '')
  const itemCode = String(fd?.get('itemCode') ?? '')
  const attemptNo = Number(fd?.get('attemptNo'))
  const durationSec = Number(fd?.get('durationSec') ?? 0)
  const item = itemByCode.get(itemCode)
  if (!(audio instanceof File) || !UUID_RE.test(sessionId) || !item || item.maxSec === 0
    || !Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > MAX_ATTEMPTS
    || !Number.isFinite(durationSec) || durationSec < 0 || durationSec > MAX_DURATION_SEC)
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })

  if (!(await verifySessionToken(sessionId, sessionToken, env('SESSION_SECRET'))))
    return NextResponse.json({ error: '유효하지 않은 세션입니다.' }, { status: 401 })

  if (audio.size > MAX_BYTES)
    return NextResponse.json({ error: '녹음 파일이 너무 큽니다.' }, { status: 413 })

  const bytes = new Uint8Array(await audio.arrayBuffer())
  const sniffed = sniffAudio(bytes)
  if (!isAllowedAudioMime(audio.type || '') || !sniffed)
    return NextResponse.json({ error: '오디오 파일만 업로드할 수 있습니다.' }, { status: 400 })

  const mime = safeContentType(sniffed)  // 클라이언트 MIME 불신 → 서버 고정값 저장(저장형 XSS 차단)
  const audioPath = `${sessionId}/${itemCode}_${attemptNo}.${audioExt(mime)}`

  try {
    if ((await countSessionRecordings(sessionId)) >= MAX_PER_SESSION)
      return NextResponse.json({ error: '녹음 개수 상한을 초과했습니다.' }, { status: 429 })
    await uploadRecording(audioPath, Buffer.from(bytes), mime)
    try {
      await insertRecording({ sessionId, itemCode, attemptNo, audioPath, durationSec })
    } catch (insertErr) {
      // 고아 파일 방지: DB insert 실패 시 방금 올린 객체 정리(정리 실패는 로그만).
      await removeStorageObject(audioPath).catch(err => console.error('[recordings] 보상 정리 실패', err))
      throw insertErr
    }
  } catch (e) {
    console.error('[recordings] 저장 실패', e)
    return NextResponse.json({ error: '녹음 저장에 실패했습니다.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
