import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  createSession: vi.fn().mockResolvedValue('sess-1'),
  findClassCode: vi.fn(),
  listRoster: vi.fn(),
}))
vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))

import { POST } from '@/app/api/sessions/route'
import * as db from '@/lib/db'
import { PUBLIC_RATE_LIMIT } from '@/lib/request'

const CODE_ROW = {
  id: '11111111-1111-1111-1111-111111111111', code: 'K7M2P9',
  school_region: '서울특별시교육청', school_id: 'B000002295', school_name: '서울신구초등학교',
  grade: 2, class_no: 3, teacher_name: '박선생',
  teacher_phone: '01012345678', teacher_email: null,
  created_at: '2026-08-13T00:00:00.000Z',
  status: 'active' as const, applied_at: null,
}
const PENDING_CODE_ROW = { ...CODE_ROW, status: 'pending' as const, applied_at: '2026-08-13T00:00:00.000Z' }
const VALID = { code: 'K7M2P9', childNo: 7, name: '김도연', gender: '남', birthYmd: '190101', guardianConsent: true }
const ROSTER = [
  { child_no: 3, child_name: '이서준', gender: '여' as const, birth_ymd: '180505' },
  { child_no: 7, child_name: '박지민', gender: '남' as const, birth_ymd: '190202' },
]
const FROM_ROSTER = { fromRoster: true as const, code: 'K7M2P9', childNo: 7, guardianConsent: true }

let ipSeq = 0
function makeReq(body: unknown, ip = `10.1.0.${++ipSeq}`) {
  return new Request('http://x/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.createSession).mockResolvedValue('sess-1')
  vi.mocked(db.findClassCode).mockResolvedValue(CODE_ROW)
  vi.mocked(db.listRoster).mockResolvedValue(ROSTER)
})

describe('POST /api/sessions — 코드 기반 생성', () => {
  it('유효한 코드로 세션 생성 + 토큰 + 학년(코드가 정한 값) 반환', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessionId).toBe('sess-1')
    expect(typeof json.sessionToken).toBe('string')
    expect(json.grade).toBe(2)
    expect(db.createSession).toHaveBeenCalledWith({
      classCode: CODE_ROW, childNo: 7,
      birthYmd: '190101', gender: '남', childName: '김도연',
    })
  })
  it('[REGRESSION] 클라이언트가 보낸 학급 정보는 무시된다 — 서버가 코드에서 복사한다', async () => {
    const res = await POST(makeReq({ ...VALID, schoolName: '위조초등학교', grade: 6, teacherName: '위조' }))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith({
      classCode: CODE_ROW, childNo: 7,
      birthYmd: '190101', gender: '남', childName: '김도연',
    })
  })
  it('idemKey를 그대로 db 계층에 넘긴다 — 직접 입력 모드', async () => {
    const key = '11111111-2222-4333-8444-555555555555'
    await POST(makeReq({ ...VALID, idemKey: key }))
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({ idemKey: key }))
  })
  it('idemKey를 그대로 db 계층에 넘긴다 — 명단 모드', async () => {
    const key = '11111111-2222-4333-8444-555555555555'
    await POST(makeReq({ ...FROM_ROSTER, idemKey: key }))
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({
      idemKey: key, childName: '박지민',   // 신원은 여전히 서버가 명단에서 복사한다
    }))
  })
  it('idemKey가 UUID가 아니면 400 — 세션이 만들어지지 않는다', async () => {
    const res = await POST(makeReq({ ...VALID, idemKey: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    expect(db.createSession).not.toHaveBeenCalled()
  })
  it('idemKey 없이도 생성된다 — 멱등 보장만 없다(구버전 화면 호환)', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({ idemKey: undefined }))
  })
  it('미존재 코드 404 — 세션이 만들어지지 않는다', async () => {
    vi.mocked(db.findClassCode).mockResolvedValue(null)
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(404)
    expect(db.createSession).not.toHaveBeenCalled()
  })
  it('아동 번호 범위 밖(0·100) 400', async () => {
    expect((await POST(makeReq({ ...VALID, childNo: 0 }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, childNo: 100 }))).status).toBe(400)
  })
  it('guardianConsent가 true 리터럴이 아니면 400 (미체크로는 생성 불가)', async () => {
    expect((await POST(makeReq({ ...VALID, guardianConsent: false }))).status).toBe(400)
    const { guardianConsent: _omit, ...rest } = VALID
    expect((await POST(makeReq(rest))).status).toBe(400)
  })
  it('이름 형식 위반 400', async () => {
    expect((await POST(makeReq({ ...VALID, name: '123' }))).status).toBe(400)
  })
  it('DB 오류 502 + 내부 문구 비노출', async () => {
    vi.mocked(db.createSession).mockRejectedValue(new Error('pg secret'))
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/pg secret/)
  })
  // 상한을 숫자로 박지 않고 상수에서 끌어온다 — 값이 바뀌어도 "상한+1에서 막힌다"는
  // 성질만 고정해, 정책값 조정 때 테스트가 함께 썩지 않게 한다.
  it(`같은 IP ${PUBLIC_RATE_LIMIT + 1}번째 요청 429 (레이트리밋 유지)`, async () => {
    let last = 0
    for (let i = 0; i < PUBLIC_RATE_LIMIT + 1; i++) last = (await POST(makeReq(VALID, '8.8.8.8'))).status
    expect(last).toBe(429)
  })
  // 한 학급이 컴퓨터실에서 일제히 시작하면 학교 NAT IP 하나로 아이 수만큼의 세션 생성이
  // 몰린다. 구 상한 20은 21번째 아이의 검사를 막았다(사용자 보고 2026-08-15).
  // 40대 규모 컴퓨터실 + 재시도를 감당하는지 성질로 고정한다.
  it('[REGRESSION] 한 학급 40명이 한 IP에서 연달아 시작해도 막히지 않는다', async () => {
    for (let i = 0; i < 40; i++) {
      const res = await POST(makeReq(VALID, '10.0.0.1'))
      expect(res.status, `${i + 1}번째 아동에서 막힘`).not.toBe(429)
    }
  })
})

