import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))
vi.mock('@/lib/db', () => ({
  scanUploadTarget: vi.fn(),
  uploadScanObject: vi.fn().mockResolvedValue(undefined),
  upsertWritingScan: vi.fn().mockResolvedValue(undefined),
  removeScanObjects: vi.fn().mockResolvedValue(undefined),
  restoreWritingScan: vi.fn().mockResolvedValue(undefined),
  latestSubmittedSessionId: vi.fn(),
}))

import { POST } from '@/app/api/results/[token]/scans/route'
import { createResultsToken } from '@/lib/auth'
import * as db from '@/lib/db'

const CID = '755316e7-fe7c-43f9-a5c5-5c2d39da59d7'
const SID = '11111111-1111-4111-8111-111111111111'
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])

/** 올릴 수 있는 검사 — 이 학급 · 제출됨 · 스캔본 방식 · 담당자 채점 전 · 아직 안 올림 */
const TARGET = {
  class_code_id: CID, child_no: 5, grade: 1, submitted_at: '2026-09-30T01:00:00Z', writing_mode: 'scan' as const,
  writing_answers: [] as { item_code: string }[], sentence_scores: [] as { item_code: string }[],
  scan: null as null | { session_id: string; path: string; content_type: string; bytes: number; uploaded_at: string },
}

let token = ''
const post = (fields: { sessionId?: string; file?: Uint8Array<ArrayBuffer> | string }, t = token) => {
  const fd = new FormData()
  if (fields.sessionId !== undefined) fd.append('sessionId', fields.sessionId)
  if (fields.file !== undefined)
    fd.append('file', typeof fields.file === 'string' ? fields.file : new File([fields.file], 'scan.jpg', { type: 'image/jpeg' }))
  return POST(new Request(`http://x/api/results/${t}/scans`, { method: 'POST', body: fd }), { params: Promise.resolve({ token: t }) })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(db.scanUploadTarget).mockResolvedValue({ ...TARGET })
  vi.mocked(db.uploadScanObject).mockResolvedValue(undefined)
  vi.mocked(db.upsertWritingScan).mockResolvedValue(undefined)
  vi.mocked(db.removeScanObjects).mockResolvedValue(undefined)
  vi.mocked(db.restoreWritingScan).mockResolvedValue(undefined)
  vi.mocked(db.latestSubmittedSessionId).mockResolvedValue(SID)   // 보낸 검사가 그 아이의 가장 최근 제출 검사
  token = await createResultsToken(CID, 'test-secret')
})

