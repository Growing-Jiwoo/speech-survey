// components/admin/FilterToolbar.tsx — 관리자 목록 상단 필터 툴바.
// 검색(디바운스)·상태 탭·학교/학년 Select·필터 초기화를 담당한다.
// 필터 상태의 단일 소스는 URL(부모 AdminDashboard) — 여기는 표시와 콜백만.
'use client'
import { useEffect, useState } from 'react'
import { type Filters, type StatusFilter } from '@/lib/adminStats'
import { Select } from '@/components/Select'

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'submitted', label: '제출' },
  { key: 'inProgress', label: '진행 중' },
]

export function FilterToolbar({ filters, schools, grades, shownCount, onFilters, onReset }: {
  filters: Filters
  schools: string[]
  grades: number[]
  /** 현재 필터를 통과해 표에 보이는 행 수(필터 활성일 때 "N건 표시"로 노출) */
  shownCount: number
  onFilters: (patch: Partial<Filters>) => void
  onReset: () => void
}) {
  // 검색 입력은 로컬 상태 + 250ms 디바운스로 URL에 반영(타이핑마다 히스토리 교체 방지)
  const [qLocal, setQLocal] = useState(filters.q)
  // URL의 q가 외부 요인(초기화 버튼·뒤로가기)으로 바뀌면 입력값을 따라 맞춘다
  // — effect 대신 렌더 중 조정(공식 "adjusting state when props change" 패턴).
  const [prevQ, setPrevQ] = useState(filters.q)
  if (prevQ !== filters.q) {
    setPrevQ(filters.q)
    setQLocal(filters.q)
  }
  // filters.q·onFilters가 바뀌면 타이머가 재장전되지만 qLocal === filters.q인 동안은
  // 무동작이라 실질 영향 없다(onFilters는 부모에서 useCallback).
  useEffect(() => {
    const t = setTimeout(() => { if (qLocal !== filters.q) onFilters({ q: qLocal }) }, 250)
    return () => clearTimeout(t)
  }, [qLocal, filters.q, onFilters])

  const hasFilter = filters.q !== '' || filters.status !== 'all'
    || filters.school !== null || filters.grade !== null || filters.today

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
      <input type="search" aria-label="세션 검색" value={qLocal} onChange={e => setQLocal(e.target.value)}
        placeholder="이름·학교·담임·반 검색"
        className="h-10 w-52 rounded-xl border-[1.5px] border-line bg-well px-3.5 text-sm outline-none transition focus:border-blue" />
      <div className="flex gap-1.5">
        {STATUS_TABS.map(t => (
          <button key={t.key} type="button" onClick={() => onFilters({ status: t.key })} aria-pressed={filters.status === t.key}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              filters.status === t.key ? 'bg-blue text-white' : 'bg-well text-ink-soft'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <Select size="sm" ariaLabel="학교 필터" placeholder="학교 전체" className="w-44"
        value={filters.school ?? ''} onChange={v => onFilters({ school: v || null })}
        options={[{ value: '', label: '학교 전체' }, ...schools.map(s => ({ value: s, label: s }))]} />
      <Select size="sm" ariaLabel="학년 필터" placeholder="학년 전체" className="w-28"
        value={filters.grade !== null ? String(filters.grade) : ''}
        onChange={v => onFilters({ grade: v ? Number(v) : null })}
        options={[{ value: '', label: '학년 전체' }, ...grades.map(g => ({ value: String(g), label: `${g}학년` }))]} />
      {/* 학교·학년은 Select가 현재 값을 나타내므로 중복 Chip 제거. Select가 없는 'today'만 Chip 유지. */}
      {filters.today && <Chip label="오늘 참여" onRemove={() => onFilters({ today: false })} />}
      <div className="ml-auto flex items-center gap-2">
        {hasFilter && (
          <>
            <span className="text-xs tabular-nums text-ink-mute">{shownCount}건 표시</span>
            <button type="button" onClick={onReset} className="text-xs font-bold text-blue underline">초기화</button>
          </>
        )}
      </div>
    </div>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-blue/10 px-2.5 py-1 text-xs font-bold text-blue">
      {label}
      {/* 히트 영역 확장(-m/p) — 시각 크기는 유지하면서 터치 타깃을 키운다 */}
      <button type="button" onClick={onRemove} aria-label={`${label} 필터 제거`} className="-m-1.5 p-1.5 leading-none">×</button>
    </span>
  )
}
