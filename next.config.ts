import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  // TypeScript 7 (native tsgo)은 Next의 빌드 내장 타입체크(클래식 TS API 의존)와 호환되지 않는다.
  // 타입체크는 `tsc --noEmit`(tsgo)로 분리 실행하고, 여기서는 Next의 타입체크만 끈다.
  typescript: { ignoreBuildErrors: true },
}
export default nextConfig
