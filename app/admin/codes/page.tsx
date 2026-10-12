import { Suspense } from 'react'
import { CodeIssuer } from '@/components/admin/CodeIssuer'
import { LoadingOverlay } from '@/components/LoadingOverlay'

export default function AdminCodes() {
  // 데이터는 CodeIssuer가 react-query로 클라이언트에서 로드·캐싱한다.
  // 폭은 결과지 화면과 같은 max-w-6xl — max-w-4xl(본문 814px)에서는 발급 목록 표의 연락처가 잘리고 발급일부터 [삭제]까지
  // 가로 스크롤 뒤에 있었다(2026-10-12 점검). 발급 폼은 CodeIssuer 안에서 따로 좁힌다.
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10">
      <Suspense fallback={<LoadingOverlay show />}>
        <CodeIssuer />
      </Suspense>
    </main>
  )
}
