import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  sessionDetail: vi.fn(),
  signedAudioUrl: vi.fn(),
  deleteSession: vi.fn().mockResolvedValue(undefined),
}))

import { GET as LIST } from '@/app/api/admin/sessions/route'
import { GET as DETAIL, DELETE } from '@/app/api/admin/sessions/[id]/route'
import { GET as SHEET } from '@/app/api/admin/sessions/[id]/sheet.pdf/route'
import { POST as LOGOUT } from '@/app/api/admin/logout/route'
import * as db from '@/lib/db'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const SID = '11111111-1111-4111-8111-111111111111'
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method = 'GET') => new Request('http://x/api/admin/sessions', { method })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.listSessions).mockResolvedValue([])
  vi.mocked(db.sessionDetail).mockResolvedValue({
    session: { id: SID } as never, recordings: [], writing: [], marks: [], sentences: [],
  })
  vi.mocked(db.deleteSession).mockResolvedValue(undefined)
})

describe('GET /api/admin/sessions', () => {
  it('성공 시 200 + { sessions } 형태', async () => {
    vi.mocked(db.listSessions).mockResolvedValueOnce([{ id: SID } as never])
    const res = await LIST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sessions: [{ id: SID }] })
  })
  it('DB 오류 시 500 + 일반화된 메시지 (내부 오류 원문 노출 안 함)', async () => {
    vi.mocked(db.listSessions).mockRejectedValueOnce(new Error('relation "sessions" does not exist'))
    const res = await LIST()
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/relation/)
  })
})

describe('GET /api/admin/sessions/[id]', () => {
  it('성공: 녹음마다 서명 URL을 만들어 내려주고, 스토리지 내부 경로(audio_path)는 노출하지 않는다', async () => {
    vi.mocked(db.sessionDetail).mockResolvedValueOnce({
      session: { id: SID } as never,
      recordings: [
        { item_code: 'rw01', attempt_no: 1, audio_path: `${SID}/rw01_1.webm`, duration_sec: 3.2, created_at: 'z' },
        { item_code: 'rw02', attempt_no: 2, audio_path: `${SID}/rw02_2.webm`, duration_sec: null, created_at: 'z' },
      ],
      writing: [{ item_code: 'ww01', can_write: true }],
      marks: [{ item_code: 'rw01', correct: true }], sentences: [{ item_code: 'rs01', words: 7 }],
    })
    vi.mocked(db.signedAudioUrl).mockImplementation(async p => `https://signed/${p}`)

    const res = await DETAIL(req(), ctx(SID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(db.signedAudioUrl).toHaveBeenCalledTimes(2)
    expect(body.recordings).toEqual([
      { item_code: 'rw01', attempt_no: 1, url: `https://signed/${SID}/rw01_1.webm`, duration_sec: 3.2 },
      { item_code: 'rw02', attempt_no: 2, url: `https://signed/${SID}/rw02_2.webm`, duration_sec: null },
    ])
    expect(JSON.stringify(body.recordings)).not.toContain('audio_path')
    expect(body.writing).toEqual([{ item_code: 'ww01', can_write: true }])
    expect(body.marks).toEqual([{ item_code: 'rw01', correct: true }])
    expect(body.sentences).toEqual([{ item_code: 'rs01', words: 7 }])
  })
  it('UUID가 아닌 id 400 (DB 오류 경로 진입 차단)', async () => {
    const res = await DETAIL(req(), ctx('not-a-uuid'))
    expect(res.status).toBe(400)
    expect(db.sessionDetail).not.toHaveBeenCalled()
  })
  it('DB 오류 시 500 + 일반화된 메시지', async () => {
    vi.mocked(db.sessionDetail).mockRejectedValueOnce(new Error('JSON object requested, multiple rows'))
    const res = await DETAIL(req(), ctx(SID))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/JSON object/)
  })
})

describe('DELETE /api/admin/sessions/[id]', () => {
  it('세션·녹음 삭제 후 200', async () => {
    const res = await DELETE(req('DELETE'), ctx(SID))
    expect(res.status).toBe(200)
    expect(db.deleteSession).toHaveBeenCalledWith(SID)
  })
  it('UUID가 아닌 id 400', async () => {
    const res = await DELETE(req('DELETE'), ctx('../etc'))
    expect(res.status).toBe(400)
    expect(db.deleteSession).not.toHaveBeenCalled()
  })
  it('DB 오류 시 500 + 일반화된 메시지', async () => {
    vi.mocked(db.deleteSession).mockRejectedValueOnce(new Error('storage internal path leak'))
    const res = await DELETE(req('DELETE'), ctx(SID))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/storage internal/)
  })
})

