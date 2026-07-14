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

/**
 * 관리자 토큰 형식: `${만료ms}.${jti}.${HMAC(만료ms.jti)}`.
 * YAGNI: jti는 유일성 확보용일 뿐, DB 기반 폐기(revocation) 테이블은 두지 않는다.
 * 토큰을 즉시 무효화해야 하면 SESSION_SECRET을 회전한다 — 그 즉시 발급된 모든 토큰의 서명이
 * 무효가 되므로 이것이 이 시스템의 유일한 폐기(revocation) 메커니즘이다.
 */
export async function createToken(secret: string, ttlMs = 8 * 3600_000): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  const jti = randomId()
  return `${exp}.${jti}.${await hmacHex(`${exp}.${jti}`, secret)}`
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [exp, jti, sig] = parts
  if (!exp || !jti || !sig) return false
  if (Number(exp) < Date.now()) return false
  return timingSafeEqualHex(await hmacHex(`${exp}.${jti}`, secret), sig)
}

/** 세션 스코프 토큰 형식: `${sessionId}.${HMAC(sessionId)}`. 후속 업로드/제출에 동봉해 임의 세션 쓰기 차단. */
export async function createSessionToken(sessionId: string, secret: string): Promise<string> {
  return `${sessionId}.${await hmacHex(sessionId, secret)}`
}

export async function verifySessionToken(sessionId: string, token: string, secret: string): Promise<boolean> {
  if (!sessionId || !token) return false
  const idx = token.lastIndexOf('.')
  if (idx < 0) return false
  const sig = token.slice(idx + 1)
  return timingSafeEqualHex(await hmacHex(sessionId, secret), sig)
}

export const ADMIN_COOKIE = 'admin_token'
