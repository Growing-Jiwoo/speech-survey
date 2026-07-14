import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  uploadRecording: vi.fn().mockResolvedValue(undefined),
  insertRecording: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/recordings/route'
import * as db from '@/lib/db'

function makeReq(over: Record<string, string | Blob> = {}) {
  const fd = new FormData()
  fd.set('audio', new Blob([new Uint8Array(8)], { type: 'audio/webm' }), 'audio')
  fd.set('sessionId', 'sess-1')
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
    expect(db.uploadRecording).toHaveBeenCalledWith('sess-1/rw01_1.webm', expect.any(Buffer), 'audio/webm')
    expect(db.insertRecording).toHaveBeenCalledWith({
      sessionId: 'sess-1', itemCode: 'rw01', attemptNo: 1, audioPath: 'sess-1/rw01_1.webm', durationSec: 3.2,
    })
  })
  it('녹음 문항이 아닌 코드 400 (ww01, cl, 미지 코드)', async () => {
    expect((await POST(makeReq({ itemCode: 'ww01' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'cl' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'zz99' }))).status).toBe(400)
  })
  it('오디오·세션 누락 400', async () => {
    const noAudio = new FormData()
    noAudio.set('sessionId', 'sess-1'); noAudio.set('itemCode', 'rw01'); noAudio.set('attemptNo', '1')
    expect((await POST(new Request('http://x', { method: 'POST', body: noAudio }))).status).toBe(400)
    expect((await POST(makeReq({ sessionId: '' }))).status).toBe(400)
  })
  it('attemptNo 0 이하 400', async () =>
    expect((await POST(makeReq({ attemptNo: '0' }))).status).toBe(400))
  it('업로드 실패 시 502, 기록 저장 안 함', async () => {
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    expect((await POST(makeReq())).status).toBe(502)
    expect(db.insertRecording).not.toHaveBeenCalled()
  })
})
