'use client'
import { hasActiveFilters, type Filters, type Kpis } from '@/lib/adminStats'

export type KpiKind = 'total' | 'submitted' | 'inProgress' | 'today'

/** KPI 카드 4장 — 클릭 시 해당 필터 토글 (제출/진행중 → status, 오늘 → today, 전체 → 해제) */
export function StatsCards({ kpis, filters, onSelect }: {
  kpis: Kpis; filters: Filters; onSelect: (kind: KpiKind) => void
}) {
  const cards: { kind: KpiKind; label: string; value: number; on: boolean }[] = [
    // 「전체」는 거르는 조건이 하나도 없을 때만 켜진 모양 — 학교·학년·검색만 걸려 있어도 켜져 보여 전체를 보는 줄 알았다(2026-10-12)
    { kind: 'total', label: '전체 검사', value: kpis.total, on: !hasActiveFilters(filters) },
    { kind: 'submitted', label: '제출 완료', value: kpis.submitted, on: filters.status === 'submitted' },
    { kind: 'inProgress', label: '진행 중', value: kpis.inProgress, on: filters.status === 'inProgress' },
    { kind: 'today', label: '오늘 참여', value: kpis.today, on: filters.today },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-line px-5 py-4 sm:grid-cols-4">
      {cards.map(c => (
        <button key={c.kind} type="button" onClick={() => onSelect(c.kind)} aria-pressed={c.on}
          className={`rounded-2xl border-[1.5px] px-4 py-3 text-left transition ${
            c.on ? 'border-blue bg-blue/5' : 'border-line bg-well hover:border-ink-mute/40'}`}>
          <p className="text-[12px] font-bold text-ink-mute">{c.label}</p>
          <p className={`font-read text-2xl font-bold ${c.on ? 'text-blue' : 'text-ink'}`}>{c.value}</p>
        </button>
      ))}
    </div>
  )
}
