'use client'
import type { Kpis, StatusFilter } from '@/lib/adminStats'

export type KpiKind = 'total' | 'submitted' | 'inProgress' | 'today'

/** KPI 카드 4장 — 클릭 시 해당 필터 토글 (제출/진행중 → status, 오늘 → today, 전체 → 해제) */
export function StatsCards({ kpis, activeStatus, activeToday, onSelect }: {
  kpis: Kpis; activeStatus: StatusFilter; activeToday: boolean; onSelect: (kind: KpiKind) => void
}) {
  const cards: { kind: KpiKind; label: string; value: number; on: boolean }[] = [
    { kind: 'total', label: '전체 세션', value: kpis.total, on: activeStatus === 'all' && !activeToday },
    { kind: 'submitted', label: '제출 완료', value: kpis.submitted, on: activeStatus === 'submitted' },
    { kind: 'inProgress', label: '진행 중', value: kpis.inProgress, on: activeStatus === 'inProgress' },
    { kind: 'today', label: '오늘 참여', value: kpis.today, on: activeToday },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-line px-5 py-4 sm:grid-cols-4">
      {cards.map(c => (
        <button key={c.kind} type="button" onClick={() => onSelect(c.kind)} aria-pressed={c.on}
          className={`rounded-2xl border-[1.5px] px-4 py-3 text-left transition ${
            c.on ? 'border-blue bg-blue/5' : 'border-line bg-well hover:border-ink-mute/40'}`}>
          <p className="text-[11px] font-bold text-ink-mute">{c.label}</p>
          <p className={`font-read text-2xl font-bold ${c.on ? 'text-blue' : 'text-ink'}`}>{c.value}</p>
        </button>
      ))}
    </div>
  )
}
