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
  // TypeScript 7 (native tsgo)은 Next의 빌드 내장 타입체크(클래식 TS API 의존)와 호환되지 않는다.
  // 타입체크는 `tsc --noEmit`(tsgo)로 분리 실행하고, 여기서는 Next의 타입체크만 끈다.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
export default nextConfig
