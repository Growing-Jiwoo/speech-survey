// lib/auth.ts — HMAC 토큰(관리자 쿠키·세션 스코프) + 상수시간 비교. Web Crypto만 사용(Edge·Node 공용).
const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)))
}

/** 동일 길이 문자열의 상수시간 비교(HMAC-SHA256 hex는 항상 64자 → 길이 노출 없음). Edge 안전(순수 JS, Node의 crypto.timingSafeEqual 불필요). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 랜덤 nonce(16 hex). 관리자 토큰 유일성 확보용. */
function randomId(): string {
  const b = new Uint8Array(8)
  crypto.getRandomValues(b)
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('')
}

/** 관리자 세션 수명(토큰 exp·쿠키 maxAge가 공유하는 단일 소스 — 한쪽만 바뀌어 어긋나는 것 방지). */
export const ADMIN_TTL_MS = 8 * 3600_000

/**
 * 관리자 토큰 형식: `${만료ms}.${jti}.${HMAC(만료ms.jti)}`.
 * YAGNI: jti는 유일성 확보용일 뿐, DB 기반 폐기(revocation) 테이블은 두지 않는다.
 * 토큰을 즉시 무효화해야 하면 SESSION_SECRET을 회전한다 — 그 즉시 발급된 모든 토큰의 서명이
 * 무효가 되므로 이것이 이 시스템의 유일한 폐기(revocation) 메커니즘이다.
 */
export async function createToken(secret: string, ttlMs = ADMIN_TTL_MS): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  const jti = randomId()
  return `${exp}.${jti}.${await hmacHex(`${exp}.${jti}`, secret)}`
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [exp, jti, sig] = parts
  if (!exp || !jti || !sig) return false
  if (!(Number(exp) >= Date.now())) return false // NaN 포함 거부(verifySessionToken과 같은 규칙)
  return timingSafeEqualHex(await hmacHex(`${exp}.${jti}`, secret), sig)
}

/** 세션 스코프 토큰 형식: `${만료ms}.${HMAC(sessionId.만료ms)}`. 후속 업로드/제출에 동봉해 임의 세션 쓰기 차단.
 *  만료(기본 24시간)를 둬 유출된 토큰의 유효 기간을 검사 당일 수준으로 제한한다. */
export async function createSessionToken(sessionId: string, secret: string, ttlMs = 24 * 3600_000): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  return `${exp}.${await hmacHex(`${sessionId}.${exp}`, secret)}`
}

export async function verifySessionToken(sessionId: string, token: string, secret: string): Promise<boolean> {
  if (!sessionId || !token) return false
  const idx = token.indexOf('.')
  if (idx < 0) return false
  const exp = token.slice(0, idx)
  const sig = token.slice(idx + 1)
  if (!(Number(exp) >= Date.now())) return false // NaN 포함 거부
  return timingSafeEqualHex(await hmacHex(`${sessionId}.${exp}`, secret), sig)
}

/** 결과지 링크 토큰의 수명. 채점이 며칠 걸릴 수 있어 7일은 짧다 — 교사가 링크 하나를 북마크해
 *  두고 새로고침만으로 채점 진행을 따라가게 하려면 2주는 필요하다(사용자 확정 2026-09-22). */
export const RESULTS_TTL_MS = 14 * 24 * 3600_000

/** UUID v4 모양 — 주체 자리에 임의 문자열이 오는 것을 형식에서 거른다(서명 검증 전 1차 방어).
 *  lib/request.ts의 `UUID_RE`와 같은 모양이지만 **일부러 따로 둔다** — 이 파일은 proxy(엣지)가
 *  import하므로 Web Crypto 외의 의존성을 들이지 않는다(request.ts는 next/server를 끌고 온다).
 *  한쪽을 조이면 다른 쪽도 함께 볼 것. */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 학급 스코프 토큰 `${classCodeId}.${만료ms}.${HMAC(classCodeId.만료ms)}` — 교사 결과지 링크용.
 * 세션 토큰과 달리 **주체를 토큰 안에 담는다** — URL 하나로 자립해야 메일 링크가 된다.
 * 권한만 담고 데이터는 담지 않으므로, 같은 링크를 새로고침하면 그 시점 DB가 보인다.
 * 폐기 수단은 관리자 토큰과 같다(SESSION_SECRET 회전).
 */
export async function createResultsToken(classCodeId: string, secret: string, ttlMs = RESULTS_TTL_MS): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  return `${classCodeId}.${exp}.${await hmacHex(`${classCodeId}.${exp}`, secret)}`
}

/** 검증 통과 시 classCodeId, 아니면 null. 만료·변조·형식 오류를 구분하지 않는다 — 호출부가
 *  사유를 나눠 보여주면 그 자체가 정보다(verify-code가 pending을 404로 뭉뚱그리는 것과 같은 방침). */
export async function verifyResultsToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [cid, exp, sig] = parts
  if (!UUID_LIKE.test(cid) || !exp || !sig) return null
  if (!(Number(exp) >= Date.now())) return null // NaN 포함 거부
  return timingSafeEqualHex(await hmacHex(`${cid}.${exp}`, secret), sig) ? cid : null
}

export const ADMIN_COOKIE = 'admin_token'
