import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORK_ERR_MSG, fetchJson, postJson, requestJson } from '@/lib/http'

const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { vi.unstubAllGlobals() })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('postJson / requestJson — 던지지 않는 클라이언트 요청 헬퍼', () => {
  it('성공이면 { ok: true, data }', async () => {
    fetchMock.mockResolvedValueOnce(json({ sessionId: 's1' }))
    const r = await postJson<{ sessionId: string }>('/api/sessions', { name: '가' })
    expect(r).toEqual({ ok: true, status: 200, data: { sessionId: 's1' } })
  })

  it('body를 JSON으로 직렬화하고 Content-Type을 설정한다', async () => {
    fetchMock.mockResolvedValueOnce(json({}))
    await postJson('/x', { a: 1 })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"a":1}')
  })

  it('body 없는 호출은 헤더·본문을 보내지 않는다 (로그아웃 등)', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await postJson('/api/admin/logout')
    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBeUndefined()
  })

  it('실패 응답의 { error } 문구를 그대로 전달한다 (서버가 준 사용자용 메시지)', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: '이미 제출된 검사입니다.' }, 409))
    const r = await postJson('/api/sessions/submit', {})
    expect(r).toEqual({ ok: false, status: 409, error: '이미 제출된 검사입니다.' })
  })

  it('실패 응답에 error가 없으면 fallback 문구', async () => {
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }))
    const r = await postJson('/x', {}, '요청 실패 문구')
    expect(r).toEqual({ ok: false, status: 500, error: '요청 실패 문구' })
  })

  it('네트워크 단절이면 status 0 + 공통 네트워크 문구', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const r = await postJson('/x', {})
    expect(r).toEqual({ ok: false, status: 0, error: NETWORK_ERR_MSG })
  })

  it('requestJson은 임의 메서드(DELETE) 지원', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }))
    await requestJson('/api/admin/sessions/abc', { method: 'DELETE' })
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })
})

describe('fetchJson — 실패 시 throw 하는 GET 헬퍼 (react-query queryFn용)', () => {
  it('성공이면 파싱된 JSON 반환', async () => {
    fetchMock.mockResolvedValueOnce(json({ sessions: [] }))
    expect(await fetchJson('/api/admin/sessions')).toEqual({ sessions: [] })
  })
  it('실패면 상태코드를 담아 throw', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    await expect(fetchJson('/x')).rejects.toThrow('401')
  })
})
