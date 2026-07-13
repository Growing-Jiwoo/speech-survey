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

/** 토큰 형식: `${만료ms}.${HMAC(만료ms)}` */
export async function createToken(secret: string, ttlMs = 12 * 3600_000): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  return `${exp}.${await hmacHex(exp, secret)}`
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const [exp, sig] = token.split('.')
  if (!exp || !sig) return false
  if (Number(exp) < Date.now()) return false
  return (await hmacHex(exp, secret)) === sig
}

export const ADMIN_COOKIE = 'admin_token'
