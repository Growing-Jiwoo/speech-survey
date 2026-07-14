import { Suspense } from 'react'
import { listSessions } from '@/lib/db'
import { RECORDING_ITEMS, WRITING_ITEMS } from '@/lib/items'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminList() {
  const sessions = await listSessions()
  return (
    <main className="mx-auto max-w-5xl p-6">
      <Suspense>
        <AdminDashboard sessions={sessions}
          totals={{ rec: RECORDING_ITEMS.length, write: WRITING_ITEMS.length }} />
      </Suspense>
    </main>
  )
}
