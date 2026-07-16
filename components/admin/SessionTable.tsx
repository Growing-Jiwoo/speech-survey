'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper, flexRender, getCoreRowModel, useReactTable, type RowData,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionListRow } from '@/lib/db'
import { filtersToQuery, sessionProgress, type Filters, type Sort, type SortKey, type StatusFilter, type Totals } from '@/lib/adminStats'
import { Select } from '@/components/Select'

// 컬럼별 정렬 키·셀 클래스를 meta로 실어 헤더/셀 렌더에서 사용한다.
declare module '@tanstack/react-table' {
  // 선언 병합은 원본과 타입 파라미터 이름까지 동일해야 한다(TS2428) — 이 확장에서는 미사용.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    sortKey?: SortKey
    thClassName?: string
    tdClassName?: string
  }
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'submitted', label: '제출' },
  { key: 'inProgress', label: '진행 중' },
]

const ROW_HEIGHT = 56  // 진행률 트랙 2개 기준 예상 행 높이(measureElement로 실측 보정)

/** 관리자 세션 목록 — 필터/정렬 상태는 부모(AdminDashboard)가 보유, 여기는 표시와 콜백만.
 * react-table은 컬럼/가상 렌더 골격으로만 쓰고, 정렬·필터는 기존 URL 동기화 로직을 그대로 사용한다
 * (내장 sorting/filtering 모델은 사용하지 않음 — 이중 정렬/충돌 상태를 피하기 위함). */
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
  // 디바운스 반영. filters.q·onFilters가 바뀌면 타이머가 재장전되지만
  // qLocal === filters.q인 동안은 무동작이라 실질 영향 없다(onFilters는 부모에서 useCallback).
  useEffect(() => {
    const t = setTimeout(() => { if (qLocal !== filters.q) onFilters({ q: qLocal }) }, 250)
    return () => clearTimeout(t)
  }, [qLocal, filters.q, onFilters])

  const hasFilter = filters.q !== '' || filters.status !== 'all'
    || filters.school !== null || filters.grade !== null || filters.today

  // 결과지로 이동했다가 "← 목록"으로 돌아올 때 현재 필터·정렬을 유지하기 위해 back 파라미터로 전달.
  // columns 메모의 의존성이 되므로 useCallback으로 정체성을 backQuery에 고정한다.
  const backQuery = filtersToQuery(filters, sort)
  const detailHref = useCallback(
    (id: string) => backQuery ? `/admin/${id}?back=${encodeURIComponent(backQuery)}` : `/admin/${id}`,
    [backQuery],
  )

  // ---- react-table 컬럼 정의 (셀 마크업·클래스는 기존 디자인 그대로 보존) ----
  const columns = useMemo(() => {
    const col = createColumnHelper<SessionListRow>()
    return [
      col.accessor('child_name', {
        id: 'name', header: '이름',
        meta: { sortKey: 'name', thClassName: 'whitespace-nowrap px-5 py-3', tdClassName: 'whitespace-nowrap px-5 py-2.5' },
        cell: ({ row }) => (
          <Link href={detailHref(row.original.id)} onClick={e => e.stopPropagation()} className="font-bold text-blue">
            {row.original.child_name}
          </Link>
        ),
      }),
      col.accessor('school_name', {
        id: 'school', header: '학교',
        meta: { sortKey: 'school', thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4' },
        cell: ({ row }) => row.original.school_name,
      }),
      col.display({
        id: 'gradeClass', header: '학년/반',
        meta: { sortKey: 'grade', thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4' },
        cell: ({ row }) => `${row.original.grade}-${row.original.class_no}`,
      }),
      col.accessor('birth_ymd', {
        id: 'birth', header: '생년월일',
        meta: { thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4 text-ink-soft' },
        cell: ({ row }) => row.original.birth_ymd,
      }),
      col.display({
        id: 'started', header: '참여일',
        meta: { sortKey: 'started', thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4 text-ink-soft' },
        cell: ({ row }) => new Date(row.original.started_at).toLocaleDateString('ko-KR'),
      }),
      col.display({
        id: 'submitted', header: '제출일',
        meta: { sortKey: 'submitted', thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4 text-ink-soft' },
        cell: ({ row }) => row.original.submitted_at ? new Date(row.original.submitted_at).toLocaleDateString('ko-KR') : '—',
      }),
      col.display({
        id: 'progress', header: '진행률',
        meta: { sortKey: 'progress', thClassName: 'whitespace-nowrap px-4', tdClassName: 'px-4' },
        cell: ({ row }) => {
          const p = sessionProgress(row.original, totals)
          return <ProgressCell recorded={p.recorded} written={p.written} totals={totals} />
        },
      }),
      col.display({
        id: 'checklist', header: '검사자 체크리스트',
        meta: { thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4' },
        cell: ({ row }) => row.original.checklist.length > 0
          ? <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-xs font-bold text-amber">{row.original.checklist.length}개 영역</span>
          : <span className="text-xs text-ink-mute">—</span>,
      }),
      col.display({
        id: 'status', header: '상태',
        meta: { thClassName: 'whitespace-nowrap px-4 pr-5', tdClassName: 'whitespace-nowrap px-4 pr-5' },
        cell: ({ row }) => {
          const p = sessionProgress(row.original, totals)
          return <StatusBadge submitted={!!row.original.submitted_at} incomplete={p.incomplete} />
        },
      }),
    ]
  }, [totals, detailHref])

  // tanstack table v8은 React Compiler 미호환 목록에 있으나(내부 캐시 뮤테이션),
  // 자체 메모이제이션으로 동작은 안전하다 — v9 호환판이 나올 때까지 경고만 억제.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  // ---- 행 가상화 ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const modelRows = table.getRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0
  const colCount = table.getAllLeafColumns().length

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <input value={qLocal} onChange={e => setQLocal(e.target.value)} placeholder="이름·학교·담임·반 검색"
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
              <span className="text-xs text-ink-mute">{rows.length}건 표시</span>
              <button type="button" onClick={onReset} className="text-xs font-bold text-blue underline">초기화</button>
            </>
          )}
        </div>
      </div>
      {/* 세로 가상화를 위한 스크롤 컨테이너. 긴 학교명 등은 셀 nowrap + 가로 스크롤로 처리. */}
      <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="text-left text-xs text-ink-mute">
                {hg.headers.map(h => {
                  const meta = h.column.columnDef.meta
                  const label = flexRender(h.column.columnDef.header, h.getContext())
                  const sortKey = meta?.sortKey
                  const on = sortKey !== undefined && sort.key === sortKey
                  return (
                    <th key={h.id} scope="col"
                      aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={`font-medium ${meta?.thClassName ?? 'px-4'}`}>
                      {sortKey !== undefined ? (
                        <button type="button" onClick={() => onSort(sortKey)}
                          className={`inline-flex items-center gap-0.5 ${on ? 'font-bold text-ink' : ''}`}>
                          {label}{on && <span aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                        </button>
                      ) : label}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && <tr><td colSpan={colCount} style={{ height: paddingTop }} /></tr>}
            {virtualRows.map(vr => {
              const row = modelRows[vr.index]
              return (
                <tr key={row.id} data-index={vr.index} ref={rowVirtualizer.measureElement}
                  onClick={() => router.push(detailHref(row.original.id))}
                  className="cursor-pointer border-t border-line/60 hover:bg-well">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName ?? 'px-4'}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {paddingBottom > 0 && <tr><td colSpan={colCount} style={{ height: paddingBottom }} /></tr>}
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
