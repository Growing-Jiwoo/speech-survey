import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, ADMIN_COOKIE } from '@/lib/auth'

/**
 * 요청별 CSP를 만든다. 핵심은 script-src를 nonce + strict-dynamic으로 잠가(prod) 인라인/외부
 * 스크립트 주입(XSS)을 차단하는 것(F-13). style은 Tailwind·인라인 스타일 속성 때문에 unsafe-inline을
 * 유지하고, 녹음 재생용 Supabase 서명 URL을 media/connect-src에 허용한다.
 * dev는 HMR(eval·인라인)이 필요해 완화한다 — 엄격 모드는 prod 빌드에서만 활성.
 */
function buildCsp(nonce: string | null): string {
  const isDev = process.env.NODE_ENV !== 'production'
  let supabaseOrigin = ''
  try { supabaseOrigin = new URL(process.env.SUPABASE_URL ?? '').origin } catch { /* 미설정 시 self만 */ }
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",                              // Tailwind 주입 스타일·style 속성(스크립트 아님)
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `media-src 'self' blob: data: ${supabaseOrigin}`.trim(),         // 녹음 재생(Supabase 서명 URL)
    `connect-src 'self' ${supabaseOrigin}`.trim(),                   // API 동일출처 + Supabase
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // prod에서만 nonce 발급. Edge 런타임엔 Node Buffer가 없으므로 btoa로 base64 인코딩한다.
  const nonce = process.env.NODE_ENV === 'production' ? btoa(crypto.randomUUID()) : null
  const csp = buildCsp(nonce)

  // 요청 헤더에 CSP(+nonce)를 실으면 Next가 자기 스크립트 태그에 nonce를 자동 부여한다(prod strict 경로).
  const requestHeaders = new Headers(req.headers)
  if (nonce) {
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('content-security-policy', csp)
  }
  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    res.headers.set('Content-Security-Policy', csp)
    return res
  }
  const withCsp = (res: NextResponse) => { res.headers.set('Content-Security-Policy', csp); return res }

  const isAdminArea = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
  // 로그인·로그아웃은 인증 없이 통과(로그아웃은 만료 쿠키로도 가능해야 함). CSP는 그대로 부여.
  if (!isAdminArea
    || pathname === '/admin/login' || pathname === '/api/admin/login' || pathname === '/api/admin/logout')
    return pass()

  // admin 보호 구역: 시크릿 미설정 시 fail-open 금지(빈 키 서명 위조 차단).
  const secret = process.env.SESSION_SECRET
  const token = req.cookies.get(ADMIN_COOKIE)?.value ?? ''
  const authed = secret && token && await verifyToken(token, secret)
  if (authed) return pass()
  if (pathname.startsWith('/api/'))
    return withCsp(NextResponse.json({ error: '인증 필요' }, { status: 401 }))
  return withCsp(NextResponse.redirect(new URL('/admin/login', req.url)))
}

// 정적 자산·학교 JSON을 제외한 모든 경로에서 실행(CSP를 전 페이지에 부여하기 위함).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|schools/).*)'],
}
