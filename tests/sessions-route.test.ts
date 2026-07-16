import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ createSession: vi.fn().mockResolvedValue('sess-1') }))
vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))

import { POST } from '@/app/api/sessions/route'
import * as db from '@/lib/db'

const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
  name: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
  guardianConsent: true, // 법정대리인 서면 동의 확인(필수 — 제22조의2)
}

function makeReq(body: unknown, ip?: string, extraHeaders: Record<string, string> = {}) {
  return new Request('http://x/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ip ? { 'x-forwarded-for': ip } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/sessions', () => {
  it('유효한 참여자 정보로 세션 생성 + 토큰 반환', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessionId).toBe('sess-1')
    expect(typeof json.sessionToken).toBe('string')
    expect(json.sessionToken.length).toBeGreaterThan(0)
    expect(db.createSession).toHaveBeenCalledWith({
      schoolRegion: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
      birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
      childName: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
    })
  })
  it('이름 연속 공백은 서버가 정규화', async () => {
    await POST(makeReq({ ...VALID, name: '  Mary   Jane ' }))
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({ childName: 'Mary Jane' }))
  })
  it('[제22조의2] 법정대리인 동의 미확인(false/누락)이면 400 — 세션 생성 불가', async () => {
    expect((await POST(makeReq({ ...VALID, guardianConsent: false }))).status).toBe(400)
    const { guardianConsent: _omitted, ...withoutConsent } = VALID
    expect((await POST(makeReq(withoutConsent))).status).toBe(400)
    expect(db.createSession).not.toHaveBeenCalled()
  })
  it('미등록 지역 400', async () =>
    expect((await POST(makeReq({ ...VALID, region: '화성교육청' }))).status).toBe(400))
  it('학교 누락 400', async () => {
    expect((await POST(makeReq({ ...VALID, schoolId: '' }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, schoolName: '' }))).status).toBe(400)
  })
  it('생년월일 형식 오류 400', async () =>
    expect((await POST(makeReq({ ...VALID, birthYmd: '191301' }))).status).toBe(400))
  it('학년·반 범위 밖 400', async () => {
    expect((await POST(makeReq({ ...VALID, grade: 7 }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, classNo: 0 }))).status).toBe(400)
  })
  it('성별·연락처 형식 오류 400', async () => {
    expect((await POST(makeReq({ ...VALID, gender: 'M' }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, teacherContact: '1234' }))).status).toBe(400)
  })
  it('담임교사명 특수문자 400', async () =>
    expect((await POST(makeReq({ ...VALID, teacherName: '박선생1' }))).status).toBe(400))
  it('본문 없음 400', async () =>
    expect((await POST(new Request('http://x', { method: 'POST', body: 'not json' }))).status).toBe(400))
  it('DB 오류는 원문 노출 없이 502로 은닉', async () => {
    vi.mocked(db.createSession).mockRejectedValueOnce(new Error('connection refused: super-secret-internal-detail'))
    const res = await POST(makeReq(VALID, '198.51.100.9'))
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBeTruthy()
    expect(json.error).not.toMatch(/connection refused|super-secret-internal-detail/)
    expect(json.sessionToken).toBeUndefined()
  })
  it('동일 IP 과다 요청 시 429', async () => {
    let last = 200
    for (let i = 0; i < 21; i++) last = (await POST(makeReq(VALID, '203.0.113.7'))).status
    expect(last).toBe(429)
  })
  it('x-forwarded-for 마지막 IP를 레이트리밋 키로 사용 (클라이언트가 조작 가능한 앞쪽 항목은 무시)', async () => {
    // 앞쪽에 서로 다른 위조 IP를 채워 넣어도, 실제 키는 항상 마지막 값(203.0.113.201)으로 수렴 → 결국 차단.
    let last = 200
    for (let i = 0; i < 21; i++)
      last = (await POST(makeReq(VALID, `198.51.100.${i}, 203.0.113.201`))).status
    expect(last).toBe(429)
  })
  it('x-real-ip 헤더가 있으면 x-forwarded-for보다 우선', async () => {
    let last = 200
    for (let i = 0; i < 21; i++)
      last = (await POST(makeReq(VALID, '198.51.100.50', { 'x-real-ip': '203.0.113.202' }))).status
    expect(last).toBe(429)
    // 같은 x-real-ip를 계속 쓰지만 x-forwarded-for는 매번 다르게 줘도 여전히 차단되어야
    // x-real-ip가 실제로 우선 적용되고 있음을 확인할 수 있다.
    const res = await POST(makeReq(VALID, '9.9.9.9', { 'x-real-ip': '203.0.113.202' }))
    expect(res.status).toBe(429)
  })
})
