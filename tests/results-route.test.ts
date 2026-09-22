import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  findClassCode: vi.fn(),
  findClassCodeById: vi.fn(),
  classResults: vi.fn(),
  listRoster: vi.fn(),
}))
vi.mock('@/lib/mail', () => ({
  resultsLinkMail: vi.fn((v: { resultsUrl: string }) => ({ to: '', subject: '결과지', html: `<a href="${v.resultsUrl}">x</a>` })),
  sendMail: vi.fn(),
}))
vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))

import { POST as REQUEST } from '@/app/api/results/request/route'
import * as db from '@/lib/db'
import * as mail from '@/lib/mail'

const CID = '755316e7-fe7c-43f9-a5c5-5c2d39da59d7'
const CODE_ROW = {
  id: CID, code: 'TEST24',
  school_region: 'daegu', school_id: 'B000002944', school_name: '대구가창초등학교',
  grade: 1, class_no: 2, teacher_name: '김서연',
  teacher_phone: null, teacher_email: 'kim@school.kr',
  created_at: '2026-09-21T00:00:00.000Z', status: 'active' as const, applied_at: null,
}

let ipSeq = 0
const reqFor = (body: unknown, ip = `10.9.0.${++ipSeq}`) => new Request('http://x/api/results/request', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.findClassCode).mockResolvedValue(CODE_ROW)
  vi.mocked(db.classResults).mockResolvedValue([])
  vi.mocked(db.listRoster).mockResolvedValue([])
  vi.mocked(mail.sendMail).mockResolvedValue({ ok: true, id: 'mail-1' })
})

describe('POST /api/results/request', () => {
  // 코드당 쿨다운은 모듈 상태라 테스트마다 다른 코드를 쓴다.
  // CODE_ALPHABET(lib/schema.ts)이 0·1·I·L·O를 뺀 집합이라 2~9만으로 만들어야 서로도, 형식 검증과도 부딪히지 않는다.
  const codeOf = (n: number) => `RQ${2222 + n}`
  let n = 0
  const fresh = () => {
    const code = codeOf(++n)
    vi.mocked(db.findClassCode).mockResolvedValue({ ...CODE_ROW, code })
    return code
  }

  it('등록된 이메일로 링크를 보내고 가린 주소·채점 수를 돌려준다', async () => {
    const res = await REQUEST(reqFor({ code: fresh() }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ sent: true, maskedEmail: 'k***@sch***.kr', scoredCount: 0 })
    expect(mail.sendMail).toHaveBeenCalledTimes(1)
    const call = vi.mocked(mail.sendMail).mock.calls[0][0]
    expect(call.to).toBe('kim@school.kr')
    // 링크는 /results/<classCodeId>.<exp>.<sig> — 주체가 코드 id다
    const url = vi.mocked(mail.resultsLinkMail).mock.calls[0][0].resultsUrl
    expect(url).toMatch(new RegExp(`^http://x/results/${CID}\\.\\d+\\.[0-9a-f]{64}$`))
  })
  it('[REGRESSION] 바디의 이메일은 무시한다 — 요청자가 주소를 정하면 코드가 곧 열쇠다', async () => {
    await REQUEST(reqFor({ code: fresh(), email: 'attacker@evil.com', teacherEmail: 'attacker@evil.com' }))
    expect(vi.mocked(mail.sendMail).mock.calls[0][0].to).toBe('kim@school.kr')
  })
  it('APP_URL이 있으면 Host 헤더 대신 그 origin을 쓴다', async () => {
    vi.stubEnv('APP_URL', 'https://survey.example.kr')
    await REQUEST(reqFor({ code: fresh() }))
    expect(vi.mocked(mail.resultsLinkMail).mock.calls[0][0].resultsUrl).toMatch(/^https:\/\/survey\.example\.kr\/results\//)
    vi.unstubAllEnvs()
  })
  it('코드가 없거나 pending이면 404 — 같은 문구(승인 여부를 새지 않게)', async () => {
    vi.mocked(db.findClassCode).mockResolvedValueOnce(null)
    // 'O'는 CODE_ALPHABET(lib/schema.ts)에 없다(0과 혼동 방지로 제외) — 형식 검증을 통과해야 하는
    // 자리라 'NADA22'를 쓴다.
    const a = await REQUEST(reqFor({ code: 'NADA22' }))
    vi.mocked(db.findClassCode).mockResolvedValueOnce({ ...CODE_ROW, status: 'pending' })
    const b = await REQUEST(reqFor({ code: 'PEND22' }))
    expect(a.status).toBe(404); expect(b.status).toBe(404)
    expect((await a.json()).error).toBe((await b.json()).error)
    expect(mail.sendMail).not.toHaveBeenCalled()
  })
  it('형식 밖 코드는 400', async () => {
    expect((await REQUEST(reqFor({ code: 'x' }))).status).toBe(400)
  })
  it('[REGRESSION] 같은 코드 60초 안 재요청은 429 + 남은 초 — IP가 달라도 막힌다(학교=IP 하나, 막을 것은 코드 연타)', async () => {
    const code = fresh()
    expect((await REQUEST(reqFor({ code }, '10.9.1.1'))).status).toBe(200)
    const res = await REQUEST(reqFor({ code }, '10.9.1.2'))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.retryAfterSec).toBeGreaterThan(0)
    expect(json.retryAfterSec).toBeLessThanOrEqual(60)
    expect(mail.sendMail).toHaveBeenCalledTimes(1)
  })
  it('teacher_email이 null이면 400 — 정상 흐름 미도달 방어선(발급 이메일 필수화)', async () => {
    vi.mocked(db.findClassCode).mockResolvedValueOnce({ ...CODE_ROW, code: fresh(), teacher_email: null })
    const res = await REQUEST(reqFor({ code: 'ANY222' }))
    expect(res.status).toBe(400)
    expect(mail.sendMail).not.toHaveBeenCalled()
  })
  it('메일 발송 실패는 502 — "보냈어요"를 거짓으로 말하지 않는다. 쿨다운도 소비하지 않는다', async () => {
    const code = fresh()
    vi.mocked(mail.sendMail).mockResolvedValueOnce({ ok: false, error: 'resend down' })
    const res = await REQUEST(reqFor({ code }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/resend down/)
    // 실패 뒤 곧바로 다시 누르면 다시 시도할 수 있어야 한다
    vi.mocked(db.findClassCode).mockResolvedValue({ ...CODE_ROW, code })
    expect((await REQUEST(reqFor({ code }))).status).toBe(200)
  })
  it('채점 완료 수를 함께 돌려준다 — 화면이 「아직 채점된 학생이 없어요」를 낼 근거', async () => {
    vi.mocked(db.classResults).mockResolvedValueOnce([{
      id: 's1', child_no: 1, child_name: '가', gender: '여', grade: 1, birth_ymd: '190312', checklist: [],
      started_at: '2026-09-22T01:00:00.000Z', submitted_at: '2026-09-22T01:20:00.000Z',
      recordings: [], reading_marks: [], sentence_scores: [], writing_answers: [],
    }])
    const json = await (await REQUEST(reqFor({ code: fresh() }))).json()
    expect(json.scoredCount).toBe(1)
  })
})