describe('GET /api/admin/sessions/[id]/sheet.pdf', () => {
  const detail = (started_at: string, submitted_at: string | null = null) => ({
    session: {
      id: SID, school_name: '경기초등학교', grade: 1, class_no: 3, child_name: '홍길동',
      birth_ymd: '170310', started_at, submitted_at,
      checklist: [],
    } as never,
    recordings: [], writing: [{ item_code: 'ww01', can_write: true }],
    marks: [{ item_code: 'rw01', correct: true }], sentences: [{ item_code: 'rs01', words: 7 }],
  })

  it('PDF를 첨부 파일로 내려준다', async () => {
    vi.mocked(db.sessionDetail).mockResolvedValueOnce(detail('2026-08-07T06:25:08.000Z'))
    const res = await SHEET(req(), ctx(SID))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/attachment/)
    const buf = await res.arrayBuffer()
    // PDF 매직 넘버
    expect(new TextDecoder().decode(buf.slice(0, 4))).toBe('%PDF')
  })
  it('파일명 날짜는 KST 기준 — UTC로 계산하면 아침 검사가 하루 전으로 찍힌다', async () => {
    vi.mocked(db.sessionDetail).mockResolvedValueOnce(detail('2026-08-06T23:00:00.000Z'))
    const res = await SHEET(req(), ctx(SID))
    expect(res.headers.get('content-disposition')).toContain('2026-08-07')
    expect(res.headers.get('content-disposition')).not.toContain('2026-08-06')
  })
  // 항목 8·9 — 녹음이 없는 과제를 채점자가 손으로 X 찍어 저장하기 전까지 검사지 점수 칸이
  // 통째로 비어 나갔다. 라우트가 화면과 같은 기본값(withUnrecordedDefaults)을 적용한다.
  it('미녹음 페이지는 오반응(X·0점)으로 채워 찍는다 — 녹음이 다 있는 세션과 출력이 다르다', async () => {
    const d = detail('2026-08-07T06:25:08.000Z', '2026-08-07T07:00:00.000Z')
    vi.mocked(db.sessionDetail).mockResolvedValueOnce(d)
    const filled = await (await SHEET(req(), ctx(SID))).arrayBuffer()

    const allPages = itemsFor(formForGrade(1)).recordingPages.map(p => ({
      item_code: p.code, attempt_no: 1, audio_path: `${SID}/${p.code}_1.webm`,
      duration_sec: 3, created_at: 'z',
    }))
    vi.mocked(db.sessionDetail).mockResolvedValueOnce({ ...d, recordings: allPages })
    const bare = await (await SHEET(req(), ctx(SID))).arrayBuffer()

    expect(filled.byteLength).toBeGreaterThan(bare.byteLength)
  })

  it('진행 중(미제출) 세션에는 기본값을 넣지 않는다 — 아직 안 한 것은 오반응이 아니다', async () => {
    vi.mocked(db.sessionDetail).mockResolvedValueOnce(detail('2026-08-07T06:25:08.000Z'))
    const inProgress = await (await SHEET(req(), ctx(SID))).arrayBuffer()
    vi.mocked(db.sessionDetail)
      .mockResolvedValueOnce(detail('2026-08-07T06:25:08.000Z', '2026-08-07T07:00:00.000Z'))
    const done = await (await SHEET(req(), ctx(SID))).arrayBuffer()
    expect(inProgress.byteLength).toBeLessThan(done.byteLength)
  })
  it('UUID가 아닌 id 400', async () => {
    const res = await SHEET(req(), ctx('not-a-uuid'))
    expect(res.status).toBe(400)
    expect(db.sessionDetail).not.toHaveBeenCalled()
  })
  it('DB 오류 시 500 + 일반화된 메시지', async () => {
    vi.mocked(db.sessionDetail).mockRejectedValueOnce(new Error('relation does not exist'))
    const res = await SHEET(req(), ctx(SID))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/relation/)
  })
})

describe('POST /api/admin/logout', () => {
  it('쿠키 즉시 만료로 세션 종료', async () => {
    const res = await LOGOUT()
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/admin_token=/)
    expect(cookie).toMatch(/Max-Age=0/i)
  })
})
