'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { KIND_LABEL, RECORDING_ITEMS, SECTION_LABEL, WRITING_ITEMS, areaLabel } from '@/lib/items'
import { adjacentSessionIds, filterSessions, parseFilters, sortSessions } from '@/lib/adminStats'
import { useSessionDetailQuery, useSessionsQuery } from '@/hooks/useAdminQueries'
import { AudioBusProvider } from '@/components/AudioBus'
import { AudioPlayer } from '@/components/AudioPlayer'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'

// 결과지에서도 목록과 동일한 totals(문항 수)로 정렬·진행률을 재구성한다.
const TOTALS = { rec: RECORDING_ITEMS.length, write: WRITING_ITEMS.length }

/** 초 → m:ss (미상이면 '—') */
function fmtDur(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AdminDetailView() {
  const id = String(useParams().id)
  const router = useRouter()
  const back = useSearchParams().get('back')
  const listHref = back ? `/admin?${back}` : '/admin'
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useSessionDetailQuery(id)

  // 이전/다음 아동: 캐시된 목록에 back의 필터·정렬을 재적용해 현재 id의 앞/뒤를 구한다.
  const { data: sessions } = useSessionsQuery()
  const nav = useMemo(() => {
    if (!sessions) return { prev: null, next: null }
    const { filters, sort } = parseFilters(new URLSearchParams(back ?? ''))
    const rows = sortSessions(filterSessions(sessions, filters, new Date()), sort, TOTALS)
    return adjacentSessionIds(rows, id)
  }, [sessions, back, id])

  const goHref = (target: string) => back ? `/admin/${target}?back=${encodeURIComponent(back)}` : `/admin/${target}`

  const byItem = useMemo(() => {
    const m = new Map<string, { attempt_no: number; url: string; duration_sec: number | null }[]>()
    for (const r of data?.recordings ?? []) {
      const list = m.get(r.item_code) ?? []
      list.push({ attempt_no: r.attempt_no, url: r.url, duration_sec: r.duration_sec })
      m.set(r.item_code, list)
    }
    return m
  }, [data])

  if (isLoading) return <LoadingOverlay show />
  if (isError || !data) return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href={listHref} className="text-sm text-ink-mute underline">← 목록</Link>
      <p className="mt-6 text-sm text-ink-soft">결과지를 불러오지 못했어요. {(error as Error | undefined)?.message ?? ''}</p>
    </main>
  )

  const { session: s, writing } = data
  const writingByCode = new Map(writing.map(w => [w.item_code, w.can_write]))
  const recordedCount = RECORDING_ITEMS.filter(i => byItem.has(i.code)).length
  const missingCount = (RECORDING_ITEMS.length - recordedCount) + (WRITING_ITEMS.length - writing.length)

  return (
    <AudioBusProvider>
      <main className="mx-auto max-w-4xl p-6">
        <div className="flex items-center justify-between gap-2">
          <Link href={listHref} className="text-sm text-ink-mute underline">← 목록</Link>
          {/* 이전/다음 아동: 캐시 목록이 없거나 경계면 비활성. 필터(back) 보존 */}
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={!nav.prev}
              onClick={() => nav.prev && router.push(goHref(nav.prev))}
              className="rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition disabled:opacity-40">
              ◀ 이전 아동
            </button>
            <button type="button" disabled={!nav.next}
              onClick={() => nav.next && router.push(goHref(nav.next))}
              className="rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition disabled:opacity-40">
              다음 아동 ▶
            </button>
          </div>
        </div>
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
                <span className="kpi">녹음 <b>{recordedCount} / {RECORDING_ITEMS.length}</b></span>
                <span className="kpi">낱말쓰기 <b>{writing.length} / {WRITING_ITEMS.length}</b></span>
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
                <th scope="col" className="w-24 px-3 font-medium">구분</th>
                <th scope="col" className="px-3 font-medium">제시어</th>
                <th scope="col" className="w-14 px-3 font-medium">시도</th>
                <th scope="col" className="w-20 px-3 font-medium">길이</th>
                <th scope="col" className="w-72 px-3 pr-5 font-medium">듣기</th>
              </tr>
            </thead>
            <tbody>
              {RECORDING_ITEMS.flatMap(item => {
                const label = item.section === 'word_reading'
                  ? `낱말 (${KIND_LABEL[item.kind!]})` : '문장'
                const views = byItem.get(item.code) ?? []
                if (views.length === 0) return [(
                  <tr key={item.code} className="border-t border-line/60 bg-rec/5">
                    <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                    <td className="px-3 text-xs text-ink-mute">{label}</td>
                    <td className="px-3 font-read whitespace-pre-line">{item.text}</td>
                    <td className="px-3">—</td>
                    <td className="px-3 text-ink-mute">—</td>
                    <td className="px-3 pr-5">
                      <span className="rounded-full bg-rec/10 px-3 py-1 text-xs font-bold text-rec-deep">미녹음</span>
                    </td>
                  </tr>
                )]
                return views.map((v, i) => {
                  const over = v.duration_sec != null && v.duration_sec > item.maxSec
                  return (
                    <tr key={`${item.code}-${v.attempt_no}`} className={i === 0 ? 'border-t border-line/60' : ''}>
                      <td className="px-5 py-3 text-ink-mute">{i === 0 ? item.orderNo : ''}</td>
                      <td className="px-3 text-xs text-ink-mute">{i === 0 ? label : ''}</td>
                      <td className="px-3 font-read whitespace-pre-line">{i === 0 ? item.text : ''}</td>
                      <td className="px-3 text-ink-mute">{views.length > 1 ? `#${v.attempt_no}` : ''}</td>
                      <td className={`px-3 font-read text-[12px] tabular-nums ${over ? 'font-bold text-amber' : 'text-ink-soft'}`}
                        title={over ? `제한(${item.maxSec}초) 초과` : undefined}>
                        {fmtDur(v.duration_sec)}{over && ' !'}
                      </td>
                      <td className="px-3 py-2 pr-5">
                        <AudioPlayer src={v.url}
                          onError={() => queryClient.invalidateQueries({ queryKey: ['admin', 'session', id] })} />
                      </td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>

          <h2 className="border-t border-line px-5 pt-4 text-[13px] font-bold text-ink-soft">낱말 쓰기 (예/아니오)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-mute">
                <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
                <th scope="col" className="w-24 px-3 font-medium">구분</th>
                <th scope="col" className="px-3 font-medium">낱말</th>
                <th scope="col" className="w-28 px-3 pr-5 font-medium">답</th>
              </tr>
            </thead>
            <tbody>
              {WRITING_ITEMS.map(item => {
                const v = writingByCode.get(item.code)
                return (
                  <tr key={item.code} className={`border-t border-line/60 ${v === undefined ? 'bg-rec/5' : ''}`}>
                    <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                    <td className="px-3 text-xs text-ink-mute">{KIND_LABEL[item.kind!]}</td>
                    <td className="px-3 font-read">{item.text}</td>
                    <td className="px-3 pr-5">
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
    </AudioBusProvider>
  )
}
