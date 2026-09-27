import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))
vi.mock('@/lib/db', () => ({
  sessionState: vi.fn().mockResolvedValue({ state: 'open', grade: 1 }),
}))

import { POST } from '@/app/api/sessions/form/route'
import * as db from '@/lib/db'
import { createSessionToken } from '@/lib/auth'
import { G1 } from '@/lib/forms/g1'
import { G2 } from '@/lib/forms/g2'

const SID = 'sess-1'
let TOKEN = ''

const makeReq = (body: unknown) => new Request('http://x/api/sessions/form', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(db.sessionState).mockResolvedValue({ state: 'open', grade: 1 })
  TOKEN = await createSessionToken(SID, 'test-secret')
})

describe('POST /api/sessions/form', () => {
  it('세션 학년의 검사지를 내려준다(G1·G2)', async () => {
    const r1 = await POST(makeReq({ sessionId: SID, sessionToken: TOKEN }))
    expect(r1.status).toBe(200)
    expect(r1.headers.get('Cache-Control')).toBe('no-store')
    expect((await r1.json()).form).toEqual(JSON.parse(JSON.stringify(G1)))

    vi.mocked(db.sessionState).mockResolvedValue({ state: 'open', grade: 2 })
    const r2 = await POST(makeReq({ sessionId: SID, sessionToken: TOKEN }))
    expect((await r2.json()).form.id).toBe(G2.id)
  })
  it('토큰 없음·위조·다른 세션의 토큰은 401이고 DB를 읽지 않는다', async () => {
    const other = await createSessionToken('sess-2', 'test-secret')
    for (const body of [{ sessionId: SID }, { sessionId: SID, sessionToken: `${SID}.deadbeef` },
      { sessionId: SID, sessionToken: other }, { sessionId: SID, sessionToken: 123 }, {}]) {
      expect((await POST(makeReq(body))).status).toBe(401)
    }
    expect(db.sessionState).not.toHaveBeenCalled()
  })
  it('없는 세션 404, 제출된 세션 409', async () => {
    vi.mocked(db.sessionState).mockResolvedValue({ state: 'missing', grade: 0 })
    expect((await POST(makeReq({ sessionId: SID, sessionToken: TOKEN }))).status).toBe(404)
    vi.mocked(db.sessionState).mockResolvedValue({ state: 'submitted', grade: 1 })
    expect((await POST(makeReq({ sessionId: SID, sessionToken: TOKEN }))).status).toBe(409)
  })
  it('DB 오류는 502 + 일반화된 문구', async () => {
    vi.mocked(db.sessionState).mockRejectedValueOnce(new Error('secret db detail'))
    const res = await POST(makeReq({ sessionId: SID, sessionToken: TOKEN }))
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })
})
