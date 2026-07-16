import { Suspense } from 'react'
import { AdminDashboard } from '@/components/admin/AdminDashboard'
import { LoadingOverlay } from '@/components/LoadingOverlay'

export default function AdminList() {
  // 세션 데이터는 AdminDashboard가 react-query로 클라이언트에서 로드·캐싱한다.
  // useSearchParams 사용 → CSR 바일아웃 방지를 위해 Suspense로 감싼다.
  return (
    // 관리자 화면은 목록 테이블이 넓어 좌우 여백만 남기고 창을 꽉 채운다(가로 스크롤 최소화).
    <main className="w-full px-4 py-6 sm:px-6 lg:px-10">
      <Suspense fallback={<LoadingOverlay show />}>
        <AdminDashboard />
      </Suspense>
    </main>
  )
}
