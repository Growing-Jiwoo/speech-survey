import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  createSession: vi.fn().mockResolvedValue('sess-1'),
  checkRateLimit: vi.fn().mockResolvedValue(true),
}))

import { POST } from '@/app/api/sessions/route'
import * as db from '@/lib/db'

const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
  name: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
}

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/sessions', () => {
  it('유효한 참여자 정보로 세션 생성', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sessionId: 'sess-1' })
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
  it('레이트리밋 초과 시 429, 세션 생성 안 함', async () => {
    vi.mocked(db.checkRateLimit).mockResolvedValueOnce(false)
    expect((await POST(makeReq(VALID))).status).toBe(429)
    expect(db.createSession).not.toHaveBeenCalled()
  })
})
