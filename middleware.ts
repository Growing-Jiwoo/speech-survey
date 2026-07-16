import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, ADMIN_COOKIE } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  // 로그아웃은 만료된 쿠키로도 항상 가능해야 한다(쿠키 제거가 목적이므로 인증 불필요).
  if (pathname === '/admin/login' || pathname === '/api/admin/login' || pathname === '/api/admin/logout')
    return NextResponse.next()
  // 시크릿 미설정 시 fail-open 금지 — 빈 키로 서명된 토큰 위조를 차단한다.
  const secret = process.env.SESSION_SECRET
  const token = req.cookies.get(ADMIN_COOKIE)?.value ?? ''
  const ok = secret && token && await verifyToken(token, secret)
  if (ok) return NextResponse.next()
  if (pathname.startsWith('/api/'))
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  return NextResponse.redirect(new URL('/admin/login', req.url))
}

export const config = { matcher: ['/admin/:path*', '/admin', '/api/admin/:path*'] }
