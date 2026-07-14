import type { Metadata } from 'next'
import { Noto_Sans_KR, Lexend } from 'next/font/google'
import './globals.css'

const noto = Noto_Sans_KR({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-noto' })
const lexend = Lexend({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-lexend' })

export const metadata: Metadata = { title: '말하기 설문', description: '영어 문장을 소리 내어 읽는 설문' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${noto.variable} ${lexend.variable} min-h-dvh`}>{children}</body>
    </html>
  )
}
