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
vi.mock('@/lib/pdf/stamp-sheet', () => ({
  stampSheet: vi.fn(),
}))
vi.mock('pdf-lib', async () => {
  // 실제 병합은 pdf-lib이 하고 여기서는 "세션 수만큼 페이지가 붙었는가"만 본다.
  const pages: unknown[] = []
  const doc = {
    copyPages: vi.fn(async (_src: unknown, idx: number[]) => idx.map(i => ({ i }))),
    addPage: vi.fn((p: unknown) => pages.push(p)),
    getPageIndices: vi.fn(() => [0]),
    save: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, pages.length])),
  }
  return {
    PDFDocument: {
      create: vi.fn(async () => { pages.length = 0; return doc }),
      load: vi.fn(async () => doc),
    },
  }
})

import { POST as REQUEST } from '@/app/api/results/request/route'
import { GET as LIST } from '@/app/api/results/[token]/route'
import { GET as SHEETS } from '@/app/api/results/[token]/sheets.pdf/route'
import { createResultsToken } from '@/lib/auth'
import * as db from '@/lib/db'
import * as mail from '@/lib/mail'
import * as pdf from '@/lib/pdf/stamp-sheet'

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

describe('GET /api/results/[token]', () => {
  const listReq = (token: string) => LIST(new Request(`http://x/api/results/${token}`), { params: Promise.resolve({ token }) })
  const SESSION = {
    id: 's1', child_no: 1, child_name: '김가나', gender: '여', grade: 1, birth_ymd: '190312', checklist: [],
    started_at: '2026-09-22T01:00:00.000Z', submitted_at: '2026-09-22T01:20:00.000Z',
    recordings: [], reading_marks: [], sentence_scores: [], writing_answers: [],
  }
  beforeEach(() => {
    vi.mocked(db.findClassCodeById).mockResolvedValue(CODE_ROW)
    vi.mocked(db.listRoster).mockResolvedValue([
      { child_no: 1, child_name: '김가나', gender: '여', birth_ymd: '190312' },
      { child_no: 2, child_name: '김가나', gender: '남', birth_ymd: '190527' },
    ])
    vi.mocked(db.classResults).mockResolvedValue([SESSION])
  })
  it('유효 토큰 → 학급 머리글·만점·아이별 행. 명단만 있는 아이는 sessions 빈 배열', async () => {
    const res = await listReq(await createResultsToken(CID, 'test-secret'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.cls).toEqual({ schoolName: '대구가창초등학교', grade: 1, classNo: 2, teacherName: '김서연' })
    expect(json.taskMax).toEqual({ wordReading: 14, sentenceReading: 36, writing: 10 })
    expect(typeof json.provisional).toBe('boolean')
    expect(json.children).toHaveLength(2)
    const [tested, untested] = json.children
    expect(tested.childNo).toBe(1)
    expect(tested.sessions[0]).toMatchObject({ id: 's1', attemptNo: 1, status: 'scored',
      scores: { wordReading: 0, sentenceReading: 0, writing: 0 } })
    expect(untested).toMatchObject({ childNo: 2, sessions: [] })
    expect(db.findClassCodeById).toHaveBeenCalledWith(CID)
    expect(db.classResults).toHaveBeenCalledWith(CID)
  })
  it('[REGRESSION] 응답에 생년월일·전화·내부 경로가 실리지 않는다', async () => {
    const text = await (await listReq(await createResultsToken(CID, 'test-secret'))).text()
    expect(text).not.toContain('190312')
    expect(text).not.toContain('birth')
    expect(text).not.toContain('audio_path')
  })
  it('[REGRESSION] 전부 미녹음인 세션은 verdict가 null이고 complete.writing이 false다 — 치르지도 않은 쓰기의 0점으로 아동을 낙제시키지 않는다(A안, 사용자 확정 2026-09-22)', async () => {
    const res = await listReq(await createResultsToken(CID, 'test-secret'))
    const json = await res.json()
    const session = json.children[0].sessions[0]
    expect(session.verdict).toBeNull()
    expect(session.complete.writing).toBe(false)
  })
  it('만료·변조·형식 오류는 전부 401 한 가지', async () => {
    expect((await listReq(await createResultsToken(CID, 'test-secret', -1))).status).toBe(401)
    expect((await listReq('garbage')).status).toBe(401)
    expect((await listReq(await createResultsToken(CID, 'other-secret'))).status).toBe(401)
    expect(db.classResults).not.toHaveBeenCalled()
  })
  it('코드 행이 삭제됐으면 404', async () => {
    vi.mocked(db.findClassCodeById).mockResolvedValueOnce(null)
    expect((await listReq(await createResultsToken(CID, 'test-secret'))).status).toBe(404)
  })
  it('DB 장애는 500 + 내부 문구 비노출', async () => {
    vi.mocked(db.classResults).mockRejectedValueOnce(new Error('relation missing'))
    const res = await listReq(await createResultsToken(CID, 'test-secret'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/relation/)
  })
})

describe('GET /api/results/[token]/sheets.pdf', () => {
  const sheetsReq = (token: string, qs = '') =>
    SHEETS(new Request(`http://x/api/results/${token}/sheets.pdf${qs}`), { params: Promise.resolve({ token }) })
  const scored = (id: string, child_no: number, started_at: string) => ({
    id, child_no, child_name: `아이${child_no}`, gender: '여', grade: 1, birth_ymd: '190312', checklist: ['none'],
    started_at, submitted_at: started_at,
    recordings: [], reading_marks: [], sentence_scores: [], writing_answers: [],
  })
  const ROWS = [
    scored('a1', 1, '2026-09-21T01:00:00.000Z'),
    scored('a2', 1, '2026-09-22T01:00:00.000Z'),   // 1번의 재검사(최신)
    scored('b1', 3, '2026-09-22T02:00:00.000Z'),
    { ...scored('c1', 5, '2026-09-22T03:00:00.000Z'), submitted_at: null },   // 미제출
  ]
  beforeEach(() => {
    vi.mocked(db.findClassCodeById).mockResolvedValue(CODE_ROW)
    vi.mocked(db.classResults).mockResolvedValue(ROWS)
    vi.mocked(pdf.stampSheet).mockResolvedValue(new Uint8Array([1]))
  })
  it('ids 없음 → 채점 완료 전부, 아이당 최신 1장, 번호순. 파일명 「1-2_결과지_전체_날짜.pdf」', async () => {
    const res = await sheetsReq(await createResultsToken(CID, 'test-secret'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(decodeURIComponent(res.headers.get('content-disposition') ?? '')).toMatch(/1-2_결과지_전체_\d{4}-\d{2}-\d{2}\.pdf/)
    // a2(1번 최신)·b1(3번) 두 장 — a1(옛 차수)·c1(미제출)은 빠진다
    const stamped = vi.mocked(pdf.stampSheet).mock.calls.map(c => c[0].session.child_name)
    expect(stamped).toEqual(['아이1', '아이3'])
    expect(vi.mocked(pdf.stampSheet).mock.calls[0][0].session).toMatchObject({ started_at: '2026-09-22T01:00:00.000Z' })
  })
  it('ids로 고르면 그 세션만 — 옛 차수도 고를 수 있다. 여럿이면 「N명」', async () => {
    const res = await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=a1,b1')
    expect(res.status).toBe(200)
    expect(vi.mocked(pdf.stampSheet).mock.calls.map(c => c[0].session.started_at))
      .toEqual(['2026-09-21T01:00:00.000Z', '2026-09-22T02:00:00.000Z'])
    expect(decodeURIComponent(res.headers.get('content-disposition') ?? '')).toContain('1-2_결과지_2명_')
  })
  it('한 장이면 관리자 규약 파일명 + 재검사가 있으면 차수', async () => {
    const res = await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=a1')
    expect(decodeURIComponent(res.headers.get('content-disposition') ?? '')).toContain('01_아이1_1차_2026-09-21.pdf')
  })
  it('[REGRESSION] 다른 학급 세션 id를 끼워 넣으면 403 — 토큰 하나로 다른 반을 열 수 없다', async () => {
    const res = await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=a1,zz-other-class')
    expect(res.status).toBe(403)
    expect(pdf.stampSheet).not.toHaveBeenCalled()
  })
  it('채점 완료가 아닌 세션(미제출)을 고르면 400', async () => {
    expect((await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=c1')).status).toBe(400)
  })
  it('채점 완료 세션이 하나도 없으면 400', async () => {
    vi.mocked(db.classResults).mockResolvedValueOnce([ROWS[3]])
    expect((await sheetsReq(await createResultsToken(CID, 'test-secret'))).status).toBe(400)
  })
  it('토큰 불량 401 · 코드 삭제 404', async () => {
    expect((await sheetsReq('bad')).status).toBe(401)
    vi.mocked(db.findClassCodeById).mockResolvedValueOnce(null)
    expect((await sheetsReq(await createResultsToken(CID, 'test-secret'))).status).toBe(404)
  })
  it('stampSheet 입력은 관리자 PDF와 같다 — 제출된 세션은 미녹음 X·0점이 채워진다', async () => {
    await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=b1')
    const input = vi.mocked(pdf.stampSheet).mock.calls[0][0]
    expect(input.form.id).toBe('KODYS-G1')
    expect(input.marks.rw01).toBe(false)
    expect(input.sentences.rs01).toBe(0)
    expect(input.session).toMatchObject({ school_name: '대구가창초등학교', grade: 1, class_no: 2, child_name: '아이3',
      birth_ymd: '190312', checklist: ['none'] })   // 관리자 PDF와 같은 문서 — 머리글·체크리스트도 찍힌다
  })
})
