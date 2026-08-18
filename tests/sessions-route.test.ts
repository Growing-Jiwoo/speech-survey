import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  createSession: vi.fn().mockResolvedValue('sess-1'),
  findClassCode: vi.fn(),
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
const VALID = { code: 'K7M2P9', childNo: 7, name: '김도연', gender: '남', birthYmd: '190101', guardianConsent: true }

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
