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
