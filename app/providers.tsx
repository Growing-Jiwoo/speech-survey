'use client'
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** 앱 전역 react-query 클라이언트. 관리자 화면의 목록/결과지 데이터 캐싱에 사용된다. */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // 결과지·목록을 재방문할 때 재요청 없이 캐시를 즉시 보여준다.
        staleTime: 5 * 60_000,      // 5분 동안은 fresh (스피너 없이 캐시 사용)
        // staleTime이 지나도 30분간은 캐시를 버리지 않는다 — 목록↔결과지를 계속 오가는
        // 채점 동선에서, 다시 들른 화면이 매번 스피너부터 보여 주지 않게.
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