describe('POST /api/results/[token]/scans — 쓰기 기록지 스캔본 한 장', () => {
  it('올린다: 새 경로에 파일 → 스캔본 행. Content-Type은 매직바이트로 서버가 정한다', async () => {
    const res = await post({ sessionId: SID, file: JPEG })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    const [path, bytes, mime] = vi.mocked(db.uploadScanObject).mock.calls[0]
    // 올릴 때마다 새 경로 + 무작위 꼬리 — 「이미 있음」을 성공으로 보는 재시도가 같은 ms의 다른 요청 그림을 제 것으로 받지 않게
    expect(path).toMatch(new RegExp(`^${SID}/\\d+-[0-9a-f]{8}\\.jpg$`))
    expect(bytes.length).toBe(JPEG.length)
    expect(mime).toBe('image/jpeg')
    expect(db.upsertWritingScan).toHaveBeenCalledWith({ sessionId: SID, path, contentType: 'image/jpeg', bytes: JPEG.length })
    expect(db.removeScanObjects).not.toHaveBeenCalled()
  })
  it('PNG도 받는다(확장자·형식은 판별 결과를 따른다)', async () => {
    expect((await post({ sessionId: SID, file: PNG })).status).toBe(200)
    const [path, , mime] = vi.mocked(db.uploadScanObject).mock.calls[0]
    expect(path).toMatch(/\.png$/)
    expect(mime).toBe('image/png')
  })
  it('이미 올린 스캔본은 바꾼다 — 새 파일·행을 먼저, **그다음** 옛 파일을 지운다(도중 실패해도 옛 것이 남는다)', async () => {
    vi.mocked(db.scanUploadTarget).mockResolvedValue({ ...TARGET,
      scan: { session_id: SID, path: `${SID}/1.jpg`, content_type: 'image/jpeg', bytes: 1, uploaded_at: 'T' } })
    const res = await post({ sessionId: SID, file: JPEG })
    expect(res.status).toBe(200)
    expect(db.removeScanObjects).toHaveBeenCalledWith([`${SID}/1.jpg`])
    const order = [
      vi.mocked(db.uploadScanObject).mock.invocationCallOrder[0],
      vi.mocked(db.upsertWritingScan).mock.invocationCallOrder[0],
      vi.mocked(db.removeScanObjects).mock.invocationCallOrder[0],
    ]
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('옛 파일 정리가 실패해도 올리기는 성공이다(행은 이미 새 파일을 가리킨다)', async () => {
    vi.mocked(db.scanUploadTarget).mockResolvedValue({ ...TARGET,
      scan: { session_id: SID, path: `${SID}/1.jpg`, content_type: 'image/jpeg', bytes: 1, uploaded_at: 'T' } })
    vi.mocked(db.removeScanObjects).mockRejectedValueOnce(new Error('rm'))
    expect((await post({ sessionId: SID, file: JPEG })).status).toBe(200)
  })
  it('행 저장이 실패하면 방금 올린 파일을 지우고 502(고아 파일 방지)', async () => {
    vi.mocked(db.upsertWritingScan).mockRejectedValueOnce(new Error('db down'))
    const res = await post({ sessionId: SID, file: JPEG })
    expect(res.status).toBe(502)
    const [path] = vi.mocked(db.uploadScanObject).mock.calls[0]
    expect(db.removeScanObjects).toHaveBeenCalledWith([path])
    expect((await res.json()).error).not.toMatch(/db down/)
  })

  describe('거부', () => {
    it('토큰이 틀리거나 만료면 401 — DB를 보지 않는다', async () => {
      expect((await post({ sessionId: SID, file: JPEG }, 'garbage')).status).toBe(401)
      expect((await post({ sessionId: SID, file: JPEG }, await createResultsToken(CID, 'test-secret', -1))).status).toBe(401)
      expect(db.scanUploadTarget).not.toHaveBeenCalled()
    })
    it('필수 항목이 없거나 세션 id가 UUID가 아니면 400', async () => {
      expect((await post({ file: JPEG })).status).toBe(400)
      expect((await post({ sessionId: '../x', file: JPEG })).status).toBe(400)
      expect((await post({ sessionId: SID })).status).toBe(400)
      expect((await post({ sessionId: SID, file: 'not-a-file' })).status).toBe(400)
    })
    it('이미지가 아니면(매직바이트) 400 — 이름·MIME을 믿지 않는다', async () => {
      expect((await post({ sessionId: SID, file: new TextEncoder().encode('%PDF-1.7') })).status).toBe(400)
      expect(db.uploadScanObject).not.toHaveBeenCalled()
    })
    it('4MB를 넘으면 413', async () => {
      const big = new Uint8Array(4 * 1024 * 1024 + 1); big.set(JPEG)
      expect((await post({ sessionId: SID, file: big })).status).toBe(413)
    })
    it('[핵심] 다른 학급의 검사는 없는 검사와 같은 404 — 있다는 사실도 알려 주지 않는다', async () => {
      vi.mocked(db.scanUploadTarget).mockResolvedValueOnce({ ...TARGET, class_code_id: 'other' })
      expect((await post({ sessionId: SID, file: JPEG })).status).toBe(404)
      vi.mocked(db.scanUploadTarget).mockResolvedValueOnce(null)
      expect((await post({ sessionId: SID, file: JPEG })).status).toBe(404)
      expect(db.uploadScanObject).not.toHaveBeenCalled()
    })
    it('제출 전·화면 방식 검사는 409', async () => {
      vi.mocked(db.scanUploadTarget).mockResolvedValueOnce({ ...TARGET, submitted_at: null })
      expect((await post({ sessionId: SID, file: JPEG })).status).toBe(409)
      vi.mocked(db.scanUploadTarget).mockResolvedValueOnce({ ...TARGET, writing_mode: 'screen' })
      expect((await post({ sessionId: SID, file: JPEG })).status).toBe(409)
      expect(db.uploadScanObject).not.toHaveBeenCalled()
    })
    it('[핵심] 담당자가 쓰기를 하나라도 넣었으면 409 — 넣은 점수와 근거 그림이 어긋나지 않게', async () => {
      vi.mocked(db.scanUploadTarget).mockResolvedValueOnce({ ...TARGET, writing_answers: [{ item_code: 'ww03' }] })
      const res = await post({ sessionId: SID, file: JPEG })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toMatch(/채점/)
      expect(db.uploadScanObject).not.toHaveBeenCalled()
    })
    it('문장 쓰기(G2)는 sentence_scores의 쓰기 코드(sw..)만 채점으로 본다 — 문장 읽기(rs..) 점수는 막지 않는다', async () => {
      vi.mocked(db.scanUploadTarget).mockResolvedValueOnce({ ...TARGET, grade: 2, sentence_scores: [{ item_code: 'rs01' }] })
      expect((await post({ sessionId: SID, file: JPEG })).status).toBe(200)
      vi.mocked(db.scanUploadTarget).mockResolvedValueOnce({ ...TARGET, grade: 2, sentence_scores: [{ item_code: 'sw02' }] })
      expect((await post({ sessionId: SID, file: JPEG })).status).toBe(409)
    })
    it('[REGRESSION] 확인과 교체 사이에 담당자가 쓰기를 넣었으면 되돌리고 409 — 점수와 근거 그림이 어긋나지 않게', async () => {
      const prev = { session_id: SID, path: `${SID}/1.jpg`, content_type: 'image/jpeg', bytes: 1, uploaded_at: 'T' }
      vi.mocked(db.scanUploadTarget)
        .mockResolvedValueOnce({ ...TARGET, scan: prev })                                    // 확인: 채점 전
        .mockResolvedValueOnce({ ...TARGET, scan: prev, writing_answers: [{ item_code: 'ww01' }] })  // 교체 직후: 채점이 끼었다
      const res = await post({ sessionId: SID, file: JPEG })
      expect(res.status).toBe(409)
      expect(db.restoreWritingScan).toHaveBeenCalledWith(SID, prev)
      const [path] = vi.mocked(db.uploadScanObject).mock.calls[0]
      expect(db.removeScanObjects).toHaveBeenCalledWith([path])          // 방금 올린 새 파일만 지운다
      expect(db.removeScanObjects).not.toHaveBeenCalledWith([prev.path])  // 옛 파일은 그대로(행이 다시 가리킨다)
    })
    it('[REGRESSION] 그 아이의 가장 최근 제출 검사가 아니면 409 — 오래 열어 둔 탭이 새 기록지를 앞 차수에 붙이지 않게', async () => {
      vi.mocked(db.latestSubmittedSessionId).mockResolvedValueOnce('22222222-2222-4222-8222-222222222222')
      const res = await post({ sessionId: SID, file: JPEG })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toMatch(/새로고침/)
      expect(db.latestSubmittedSessionId).toHaveBeenCalledWith(CID, 5)
      expect(db.uploadScanObject).not.toHaveBeenCalled()
    })
    it('[REGRESSION] 사후 확인 뒤 되돌리기가 실패하면 새 파일을 지우지 않는다(행이 가리킨다) · 409 · 찾을 수 있게 기록', async () => {
      const prev = { session_id: SID, path: `${SID}/1.jpg`, content_type: 'image/jpeg', bytes: 1, uploaded_at: 'T' }
      vi.mocked(db.scanUploadTarget)
        .mockResolvedValueOnce({ ...TARGET, scan: prev })
        .mockResolvedValueOnce({ ...TARGET, scan: prev, writing_answers: [{ item_code: 'ww01' }] })
      vi.mocked(db.restoreWritingScan).mockRejectedValueOnce(new Error('db down'))
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      const res = await post({ sessionId: SID, file: JPEG })
      expect(res.status).toBe(409)
      expect(db.removeScanObjects).not.toHaveBeenCalled()
      expect(err.mock.calls.some(c => String(c[0]).includes(`session=${SID}`))).toBe(true)
      err.mockRestore()
    })
    it('학급(토큰)당 시간당 상한을 넘으면 429', async () => {
      const other = await createResultsToken('11111111-2222-4333-8444-555555555555', 'test-secret')
      vi.mocked(db.scanUploadTarget).mockResolvedValue({ ...TARGET, class_code_id: '11111111-2222-4333-8444-555555555555' })
      let last = 0
      for (let i = 0; i < 301; i++) last = (await post({ sessionId: SID, file: JPEG }, other)).status
      expect(last).toBe(429)
    })
    it('스토리지 장애는 502 + 내부 문구 비노출', async () => {
      vi.mocked(db.uploadScanObject).mockRejectedValueOnce(new Error('bucket not found'))
      const res = await post({ sessionId: SID, file: JPEG })
      expect(res.status).toBe(502)
      expect((await res.json()).error).not.toMatch(/bucket/)
    })
  })
})
