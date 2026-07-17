import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR, Lexend } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from './providers'

const noto = Noto_Sans_KR({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-noto' })
const lexend = Lexend({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-lexend' })

export const metadata: Metadata = { title: '읽기 검사', description: '아동 읽기 선별검사 — 낱말·문장 소리 내어 읽기 녹음과 낱말 쓰기 확인' }
// 라이트 전용 앱 — 다크모드 기기에서 UA 폼 컨트롤·스크롤바가 어둡게 섞이지 않게 명시한다.
export const viewport: Viewport = { themeColor: '#F4F6FB', colorScheme: 'light' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // middleware가 심은 요청별 nonce를 읽는다. headers()를 읽으면 렌더가 동적으로 전환되고,
  // 그때 Next가 자기 스크립트 태그에 이 nonce를 자동 부여한다(strict-dynamic CSP와 맞물림).
  // 정적 프리렌더 상태에서는 nonce를 주입할 수 없어 CSP가 스크립트를 전부 차단하므로 필수 단계다.
  await headers()
  return (
    <html lang="ko">
      <body className={`${noto.variable} ${lexend.variable} min-h-dvh`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
