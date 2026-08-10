import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))
vi.mock('@/lib/db', () => ({
  submitSession: vi.fn().mockResolvedValue('ok'),
  sessionState: vi.fn().mockResolvedValue({ state: 'open', grade: 1 }),
}))

import { POST } from '@/app/api/sessions/submit/route'
import * as db from '@/lib/db'
import { createSessionToken } from '@/lib/auth'

const SID = 'sess-1'
let TOKEN = ''
const VALID = () => ({ sessionId: SID, sessionToken: TOKEN, writing: { ww01: 1, ww02: 0 }, checklist: ['none'] })

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

/** submitSession이 받은 인자(옵션 객체) */
const submitArg = () => vi.mocked(db.submitSession).mock.calls[0][0]

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(db.submitSession).mockResolvedValue('ok')
  vi.mocked(db.sessionState).mockResolvedValue({ state: 'open', grade: 1 })
  TOKEN = await createSessionToken(SID, 'test-secret')
})

describe('POST /api/sessions/submit', () => {
  it('낱말쓰기 답 + 체크리스트 저장', async () => {
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(200)
    expect(submitArg()).toMatchObject({
      sessionId: SID,
      writing: [{ itemCode: 'ww01', canWrite: true }, { itemCode: 'ww02', canWrite: false }],
      sentenceWriting: [],
      checklist: ['none'],
      marks: [],
      discontinued: false,
    })
  })
  it('답이 하나도 없어도 제출 가능', async () => {
    const res = await POST(makeReq({ sessionId: SID, sessionToken: TOKEN, writing: {}, checklist: [] }))
    expect(res.status).toBe(200)
    expect(submitArg()).toMatchObject({ writing: [], sentenceWriting: [], checklist: [], marks: [] })
  })
  it('존재하지 않는 세션 404 (허위 성공 제거)', async () => {
    vi.mocked(db.sessionState).mockResolvedValue({ state: 'missing', grade: 0 })
    expect((await POST(makeReq(VALID()))).status).toBe(404)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('제출 시점 경합으로 submitSession이 not_found를 돌려줘도 404', async () => {
    vi.mocked(db.submitSession).mockResolvedValue('not_found')
    expect((await POST(makeReq(VALID()))).status).toBe(404)
  })
  it('이미 제출된 세션 재제출 409 (제출 후 변조 차단)', async () => {
    vi.mocked(db.sessionState).mockResolvedValue({ state: 'submitted', grade: 1 })
    expect((await POST(makeReq(VALID()))).status).toBe(409)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('경합으로 submitSession이 already_submitted를 돌려줘도 409', async () => {
    vi.mocked(db.submitSession).mockResolvedValue('already_submitted')
    expect((await POST(makeReq(VALID()))).status).toBe(409)
  })
  it('토큰 없음/위조 401', async () => {
    expect((await POST(makeReq({ ...VALID(), sessionToken: '' }))).status).toBe(401)
    expect((await POST(makeReq({ ...VALID(), sessionToken: `${SID}.deadbeef` }))).status).toBe(401)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('sessionToken이 문자열이 아니면(숫자) 401 (500/미처리 예외 아님)', async () => {
    const res = await POST(makeReq({ ...VALID(), sessionToken: 12345 }))
    expect(res.status).toBe(401)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('DB 오류 시 502 + 일반화된 메시지 (원본 오류 텍스트 노출 안 함)', async () => {
    vi.mocked(db.submitSession).mockRejectedValueOnce(new Error('secret db connection string leaked'))
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/secret db connection string/)
  })
  it('세션 조회 실패도 502로 감싼다', async () => {
    vi.mocked(db.sessionState).mockRejectedValueOnce(new Error('secret connection string'))
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/secret connection string/)
  })
  it('체크리스트 중복 코드는 dedup되어 저장된다', async () => {
    const res = await POST(makeReq({ ...VALID(), checklist: ['speech', 'speech', 'attention'] }))
    expect(res.status).toBe(200)
    expect(submitArg().checklist).toEqual(['speech', 'attention'])
  })
  it('marks에 의미 낱말 코드와 boolean이 오면 저장된다', async () => {
    const res = await POST(makeReq({ ...VALID(), marks: { rw01: true, rw02: false } }))
    expect(res.status).toBe(200)
    expect(submitArg().marks)
      .toEqual([{ itemCode: 'rw01', correct: true }, { itemCode: 'rw02', correct: false }])
  })
  it('marks가 없으면 빈 배열로 저장된다 (구버전 클라이언트 호환)', async () => {
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(200)
    expect(submitArg().marks).toEqual([])
  })
  it('의미 낱말이 아닌 코드는 400 (무의미 낱말·쓰기 문항은 현장 채점 대상이 아님)', async () => {
    expect((await POST(makeReq({ ...VALID(), marks: { rw08: true } }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID(), marks: { ww01: true } }))).status).toBe(400)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('marks 값이 boolean이 아니면 400', async () => {
    expect((await POST(makeReq({ ...VALID(), marks: { rw01: 'yes' } }))).status).toBe(400)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('marks가 배열이면 400 (객체만 허용)', async () => {
    expect((await POST(makeReq({ ...VALID(), marks: [['rw01', true]] }))).status).toBe(400)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('writing이 배열이면 400 (객체만 허용)', async () =>
    expect((await POST(makeReq({ ...VALID(), writing: [['ww01', 1]] }))).status).toBe(400))
  it('체크리스트 비문자열 원소 400', async () =>
    expect((await POST(makeReq({ ...VALID(), checklist: [1] }))).status).toBe(400))
  it('sessionId 비문자열 400', async () =>
    expect((await POST(makeReq({ ...VALID(), sessionId: 123 }))).status).toBe(400))
  it('미지 쓰기 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID(), writing: { rw01: 1 } }))).status).toBe(400))
  it('숫자 아닌 답 400', async () =>
    expect((await POST(makeReq({ ...VALID(), writing: { ww01: '예' } }))).status).toBe(400))
  it('낱말 쓰기 문항 만점(1)을 넘는 값은 400', async () =>
    expect((await POST(makeReq({ ...VALID(), writing: { ww01: 2 } }))).status).toBe(400))
  it('미지 체크리스트 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID(), checklist: ['unknown'] }))).status).toBe(400))
  it('sessionId 누락 400', async () =>
    expect((await POST(makeReq({ ...VALID(), sessionId: '' }))).status).toBe(400))
  it('본문 없음 400', async () =>
    expect((await POST(new Request('http://x', { method: 'POST', body: 'x' }))).status).toBe(400))
})

describe('유효한 문항 코드는 세션의 학년(검사지)이 정한다', () => {
  const g2Req = (writing: Record<string, unknown>) =>
    makeReq({ sessionId: SID, sessionToken: TOKEN, writing, checklist: ['none'] })

  beforeEach(() => {
    vi.mocked(db.sessionState).mockResolvedValue({ state: 'open', grade: 2 })
  })

  it('G2 세션의 문장 쓰기 점수는 sentence_scores 쪽으로 간다', async () => {
    const res = await POST(g2Req({ sw01: 2, sw02: 0 }))
    expect(res.status).toBe(200)
    expect(submitArg()).toMatchObject({
      writing: [],
      sentenceWriting: [{ itemCode: 'sw01', words: 2 }, { itemCode: 'sw02', words: 0 }],
    })
  })

  it('G2 세션에 G1 문항 코드(ww01)를 보내면 400 — 다른 학년 문항이 섞여 저장되지 않는다', async () => {
    expect((await POST(g2Req({ ww01: 1 }))).status).toBe(400)
    expect(db.submitSession).not.toHaveBeenCalled()
  })

  it('문장 쓰기 만점(2어절)을 넘는 값은 400', async () => {
    expect((await POST(g2Req({ sw01: 3 }))).status).toBe(400)
  })

  it('G1 세션에 G2 문항 코드(sw01)를 보내면 400', async () => {
    vi.mocked(db.sessionState).mockResolvedValue({ state: 'open', grade: 1 })
    expect((await POST(g2Req({ sw01: 2 }))).status).toBe(400)
  })
})

describe('중단 규칙 ① 판정을 제출 시점에 굳힌다', () => {
  it('의미 낱말 첫 3개 연속 오반응이면 중단으로 기록된다', async () => {
    const res = await POST(makeReq({ ...VALID(), marks: { rw01: false, rw02: false, rw03: false } }))
    expect(res.status).toBe(200)
    expect(submitArg().discontinued).toBe(true)
  })
  it('첫 3개 중 하나라도 정반응이면 중단이 아니다', async () => {
    const res = await POST(makeReq({ ...VALID(), marks: { rw01: false, rw02: true, rw03: false } }))
    expect(res.status).toBe(200)
    expect(submitArg().discontinued).toBe(false)
  })
  it('현장 채점이 없으면 중단이 아니다 (미채점을 오반응으로 보지 않는다)', async () => {
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(200)
    expect(submitArg().discontinued).toBe(false)
  })
})
