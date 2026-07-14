import { listSessions } from '@/lib/db'
import { RECORDING_ITEMS, WRITING_ITEMS } from '@/lib/items'
import { Blip } from '@/components/Blip'
import { SessionTable } from '@/components/admin/SessionTable'

export const dynamic = 'force-dynamic'

export default async function AdminList() {
  const sessions = await listSessions()
  const submitted = sessions.filter(s => s.submitted_at).length
  const todayKey = new Date().toDateString()
  const today = sessions.filter(s => new Date(s.started_at).toDateString() === todayKey).length

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Blip variant="logo" className="h-8 w-8" />
          <div>
            <p className="text-[15px] font-bold">KODYS-G1 읽기 검사 · 관리자</p>
            <p className="text-[11px] text-ink-mute">이름을 누르면 결과지가 열립니다</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="kpi">세션 <b>{sessions.length}</b></span>
            <span className="kpi">제출 <b>{submitted}</b></span>
            <span className="kpi">오늘 <b>{today}</b></span>
          </div>
        </div>
        <SessionTable sessions={sessions} totalRec={RECORDING_ITEMS.length} totalWrite={WRITING_ITEMS.length} />
      </div>
    </main>
  )
}
