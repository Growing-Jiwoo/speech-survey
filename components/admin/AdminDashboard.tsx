'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
  const { filters, sort } = parseFilters(new URLSearchParams(sp.toString()))
  const { data: sessions, isLoading, isError, error } = useSessionsQuery()

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
      : { key, dir: key === 'started' ? 'desc' : 'asc' })

  if (isLoading) return <LoadingOverlay show />
  if (isError || !sessions) return (
    <div className="rounded-[20px] border border-line bg-white p-10 text-center text-sm text-ink-soft shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      데이터를 불러오지 못했어요. {(error as Error | undefined)?.message ?? ''}
    </div>
  )

  const now = new Date()
  const kpis = computeKpis(sessions, now)
  const rows = sortSessions(filterSessions(sessions, filters, now), sort, totals)

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <Blip variant="logo" className="h-8 w-8" />
        <div>
          <p className="text-[15px] font-bold">KODYS-G1 읽기 검사 · 관리자</p>
          <p className="text-[11px] text-ink-mute">행을 누르면 결과지가 열립니다 · 카드와 학교를 누르면 목록이 필터링됩니다</p>
        </div>
      </div>
      <StatsCards kpis={kpis} activeStatus={filters.status} activeToday={filters.today} onSelect={onKpi} />
      <SchoolBreakdown stats={computeSchoolStats(sessions)} activeSchool={filters.school}
        onSelect={school => patchFilters({ school: filters.school === school ? null : school })} />
      <SessionTable rows={rows} total={sessions.length} totals={totals} filters={filters} sort={sort}
        schools={schoolOptions(sessions)} grades={gradeOptions(sessions)}
        onFilters={patchFilters} onSort={onSort} onReset={() => apply(DEFAULT_FILTERS, DEFAULT_SORT)} />
    </div>
  )
}
