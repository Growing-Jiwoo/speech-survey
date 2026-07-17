import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  sessionDetail: vi.fn(),
  signedAudioUrl: vi.fn(),
  deleteSession: vi.fn().mockResolvedValue(undefined),
}))

import { GET as LIST } from '@/app/api/admin/sessions/route'
import { GET as DETAIL, DELETE } from '@/app/api/admin/sessions/[id]/route'
import { POST as LOGOUT } from '@/app/api/admin/logout/route'
import * as db from '@/lib/db'

const SID = '11111111-1111-4111-8111-111111111111'
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (method = 'GET') => new Request('http://x/api/admin/sessions', { method })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.listSessions).mockResolvedValue([])
  vi.mocked(db.sessionDetail).mockResolvedValue({
    session: { id: SID } as never, recordings: [], writing: [],
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

describe('POST /api/admin/logout', () => {
  it('쿠키 즉시 만료로 세션 종료', async () => {
    const res = await LOGOUT()
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/admin_token=/)
    expect(cookie).toMatch(/Max-Age=0/i)
  })
})
