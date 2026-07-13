import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  getOrCreateResponse: vi.fn().mockResolvedValue('resp-1'),
  insertAttempt: vi.fn().mockResolvedValue('att-1'),
  uploadRecording: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/audio-convert', () => ({
  pickConversion: vi.fn().mockReturnValue({ args: [], contentType: 'audio/wav', ext: 'webm' }),
  toAzureFormat: vi.fn().mockResolvedValue({ data: Buffer.from('wav'), contentType: 'audio/wav' }),
}))
vi.mock('@/lib/azure-stt', () => ({ transcribeShortAudio: vi.fn().mockResolvedValue('i like apples') }))

import { POST } from '@/app/api/transcribe/route'
import * as db from '@/lib/db'
import * as conv from '@/lib/audio-convert'
import * as azure from '@/lib/azure-stt'

function makeReq(overrides: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('audio', new File([new Uint8Array([1, 2, 3])], 'a.webm', { type: 'audio/webm;codecs=opus' }))
  fd.set('sessionId', 's-1'); fd.set('questionId', '5'); fd.set('orderNo', '5')
  fd.set('attemptNo', '1'); fd.set('durationSec', '3.2')
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return new Request('http://x/api/transcribe', { method: 'POST', body: fd })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/transcribe', () => {
  it('성공: 업로드→STT→attempt 저장. 응답에 sttText 없음 (아이에게 결과 비노출)', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(db.uploadRecording).toHaveBeenCalledWith('s-1/5_1.webm', expect.any(Buffer), 'audio/webm;codecs=opus')
    expect(db.insertAttempt).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'resp-1', attemptNo: 1, sttText: 'i like apples' }))
  })
  it('STT 실패해도 200 — 빈 STT로 attempt 저장 (진행 무차단)', async () => {
    vi.mocked(azure.transcribeShortAudio).mockRejectedValueOnce(new Error('timeout'))
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.insertAttempt).toHaveBeenCalledWith(expect.objectContaining({ sttText: '' }))
  })
  it('오디오 변환 실패해도 200 — 빈 STT로 attempt 저장', async () => {
    vi.mocked(conv.toAzureFormat).mockRejectedValueOnce(new Error('ffmpeg fail'))
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.insertAttempt).toHaveBeenCalledWith(expect.objectContaining({ sttText: '' }))
  })
  it('업로드 실패면 502, STT 진행 안 함 (녹음 없는 텍스트 방지)', async () => {
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    expect(azure.transcribeShortAudio).not.toHaveBeenCalled()
  })
  it('DB 저장 실패면 502 (클라이언트가 재시도 안내)', async () => {
    vi.mocked(db.insertAttempt).mockRejectedValueOnce(new Error('db down'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
  })
  it('필수 필드 누락이면 400', async () => {
    const fd = new FormData(); fd.set('sessionId', 's-1')
    const res = await POST(new Request('http://x', { method: 'POST', body: fd }))
    expect(res.status).toBe(400)
  })
})
