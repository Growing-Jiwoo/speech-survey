import { afterEach, describe, expect, it, vi } from 'vitest'
import { dispositionFilename, fetchFile } from '@/lib/download'
import { NETWORK_ERR_MSG } from '@/lib/http'

// 관리자 결과보고서 PDF 받기(2026-10-12 점검 X6) — `<a download>`·`window.location.href`는 로그인이 끝났을 때 아무 안내 없이
// 실패하거나 화면이 JSON 원문으로 바뀌었다. fetch로 받아 res.ok를 보고, 실패면 서버 문구를 돌려준다.
describe('dispositionFilename', () => {
  it('RFC 5987 한글 파일명을 푼다(라우트가 filename*=UTF-8\'\'…로 보낸다)', () => {
    const name = '03_홍길동_2차_2026-10-12.pdf'
    expect(dispositionFilename(`attachment; filename="sheet_2026-10-12.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`, 'x.pdf'))
      .toBe(name)
  })
  it('없거나 깨졌으면 대신 이름', () => {
    expect(dispositionFilename(null, 'result.pdf')).toBe('result.pdf')
    expect(dispositionFilename('attachment; filename="a.pdf"', 'result.pdf')).toBe('result.pdf')
    expect(dispositionFilename("attachment; filename*=UTF-8''%E0%A4%A", 'result.pdf')).toBe('result.pdf')
  })
})

describe('fetchFile', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('성공이면 내용과 파일명을 돌려준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('%PDF', {
      status: 200, headers: { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('03_홍길동_2026-10-12.pdf')}` },
    })))
    const r = await fetchFile('/x.pdf', 'result.pdf', '못 받음')
    expect(r.ok && r.name).toBe('03_홍길동_2026-10-12.pdf')
    expect(r.ok && await r.blob.text()).toBe('%PDF')
  })

  it('[REGRESSION] 로그인 만료(401)는 화면을 바꾸지 않고 서버 문구와 상태를 돌려준다 — 화면이 [다시 로그인]을 띄운다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: '로그인이 끝났어요. 새 탭에서 …' }), { status: 401 })))
    expect(await fetchFile('/x.pdf', 'result.pdf', '못 받음')).toEqual({ ok: false, status: 401, error: '로그인이 끝났어요. 새 탭에서 …' })
  })

  it('문구 없는 실패는 대신 문구, 연결 끊김은 status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500 })))
    expect(await fetchFile('/x.pdf', 'result.pdf', '못 받음')).toEqual({ ok: false, status: 500, error: '못 받음' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await fetchFile('/x.pdf', 'result.pdf', '못 받음')).toEqual({ ok: false, status: 0, error: NETWORK_ERR_MSG })
  })
})
