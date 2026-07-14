import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  uploadRecording: vi.fn().mockResolvedValue(undefined),
  insertRecording: vi.fn().mockResolvedValue(undefined),
  checkRateLimit: vi.fn().mockResolvedValue(true),
}))

import { POST } from '@/app/api/recordings/route'
import * as db from '@/lib/db'

const SID = '11111111-1111-4111-8111-111111111111'

function makeReq(over: Record<string, string | Blob> = {}) {
  const fd = new FormData()
  fd.set('audio', new Blob([new Uint8Array(8)], { type: 'audio/webm' }), 'audio')
  fd.set('sessionId', SID)
  fd.set('itemCode', 'rw01')
  fd.set('attemptNo', '1')
  fd.set('durationSec', '3.20')
  for (const [k, v] of Object.entries(over)) fd.set(k, v)
  return new Request('http://x/api/recordings', { method: 'POST', body: fd })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/recordings', () => {
  it('업로드 + 녹음 기록', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.uploadRecording).toHaveBeenCalledWith(`${SID}/rw01_1.webm`, expect.any(Buffer), 'audio/webm')
    expect(db.insertRecording).toHaveBeenCalledWith({
      sessionId: SID, itemCode: 'rw01', attemptNo: 1, audioPath: `${SID}/rw01_1.webm`, durationSec: 3.2,
    })
  })
  it('녹음 문항이 아닌 코드 400 (ww01, cl, 미지 코드)', async () => {
    expect((await POST(makeReq({ itemCode: 'ww01' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'cl' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'zz99' }))).status).toBe(400)
  })
  it('오디오·세션 누락 400', async () => {
    const noAudio = new FormData()
    noAudio.set('sessionId', SID); noAudio.set('itemCode', 'rw01'); noAudio.set('attemptNo', '1')
    expect((await POST(new Request('http://x', { method: 'POST', body: noAudio }))).status).toBe(400)
    expect((await POST(makeReq({ sessionId: '' }))).status).toBe(400)
  })
  it('sessionId가 UUID가 아니면 400 (경로 주입 방지)', async () => {
    expect((await POST(makeReq({ sessionId: 'sess-1' }))).status).toBe(400)
    expect((await POST(makeReq({ sessionId: '../etc/passwd' }))).status).toBe(400)
  })
  it('durationSec 비숫자 400', async () =>
    expect((await POST(makeReq({ durationSec: 'abc' }))).status).toBe(400))
  it('attemptNo 0 이하·상한(10) 초과 400', async () => {
    expect((await POST(makeReq({ attemptNo: '0' }))).status).toBe(400)
    expect((await POST(makeReq({ attemptNo: '11' }))).status).toBe(400)
  })
  it('5MB 초과 파일 413, 업로드 안 함', async () => {
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'audio/webm' })
    expect((await POST(makeReq({ audio: big }))).status).toBe(413)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('업로드 실패 시 502, 기록 저장 안 함, 내부 오류 메시지 노출 안 함', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    expect(db.insertRecording).not.toHaveBeenCalled()
    expect((await res.json()).error).not.toContain('storage down')
  })
  it('레이트리밋 초과 시 429, 업로드 안 함', async () => {
    vi.mocked(db.checkRateLimit).mockResolvedValueOnce(false)
    expect((await POST(makeReq())).status).toBe(429)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
})
