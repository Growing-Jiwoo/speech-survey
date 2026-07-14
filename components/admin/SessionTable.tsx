'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SessionListRow } from '@/lib/db'
import { filtersToQuery, sessionProgress, type Filters, type Sort, type SortKey, type StatusFilter, type Totals } from '@/lib/adminStats'
import { Select } from '@/components/Select'

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'submitted', label: '제출' },
  { key: 'inProgress', label: '진행 중' },
]

/** 관리자 세션 목록 — 필터/정렬 상태는 부모(AdminDashboard)가 보유, 여기는 표시와 콜백만 */
export function SessionTable({ rows, total, totals, filters, sort, schools, grades, onFilters, onSort, onReset }: {
  rows: SessionListRow[]           // 필터·정렬 적용 완료본
  total: number                    // 전체 세션 수 (빈 상태 문구 분기용)
  totals: Totals
  filters: Filters
  sort: Sort
  schools: string[]
  grades: number[]
  onFilters: (patch: Partial<Filters>) => void
  onSort: (key: SortKey) => void
  onReset: () => void
}) {
  const router = useRouter()
  // 검색 입력은 로컬 상태 + 250ms 디바운스로 URL에 반영
  const [qLocal, setQLocal] = useState(filters.q)
  useEffect(() => { setQLocal(filters.q) }, [filters.q])
  useEffect(() => {
    const t = setTimeout(() => { if (qLocal !== filters.q) onFilters({ q: qLocal }) }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal])

  const hasFilter = filters.q !== '' || filters.status !== 'all'
    || filters.school !== null || filters.grade !== null || filters.today

  // 결과지로 이동했다가 "← 목록"으로 돌아올 때 현재 필터·정렬을 유지하기 위해 back 파라미터로 전달
  const backQuery = filtersToQuery(filters, sort)
  const detailHref = (id: string) => backQuery ? `/admin/${id}?back=${encodeURIComponent(backQuery)}` : `/admin/${id}`

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <input value={qLocal} onChange={e => setQLocal(e.target.value)} placeholder="이름 또는 학교 검색"
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
        {filters.today && <Chip label="오늘 참여" onRemove={() => onFilters({ today: false })} />}
        {filters.school !== null && <Chip label={filters.school} onRemove={() => onFilters({ school: null })} />}
        {filters.grade !== null && <Chip label={`${filters.grade}학년`} onRemove={() => onFilters({ grade: null })} />}
        <div className="ml-auto flex items-center gap-2">
          {hasFilter && (
            <>
              <span className="text-xs text-ink-mute">{rows.length}건 표시</span>
              <button type="button" onClick={onReset} className="text-xs font-bold text-blue underline">초기화</button>
            </>
          )}
        </div>
      </div>
      {/* 긴 학교명 등으로 셀이 줄바꿈되지 않도록 각 셀은 nowrap, 넘치는 폭은 가로 스크롤로 처리 */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <Th label="이름" sortKey="name" sort={sort} onSort={onSort} className="whitespace-nowrap px-5 py-3" />
              <Th label="학교" sortKey="school" sort={sort} onSort={onSort} className="whitespace-nowrap px-4" />
              <th scope="col" className="whitespace-nowrap px-4 font-medium">학년/반</th>
              <th scope="col" className="whitespace-nowrap px-4 font-medium">생년월일</th>
              <Th label="참여일" sortKey="started" sort={sort} onSort={onSort} className="whitespace-nowrap px-4" />
              <Th label="진행률" sortKey="progress" sort={sort} onSort={onSort} className="whitespace-nowrap px-4" />
              <th scope="col" className="whitespace-nowrap px-4 font-medium">검사자 체크리스트</th>
              <th scope="col" className="whitespace-nowrap px-4 pr-5 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const p = sessionProgress(s, totals)
              // 행 어디를 눌러도 결과지로 이동. 이름은 접근성/새 탭용 실제 링크로 유지(중복 이동 방지 위해 전파 차단).
              return (
                <tr key={s.id} onClick={() => router.push(detailHref(s.id))}
                  className="cursor-pointer border-t border-line/60 hover:bg-well">
                  <td className="whitespace-nowrap px-5 py-2.5">
                    <Link href={detailHref(s.id)} onClick={e => e.stopPropagation()} className="font-bold text-blue">{s.child_name}</Link>
                  </td>
                  <td className="whitespace-nowrap px-4">{s.school_name}</td>
                  <td className="whitespace-nowrap px-4">{s.grade}-{s.class_no}</td>
                  <td className="whitespace-nowrap px-4 text-ink-soft">{s.birth_ymd}</td>
                  <td className="whitespace-nowrap px-4 text-ink-soft">{new Date(s.started_at).toLocaleDateString('ko-KR')}</td>
                  <td className="px-4"><ProgressCell recorded={p.recorded} written={p.written} totals={totals} /></td>
                  <td className="whitespace-nowrap px-4">
                    {s.checklist.length > 0
                      ? <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-xs font-bold text-amber">{s.checklist.length}개 영역</span>
                      : <span className="text-xs text-ink-mute">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 pr-5"><StatusBadge submitted={!!s.submitted_at} incomplete={p.incomplete} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="p-8 text-center text-sm text-ink-mute">
          {total === 0 ? '아직 참여한 세션이 없습니다.' : '조건에 맞는 세션이 없습니다.'}
        </p>
      )}
    </>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-blue/10 px-2.5 py-1 text-xs font-bold text-blue">
      {label}
      <button type="button" onClick={onRemove} aria-label={`${label} 필터 제거`} className="leading-none">×</button>
    </span>
  )
}

function Th({ label, sortKey, sort, onSort, className = '' }: {
  label: string; sortKey: SortKey; sort: Sort; onSort: (k: SortKey) => void; className?: string
}) {
  const on = sort.key === sortKey
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`font-medium ${className}`}>
      <button type="button" onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 ${on ? 'font-bold text-ink' : ''}`}>
        {label}{on && <span aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )
}

/** 상태 배지 3단계: 제출 완료(mint) / 제출·미완료 있음(amber) / 진행 중(회색) */
function StatusBadge({ submitted, incomplete }: { submitted: boolean; incomplete: boolean }) {
  if (!submitted)
    return <span className="whitespace-nowrap rounded-full bg-ink/5 px-3 py-1 text-xs font-bold text-ink-mute">진행 중</span>
  if (incomplete)
    return <span className="whitespace-nowrap rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">제출 · 미완료 있음</span>
  return <span className="whitespace-nowrap rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">제출 완료</span>
}

function ProgressCell({ recorded, written, totals }: { recorded: number; written: number; totals: Totals }) {
  return (
    <div className="flex min-w-[140px] flex-col gap-1 py-1.5">
      <Track label="녹음" value={recorded} max={totals.rec} />
      <Track label="쓰기" value={written} max={totals.write} />
    </div>
  )
}

function Track({ label, value, max }: { label: string; value: number; max: number }) {
  const full = value >= max
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-7 text-[10px] text-ink-mute">{label}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/10">
        <span className={`block h-full rounded-full ${full ? 'bg-mint' : 'bg-rec'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-read text-[11px] ${full ? 'text-ink-soft' : 'font-bold text-rec-deep'}`}>{value}/{max}</span>
    </div>
  )
}
