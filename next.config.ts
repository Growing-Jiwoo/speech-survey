import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  // TypeScript 7 (native tsgo)은 Next의 빌드 내장 타입체크(클래식 TS API 의존)와 호환되지 않는다.
  // 타입체크는 `tsc --noEmit`(tsgo)로 분리 실행하고, 여기서는 Next의 타입체크만 끈다.
  typescript: { ignoreBuildErrors: true },
  // ffmpeg-static은 서버 번들에 포함되면 바이너리 경로가 /ROOT/... 로 잘못 재작성돼
  // spawn ENOENT가 난다. 외부 패키지로 두어 런타임에 실제 경로가 잡히게 한다.
  serverExternalPackages: ['ffmpeg-static'],
}
export default nextConfig
