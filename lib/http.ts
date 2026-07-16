// lib/http.ts — 클라이언트 fetch 공용 헬퍼.
// "요청 → JSON 파싱 → 실패 문구" 보일러플레이트와 네트워크 오류 카피를 한 곳으로 모은다.
'use client'

export const NETWORK_ERR_MSG = '연결에 문제가 생겼어요. 다시 시도해 주세요.'

export type JsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }

/**
 * JSON 요청을 보내고 결과를 던지지 않는 형태로 돌려준다.
 * - 서버가 준 `{ error }` 문구가 있으면 그대로, 없으면 fallbackError, 네트워크 단절은 NETWORK_ERR_MSG.
 * - 호출부는 try/catch 없이 `if (!r.ok) setErr(r.error)` 한 줄로 처리할 수 있다.
 */
export async function requestJson<T = unknown>(
  url: string,
  init?: { method?: string; body?: unknown },
  fallbackError = '문제가 생겼어요. 다시 시도해 주세요.',
): Promise<JsonResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'POST',
      ...(init?.body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
        : {}),
    })
    const data = (await res.json().catch(() => ({}))) as T
    if (!res.ok)
      return { ok: false, status: res.status, error: (data as { error?: string }).error ?? fallbackError }
    return { ok: true, status: res.status, data }
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERR_MSG }
  }
}

/** POST 축약형 — 이 앱의 클라이언트 변이는 대부분 POST다. */
export function postJson<T = unknown>(url: string, body?: unknown, fallbackError?: string) {
  return requestJson<T>(url, { method: 'POST', body }, fallbackError)
}

/** GET + JSON 파싱. react-query queryFn 등 "실패 시 throw" 관례가 필요한 곳에서 사용. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`)
  return res.json() as Promise<T>
}
