import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  findClassCode: vi.fn(),
  childTestState: vi.fn(),
  rosterWithTested: vi.fn(),
}))

import { classSheetTag } from '@/lib/writing-sheet'
import { POST } from '@/app/api/sessions/verify-code/route'
import * as db from '@/lib/db'

const ROW = {
  id: '11111111-1111-1111-1111-111111111111', code: 'K7M2P9',
  school_region: '서울특별시교육청', school_id: 'B000002295', school_name: '서울신구초등학교',
  grade: 1, class_no: 2, teacher_name: '김담임',
  teacher_phone: '01012345678', teacher_email: null,
  created_at: '2026-08-13T00:00:00.000Z',
  status: 'active' as const, applied_at: null,
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
  vi.mocked(db.rosterWithTested).mockResolvedValue({ roster: [], scanPending: 0 })
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
  it('childNo 없음은 유효(명단 조회) — 범위 밖 값만 400', async () => {
    expect((await POST(req({ code: 'K7M2P9' }))).status).toBe(200)
    expect((await POST(req({ code: 'K7M2P9', childNo: 0 }))).status).toBe(400)
  })
  it('같은 IP 301번째 요청은 429 (코드 열거 방지, 다중 PC 동시 검사를 감안한 높은 상한)', async () => {
    let last = 0
    for (let i = 0; i < 301; i++) last = (await POST(req({ code: 'K7M2P9', childNo: 3 }, '9.9.9.9'))).status
    expect(last).toBe(429)
  })

  it('[REGRESSION] pending 코드는 404이고, 문구가 존재하지 않는 코드와 똑같다', async () => {
    vi.mocked(db.findClassCode).mockResolvedValue({ ...ROW, status: 'pending', applied_at: '2026-08-01T00:00:00.000Z' })
    const pendingRes = await POST(req({ code: 'K7M2P9', childNo: 3 }))
    const pendingJson = await pendingRes.json()

    vi.mocked(db.findClassCode).mockResolvedValue(null)
    const missingRes = await POST(req({ code: 'AAAAAA', childNo: 3 }))
    const missingJson = await missingRes.json()

    expect(pendingRes.status).toBe(404)
    expect(missingRes.status).toBe(404)
    expect(pendingJson.error).toBe(missingJson.error)
  })

  it('childNo 없이 호출하면 roster(번호별 검사 상태 포함)를 돌려주고 childTestState는 부르지 않는다', async () => {
    const roster = [
      { childNo: 1, name: '김서아', gender: '여' as const, birthYmd: '190304', tested: null, writing: null },
      { childNo: 2, name: '박도윤', gender: '남' as const, birthYmd: '190712', tested: 'submitted' as const, writing: 'wait' as const },
    ]
    vi.mocked(db.rosterWithTested).mockResolvedValue({ roster, scanPending: 1 })
    const res = await POST(req({ code: 'K7M2P9' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.roster).toEqual(roster)
    expect(json.scanPending).toBe(1)
    expect(db.rosterWithTested).toHaveBeenCalledWith(ROW.id, expect.any(Function))
    expect(db.childTestState).not.toHaveBeenCalled()
  })

  it('쓰기 문항 코드 판정은 세션 학년의 양식을 따른다 — 문장 읽기(rs..)는 쓰기가 아니다', async () => {
    await POST(req({ code: 'K7M2P9' }))
    const isWriting = vi.mocked(db.rosterWithTested).mock.calls[0][1]
    expect(isWriting('ww01')).toBe(true)
    expect(isWriting('rs01')).toBe(false)
    vi.mocked(db.findClassCode).mockResolvedValue({ ...ROW, grade: 2 })
    await POST(req({ code: 'K7M2P9' }))
    const isWriting2 = vi.mocked(db.rosterWithTested).mock.calls[1][1]
    expect(isWriting2('sw01')).toBe(true)
    expect(isWriting2('ww01')).toBe(false)
  })

  it('기록지 인쇄 정보: 반 표시(해시 8자리)와 쓰는 칸 종류·개수 — 문항 글자는 싣지 않는다', async () => {
    const json = await (await POST(req({ code: 'K7M2P9' }))).json()
    expect(json.sheet.tag).toMatch(/^[0-9a-f]{8}$/)
    // 인쇄 쪽 반 표시가 올리기 쪽(결과 라우트의 sheetTag)과 같은 함수·같은 입력이어야 한다 — 한쪽만 바뀌면 모든 쪽이 「다른 반」이 된다
    expect(json.sheet.tag).toBe(await classSheetTag(ROW.id))
    expect(json.sheet.layout).toEqual({ kind: 'word', count: 10 })
    expect(JSON.stringify(json.sheet)).not.toContain(ROW.id)
    vi.mocked(db.findClassCode).mockResolvedValue({ ...ROW, grade: 2 })
    const g2 = await (await POST(req({ code: 'K7M2P9' }))).json()
    expect(g2.sheet.layout).toEqual({ kind: 'sentence', count: 5 })
  })

  it('childNo와 함께 호출하면 기존처럼 alreadyTested만 답하고 rosterWithTested는 부르지 않는다', async () => {
    vi.mocked(db.childTestState).mockResolvedValue('inProgress')
    const res = await POST(req({ code: 'K7M2P9', childNo: 3 }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.alreadyTested).toBe('inProgress')
    expect(json.roster).toBeUndefined()
    expect(db.rosterWithTested).not.toHaveBeenCalled()
  })

  it('명단이 빈 학급(관리자 직접 발급 코드)은 roster: []를 돌려준다', async () => {
    vi.mocked(db.rosterWithTested).mockResolvedValue({ roster: [], scanPending: 0 })
    const res = await POST(req({ code: 'K7M2P9' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.roster).toEqual([])
  })
})
