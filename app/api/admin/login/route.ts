import { NextResponse } from 'next/server'
import { verify } from '@node-rs/argon2'
import { createToken, ADMIN_COOKIE } from '@/lib/auth'
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from '@/lib/db'
import { env } from '@/lib/env'

export const runtime = 'nodejs' // @node-rs/argon2는 네이티브 바인딩 → Node 런타임 필수

const MAX_FAILS = 5
const LOCK_MS = 10 * 60_000
const GLOBAL_KEY = '__global__'   // IP 무관 누적 실패 버킷(IP 로테이션 공격 완화)
const GLOBAL_MAX_FAILS = 50

/** 브루트포스 키: 플랫폼(Vercel)이 주입하는 x-real-ip 우선(클라이언트 위조 불가).
 *  없으면 x-forwarded-for의 마지막(가장 신뢰 가능한) 홉. 둘 다 없으면 'local'.
 *  ※ x-forwarded-for 첫 IP는 클라이언트가 위조 가능하므로 키로 쓰지 않는다. */
function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const hops = req.headers.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean)
  return hops?.[hops.length - 1] ?? 'local'
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  if ((await isLoginLocked(ip, MAX_FAILS)) || (await isLoginLocked(GLOBAL_KEY, GLOBAL_MAX_FAILS)))
    return NextResponse.json({ error: '시도가 너무 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 })

  const { password } = await req.json().catch(() => ({}))
  let ok = false
  if (typeof password === 'string' && password) {
    try { ok = await verify(env('ADMIN_PASSWORD_HASH'), password) } // 상수시간 비교는 argon2.verify 내장
    catch (e) { console.error('[login] 해시 검증 오류', e); ok = false }
  }
  if (!ok) {
    await recordLoginFailure(ip, LOCK_MS)
    await recordLoginFailure(GLOBAL_KEY, LOCK_MS)
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 })
  }
  await clearLoginFailures(ip)
  await clearLoginFailures(GLOBAL_KEY)
  const token = await createToken(env('SESSION_SECRET'))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600, // 토큰 TTL과 일치(8시간)
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
