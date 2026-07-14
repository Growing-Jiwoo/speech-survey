import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, ADMIN_COOKIE } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/admin/login' || pathname === '/api/admin/login') return NextResponse.next()
  const token = req.cookies.get(ADMIN_COOKIE)?.value ?? ''
  const ok = token && await verifyToken(token, process.env.SESSION_SECRET ?? '')
  if (ok) return NextResponse.next()
  if (pathname.startsWith('/api/'))
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  return NextResponse.redirect(new URL('/admin/login', req.url))
}

export const config = { matcher: ['/admin/:path*', '/admin', '/api/admin/:path*'] }
