import type { Metadata } from 'next'
import { Jua } from 'next/font/google'
import './globals.css'

const jua = Jua({ weight: '400', subsets: ['latin'], variable: '--font-jua' })

export const metadata: Metadata = { title: '말하기 설문', description: '문장을 읽어보아요' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${jua.variable} min-h-dvh`}>{children}</body>
    </html>
  )
}
