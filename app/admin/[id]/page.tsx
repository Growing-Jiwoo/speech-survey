import Link from 'next/link'
import { sessionDetail, signedAudioUrl } from '@/lib/db'
import { AttemptList, type AttemptView } from '@/components/AttemptList'

export const dynamic = 'force-dynamic'

export default async function AdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, rows } = await sessionDetail(id)
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/admin" className="text-sm text-ink/50 underline">← 목록</Link>
      <h1 className="mb-1 mt-2 text-2xl">{session.child_name} ({session.child_age}세)</h1>
      <p className="mb-6 text-sm text-ink/50">
        {new Date(session.started_at).toLocaleString('ko-KR')} · {session.completed_at ? '완료' : '미완료'}
      </p>
      <div className="flex flex-col gap-4">
        {await Promise.all(rows.map(async r => {
          const attempts: AttemptView[] = await Promise.all(r.attempts.map(async a => ({
            id: a.id, attemptNo: a.attempt_no, sttText: a.stt_text,
            url: await signedAudioUrl(a.audio_path), isFinal: a.id === r.finalAttemptId,
          })))
          return (
            <div key={r.question.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ${r.status === 'skipped' ? 'opacity-50' : ''}`}>
              <div className="mb-2 flex items-center gap-2 text-sm text-ink/50">
                <span>Q{r.question.order_no}</span>
                <span className="rounded-full bg-ink/5 px-2">{r.question.difficulty}</span>
                {r.retryCount > 1 && <span className="rounded-full bg-peach px-2">재시도 {r.retryCount}회</span>}
                {r.status === 'skipped' && <span className="rounded-full bg-ink/10 px-2">건너뜀</span>}
                {r.status === 'none' && <span className="rounded-full bg-ink/10 px-2">미응답</span>}
              </div>
              <p className="mb-2 font-sans font-semibold">{r.question.text}</p>
              {r.attempts.length > 0 && <AttemptList attempts={attempts} />}
            </div>
          )
        }))}
      </div>
    </main>
  )
}
