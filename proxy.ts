// proxy.ts — 요청 전처리(옛 middleware.ts). Next 16에서 middleware 컨벤션이 deprecated돼 이름만 옮겼다.
// **/admin·/api/admin/* 의 유일한 인증 계층**이다 — 라우트에는 인증 코드가 없다(app/api/README.md).
// 컨벤션이 빠지면 빌드는 성공하고 관리자 API가 무인증으로 열리므로(fail-open), Next 메이저를 올릴 때
// 빌드 출력에 "ƒ Proxy"가 남는지 반드시 확인할 것.
import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, ADMIN_COOKIE } from '@/lib/auth'

/**
 * 요청별 CSP를 만든다. 핵심은 script-src를 nonce + strict-dynamic으로 잠가(prod) 인라인/외부
 * 스크립트 주입(XSS)을 차단하는 것(F-13). style은 Tailwind·인라인 스타일 속성 때문에 unsafe-inline을
 * 유지하고, 녹음 재생용 Supabase 서명 URL을 media/connect-src에, 쓰기 기록지 스캔본(관리자 결과지)의
 * 서명 URL을 img-src에 허용한다.
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
    `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),          // 쓰기 기록지 스캔본(관리자 결과지, Supabase 서명 URL)
    "font-src 'self'",
    // PDF 스캔본을 그리는 pdf.js 작업자(같은 출처 파일) — 없으면 script-src로 떨어지는데, strict-dynamic은 'self'를
    // 무시해 브라우저마다 작업자 로드 판단이 갈릴 수 있다. 작업자만 따로 명시한다.
    "worker-src 'self'",
    `media-src 'self' blob: data: ${supabaseOrigin}`.trim(),         // 녹음 재생(Supabase 서명 URL)
    `connect-src 'self' ${supabaseOrigin}`.trim(),                   // API 동일출처 + Supabase
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

/** 관리자 API의 401 문구 — 화면이 그대로 보여 준다 */
const ADMIN_EXPIRED_MSG = '로그인이 끝났어요. 새 탭에서 관리자 화면에 다시 로그인한 뒤 이 화면에서 다시 시도해 주세요.'

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // prod에서만 nonce 발급. btoa는 Edge·Node 어디서든 있어 런타임을 가리지 않는다.
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
  const authed = secret && token && (await verifyToken(token, secret))
  if (authed) return pass()
  // 문구는 화면에 그대로 나간다(채점 자동 저장 실패 줄 등) — 무엇을 하면 되는지까지 말한다. 로그인은 8시간이라
  // 하루 채점 중에 끝날 수 있다(2026-10-08 야간 점검: 「인증 필요」만 떠 무엇을 할지 몰랐다).
  if (pathname.startsWith('/api/'))
    return withCsp(NextResponse.json({ error: ADMIN_EXPIRED_MSG }, { status: 401 }))
  // 로그인 뒤 원래 화면으로 돌아오게 경로를 싣는다(같은 출처의 /admin 경로만 — 로그인 화면이 다시 검사한다)
  const login = new URL('/admin/login', req.url)
  login.searchParams.set('next', pathname + req.nextUrl.search)
  return withCsp(NextResponse.redirect(login))
}

// 정적 자산·학교 JSON을 제외한 모든 경로에서 실행(CSP를 전 페이지에 부여하기 위함).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|schools/).*)'],
}
