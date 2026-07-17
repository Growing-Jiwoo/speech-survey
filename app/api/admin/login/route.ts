// POST /api/admin/login — 관리자 로그인. argon2id 해시 검증 + DB 기반 레이트리밋.
// 방어 2단: (1) per-IP 하드 잠금(대상형 429), (2) 글로벌 점증 지연(가용성 보존 완화).
import { NextResponse } from 'next/server'
import { verify } from '@node-rs/argon2'
import { createToken, ADMIN_COOKIE, ADMIN_TTL_MS } from '@/lib/auth'
import { clearLoginFailures, isLoginLocked, loginFailureCount, recordLoginFailure } from '@/lib/db'
import { env } from '@/lib/env'
import { clientIp } from '@/lib/request'
import { GLOBAL_KEY, IP_MAX_FAILS, LOCK_MS, globalBackoffMs } from '@/lib/login-policy'

export const runtime = 'nodejs' // @node-rs/argon2는 네이티브 바인딩 → Node 런타임 필수

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST(req: Request) {
  const ip = clientIp(req)
  // (1) per-IP 하드 잠금: 이 IP만 잠그므로 다른 IP의 정상 관리자는 영향받지 않는다.
  if (await isLoginLocked(ip, IP_MAX_FAILS))
    return NextResponse.json({ error: '시도가 너무 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 })

  // (2) 글로벌 백오프: 예전엔 전역 50회 도달 시 모든 로그인을 하드 잠금(정상 관리자까지 봉쇄)했으나,
  //     이제 전역 실패 누적에 비례한 지연(상한 2s)만 준다 — IP 로테이션 공격엔 마찰을 주되 봉쇄는 안 한다.
  //     지연은 함수 실행시간을 잡아먹으므로 상한을 둔다(대량 동시 지연 요청에 의한 자원 소모 방지).
  const backoff = globalBackoffMs(await loginFailureCount(GLOBAL_KEY))
  if (backoff > 0) await sleep(backoff)

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
