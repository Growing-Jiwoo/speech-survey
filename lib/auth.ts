const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

/** 토큰 형식: `${만료ms}.${HMAC(만료ms)}` */
export async function createToken(secret: string, ttlMs = 12 * 3600_000): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  return `${exp}.${await hmacHex(exp, secret)}`
}

/** 타이밍 사이드채널 방지용 비교 — 길이가 다르면 즉시 false, 같으면 조기 종료 없이 전체 비교. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const [exp, sig] = token.split('.')
  if (!exp || !sig) return false
  if (Number(exp) < Date.now()) return false
  return timingSafeEqualStr(await hmacHex(exp, secret), sig)
}

export const ADMIN_COOKIE = 'admin_token'
