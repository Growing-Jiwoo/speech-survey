import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { retryOn401 } from '@/lib/supabase'

const URL_SESSIONS = 'https://example.supabase.co/rest/v1/sessions?select=id&child_name=eq.%EA%B0%80'
const reply = (status: number, body = '{}') =>
  new Response(body, { status, headers: { 'content-type': 'application/json' } })

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('retryOn401 — Supabase의 일시적 401을 한 번 다시 보낸다', () => {
  it('401 다음 200이면 200을 돌려준다 — 같은 주소·같은 init으로 한 번 더', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200, '[{"id":"s1"}]'))
    const init = { method: 'GET', headers: { apikey: 'k' } }
    const res = await retryOn401(f, 0)(URL_SESSIONS, init)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 's1' }])
    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls[1]).toEqual([URL_SESSIONS, init])
  })

  it.each([200, 201, 400, 403, 404, 409, 500, 503])('%i는 다시 보내지 않는다 — 401만', async status => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(reply(status))
    const res = await retryOn401(f, 0)(URL_SESSIONS, { method: 'GET' })
    expect(res.status).toBe(status)
    expect(f).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('두 번째도 401이면 401을 돌려준다(키가 정말 틀린 설정 오류는 그대로 드러남) — 세 번은 보내지 않는다', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => reply(401, '{"message":"Invalid API key"}'))
    const res = await retryOn401(f, 0)(URL_SESSIONS, { method: 'GET' })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ message: 'Invalid API key' })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('쓰기도 같은 본문으로 다시 보낸다 — JSON 문자열(행 넣기)·Buffer(녹음 올리기)', async () => {
    for (const body of ['{"child_no":3}', Buffer.from([1, 2, 3])]) {
      const f = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(201))
      const res = await retryOn401(f, 0)('https://example.supabase.co/storage/v1/object/recordings/a.webm', { method: 'POST', body })
      expect(res.status).toBe(201)
      expect(f).toHaveBeenCalledTimes(2)
      expect(f.mock.calls[1][1]?.body).toBe(body)
    }
  })

  it('스트림 본문은 다시 보낼 수 없어 401을 그대로 돌려준다', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(reply(401))
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close() } })
    const res = await retryOn401(f, 0)('https://example.supabase.co/storage/v1/object/x', { method: 'POST', body })
    expect(res.status).toBe(401)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('다시 보낼 때 경고 한 줄 — 방법과 경로만, 쿼리 문자열(검색 조건)은 남기지 않는다', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200))
    await retryOn401(f, 0)(URL_SESSIONS, { method: 'GET' })
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]).toEqual(['[supabase] 401 — 한 번 다시 보냄', 'GET', '/rest/v1/sessions'])
  })

  it('기다린 뒤에 다시 보낸다', async () => {
    vi.useFakeTimers()
    try {
      const f = vi.fn<typeof fetch>().mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(200))
      const p = retryOn401(f, 300)(URL_SESSIONS, { method: 'GET' })
      await vi.advanceTimersByTimeAsync(299)
      expect(f).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect((await p).status).toBe(200)
      expect(f).toHaveBeenCalledTimes(2)
    } finally { vi.useRealTimers() }
  })
})

describe('sb() — 실제 supabase-js 경로', () => {
  it('[REGRESSION] 쉬었다 온 첫 조회의 401(운영 2026-10-23 02:00) → 다시 보낸 200의 행을 쓴다 · 두 번 다 같은 키', async () => {
    vi.resetModules()
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply(401, '{"message":"Invalid API key"}'))
      .mockResolvedValueOnce(reply(200, '[{"id":"s1"}]'))
    vi.stubGlobal('fetch', f)
    const { sb } = await import('@/lib/supabase')

    const { data, error } = await sb().from('sessions').select('id')

    expect(error).toBeNull()
    expect(data).toEqual([{ id: 's1' }])
    expect(f).toHaveBeenCalledTimes(2)
    const key = (i: number) => new Headers(f.mock.calls[i][1]?.headers).get('apikey')
    expect(key(0)).toBe('test-service-key')
    expect(key(1)).toBe('test-service-key')
    expect(String(f.mock.calls[1][0])).toBe(String(f.mock.calls[0][0]))
  })
})
