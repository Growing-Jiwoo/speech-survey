import type { Metadata } from 'next'
import { Noto_Sans_KR, Lexend } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const noto = Noto_Sans_KR({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-noto' })
const lexend = Lexend({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-lexend' })

export const metadata: Metadata = { title: '읽기 검사', description: '아동 읽기 선별검사 — 낱말·문장 소리 내어 읽기 녹음과 낱말 쓰기 확인' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${noto.variable} ${lexend.variable} min-h-dvh`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
