// /results/[token] — 교사 결과 페이지의 서버 셸. 토큰이 URL에 실리므로 색인·리퍼러를 막는다.
// 데이터·상호작용은 ResultsView(클라이언트)가 맡는다.
import type { Metadata } from 'next'
import { ResultsView } from '@/components/results/ResultsView'

export const metadata: Metadata = {
  title: 'KODYS 결과지',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ResultsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ResultsView token={token} />
}
