import Link from 'next/link'
import { listSessions } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function AdminList() {
  const sessions = await listSessions()
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl">설문 세션 ({sessions.length})</h1>
        <a href="/api/admin/export" className="rounded-full bg-ink px-4 py-2 text-sm text-white">CSV 내보내기</a>
      </div>
      <table className="w-full rounded-2xl bg-white text-sm shadow">
        <thead><tr className="border-b text-left text-ink/50">
          <th className="p-3">이름</th><th>나이</th><th>시작</th><th>상태</th><th>건너뜀</th>
        </tr></thead>
        <tbody>
          {sessions.map(s => {
            const skipped = s.responses.filter(r => r.status === 'skipped').length
            return (
              <tr key={s.id} className="border-b last:border-0 hover:bg-cream">
                <td className="p-3"><Link href={`/admin/${s.id}`} className="text-sky-700 underline">{s.child_name}</Link></td>
                <td>{s.child_age}</td>
                <td>{new Date(s.started_at).toLocaleString('ko-KR')}</td>
                <td>{s.completed_at ? '완료' : <span className="text-berry">미완료</span>}</td>
                <td>{skipped > 0 ? `${skipped}개` : '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sessions.length === 0 && <p className="mt-6 text-center text-ink/50">아직 참여한 세션이 없습니다.</p>}
    </main>
  )
}
