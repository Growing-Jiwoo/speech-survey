import { Suspense } from 'react'
import { RECORDING_ITEMS, WRITING_ITEMS } from '@/lib/items'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { LoadingOverlay } from '@/components/LoadingOverlay'

export default function AdminList() {
  // 세션 데이터는 AdminDashboard가 react-query로 클라이언트에서 로드·캐싱한다.
  // useSearchParams 사용 → CSR 바일아웃 방지를 위해 Suspense로 감싼다.
  return (
    <main className="mx-auto max-w-5xl p-6">
      <Suspense fallback={<LoadingOverlay show />}>
        <AdminDashboard totals={{ rec: RECORDING_ITEMS.length, write: WRITING_ITEMS.length }} />
      </Suspense>
    </main>
  )
}
