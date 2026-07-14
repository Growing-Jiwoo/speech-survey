import { Suspense } from 'react'
import { AdminDetailView } from '@/components/admin/AdminDetailView'
import { LoadingOverlay } from '@/components/LoadingOverlay'

export default function AdminDetail() {
  // 결과지 데이터는 AdminDetailView가 react-query로 로드·캐싱한다.
  // useSearchParams 사용 → CSR 바일아웃 방지를 위해 Suspense로 감싼다.
  return (
    <Suspense fallback={<LoadingOverlay show />}>
      <AdminDetailView />
    </Suspense>
  )
}