describe('POST /api/sessions — 명단 모드(fromRoster)', () => {
  it('fromRoster:true → 200, createSession이 명단 값을 받는다', async () => {
    const res = await POST(makeReq(FROM_ROSTER))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith({
      classCode: CODE_ROW, childNo: 7,
      birthYmd: '190202', gender: '남', childName: '박지민',
    })
  })
  it('[REGRESSION] 클라이언트가 다른 name·gender·birthYmd를 함께 보내도 명단 값이 이긴다', async () => {
    const res = await POST(makeReq({
      ...FROM_ROSTER, name: '위조', gender: '여', birthYmd: '000101',
    }))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith({
      classCode: CODE_ROW, childNo: 7,
      birthYmd: '190202', gender: '남', childName: '박지민',
    })
  })
  it('명단에 없는 번호 400, createSession 호출 안 됨', async () => {
    const res = await POST(makeReq({ ...FROM_ROSTER, childNo: 99 }))
    expect(res.status).toBe(400)
    expect(db.createSession).not.toHaveBeenCalled()
  })
  it('[REGRESSION] pending 코드는 명단 모드도 미존재와 같은 404', async () => {
    vi.mocked(db.findClassCode).mockResolvedValue(PENDING_CODE_ROW)
    const res = await POST(makeReq(FROM_ROSTER))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('코드를 확인해 주세요.')
    expect(db.createSession).not.toHaveBeenCalled()
  })
  it('[REGRESSION] pending 코드는 직접 입력 모드도 같은 404 문구', async () => {
    vi.mocked(db.findClassCode).mockResolvedValue(PENDING_CODE_ROW)
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('코드를 확인해 주세요.')
    expect(db.createSession).not.toHaveBeenCalled()
  })
  it('[REGRESSION] 직접 입력 모드(기존 payload)는 그대로 동작한다', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith({
      classCode: CODE_ROW, childNo: 7,
      birthYmd: '190101', gender: '남', childName: '김도연',
    })
    expect(db.listRoster).not.toHaveBeenCalled()
  })
  it('명단 모드에서는 listRoster가 호출되고, 직접 입력 모드에서는 호출되지 않는다', async () => {
    await POST(makeReq(FROM_ROSTER))
    expect(db.listRoster).toHaveBeenCalledWith(CODE_ROW.id)
    vi.clearAllMocks()
    vi.mocked(db.createSession).mockResolvedValue('sess-1')
    vi.mocked(db.findClassCode).mockResolvedValue(CODE_ROW)
    vi.mocked(db.listRoster).mockResolvedValue(ROSTER)
    await POST(makeReq(VALID))
    expect(db.listRoster).not.toHaveBeenCalled()
  })
})
