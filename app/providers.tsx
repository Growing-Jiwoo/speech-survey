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
        gcTime: 30 * 60_000,        // 30분간 캐시 보관
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
