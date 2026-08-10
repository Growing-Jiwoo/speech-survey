import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))
vi.mock('@/lib/db', () => ({
  uploadRecording: vi.fn().mockResolvedValue(undefined),
  insertRecording: vi.fn().mockResolvedValue(undefined),
  countSessionRecordings: vi.fn().mockResolvedValue(0),
  removeStorageObject: vi.fn().mockResolvedValue(undefined),
  sessionSubmitState: vi.fn().mockResolvedValue('open'),
}))

import { POST } from '@/app/api/recordings/route'
import * as db from '@/lib/db'
import { createSessionToken } from '@/lib/auth'

const SID = '11111111-1111-4111-8111-111111111111'
const WEBM = () => new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], { type: 'audio/webm' })
let TOKEN = ''

function makeReq(over: Record<string, string | Blob> = {}) {
  const fd = new FormData()
  fd.set('audio', WEBM(), 'audio')
  fd.set('sessionId', SID)
  fd.set('sessionToken', TOKEN)
  fd.set('itemCode', 'p_rw_meaning')
  fd.set('attemptNo', '1')
  fd.set('durationSec', '3.20')
  for (const [k, v] of Object.entries(over)) fd.set(k, v)
  return new Request('http://x/api/recordings', { method: 'POST', body: fd })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(db.countSessionRecordings).mockResolvedValue(0)
  vi.mocked(db.sessionSubmitState).mockResolvedValue('open')
  TOKEN = await createSessionToken(SID, 'test-secret')
})

describe('POST /api/recordings', () => {
  it('업로드 + 녹음 기록(서버 고정 Content-Type)', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.uploadRecording).toHaveBeenCalledWith(`${SID}/p_rw_meaning_1.webm`, expect.any(Buffer), 'audio/webm')
    expect(db.insertRecording).toHaveBeenCalledWith({
      sessionId: SID, itemCode: 'p_rw_meaning', attemptNo: 1,
      audioPath: `${SID}/p_rw_meaning_1.webm`, durationSec: 3.2,
    })
  })
  it('토큰 없음/위조 401', async () => {
    expect((await POST(makeReq({ sessionToken: '' }))).status).toBe(401)
    expect((await POST(makeReq({ sessionToken: `${SID}.deadbeef` }))).status).toBe(401)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('오디오가 아닌 페이로드 400 (매직바이트)', async () => {
    const html = new Blob([new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c])], { type: 'audio/webm' })
    expect((await POST(makeReq({ audio: html }))).status).toBe(400)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('비허용 MIME 400', async () => {
    const badMime = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], { type: 'text/html' })
    expect((await POST(makeReq({ audio: badMime }))).status).toBe(400)
  })
  it('녹음 페이지가 아닌 코드 400 (쓰기·체크리스트·미지 코드)', async () => {
    expect((await POST(makeReq({ itemCode: 'p_ww' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'p_cl' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'zz99' }))).status).toBe(400)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })

  it('개별 문항 코드는 더 이상 허용하지 않는다 (녹음 단위가 페이지로 바뀜)', async () => {
    expect((await POST(makeReq({ itemCode: 'rw01' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'rs01' }))).status).toBe(400)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })

  it('연습 페이지 코드는 거부한다 (아동 연습용 — 서버에 남기지 않는다)', async () => {
    expect((await POST(makeReq({ itemCode: 'p_practice_rw' }))).status).toBe(400)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })

  it('문장 페이지 코드는 허용된다', async () => {
    expect((await POST(makeReq({ itemCode: 'p_rs04' }))).status).toBe(200)
  })
  it('sessionId가 UUID가 아니면 400', async () =>
    expect((await POST(makeReq({ sessionId: '../etc/passwd' }))).status).toBe(400))
  it('durationSec 비숫자·상한(120) 초과 400', async () => {
    expect((await POST(makeReq({ durationSec: 'abc' }))).status).toBe(400)
    expect((await POST(makeReq({ durationSec: '121' }))).status).toBe(400)
  })
  it('attemptNo 0 이하·상한(10) 초과 400', async () => {
    expect((await POST(makeReq({ attemptNo: '0' }))).status).toBe(400)
    expect((await POST(makeReq({ attemptNo: '11' }))).status).toBe(400)
  })
  it('5MB 초과 파일 413', async () => {
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'audio/webm' })
    expect((await POST(makeReq({ audio: big }))).status).toBe(413)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('이미 제출된 세션 업로드 409 (제출 후 변조 차단)', async () => {
    vi.mocked(db.sessionSubmitState).mockResolvedValue('submitted')
    expect((await POST(makeReq())).status).toBe(409)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('존재하지 않는 세션 업로드 404', async () => {
    vi.mocked(db.sessionSubmitState).mockResolvedValue('missing')
    expect((await POST(makeReq())).status).toBe(404)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('세션당 녹음 상한 초과 429', async () => {
    vi.mocked(db.countSessionRecordings).mockResolvedValue(200)
    expect((await POST(makeReq())).status).toBe(429)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('업로드 실패 시 502, 기록 저장 안 함', async () => {
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    expect((await POST(makeReq())).status).toBe(502)
    expect(db.insertRecording).not.toHaveBeenCalled()
  })
  it('insert 실패 시 502 + 업로드 객체 보상 정리', async () => {
    vi.mocked(db.insertRecording).mockRejectedValueOnce(new Error('db down'))
    expect((await POST(makeReq())).status).toBe(502)
    expect(db.removeStorageObject).toHaveBeenCalledWith(`${SID}/p_rw_meaning_1.webm`)
  })
})
