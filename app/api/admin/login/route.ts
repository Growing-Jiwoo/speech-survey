import { NextResponse } from 'next/server'
import { createToken, sha256Hex, ADMIN_COOKIE } from '@/lib/auth'
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from '@/lib/db'
import { env } from '@/lib/env'

const MAX_FAILS = 5
const LOCK_MS = 10 * 60_000

/** x-forwarded-for의 첫 IP(가장 왼쪽 = 실제 클라이언트, 프록시가 덧붙인 뒤쪽 제외) */
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  if (await isLoginLocked(ip, MAX_FAILS))
    return NextResponse.json({ error: '시도가 너무 많습니다. 10분 후 다시 시도하세요.' }, { status: 429 })

  const { password } = await req.json().catch(() => ({}))
  if (!password || (await sha256Hex(password)) !== env('ADMIN_PASSWORD_HASH')) {
    await recordLoginFailure(ip, LOCK_MS)
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 })
  }
  await clearLoginFailures(ip)
  const token = await createToken(env('SESSION_SECRET'))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600,
    secure: process.env.NODE_ENV === 'production', // HTTPS에서만 전송 (평문 유출 방지)
  })
  return res
}
