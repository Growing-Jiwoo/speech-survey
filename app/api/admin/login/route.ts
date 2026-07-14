import { NextResponse } from 'next/server'
import { createToken, ADMIN_COOKIE } from '@/lib/auth'
import { clientIp } from '@/lib/client-ip'
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from '@/lib/db'
import { verifyPassword } from '@/lib/password'
import { env } from '@/lib/env'

export const runtime = 'nodejs' // lib/password가 node:crypto(scrypt) 사용

const MAX_FAILS = 5
const LOCK_MS = 10 * 60_000

export async function POST(req: Request) {
  const ip = clientIp(req)
  if (await isLoginLocked(ip, MAX_FAILS))
    return NextResponse.json({ error: '시도가 너무 많습니다. 10분 후 다시 시도하세요.' }, { status: 429 })

  const { password } = await req.json().catch(() => ({}))
  if (!password || !verifyPassword(password, env('ADMIN_PASSWORD_HASH'))) {
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
