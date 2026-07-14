'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SessionListRow } from '@/lib/db'
import { sessionProgress, type Filters, type Sort, type SortKey, type StatusFilter, type Totals } from '@/lib/adminStats'

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
        <select value={filters.school ?? ''} onChange={e => onFilters({ school: e.target.value || null })}
          aria-label="학교 필터"
          className="h-9 rounded-xl border-[1.5px] border-line bg-well px-2.5 text-xs outline-none focus:border-blue">
          <option value="">학교 전체</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.grade ?? ''} onChange={e => onFilters({ grade: e.target.value ? Number(e.target.value) : null })}
          aria-label="학년 필터"
          className="h-9 rounded-xl border-[1.5px] border-line bg-well px-2.5 text-xs outline-none focus:border-blue">
          <option value="">학년 전체</option>
          {grades.map(g => <option key={g} value={g}>{g}학년</option>)}
        </select>
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
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-mute">
            <Th label="이름" sortKey="name" sort={sort} onSort={onSort} className="px-5 py-3" />
            <Th label="학교" sortKey="school" sort={sort} onSort={onSort} />
            <th scope="col" className="font-medium">학년/반</th>
            <th scope="col" className="font-medium">생년월일</th>
            <Th label="시작" sortKey="started" sort={sort} onSort={onSort} />
            <Th label="진행률" sortKey="progress" sort={sort} onSort={onSort} />
            <th scope="col" className="font-medium">체크</th>
            <th scope="col" className="pr-5 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s => {
            const p = sessionProgress(s, totals)
            return (
              <tr key={s.id} className="border-t border-line/60 hover:bg-well">
                <td className="px-5 py-2">
                  <Link href={`/admin/${s.id}`} className="font-bold text-blue">{s.child_name}</Link>
                </td>
                <td>{s.school_name}</td>
                <td>{s.grade}-{s.class_no}</td>
                <td className="text-ink-soft">{s.birth_ymd}</td>
                <td className="text-ink-soft">{new Date(s.started_at).toLocaleString('ko-KR')}</td>
                <td><ProgressCell recorded={p.recorded} written={p.written} totals={totals} /></td>
                <td>
                  {s.checklist.length > 0
                    ? <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-xs font-bold text-amber">{s.checklist.length}개 영역</span>
                    : <span className="text-xs text-ink-mute">—</span>}
                </td>
                <td className="pr-5"><StatusBadge submitted={!!s.submitted_at} incomplete={p.incomplete} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
