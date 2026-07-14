import Link from 'next/link'
import { sessionDetail, signedAudioUrl } from '@/lib/db'
import { ITEMS, KIND_LABEL, SECTION_LABEL, areaLabel } from '@/lib/items'
import { AudioPlayer } from '@/components/AudioPlayer'
import { Blip } from '@/components/Blip'

export const dynamic = 'force-dynamic'

export default async function AdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session: s, recordings, writing } = await sessionDetail(id)

  const recItems = ITEMS.filter(i => i.maxSec > 0)
  const writeItems = ITEMS.filter(i => i.section === 'word_writing')
  const byItem = new Map<string, { attempt_no: number; url: string; duration_sec: number | null }[]>()
  for (const r of recordings) {
    const url = await signedAudioUrl(r.audio_path)
    const list = byItem.get(r.item_code) ?? []
    list.push({ attempt_no: r.attempt_no, url, duration_sec: r.duration_sec })
    byItem.set(r.item_code, list)
  }
  const writingByCode = new Map(writing.map(w => [w.item_code, w.can_write]))
  const recordedCount = recItems.filter(i => byItem.has(i.code)).length
  const missingCount = (recItems.length - recordedCount) + (writeItems.length - writing.length)

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href="/admin" className="text-sm text-ink-mute underline">← 목록</Link>
      <div className="mt-3 overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
        <div className="border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Blip variant="logo" className="h-8 w-8" />
            <div>
              <p className="text-[15px] font-bold">
                결과지 — {s.child_name} ({s.school_name} {s.grade}-{s.class_no}, {s.gender})
              </p>
              <p className="text-[11px] text-ink-mute">
                생년월일 {s.birth_ymd} · 담임 {s.teacher_name} ({s.teacher_contact}) ·{' '}
                {new Date(s.started_at).toLocaleString('ko-KR')} · {s.submitted_at ? '제출 완료' : '진행 중'}
              </p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="kpi">녹음 <b>{recordedCount} / {recItems.length}</b></span>
              <span className="kpi">낱말쓰기 <b>{writing.length} / {writeItems.length}</b></span>
              {missingCount > 0 && (
                <span className="rounded-full bg-rec/10 px-3 py-1.5 text-xs font-bold text-rec-deep">
                  미완료 {missingCount}건
                </span>
              )}
            </div>
          </div>
          {s.checklist.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ink-soft">확인 필요 영역:</span>
              {s.checklist.map(c => (
                <span key={c} className="rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">{areaLabel(c)}</span>
              ))}
            </div>
          )}
        </div>

        <h2 className="px-5 pt-4 text-[13px] font-bold text-ink-soft">녹음 문항 (낱말 해독 · 문장 읽기유창성)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
              <th scope="col" className="w-24 font-medium">구분</th>
              <th scope="col" className="font-medium">제시어</th>
              <th scope="col" className="w-14 font-medium">시도</th>
              <th scope="col" className="w-52 pr-5 font-medium">듣기</th>
            </tr>
          </thead>
          <tbody>
            {recItems.flatMap(item => {
              const label = item.section === 'word_reading'
                ? `낱말 (${KIND_LABEL[item.kind!]})` : '문장'
              const views = byItem.get(item.code) ?? []
              if (views.length === 0) return [(
                <tr key={item.code} className="border-t border-line/60 bg-rec/5">
                  <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                  <td className="text-xs text-ink-mute">{label}</td>
                  <td className="font-read whitespace-pre-line">{item.text}</td>
                  <td>—</td>
                  <td className="pr-5">
                    <span className="rounded-full bg-rec/10 px-3 py-1 text-xs font-bold text-rec-deep">미녹음</span>
                  </td>
                </tr>
              )]
              return views.map((v, i) => (
                <tr key={`${item.code}-${v.attempt_no}`} className={i === 0 ? 'border-t border-line/60' : ''}>
                  <td className="px-5 py-3 text-ink-mute">{i === 0 ? item.orderNo : ''}</td>
                  <td className="text-xs text-ink-mute">{i === 0 ? label : ''}</td>
                  <td className="font-read whitespace-pre-line">{i === 0 ? item.text : ''}</td>
                  <td className="text-ink-mute">{views.length > 1 ? `#${v.attempt_no}` : ''}</td>
                  <td className="py-2 pr-5"><AudioPlayer src={v.url} /></td>
                </tr>
              ))
            })}
          </tbody>
        </table>

        <h2 className="border-t border-line px-5 pt-4 text-[13px] font-bold text-ink-soft">낱말 쓰기 (예/아니오)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
              <th scope="col" className="w-24 font-medium">구분</th>
              <th scope="col" className="font-medium">낱말</th>
              <th scope="col" className="w-28 pr-5 font-medium">답</th>
            </tr>
          </thead>
          <tbody>
            {writeItems.map(item => {
              const v = writingByCode.get(item.code)
              return (
                <tr key={item.code} className={`border-t border-line/60 ${v === undefined ? 'bg-rec/5' : ''}`}>
                  <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                  <td className="text-xs text-ink-mute">{KIND_LABEL[item.kind!]}</td>
                  <td className="font-read">{item.text}</td>
                  <td className="pr-5">
                    {v === undefined
                      ? <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-bold text-ink-mute">미선택</span>
                      : v
                        ? <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">예</span>
                        : <span className="rounded-full bg-rec/10 px-3 py-1 text-xs font-bold text-rec-deep">아니오</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <h2 className="border-t border-line px-5 pt-4 text-[13px] font-bold text-ink-soft">{SECTION_LABEL.checklist}</h2>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {s.checklist.length === 0
            ? <span className="text-sm text-ink-mute">선택 없음</span>
            : s.checklist.map(c => (
              <span key={c} className="rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">{areaLabel(c)}</span>
            ))}
        </div>

        <p className="border-t border-line bg-well px-5 py-3 text-[11.5px] text-ink-mute">
          채점 기준(PDF): 낱말 해독은 30초, 문장 읽기유창성은 40초 내 정확 반응 수. 모든 시도(재녹음 포함)가 순서대로 저장됩니다.
        </p>
      </div>
    </main>
  )
}
