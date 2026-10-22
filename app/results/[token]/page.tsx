// /results/[token] — 교사 결과 페이지의 서버 셸. 토큰이 URL에 실리므로 색인·리퍼러를 막는다.
// 데이터·상호작용은 ResultsView(클라이언트)가 맡는다. `?scan=1`은 시작 화면 [쓰기 스캔본 올리기]의 메일 링크다(2026-10-22) —
// 올릴 기록지가 없으면 화면이 그렇다고 알린다(없으면 스캔본 칸 자체가 숨어, 그 버튼으로 온 선생님이 헤맨다).
import type { Metadata } from 'next'
import { ResultsView } from '@/components/results/ResultsView'

export const metadata: Metadata = {
  title: 'KODYS 결과지',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ResultsPage({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { token } = await params
  return <ResultsView token={token} scanLink={(await searchParams).scan === '1'} />
}
