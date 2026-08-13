import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  findClassCode: vi.fn(),
  childTestState: vi.fn(),
}))

import { POST } from '@/app/api/sessions/verify-code/route'
import * as db from '@/lib/db'

const ROW = {
  id: '11111111-1111-1111-1111-111111111111', code: 'K7M2P9',
  school_region: '서울특별시교육청', school_id: 'B000002295', school_name: '서울신구초등학교',
  grade: 1, class_no: 2, teacher_name: '김담임',
  teacher_phone: '01012345678', teacher_email: null,
  created_at: '2026-08-13T00:00:00.000Z',
}
let ipSeq = 0
const req = (body: unknown, ip = `10.0.0.${++ipSeq}`) => new Request('http://x/api/sessions/verify-code', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.findClassCode).mockResolvedValue(ROW)
  vi.mocked(db.childTestState).mockResolvedValue(null)
})

describe('POST /api/sessions/verify-code', () => {
  it('정상 조회 — 학급 정보와 alreadyTested를 돌려준다', async () => {
    const res = await POST(req({ code: 'K7M2P9', childNo: 3 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      schoolName: '서울신구초등학교', grade: 1, classNo: 2,
      teacherName: '김담임', teacherPhone: '01012345678', teacherEmail: null,
      alreadyTested: null,
    })
    expect(db.childTestState).toHaveBeenCalledWith(ROW.id, 3)
  })
  it('소문자 코드도 대문자로 정규화해 조회한다', async () => {
    await POST(req({ code: 'k7m2p9', childNo: 3 }))
    expect(db.findClassCode).toHaveBeenCalledWith('K7M2P9')
  })
  it('미존재 코드 404', async () => {
    vi.mocked(db.findClassCode).mockResolvedValue(null)
    const res = await POST(req({ code: 'AAAAAA', childNo: 3 }))
    expect(res.status).toBe(404)
    expect(db.childTestState).not.toHaveBeenCalled()
  })
  it('제출 이력이 있으면 alreadyTested=submitted', async () => {
    vi.mocked(db.childTestState).mockResolvedValue('submitted')
    const json = await (await POST(req({ code: 'K7M2P9', childNo: 3 }))).json()
    expect(json.alreadyTested).toBe('submitted')
  })
  it('검사 진행 중이면 alreadyTested=inProgress', async () => {
    vi.mocked(db.childTestState).mockResolvedValue('inProgress')
    const json = await (await POST(req({ code: 'K7M2P9', childNo: 3 }))).json()
    expect(json.alreadyTested).toBe('inProgress')
  })
  it('findClassCode 실패 시 502이며 내부 오류 원문이 응답에 새지 않는다', async () => {
    vi.mocked(db.findClassCode).mockRejectedValue(new Error('db 커넥션 실패'))
    const res = await POST(req({ code: 'K7M2P9', childNo: 3 }))
    const json = await res.json()
    expect(res.status).toBe(502)
    expect(json.error).not.toMatch(/db 커넥션 실패/)
  })
  it('[REGRESSION] 응답에 다른 아동 번호 목록이 실리지 않는다 — 물어본 번호의 상태만 답한다', async () => {
    const json = await (await POST(req({ code: 'K7M2P9', childNo: 3 }))).json()
    expect(Object.keys(json).sort()).toEqual(
      ['alreadyTested', 'classNo', 'grade', 'schoolName', 'teacherEmail', 'teacherName', 'teacherPhone'])
  })
  it('childNo 누락·범위 밖 400', async () => {
    expect((await POST(req({ code: 'K7M2P9' }))).status).toBe(400)
    expect((await POST(req({ code: 'K7M2P9', childNo: 0 }))).status).toBe(400)
  })
  it('같은 IP 301번째 요청은 429 (코드 열거 방지, 다중 PC 동시 검사를 감안한 높은 상한)', async () => {
    let last = 0
    for (let i = 0; i < 301; i++) last = (await POST(req({ code: 'K7M2P9', childNo: 3 }, '9.9.9.9'))).status
    expect(last).toBe(429)
  })
})
