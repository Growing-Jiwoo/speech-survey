import Link from 'next/link'
import { sessionDetail, signedAudioUrl } from '@/lib/db'
import { compareUtterance, type MatchResult } from '@/lib/compare'
import { AudioPlayer } from '@/components/AudioPlayer'
import { Blip } from '@/components/Blip'

export const dynamic = 'force-dynamic'

const PILL: Record<MatchResult | 'skipped' | 'none', { label: string; cls: string }> = {
  matched: { label: '일치', cls: 'bg-mint/10 text-mint' },
  mismatched: { label: '불일치', cls: 'bg-amber/10 text-amber' },
  unrecognized: { label: '인식 안 됨', cls: 'bg-ink/5 text-ink-mute' },
  skipped: { label: '건너뜀', cls: 'bg-ink/5 text-ink-mute' },
  none: { label: '미응답', cls: 'bg-ink/5 text-ink-mute' },
}

function Pill({ kind }: { kind: keyof typeof PILL }) {
  const p = PILL[kind]
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${p.cls}`}>{p.label}</span>
}

export default async function AdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, rows } = await sessionDetail(id)
  const items = await Promise.all(rows.map(async r => ({
    ...r,
    views: await Promise.all(r.attempts.map(async a => ({
      no: a.attempt_no, stt: a.stt_text,
      url: await signedAudioUrl(a.audio_path),
      match: compareUtterance(r.question.text, a.stt_text),
    }))),
  })))
  const answered = items.filter(r => r.views.length > 0).length
  const skipped = items.filter(r => r.status === 'skipped').length
  const matched = items.filter(r => r.status !== 'skipped' && r.views.length > 0 && r.views[r.views.length - 1].match === 'matched').length

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href="/admin" className="text-sm text-ink-mute underline">← 목록</Link>
      <div className="mt-3 overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Blip variant="logo" className="h-8 w-8" />
          <div>
            <p className="text-[15px] font-bold">결과지 — {session.child_name} ({session.child_age}세)</p>
            <p className="text-[11px] text-ink-mute">
              {new Date(session.started_at).toLocaleString('ko-KR')} · {session.completed_at ? '완료' : '진행 중'}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <span className="kpi">응답 <b>{answered} / {items.length}</b></span>
            <span className="kpi">자동 일치 <b>{matched}</b></span>
            <span className="kpi">건너뜀 <b>{skipped}</b></span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
              <th scope="col" className="font-medium">제시 문장</th>
              <th scope="col" className="w-14 font-medium">시도</th>
              <th scope="col" className="font-medium">들린 말 (STT)</th>
              <th scope="col" className="w-28 font-medium">자동 비교</th>
              <th scope="col" className="w-52 pr-5 font-medium">듣기</th>
            </tr>
          </thead>
          <tbody>
            {items.flatMap(r => {
              if (r.views.length === 0) return [(
                <tr key={r.question.id} className="border-t border-line/60">
                  <td className="px-5 py-3 text-ink-mute">{r.question.order_no}</td>
                  <td className="font-read">{r.question.text}</td>
                  <td>—</td>
                  <td className="text-ink-mute">—</td>
                  <td><Pill kind={r.status === 'skipped' ? 'skipped' : 'none'} /></td>
                  <td className="pr-5">—</td>
                </tr>
              )]
              return r.views.map((v, i) => (
                <tr key={`${r.question.id}-${v.no}`} className={i === 0 ? 'border-t border-line/60' : ''}>
                  <td className="px-5 py-3 text-ink-mute">{i === 0 ? r.question.order_no : ''}</td>
                  <td className="font-read">
                    {i === 0 ? r.question.text : ''}
                    {i === 0 && r.status === 'skipped' && <span className="ml-2 text-xs text-ink-mute">(이후 건너뜀)</span>}
                  </td>
                  <td className="text-ink-mute">{r.views.length > 1 ? `#${v.no}` : ''}</td>
                  <td className="font-read">{v.stt || <span className="text-ink-mute">(인식되지 않음)</span>}</td>
                  <td><Pill kind={v.match} /></td>
                  <td className="py-2 pr-5"><AudioPlayer src={v.url} /></td>
                </tr>
              ))
            })}
          </tbody>
        </table>
        <p className="border-t border-line bg-well px-5 py-3 text-[11.5px] text-ink-mute">
          자동 비교는 참고용입니다 — 최종 평가는 녹음을 직접 듣고 판단해 주세요. 모든 시도(재녹음 포함)가 순서대로 저장됩니다.
        </p>
      </div>
    </main>
  )
}
