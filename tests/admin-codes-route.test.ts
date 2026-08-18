import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  insertClassCode: vi.fn(),
  listClassCodes: vi.fn().mockResolvedValue([]),
  deleteClassCode: vi.fn().mockResolvedValue('ok'),
}))

import { GET, POST } from '@/app/api/admin/codes/route'
import { DELETE } from '@/app/api/admin/codes/[id]/route'
import * as db from '@/lib/db'

const ROW = {
  id: '11111111-1111-1111-1111-111111111111', code: 'K7M2P9',
  school_region: '서울특별시교육청', school_id: 'B000002295', school_name: '서울신구초등학교',
  grade: 1, class_no: 2, teacher_name: '김담임',
  teacher_phone: '01012345678', teacher_email: null,
  created_at: '2026-08-13T00:00:00.000Z',
  status: 'active' as const, applied_at: null,
}
const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  grade: 1, classNo: 2, teacherName: '김담임', teacherPhone: '010-1234-5678', teacherEmail: '',
}
const req = (body: unknown) => new Request('http://x/api/admin/codes', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const delParams = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.insertClassCode).mockResolvedValue(ROW)
  vi.mocked(db.listClassCodes).mockResolvedValue([])
  vi.mocked(db.deleteClassCode).mockResolvedValue('ok')
})

describe('POST /api/admin/codes', () => {
  it('유효 입력이면 코드를 발급한다 — 전화는 하이픈 없이 저장된다', async () => {
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    const call = vi.mocked(db.insertClassCode).mock.calls[0][0]
    expect(call.teacherPhone).toBe('01012345678')
    expect(call.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
  })
  it('unique 충돌이면 새 코드로 재시도한다', async () => {
    vi.mocked(db.insertClassCode).mockResolvedValueOnce('duplicate').mockResolvedValueOnce(ROW)
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    expect(db.insertClassCode).toHaveBeenCalledTimes(2)
    const [first, second] = vi.mocked(db.insertClassCode).mock.calls.map(c => c[0].code)
    expect(first).not.toBe(second)
  })
  it('재시도 상한(5회) 소진 시 502', async () => {
    vi.mocked(db.insertClassCode).mockResolvedValue('duplicate')
    const res = await POST(req(VALID))
    expect(res.status).toBe(502)
    expect(db.insertClassCode).toHaveBeenCalledTimes(5)
  })
  it('검증 실패 400 + 내부 문구 비노출', async () => {
    const res = await POST(req({ ...VALID, teacherPhone: '', teacherEmail: '' }))
    expect(res.status).toBe(400)
    expect(db.insertClassCode).not.toHaveBeenCalled()
  })
  it('DB 오류 502 + 원본 오류 텍스트 비노출', async () => {
    vi.mocked(db.insertClassCode).mockRejectedValue(new Error('pg: secret detail'))
    const res = await POST(req(VALID))
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/secret/)
  })
})

describe('GET /api/admin/codes', () => {
  it('sessions(count)·class_roster(count)를 session_count·roster_count로 펴서 내려준다', async () => {
    // 두 수를 다르게 둔다 — 같은 값이면 조인 결과가 뒤바뀌어도 단언이 통과한다.
    vi.mocked(db.listClassCodes).mockResolvedValue([
      { ...ROW, sessions: [{ count: 7 }], class_roster: [{ count: 24 }] },
    ])
    const res = await GET()
    const json = await res.json()
    expect(json.codes[0].session_count).toBe(7)
    expect(json.codes[0].roster_count).toBe(24)
    expect(json.codes[0]).not.toHaveProperty('sessions')
    expect(json.codes[0]).not.toHaveProperty('class_roster')
  })

  it('조인이 비어 있으면 0 — 관리자 직접 발급분은 명단이 없다', async () => {
    vi.mocked(db.listClassCodes).mockResolvedValue([{ ...ROW, sessions: [], class_roster: [] }])
    const json = await (await GET()).json()
    expect(json.codes[0]).toMatchObject({ session_count: 0, roster_count: 0 })
  })
})

describe('DELETE /api/admin/codes/[id]', () => {
  it('미사용 코드는 삭제된다', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), delParams(ROW.id))
    expect(res.status).toBe(200)
  })
  it('사용 중 코드는 409', async () => {
    vi.mocked(db.deleteClassCode).mockResolvedValue('in_use')
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), delParams(ROW.id))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/사용/)
  })
  it('잘못된 id 400 — db 미호출 (가드 순서)', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), delParams('nope'))
    expect(res.status).toBe(400)
    expect(db.deleteClassCode).not.toHaveBeenCalled()
  })
})
