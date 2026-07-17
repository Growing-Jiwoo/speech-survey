// components/admin/SessionTable.tsx — 관리자 세션 목록 표(가상화 렌더).
'use client'
import { useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper, flexRender, getCoreRowModel, useReactTable, type RowData,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionListRow } from '@/lib/db'
import { filtersToQuery, sessionProgress, type Filters, type Sort, type SortKey, type Totals } from '@/lib/adminStats'
import { Badge } from '@/components/Badge'
import { FilterToolbar } from '@/components/admin/FilterToolbar'

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
          ? <Badge tone="amber" size="sm">{row.original.checklist.length}개 영역</Badge>
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
      <FilterToolbar filters={filters} schools={schools} grades={grades}
        shownCount={rows.length} onFilters={onFilters} onReset={onReset} />
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
                          className={`inline-flex items-center gap-0.5 transition-colors hover:text-ink ${on ? 'font-bold text-ink' : ''}`}>
                          {label}
                          {/* 정렬 방향 화살표(활성). 비활성 헤더에는 흐린 ↕로 정렬 가능함을 상시 표시. */}
                          {on
                            ? <span aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>
                            : <span aria-hidden className="text-ink-mute/40">↕</span>}
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
                // 행 전체 클릭은 마우스 편의용(키보드·새 탭 열기는 이름 셀의 실제 Link가 담당).
                // 수정자 키(Cmd/Ctrl/Shift) 클릭은 가로채지 않는다 — 링크 기대 동작 존중.
                <tr key={row.id} data-index={vr.index} ref={rowVirtualizer.measureElement}
                  onClick={e => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return
                    router.push(detailHref(row.original.id))
                  }}
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

/** 상태 배지 3단계: 제출 완료(mint) / 제출·미완료 있음(amber) / 진행 중(회색) */
function StatusBadge({ submitted, incomplete }: { submitted: boolean; incomplete: boolean }) {
  if (!submitted) return <Badge tone="mute">진행 중</Badge>
  if (incomplete) return <Badge tone="amber">제출 · 미완료 있음</Badge>
  return <Badge tone="mint">제출 완료</Badge>
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
      <span className={`font-read text-[11px] tabular-nums ${full ? 'text-ink-soft' : 'font-bold text-rec-deep'}`}>{value}/{max}</span>
    </div>
  )
}
