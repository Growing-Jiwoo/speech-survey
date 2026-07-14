import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  createSession: vi.fn().mockResolvedValue('sess-1'),
  listQuestions: vi.fn().mockResolvedValue([{ id: 1, order_no: 1, text: 'Hi.', difficulty: 'easy' }]),
}))

import { POST } from '@/app/api/sessions/route'
import * as db from '@/lib/db'

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/sessions', () => {
  it('한글 이름 + 나이 20 허용 (기존 3~19 제한 폐기 확인)', async () => {
    const res = await POST(makeReq({ name: '김도연', age: 20 }))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith('김도연', 20)
  })
  it('영어 공백 이름 허용, 연속 공백은 서버가 정규화', async () => {
    const res = await POST(makeReq({ name: '  Mary   Jane ', age: 8 }))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith('Mary Jane', 8)
  })
  it('숫자·특수문자 이름 400', async () => {
    expect((await POST(makeReq({ name: '지우1', age: 8 }))).status).toBe(400)
    expect((await POST(makeReq({ name: '지우!', age: 8 }))).status).toBe(400)
  })
  it('나이 0·비숫자·1000 400', async () => {
    expect((await POST(makeReq({ name: '지우', age: 0 }))).status).toBe(400)
    expect((await POST(makeReq({ name: '지우', age: 'abc' }))).status).toBe(400)
    expect((await POST(makeReq({ name: '지우', age: 1000 }))).status).toBe(400)
  })
  it('비원시 나이(배열·불리언) 400', async () => {
    expect((await POST(makeReq({ name: '지우', age: [8] }))).status).toBe(400)
    expect((await POST(makeReq({ name: '지우', age: true }))).status).toBe(400)
  })
  it('본문 없음 400', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(400)
  })
})
