import type { NextConfig } from 'next'

// 전 경로 공통 보안 응답 헤더. CSP는 요청별 nonce가 필요해 여기(정적 설정)가 아니라
// proxy.ts에서 주입한다(script-src를 nonce+strict-dynamic으로 잠금 — F-13).
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
]

// 옛 Vercel 기본 주소로 들어오면 정식 도메인으로 넘긴다(308 — 경로·쿼리 그대로). 사용자 확정(2026-10-13) — 담당자 회신 아님.
// 두 주소가 함께 열리면 진행 상태·기억된 학급 코드·쓰기 방식·관리자 쿠키가 주소마다 따로라(브라우저 저장소는 주소별),
// 10/12 전 승인 메일·옛 설명서의 링크로 들어온 선생님에게 이어하기가 보이지 않았다(2026-10-12 점검 X16).
// 대가로 옛 주소에서 진행 중이던 검사는 이어하기가 한 번 끊긴다 — 그 진행 상태는 옛 주소의 저장소에 남는다.
// Preview 주소(speech-survey-git-…·speech-survey-<해시>-…)는 넘기지 않는다 — host 값은 앞뒤가 고정된 정규식으로 맞춰져
// 길이가 다른 호스트는 맞지 않는다. 점은 Next·Vercel 문서 예시처럼 이스케이프하지 않는다(tests/next-config.test.ts).
const OLD_HOST = 'speech-survey.vercel.app'
const CANONICAL_ORIGIN = 'https://lidislab.com'

const nextConfig: NextConfig = {
  // 타입체크는 `npm run typecheck`(tsc --noEmit)로 분리 실행하고, 빌드 시에는 생략해 배포를 빠르게 한다.
  typescript: { ignoreBuildErrors: true },
  // `x-powered-by: Next.js`를 내지 않는다 — 쓰는 프레임워크를 공짜로 알려 줄 이유가 없다(2026-10-12 점검 A22).
  poweredByHeader: false,
  // 결과보고서 PDF 라우트(lib/pdf/report.ts)가 런타임에 폰트(assets/fonts)와 학교 목록(public/schools)을
  // 파일로 읽는다. 서버리스 번들에 명시적으로 포함시키지 않으면 로컬만 되고 배포에서 ENOENT가 난다.
  outputFileTracingIncludes: {
    '/api/admin/sessions/[id]/sheet.pdf': ['./assets/fonts/**', './public/schools/*.json'],
    '/api/results/[token]/sheets.pdf': ['./assets/fonts/**', './public/schools/*.json'],
  },
  async redirects() {
    return [
      { source: '/:path*', has: [{ type: 'host', value: OLD_HOST }], destination: `${CANONICAL_ORIGIN}/:path*`, permanent: true },
    ]
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // 벤더링한 폰트는 내용이 바뀌면 파일명도 바뀐다(구글 버전이 이름에 들어간다) —
      // 안전하게 영구 캐시할 수 있다. public/ 기본 헤더는 max-age=0이라 매 방문 재검증한다.
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}
export default nextConfig
