'use client'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_FILTERS, DEFAULT_SORT, computeKpis, computeSchoolStats, filterSessions, filtersToQuery,
  gradeOptions, parseFilters, schoolOptions, sortSessions,
  type Filters, type Sort, type SortKey, type Totals,
} from '@/lib/adminStats'
import { useSessionsQuery } from '@/hooks/useAdminQueries'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { StatsCards, type KpiKind } from '@/components/admin/StatsCards'
import { SchoolBreakdown } from '@/components/admin/SchoolBreakdown'
import { SessionTable } from '@/components/admin/SessionTable'

/** /admin 대시보드 — 세션은 react-query로 캐싱, 필터·정렬 상태의 단일 소스는 URL searchParams */
export function AdminDashboard({ totals }: { totals: Totals }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const queryClient = useQueryClient()
  const { data: sessions, isLoading, isError, isFetching, error } = useSessionsQuery()

  // URL 문자열이 바뀔 때만 필터·정렬을 재파싱 → 파생값 useMemo가 안정적으로 캐시된다.
  const spString = sp.toString()
  const { filters, sort } = useMemo(() => parseFilters(new URLSearchParams(spString)), [spString])

  // "오늘" 경계(KST) 롤오버 반영: 포커스 시 + 1분 주기로 now 갱신.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const iv = setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(iv); window.removeEventListener('focus', tick) }
  }, [])

  const list = sessions ?? []
  const kpis = useMemo(() => computeKpis(list, now), [list, now])
  const schoolStats = useMemo(() => computeSchoolStats(list), [list])
  const schools = useMemo(() => schoolOptions(list), [list])
  const grades = useMemo(() => gradeOptions(list), [list])
  const rows = useMemo(
    () => sortSessions(filterSessions(list, filters, now), sort, totals),
    [list, filters, sort, totals, now],
  )

  const apply = (f: Filters, s: Sort) => {
    const qs = filtersToQuery(f, s)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const patchFilters = (patch: Partial<Filters>) => apply({ ...filters, ...patch }, sort)

  const onKpi = (kind: KpiKind) => {
    if (kind === 'total') apply(DEFAULT_FILTERS, sort)
    else if (kind === 'submitted') patchFilters({ status: filters.status === 'submitted' ? 'all' : 'submitted' })
    else if (kind === 'inProgress') patchFilters({ status: filters.status === 'inProgress' ? 'all' : 'inProgress' })
    else patchFilters({ today: !filters.today })
  }
  const onSort = (key: SortKey) =>
    apply(filters, sort.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'started' || key === 'submitted' ? 'desc' : 'asc' })

  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] }) }

  if (isLoading) return <LoadingOverlay show />
  if (isError || !sessions) return (
    <div className="rounded-[20px] border border-line bg-white p-10 text-center text-sm text-ink-soft shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      데이터를 불러오지 못했어요. {(error as Error | undefined)?.message ?? ''}
    </div>
  )

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <Blip variant="logo" className="h-8 w-8" />
        <div>
          <p className="text-[15px] font-bold">읽기 검사 · 관리자</p>
          <p className="text-[11px] text-ink-mute">행을 누르면 결과지가 열립니다 · 카드와 학교를 누르면 목록이 필터링됩니다</p>
        </div>
        <button type="button" onClick={refresh} disabled={isFetching}
          className="ml-auto flex items-center gap-1.5 rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-50">
          <svg className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
          {isFetching ? '갱신 중' : '새로고침'}
        </button>
      </div>
      <StatsCards kpis={kpis} activeStatus={filters.status} activeToday={filters.today} onSelect={onKpi} />
      <SchoolBreakdown stats={schoolStats} activeSchool={filters.school}
        onSelect={school => patchFilters({ school: filters.school === school ? null : school })} />
      <SessionTable rows={rows} total={sessions.length} totals={totals} filters={filters} sort={sort}
        schools={schools} grades={grades}
        onFilters={patchFilters} onSort={onSort} onReset={() => apply(DEFAULT_FILTERS, DEFAULT_SORT)} />
    </div>
  )
}
