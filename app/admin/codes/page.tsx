import { Suspense } from 'react'
import { CodeIssuer } from '@/components/admin/CodeIssuer'
import { LoadingOverlay } from '@/components/LoadingOverlay'

export default function AdminCodes() {
  // 데이터는 CodeIssuer가 react-query로 클라이언트에서 로드·캐싱한다.
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-10">
      <Suspense fallback={<LoadingOverlay show />}>
        <CodeIssuer />
      </Suspense>
    </main>
  )
}
