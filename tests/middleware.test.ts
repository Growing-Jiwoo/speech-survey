import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import { createToken } from '@/lib/auth'

// middleware는 /admin 전체의 유일한 인증 계층이다(라우트들은 "인증은 middleware가 담당" 전제).
// 실제 HMAC 토큰(createToken)으로 검증까지 실행한다 — auth.test.ts와 같은 실크립토 관례.

const SECRET = 'test-secret'

const mkReq = (path: string, cookieToken?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookieToken !== undefined ? { cookie: `admin_token=${cookieToken}` } : {},
  })

/** NextResponse.next()로 통과했는지 여부 */
const passed = (res: Response) => res.headers.get('x-middleware-next') === '1'

beforeEach(() => { vi.stubEnv('SESSION_SECRET', SECRET) })
afterEach(() => { vi.unstubAllEnvs() })

describe('middleware — 공개 예외 경로', () => {
  it.each(['/admin/login', '/api/admin/login', '/api/admin/logout'])(
    '%s 는 토큰 없이 통과 (로그인·로그아웃은 인증 불필요)', async path => {
      const res = await middleware(mkReq(path))
      expect(passed(res)).toBe(true)
    })
})

describe('middleware — 인증 실패', () => {
  it('토큰 없는 /admin 페이지는 로그인으로 리다이렉트', async () => {
    const res = await middleware(mkReq('/admin'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/admin/login')
  })

  it('토큰 없는 /api/admin/* 는 401 JSON (리다이렉트 아님)', async () => {
    const res = await middleware(mkReq('/api/admin/sessions'))
    expect(res.status).toBe(401)
  })

  it('서명이 변조된 토큰 거부', async () => {
    const token = await createToken(SECRET)
    const res = await middleware(mkReq('/admin', token.slice(0, -2) + 'ff'))
    expect(res.status).toBe(307)
  })

  it('다른 시크릿으로 서명된 토큰 거부', async () => {
    const res = await middleware(mkReq('/admin', await createToken('other-secret')))
    expect(res.status).toBe(307)
  })

  it('만료된 토큰 거부', async () => {
    const res = await middleware(mkReq('/admin', await createToken(SECRET, -1000)))
    expect(res.status).toBe(307)
  })

  it('[REGRESSION] SESSION_SECRET 미설정 시 fail-closed — 어떤 토큰도 통과 불가', async () => {
    // (참고: WebCrypto는 길이 0 HMAC 키 자체를 거부하므로 "빈 키로 서명된 토큰"은 만들 수도 없다.
    //  여기서는 시크릿 미설정 시 검증을 시도조차 하지 않고 거부하는지를 고정한다.)
    const token = await createToken(SECRET)
    vi.stubEnv('SESSION_SECRET', '')
    const res = await middleware(mkReq('/admin', token))
    expect(res.status).toBe(307)
  })
})

describe('middleware — 인증 성공', () => {
  it('유효 토큰이면 /admin·/api/admin/* 모두 통과', async () => {
    const token = await createToken(SECRET)
    expect(passed(await middleware(mkReq('/admin', token)))).toBe(true)
    expect(passed(await middleware(mkReq('/api/admin/sessions', token)))).toBe(true)
  })
})
