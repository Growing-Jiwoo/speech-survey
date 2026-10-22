import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

/** 401을 받고 다시 보내기까지 기다리는 시간(ms) — 운영에서는 0.04~0.07초 뒤의 요청이 이미 200이었다. */
const RETRY_401_MS = 300

/** 같은 요청을 한 번 더 보낼 수 있는 본문인지 — 스트림은 한 번 읽으면 끝이라 다시 보낼 수 없다. */
function replayable(input: RequestInfo | URL, body: BodyInit | null | undefined): boolean {
  if (input instanceof Request && input.body !== null) return false
  return body == null || typeof body === 'string' || body instanceof ArrayBuffer || ArrayBuffer.isView(body)
    || body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams
}

/** 로그에 남길 경로 — 쿼리 문자열(검색 조건)은 남기지 않는다. */
function pathOf(input: RequestInfo | URL): string {
  try { return new URL(input instanceof Request ? input.url : String(input)).pathname } catch { return '?' }
}

/**
 * Supabase가 한동안 쉬었다가 온 첫 요청을 가끔 **401로 거절한다** — 운영 API 로그(2026-10-22 14:44 · 10-23 02:00 KST)에서
 * 관리자 목록의 두 조회 중 먼저 간 것이 401이고, 같은 서버가 같은 키로 0.04~0.07초 뒤 보낸 것은 200이었다(쉬었다 온 첫 요청
 * 22번 중 2번). 우리 요청은 매번 같으니 Supabase 쪽 일시 오류다. supabase-js는 GET의 연결 실패·503·520만 다시 보내고 401은
 * 그대로 돌려주므로, 선생님 화면의 첫 요청이 맞으면 「다시 시도해 주세요」가 뜬다. 그래서 401이면 잠깐 뒤 **한 번만** 다시 보낸다 —
 * 401은 실행 전에 거절된 것이라 쓰기도 두 번 실행되지 않고, 키가 정말 틀렸으면 두 번째도 401이라 설정 오류는 그대로 드러난다.
 */
export function retryOn401(fetchImpl?: typeof fetch, delayMs = RETRY_401_MS): typeof fetch {
  const send: typeof fetch = fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  return async (input, init) => {
    const res = await send(input, init)
    if (res.status !== 401 || !replayable(input, init?.body)) return res
    await res.body?.cancel().catch(() => undefined)
    console.warn('[supabase] 401 — 한 번 다시 보냄', init?.method ?? 'GET', pathOf(input))
    await new Promise(resolve => setTimeout(resolve, delayMs))
    return send(input, init)
  }
}

let client: SupabaseClient | null = null
/** 서버 전용. 클라이언트 컴포넌트에서 import 금지. */
export function sb(): SupabaseClient {
  client ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
    global: { fetch: retryOn401() },
  })
  return client
}
