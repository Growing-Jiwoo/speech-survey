import Link from 'next/link'
import { listQuestions, listSessions } from '@/lib/db'
import { Blip } from '@/components/Blip'

export const dynamic = 'force-dynamic'

export default async function AdminList() {
  const [sessions, questions] = await Promise.all([listSessions(), listQuestions()])
  const total = questions.length
  const done = sessions.filter(s => s.completed_at).length
  const todayKey = new Date().toDateString()
  const today = sessions.filter(s => new Date(s.started_at).toDateString() === todayKey).length

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Blip variant="logo" className="h-8 w-8" />
          <div>
            <p className="text-[15px] font-bold">말하기 설문 · 관리자</p>
            <p className="text-[11px] text-ink-mute">이름을 누르면 결과지가 열립니다</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="kpi">세션 <b>{sessions.length}</b></span>
            <span className="kpi">완료 <b>{done}</b></span>
            <span className="kpi">오늘 <b>{today}</b></span>
            <a href="/api/admin/export" className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white">
              CSV 내보내기
            </a>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th scope="col" className="px-5 py-3 font-medium">이름</th>
              <th scope="col" className="font-medium">나이</th>
              <th scope="col" className="font-medium">시작</th>
              <th scope="col" className="font-medium">진행</th>
              <th scope="col" className="font-medium">상태</th>
              <th scope="col" className="pr-5 font-medium">건너뜀</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              const answered = s.responses.filter(r => r.status === 'completed' || r.status === 'skipped').length
              const skipped = s.responses.filter(r => r.status === 'skipped').length
              return (
                <tr key={s.id} className="border-t border-line/60 hover:bg-well">
                  <td className="px-5 py-3">
                    <Link href={`/admin/${s.id}`} className="font-bold text-blue">{s.child_name}</Link>
                  </td>
                  <td>{s.child_age}</td>
                  <td className="text-ink-soft">{new Date(s.started_at).toLocaleString('ko-KR')}</td>
                  <td className="font-read">{answered} / {total}</td>
                  <td>
                    {s.completed_at
                      ? <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">완료</span>
                      : <span className="rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">진행 중</span>}
                  </td>
                  <td className="pr-5">{skipped > 0 ? `${skipped}개` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sessions.length === 0 && <p className="p-8 text-center text-sm text-ink-mute">아직 참여한 세션이 없습니다.</p>}
      </div>
    </main>
  )
}
