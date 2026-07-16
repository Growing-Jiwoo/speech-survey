// POST /api/admin/login — 관리자 로그인. argon2id 해시 검증 + DB 기반 레이트리밋(IP·글로벌 이중 버킷).
import { NextResponse } from 'next/server'
import { verify } from '@node-rs/argon2'
import { createToken, ADMIN_COOKIE, ADMIN_TTL_MS } from '@/lib/auth'
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from '@/lib/db'
import { env } from '@/lib/env'
import { clientIp } from '@/lib/request'

export const runtime = 'nodejs' // @node-rs/argon2는 네이티브 바인딩 → Node 런타임 필수

const MAX_FAILS = 5
const LOCK_MS = 10 * 60_000
const GLOBAL_KEY = '__global__'   // IP 무관 누적 실패 버킷(IP 로테이션 공격 완화)
const GLOBAL_MAX_FAILS = 50

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
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: ADMIN_TTL_MS / 1000, // 토큰 TTL과 단일 소스로 일치
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
