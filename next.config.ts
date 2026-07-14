import type { NextConfig } from 'next'

// 전 경로 공통 보안 응답 헤더. CSP는 프레이밍만 통제(frame-ancestors)해
// Next 하이드레이션·Tailwind 인라인 스타일을 깨지 않으면서 클릭재킹을 막는다.
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
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
