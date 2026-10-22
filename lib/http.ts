// lib/http.ts — 클라이언트 fetch 공용 헬퍼.
// "요청 → JSON 파싱 → 실패 문구" 보일러플레이트와 네트워크 오류 카피를 한 곳으로 모은다.

export const NETWORK_ERR_MSG = '연결에 문제가 생겼어요. 다시 시도해 주세요.'

/** 요청 한 번의 상한 — 넘으면 연결이 멈춘 것으로 보고 끊는다(네트워크 오류와 같은 결과). 이 상한이 없을 때는 와이파이가
 *  붙어 있되 응답이 오지 않으면 제출 확인 창·검사지 받기 화면이 로딩인 채 멈춰, 새로고침 말고는 빠져나갈 길이 없었다
 *  (2026-10-22 출시 전 점검). 녹음 업로드(lib/upload `UPLOAD_TIMEOUT_MS`)는 파일이 커서 따로 더 길게 둔다.
 *  끊은 요청이 서버에서는 끝났을 수 있다 — 다시 보내도 같은 결과가 되게 이미 만들어져 있다(세션 생성은 멱등 키, 제출은 409). */
export const REQUEST_TIMEOUT_MS = 30_000

export type JsonResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }

/**
 * JSON 요청을 보내고 결과를 던지지 않는 형태로 돌려준다.
 * - 서버가 준 `{ error }` 문구가 있으면 그대로, 없으면 fallbackError, 네트워크 단절·시간 초과(`REQUEST_TIMEOUT_MS`)는 NETWORK_ERR_MSG.
 * - 호출부는 try/catch 없이 `if (!r.ok) setErr(r.error)` 한 줄로 처리할 수 있다.
 */
export async function requestJson<T = unknown>(
  url: string,
  init?: { method?: string; body?: unknown },
  fallbackError = '문제가 생겼어요. 다시 시도해 주세요.',
): Promise<JsonResult<T>> {
  // AbortSignal.timeout이 아니라 타이머로 끊는다 — 본문(res.json())을 받는 동안까지 같은 상한에 넣는다
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'POST',
      signal: ctl.signal,
      ...(init?.body !== undefined
        ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }
        : {}),
    })
    const data = (await res.json().catch(() => ({}))) as T
    // 본문을 받다가 끊겼으면 빈 본문으로 성공 처리하지 않는다(위 catch는 형식이 틀린 본문을 위한 것이다)
    if (ctl.signal.aborted) return { ok: false, status: 0, error: NETWORK_ERR_MSG }
    if (!res.ok)
      return { ok: false, status: res.status, error: (data as { error?: string }).error ?? fallbackError }
    return { ok: true, status: res.status, data }
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERR_MSG }
  } finally {
    clearTimeout(timer)
  }
}

/** POST 축약형 — 이 앱의 클라이언트 변이는 대부분 POST다. */
export function postJson<T = unknown>(url: string, body?: unknown, fallbackError?: string) {
  return requestJson<T>(url, { method: 'POST', body }, fallbackError)
}

/** GET + JSON 파싱. react-query queryFn 등 "실패 시 throw" 관례가 필요한 곳에서 사용. */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  // 서버 문구가 있으면 싣는다(401이면 「로그인이 끝났어요…」 — proxy). 상태 코드는 괄호로 남긴다(호출부가 404를 가른다).
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(`${data.error ?? '요청 실패'} (${res.status})`)
  }
  return res.json() as Promise<T>
}
