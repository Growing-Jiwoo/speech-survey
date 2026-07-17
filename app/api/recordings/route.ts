// POST /api/recordings — 녹음 파일 업로드(스토리지) + 메타 기록(DB).
// 검증 순서: 형식 → 세션 토큰 → 크기 → 매직바이트 → 세션 상태(미제출) → 총량 상한.
import { NextResponse } from 'next/server'
import { insertRecording, uploadRecording, countSessionRecordings, removeStorageObject, sessionSubmitState } from '@/lib/db'
import { audioExt } from '@/lib/audio-ext'
import { isAllowedAudioMime, sniffAudio, safeContentType } from '@/lib/audio-validate'
import { verifySessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { itemByCode } from '@/lib/items'
import { UUID_RE, jsonError } from '@/lib/request'

export const runtime = 'nodejs'
export const maxDuration = 60

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
    return jsonError('필수 항목 누락', 400)

  if (!(await verifySessionToken(sessionId, sessionToken, env('SESSION_SECRET'))))
    return jsonError('유효하지 않은 세션입니다.', 401)

  if (audio.size > MAX_BYTES)
    return jsonError('녹음 파일이 너무 큽니다.', 413)

  const bytes = new Uint8Array(await audio.arrayBuffer())
  const sniffed = sniffAudio(bytes)
  if (!isAllowedAudioMime(audio.type || '') || !sniffed)
    return jsonError('오디오 파일만 업로드할 수 있습니다.', 400)

  const mime = safeContentType(sniffed)  // 클라이언트 MIME 불신 → 서버 고정값 저장(저장형 XSS 차단)
  const audioPath = `${sessionId}/${itemCode}_${attemptNo}.${audioExt(mime)}`

  try {
    // 제출 완료 후 업로드 차단(검사 증적 사후 변조 방지). 세션 미존재도 여기서 걸러낸다.
    const state = await sessionSubmitState(sessionId)
    if (state === 'missing')
      return jsonError('세션을 찾을 수 없습니다.', 404)
    if (state === 'submitted')
      return jsonError('이미 제출된 검사입니다.', 409)
    if ((await countSessionRecordings(sessionId)) >= MAX_PER_SESSION)
      return jsonError('녹음 개수 상한을 초과했습니다.', 429)
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
    return jsonError('녹음 저장에 실패했습니다.', 502)
  }
  return NextResponse.json({ ok: true })
}
