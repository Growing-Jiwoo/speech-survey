import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))
vi.mock('@/lib/db', () => ({ submitSession: vi.fn().mockResolvedValue(1) }))

import { POST } from '@/app/api/sessions/submit/route'
import * as db from '@/lib/db'
import { createSessionToken } from '@/lib/auth'

const SID = 'sess-1'
let TOKEN = ''
const VALID = () => ({ sessionId: SID, sessionToken: TOKEN, writing: { ww01: true, ww02: false }, checklist: ['none'] })

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(db.submitSession).mockResolvedValue(1)
  TOKEN = await createSessionToken(SID, 'test-secret')
})

describe('POST /api/sessions/submit', () => {
  it('낱말쓰기 답 + 체크리스트 저장', async () => {
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1',
      [{ itemCode: 'ww01', canWrite: true }, { itemCode: 'ww02', canWrite: false }], ['none'])
  })
  it('답이 하나도 없어도 제출 가능', async () => {
    const res = await POST(makeReq({ sessionId: SID, sessionToken: TOKEN, writing: {}, checklist: [] }))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1', [], [])
  })
  it('존재하지 않는 세션 404 (허위 성공 제거)', async () => {
    vi.mocked(db.submitSession).mockResolvedValue(0)
    expect((await POST(makeReq(VALID()))).status).toBe(404)
  })
  it('토큰 없음/위조 401', async () => {
    expect((await POST(makeReq({ ...VALID(), sessionToken: '' }))).status).toBe(401)
    expect((await POST(makeReq({ ...VALID(), sessionToken: `${SID}.deadbeef` }))).status).toBe(401)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('DB 오류 시 502 + 일반화된 메시지 (원본 오류 텍스트 노출 안 함)', async () => {
    vi.mocked(db.submitSession).mockRejectedValueOnce(new Error('secret db connection string leaked'))
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).not.toMatch(/secret db connection string/)
  })
  it('미지 낱말쓰기 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID(), writing: { rw01: true } }))).status).toBe(400))
  it('불리언 아닌 답 400', async () =>
    expect((await POST(makeReq({ ...VALID(), writing: { ww01: '예' } }))).status).toBe(400))
  it('미지 체크리스트 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID(), checklist: ['unknown'] }))).status).toBe(400))
  it('sessionId 누락 400', async () =>
    expect((await POST(makeReq({ ...VALID(), sessionId: '' }))).status).toBe(400))
  it('본문 없음 400', async () =>
    expect((await POST(new Request('http://x', { method: 'POST', body: 'x' }))).status).toBe(400))
})
