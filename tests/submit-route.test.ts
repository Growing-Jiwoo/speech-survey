import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  submitSession: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/sessions/submit/route'
import * as db from '@/lib/db'

const VALID = {
  sessionId: 'sess-1',
  writing: { ww01: true, ww02: false },
  checklist: ['none'],
}

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/sessions/submit', () => {
  it('낱말쓰기 답 + 체크리스트 저장', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1',
      [{ itemCode: 'ww01', canWrite: true }, { itemCode: 'ww02', canWrite: false }],
      ['none'])
  })
  it('답이 하나도 없어도 제출 가능 (미완료 제출 허용)', async () => {
    const res = await POST(makeReq({ sessionId: 'sess-1', writing: {}, checklist: [] }))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1', [], [])
  })
  it('미지 낱말쓰기 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID, writing: { rw01: true } }))).status).toBe(400))
  it('불리언 아닌 답 400', async () =>
    expect((await POST(makeReq({ ...VALID, writing: { ww01: '예' } }))).status).toBe(400))
  it('미지 체크리스트 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID, checklist: ['unknown'] }))).status).toBe(400))
  it('sessionId 누락 400', async () =>
    expect((await POST(makeReq({ ...VALID, sessionId: '' }))).status).toBe(400))
  it('본문 없음 400', async () =>
    expect((await POST(new Request('http://x', { method: 'POST', body: 'x' }))).status).toBe(400))
})
