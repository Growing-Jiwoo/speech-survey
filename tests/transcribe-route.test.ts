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
  it('성공: 업로드→변환→STT→attempt 저장→텍스트 반환', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sttText: 'i like apples', attemptId: 'att-1' })
    expect(db.uploadRecording).toHaveBeenCalledWith('s-1/5_1.webm', expect.any(Buffer), 'audio/webm;codecs=opus')
    expect(db.insertAttempt).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'resp-1', attemptNo: 1, sttText: 'i like apples' }))
  })
  it('빈 STT 결과도 200으로 저장·반환 (재시도 유도는 클라이언트 몫)', async () => {
    vi.mocked(azure.transcribeShortAudio).mockResolvedValueOnce('')
    const res = await POST(makeReq())
    expect((await res.json()).sttText).toBe('')
    expect(db.insertAttempt).toHaveBeenCalled()
  })
  it('업로드 실패면 502, STT 진행 안 함(녹음 없는 텍스트 방지)', async () => {
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    expect(azure.transcribeShortAudio).not.toHaveBeenCalled()
  })
  it('Azure 실패면 502 + 저장된 오디오 경로 안내', async () => {
    vi.mocked(azure.transcribeShortAudio).mockRejectedValueOnce(new Error('timeout'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('변환')
  })
  it('필수 필드 누락이면 400', async () => {
    const fd = new FormData(); fd.set('sessionId', 's-1')
    const res = await POST(new Request('http://x', { method: 'POST', body: fd }))
    expect(res.status).toBe(400)
  })
})
