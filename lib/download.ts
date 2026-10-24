// lib/download.ts — 응답을 파일로 내려받기(관리자 결과보고서 PDF). 교사 결과지(components/results/ResultsView download())와
// 같은 방식이다: fetch로 받아 `res.ok`를 보고, 성공이면 blob을 파일로 저장한다(파일명은 Content-Disposition).
//
// 왜(2026-10-12 점검 X6): 관리자 결과지의 [결과보고서 PDF 다운로드]가 `<a download>`, 관문 창의 [그래도 다운로드]가
// `window.location.href`였다. 로그인이 끝난 상태에서 전자는 아무 안내 없이 실패했고, 후자는 화면이 JSON 원문
// `{"error":"로그인이 끝났어요…"}`으로 바뀌었다(브라우저가 오류 응답을 문서로 연다).

import { NETWORK_ERR_MSG } from './http'

/** Content-Disposition의 `filename*=UTF-8''…`(RFC 5987) → 파일 이름. 없거나 깨졌으면 fallback. */
export function dispositionFilename(cd: string | null, fallback: string): string {
  const raw = cd?.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (!raw) return fallback
  try { return decodeURIComponent(raw.trim()) } catch { return fallback }
}

export type FileResult =
  | { ok: true; blob: Blob; name: string }
  | { ok: false; status: number; error: string }

/** GET → 파일. 던지지 않는다 — 실패면 서버 문구(없으면 fallbackError), 연결 끊김은 status 0. */
export async function fetchFile(url: string, fallbackName: string, fallbackError: string): Promise<FileResult> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, status: res.status, error: j.error ?? fallbackError }
    }
    return { ok: true, blob: await res.blob(), name: dispositionFilename(res.headers.get('content-disposition'), fallbackName) }
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERR_MSG }
  }
}

/** PDF 여러 개를 받은 순서대로 한 파일로 잇는다. pdf-lib는 이 함수를 부를 때만 불러온다(화면 첫 로딩에 싣지 않으려고). */
export async function mergePdfs(parts: ArrayBuffer[]): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  const merged = await PDFDocument.create()
  for (const bytes of parts) {
    const one = await PDFDocument.load(bytes)
    for (const p of await merged.copyPages(one, one.getPageIndices())) merged.addPage(p)
  }
  return merged.save()
}

/**
 * 반별 PDF를 하나씩 차례로 받아 한 파일로 합친다. 관리자의 「학교 전체」 받기가 쓴다(담당자 요청 2026-10-24).
 * 서버가 학교 전체를 한 응답으로 만들면 응답 상한(4.5MB)에 걸리므로 브라우저에서 합친다(lib/pdf/class-sheets 주석).
 * 받을 결과지가 없는 반(400)은 건너뛰고 이름을 `skipped`에 남긴다. 그 밖의 실패(로그인 만료·연결 끊김·서버 오류)에서는
 * 바로 멈춘다. 일부 반만 든 파일을 학교 전체로 알고 쓰는 일이 없게 하려는 것이다. 결과지 생성은 서버 CPU 일이라 동시에
 * 보내도 빨라지지 않으므로 한 번에 한 반씩 받는다.
 */
export async function fetchMergedPdf(
  parts: { url: string; label: string }[], fallbackError: string, onProgress?: (done: number) => void,
): Promise<{ ok: true; blob: Blob; skipped: string[] } | { ok: false; status: number; error: string }> {
  const got: ArrayBuffer[] = []
  const skipped: string[] = []
  for (const [i, p] of parts.entries()) {
    const res = await fetchFile(p.url, 'part.pdf', fallbackError)
    if (res.ok) got.push(await res.blob.arrayBuffer())
    else if (res.status === 400) skipped.push(p.label)
    // 로그인 만료·연결 끊김은 반과 상관없는 문구라 반 이름을 붙이지 않는다
    else return { ok: false, status: res.status, error: res.status === 0 || res.status === 401 ? res.error : `${p.label}: ${res.error}` }
    onProgress?.(i + 1)
  }
  if (got.length === 0) return { ok: false, status: 400, error: '내려받을 수 있는 결과지가 없어요. 채점이 끝나면 다시 시도해 주세요.' }
  return { ok: true, blob: new Blob([(await mergePdfs(got)) as BlobPart], { type: 'application/pdf' }), skipped }
}

/** 받은 파일을 저장한다(**브라우저 전용**). 문서에 붙였다 떼고 URL은 잠시 뒤에 푼다 — click 직후 바로 풀면 Safari 등에서
 *  다운로드가 시작되기 전에 주소가 사라져 조용히 받지 못한다(교사 결과지와 같은 처리). */
export function saveBlobAs(blob: Blob, name: string): void {
  const a = document.createElement('a')
  // 형식을 「일반 파일」로 넘긴다 — 아이패드 Safari는 PDF를 받지 않고 새 탭에 열어, 탭 이름이 임시 주소가 되고 공유로 저장하면
  // 붙여 둔 파일 이름(03_이름_날짜.pdf)이 사라졌다(iPad 시뮬레이터, 2026-10-21 태블릿 점검). 일반 파일이면 이름 그대로 받는다
  a.href = URL.createObjectURL(new Blob([blob], { type: 'application/octet-stream' })); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
