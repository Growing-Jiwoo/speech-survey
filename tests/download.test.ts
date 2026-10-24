import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { dispositionFilename, fetchFile, fetchMergedPdf, mergePdfs } from '@/lib/download'
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

describe('mergePdfs · fetchMergedPdf — 관리자 「학교 전체」 받기(담당자 요청 2026-10-24)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  /** 쪽 수와 쪽 너비가 다른 PDF — 너비로 어느 파일의 쪽인지 가린다 */
  const pdf = async (pages: number, width: number) => {
    const d = await PDFDocument.create()
    for (let i = 0; i < pages; i++) d.addPage([width, 100])
    return d.save()
  }
  const widths = async (bytes: Uint8Array | ArrayBuffer) =>
    (await PDFDocument.load(bytes)).getPages().map(p => Math.round(p.getWidth()))
  const pdfRes = async (pages: number, width: number) => new Response((await pdf(pages, width)) as BodyInit, { status: 200 })
  const errRes = (status: number, error: string) => new Response(JSON.stringify({ error }), { status })

  it('받은 순서대로 한 파일로 잇는다', async () => {
    const merged = await mergePdfs([(await pdf(1, 100)).buffer as ArrayBuffer, (await pdf(2, 200)).buffer as ArrayBuffer])
    expect(await widths(merged)).toEqual([100, 200, 200])
  })

  it('결과지가 없는 반(400)은 건너뛰고 이름을 남긴다 · 나머지 반은 순서대로 합친다', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(await pdfRes(1, 100))
      .mockResolvedValueOnce(errRes(400, '내려받을 수 있는 결과지가 없어요.'))
      .mockResolvedValueOnce(await pdfRes(2, 300))
    vi.stubGlobal('fetch', fetch)
    const done: number[] = []
    const r = await fetchMergedPdf([{ url: '/a', label: '1-1' }, { url: '/b', label: '1-2' }, { url: '/c', label: '1-3' }], '못 받음', n => done.push(n))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.skipped).toEqual(['1-2'])
    expect(await widths(await r.blob.arrayBuffer())).toEqual([100, 300, 300])
    expect(done).toEqual([1, 2, 3])
    expect(fetch.mock.calls.map(c => c[0])).toEqual(['/a', '/b', '/c'])
  })

  it('[REGRESSION] 로그인 만료·서버 오류에서는 바로 멈춘다 — 일부 반만 든 파일이 학교 전체로 나가지 않게', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(await pdfRes(1, 100))
      .mockResolvedValueOnce(errRes(401, '로그인이 끝났어요.'))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchMergedPdf([{ url: '/a', label: '1-1' }, { url: '/b', label: '1-2' }, { url: '/c', label: '1-3' }], '못 받음'))
      .toEqual({ ok: false, status: 401, error: '로그인이 끝났어요.' })
    expect(fetch).toHaveBeenCalledTimes(2)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(errRes(500, '결과보고서를 만들지 못했어요.')))
    expect(await fetchMergedPdf([{ url: '/a', label: '1-1' }], '못 받음'))
      .toEqual({ ok: false, status: 500, error: '1-1: 결과보고서를 만들지 못했어요.' })
  })

  it('모든 반에 결과지가 없으면 실패로 알린다(빈 파일을 저장하지 않는다)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => errRes(400, '없음')))
    const r = await fetchMergedPdf([{ url: '/a', label: '1-1' }, { url: '/b', label: '1-2' }], '못 받음')
    expect(r).toMatchObject({ ok: false, status: 400 })
  })
})
