import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  saveScores: vi.fn().mockResolvedValue(undefined),
  sessionState: vi.fn().mockResolvedValue({ state: 'open', grade: 1 }),
}))

import { PUT } from '@/app/api/admin/sessions/[id]/scores/route'
import * as db from '@/lib/db'

const SID = '11111111-1111-4111-8111-111111111111'
const ctx = (id = SID) => ({ params: Promise.resolve({ id }) })
const req = (body: unknown) => new Request('http://x', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

const RS = ['rs01', 'rs02', 'rs03', 'rs04']

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.saveScores).mockResolvedValue(undefined)
  vi.mocked(db.sessionState).mockResolvedValue({ state: 'open', grade: 1 })
})

describe('PUT /api/admin/sessions/[id]/scores', () => {
  it('낱말 O/X와 문장 어절 수를 저장한다', async () => {
    const res = await PUT(req({ marks: { rw01: true, rw14: false }, sentences: { rs01: 7 } }), ctx())
    expect(res.status).toBe(200)
    expect(db.saveScores).toHaveBeenCalledWith(SID,
      [{ itemCode: 'rw01', correct: true }, { itemCode: 'rw14', correct: false }],
      [{ itemCode: 'rs01', words: 7 }], RS)
  })

  it('낱말 해독 14개 코드를 모두 허용한다 (무의미 낱말 포함)', async () => {
    expect((await PUT(req({ marks: { rw08: true }, sentences: {} }), ctx())).status).toBe(200)
  })

  it('낱말 해독이 아닌 코드는 400', async () => {
    expect((await PUT(req({ marks: { ww01: true }, sentences: {} }), ctx())).status).toBe(400)
    expect(db.saveScores).not.toHaveBeenCalled()
  })

  it('문장이 아닌 코드는 400', async () => {
    expect((await PUT(req({ marks: {}, sentences: { rw01: 3 } }), ctx())).status).toBe(400)
  })

  it('문장 점수가 정수가 아니거나 음수면 400', async () => {
    expect((await PUT(req({ marks: {}, sentences: { rs01: 1.5 } }), ctx())).status).toBe(400)
    expect((await PUT(req({ marks: {}, sentences: { rs01: -1 } }), ctx())).status).toBe(400)
  })

  it('문항 만점을 넘는 어절 수는 400 (rs01은 7어절)', async () => {
    expect((await PUT(req({ marks: {}, sentences: { rs01: 8 } }), ctx())).status).toBe(400)
  })

  it('낱말 값이 boolean이 아니면 400', async () => {
    expect((await PUT(req({ marks: { rw01: 'yes' }, sentences: {} }), ctx())).status).toBe(400)
  })

  it('marks·sentences가 배열이면 400 (typeof "object" 함정)', async () => {
    expect((await PUT(req({ marks: [], sentences: {} }), ctx())).status).toBe(400)
    expect((await PUT(req({ marks: {}, sentences: [] }), ctx())).status).toBe(400)
    expect(db.saveScores).not.toHaveBeenCalled()
  })

  it('본문이 없거나 JSON이 아니면 400', async () => {
    const res = await PUT(new Request('http://x', { method: 'PUT' }), ctx())
    expect(res.status).toBe(400)
    expect(db.saveScores).not.toHaveBeenCalled()
  })

  it('둘 다 비어 있으면 200 (변경 없는 저장)', async () => {
    const res = await PUT(req({ marks: {}, sentences: {} }), ctx())
    expect(res.status).toBe(200)
    expect(db.saveScores).toHaveBeenCalledWith(SID, [], [], RS)
  })

  it('세션 id가 UUID가 아니면 400', async () => {
    expect((await PUT(req({ marks: {}, sentences: {} }), ctx('../etc/passwd'))).status).toBe(400)
    expect(db.saveScores).not.toHaveBeenCalled()
  })

  it('DB 오류는 502로 감싸고 원본 메시지를 노출하지 않는다', async () => {
    vi.mocked(db.saveScores).mockRejectedValueOnce(new Error('secret connection string'))
    const res = await PUT(req({ marks: { rw01: true }, sentences: {} }), ctx())
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/secret connection string/)
  })

  it('존재하지 않는 세션은 404 (조용한 no-op 금지)', async () => {
    vi.mocked(db.sessionState).mockResolvedValue({ state: 'missing', grade: 0 })
    expect((await PUT(req({ marks: {}, sentences: {} }), ctx())).status).toBe(404)
    expect(db.saveScores).not.toHaveBeenCalled()
  })
})

describe('유효한 문항 코드는 세션의 학년(검사지)이 정한다', () => {
  beforeEach(() => vi.mocked(db.sessionState).mockResolvedValue({ state: 'open', grade: 2 }))

  it('G2 문장은 만점이 다르다 (rs01은 7어절, rs03은 9어절)', async () => {
    expect((await PUT(req({ marks: {}, sentences: { rs03: 9 } }), ctx())).status).toBe(200)
    expect((await PUT(req({ marks: {}, sentences: { rs03: 10 } }), ctx())).status).toBe(400)
  })

  it('문장 쓰기 코드(sw..)는 관리자 채점 대상이 아니다 — 400', async () => {
    // 검사 중 수집된 값이라 여기서 덮어쓰면 안 된다.
    expect((await PUT(req({ marks: {}, sentences: { sw01: 2 } }), ctx())).status).toBe(400)
    expect(db.saveScores).not.toHaveBeenCalled()
  })

  it('삭제 범위(ownedCodes)는 문장 읽기 코드로만 한정된다 — 문장 쓰기 점수가 지워지지 않는다', async () => {
    await PUT(req({ marks: {}, sentences: { rs01: 3 } }), ctx())
    const owned = vi.mocked(db.saveScores).mock.calls[0][3]
    expect(owned).toEqual(RS)
    expect(owned).not.toContain('sw01')
  })
})
