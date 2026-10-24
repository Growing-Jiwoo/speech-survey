'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_FILTERS, DEFAULT_SORT, computeKpis, computeSchoolStats, filterSessions, filtersToQuery,
  gradeOptions, kstDateKey, parseFilters, schoolOptions, sortSessions,
  type Filters, type Sort, type SortKey,
} from '@/lib/adminStats'
import { adminKeys, useClassCodesQuery, useSessionsQuery } from '@/hooks/useAdminQueries'
import { NETWORK_ERR_MSG, postJson } from '@/lib/http'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { ClassSheets } from '@/components/admin/ClassSheets'
import { StatsCards, type KpiKind } from '@/components/admin/StatsCards'
import { SchoolBreakdown } from '@/components/admin/SchoolBreakdown'
import { SessionTable } from '@/components/admin/SessionTable'

/** /admin 대시보드 — 세션은 react-query로 캐싱, 필터·정렬 상태의 단일 소스는 URL searchParams */
export function AdminDashboard() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const queryClient = useQueryClient()
  const { data: sessions, isLoading, isError, isFetching, error } = useSessionsQuery()
  // 승인 대기 신청 수 — 신청 알림 메일은 10분에 한 번만 나가(app/api/apply) 그 안의 두 번째 신청부터는 메일이 없다.
  // 메일을 놓쳐도 관리자가 이 화면에서 알게 머리에 띠로 둔다(2026-10-12 점검 X5). 코드 목록 쿼리를 그대로 쓴다 — 발급 화면으로
  // 가면 캐시로 바로 뜬다. 못 받으면 띠만 없다(목록 쪽 안내가 로그인을 맡는다).
  const { data: codes } = useClassCodesQuery()
  const pendingCount = (codes ?? []).filter(c => c.status === 'pending').length

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

  const list = useMemo(() => sessions ?? [], [sessions])
  // "오늘" 파생값은 Date가 아닌 KST 일자 키(문자열)에 의존시킨다 — now는 1분마다 바뀌지만
  // 날짜가 그대로면 KPI·필터·정렬(최대 5,000행)을 재계산하지 않는다.
  const todayKey = kstDateKey(now)
  const kpis = useMemo(() => computeKpis(list, todayKey), [list, todayKey])
  const schoolStats = useMemo(() => computeSchoolStats(list), [list])
  const schools = useMemo(() => schoolOptions(list), [list])
  const grades = useMemo(() => gradeOptions(list), [list])
  // 진행률 분모는 행마다 다르다(학년별 검사지) — 서버가 행마다 계산해 싣는다(`progress`, lib/session-progress).
  const rows = useMemo(
    () => sortSessions(filterSessions(list, filters, todayKey), sort),
    [list, filters, sort, todayKey],
  )

  // SessionTable의 검색 디바운스 effect가 onFilters를 의존성으로 갖도록(정직한 deps)
  // 콜백 정체성을 안정화한다.
  const apply = useCallback((f: Filters, s: Sort) => {
    const qs = filtersToQuery(f, s)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname])
  const patchFilters = useCallback(
    (patch: Partial<Filters>) => apply({ ...filters, ...patch }, sort),
    [apply, filters, sort],
  )

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

  const refresh = () => { void queryClient.invalidateQueries({ queryKey: adminKeys.sessions }) }

  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutErr, setLogoutErr] = useState('')
  async function logout() {
    setLoggingOut(true); setLogoutErr('')
    const r = await postJson('/api/admin/logout')
    setLoggingOut(false)
    // 실패하면 이동하지 않는다 — 전에는 실패해도 로그인 화면으로 넘어가 로그아웃된 줄 알았는데, 쿠키가 남아 /admin을 다시 열면
    // 아동 목록이 그대로 보였다(2026-10-12 점검). 공용 PC에서 자리를 뜨기 전에 누르는 버튼이라 실패를 알려야 한다.
    if (!r.ok) { setLogoutErr(r.status === 0 ? NETWORK_ERR_MSG : '로그아웃하지 못했어요. 다시 눌러 주세요.'); return }
    queryClient.clear() // 공용 PC 대비: 캐시에 남은 아동 PII 제거
    router.replace('/admin/login')
  }

  const errMsg = (error as Error | undefined)?.message ?? ''
  const expired = isError && /\(401\)/.test(errMsg)
  // 다시 로그인하면 **지금 화면**(걸어 둔 필터 포함)으로 돌아온다 — `next=/admin` 고정이라 필터가 풀렸다(2026-10-12 점검)
  const loginHref = `/admin/login?next=${encodeURIComponent(spString ? `${pathname}?${spString}` : pathname)}`
  if (isLoading) return <LoadingOverlay show />
  // 목록을 이미 받았으면 다시 받기 실패로 표를 내리지 않는다(결과지와 같은 규칙 — 2026-10-08 야간 점검).
  // 새로고침·로그아웃 버튼까지 사라져 빠져나갈 길이 없었다.
  if (!sessions) return (
    <div className="rounded-[20px] border border-line bg-white p-10 text-center text-sm text-ink-soft shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      {expired ? <>로그인이 끝났어요(8시간). <Link href={loginHref} className="font-bold text-blue underline">다시 로그인</Link></>
        : <>데이터를 불러오지 못했어요. {errMsg} <button type="button" onClick={refresh} className="font-bold underline">다시 시도</button></>}
    </div>
  )

  return (
    // overflow-hidden이면 이 카드가 스크롤 컨테이너가 되어 **안쪽 sticky의 기준이 뷰포트가
    // 아니라 이 카드**가 된다 — 카드는 세로로 스크롤하지 않으므로 필터 툴바·표 헤더가
    // 화면에 붙지 못하고 카드와 함께 밀려 나간다(실측 2026-08-15). clip은 같은 모서리
    // 클리핑을 주되 스크롤 컨테이너를 만들지 않는다(결과지 카드도 같은 이유로 clip이다).
    <div className="overflow-clip rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <Blip variant="logo" className="h-8 w-8" />
        <div>
          <p className="text-[15px] font-bold">읽기 검사 · 관리자</p>
          <p className="text-[12px] text-ink-mute">행을 누르면 결과지가 열려요 · 카드와 학교를 누르면 목록을 걸러 볼 수 있어요</p>
        </div>
        <Link href="/admin/codes"
          className="ml-auto rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
          학급 코드 발급
        </Link>
        <button type="button" onClick={refresh} disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-50">
          <svg className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
          {isFetching ? '갱신 중' : '새로고침'}
        </button>
        <button type="button" onClick={() => void logout()} disabled={loggingOut}
          className="rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-50">
          {loggingOut ? '로그아웃 중…' : '로그아웃'}
        </button>
        {logoutErr && <p role="alert" className="w-full text-right text-[13px] font-bold text-rec-deep">{logoutErr}</p>}
      </div>
      {isError && (
        <p role="alert" className="border-b border-amber/40 bg-amber/10 px-5 py-2 text-[13px] text-amber">
          {expired ? <>로그인이 끝났어요(8시간). <Link href={loginHref} className="font-bold underline">다시 로그인</Link>하면 목록이 갱신돼요.</>
            : <>목록을 다시 받지 못했어요. 연결을 확인해 주세요. 아래는 마지막으로 받은 목록이에요.</>}
        </p>
      )}
      {/* 승인 대기 신청 — 0건이면 없다. 알림 메일을 놓쳐도 여기서 보인다(위 pendingCount 주석) */}
      {pendingCount > 0 && (
        <Link href="/admin/codes"
          className="flex items-center gap-2 border-b border-amber/40 bg-amber/10 px-5 py-2 text-[13px] font-bold text-amber transition hover:bg-amber/15">
          승인 대기 신청 {pendingCount}건 →
          <span className="font-medium text-ink-mute">선생님이 학급 코드를 기다리고 있어요</span>
        </Link>
      )}
      <StatsCards kpis={kpis} filters={filters} onSelect={onKpi} />
      <SchoolBreakdown stats={schoolStats} activeSchool={filters.school}
        onSelect={school => patchFilters({ school: filters.school === school ? null : school })} />
      {/* 학교를 고르면(막대·학교 필터 어느 쪽이든) 그 학교의 학급마다 결과지 받기 — 담당자 요청(2026-10-24). 학급은 코드 목록에서
          고른다(검사가 있는 발급 코드). 학교가 바뀌면 오류 문구가 남지 않게 key로 새로 그린다 */}
      {filters.school && (
        <ClassSheets key={filters.school} school={filters.school} loginHref={loginHref}
          classes={(codes ?? [])
            .filter(c => c.status === 'active' && c.school_name === filters.school && c.session_count > 0)
            .sort((a, b) => a.grade - b.grade || a.class_no - b.class_no)} />
      )}
      <SessionTable rows={rows} all={sessions} total={sessions.length} filters={filters} sort={sort}
        schools={schools} grades={grades}
        onFilters={patchFilters} onSort={onSort} onReset={() => apply(DEFAULT_FILTERS, DEFAULT_SORT)} />
    </div>
  )
}
