import type { NextConfig } from 'next'

// 전 경로 공통 보안 응답 헤더. CSP는 요청별 nonce가 필요해 여기(정적 설정)가 아니라
// middleware.ts에서 주입한다(script-src를 nonce+strict-dynamic으로 잠금 — F-13).
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  // 타입체크는 `npm run typecheck`(tsc --noEmit)로 분리 실행하고, 빌드 시에는 생략해 배포를 빠르게 한다.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
export default nextConfig
