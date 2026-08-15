// components/admin/SessionTable.tsx — 관리자 세션 목록 표(가상화 렌더).
'use client'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper, flexRender, getCoreRowModel, useReactTable, type RowData,
} from '@tanstack/react-table'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { SessionListRow } from '@/lib/db'
import { filtersToQuery, retestOrdinals, sessionProgress, type Filters, type Sort, type SortKey, type Totals } from '@/lib/adminStats'
import { gradeClassLabel } from '@/lib/format'
import { Badge } from '@/components/Badge'
import { BadgeLegend } from '@/components/admin/BadgeLegend'
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
export function SessionTable({ rows, all, total, filters, sort, schools, grades, onFilters, onSort, onReset }: {
  rows: SessionListRow[]           // 필터·정렬 적용 완료본
  /** 필터 이전의 전체 목록 — 재검사 회차를 세는 데 쓴다. 필터된 rows로 세면 걸러진
   *  앞선 검사가 없는 것처럼 보여 회차가 거짓이 된다(retestOrdinals 호출부 주석 참고). */
  all: SessionListRow[]
  total: number                    // 전체 세션 수 (빈 상태 문구 분기용)
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

  // 회차는 **필터를 통과한 rows가 아니라 전체 목록**에서 센다 — "진행 중"만 걸러 본 화면에서
  // 2회차 세션만 남았다고 "1/1회차"로 보이면, 앞선 검사가 없는 것처럼 읽혀 거짓이 된다.
  const retest = useMemo(() => retestOrdinals(all), [all])

  // ---- react-table 컬럼 정의 (셀 마크업·클래스는 기존 디자인 그대로 보존) ----
  const columns = useMemo(() => {
    const col = createColumnHelper<SessionListRow>()
    return [
      col.accessor('child_name', {
        id: 'name', header: '이름',
        meta: { sortKey: 'name', thClassName: 'whitespace-nowrap px-5 py-3', tdClassName: 'whitespace-nowrap px-5 py-2.5' },
        // 재검사한 아동만 "2/2회차" 꼬리표가 붙는다. 이름·학교·번호가 전부 같은 행이
        // 나란히 뜰 때 어느 것이 나중 검사인지 가리는 유일한 단서다(lib/adminStats 참고).
        cell: ({ row }) => {
          const nth = retest.get(row.original.id)
          return (
            <span className="inline-flex items-center gap-1.5">
              <Link href={detailHref(row.original.id)} onClick={e => e.stopPropagation()} className="font-bold text-blue">
                {row.original.child_name}
              </Link>
              {nth && (
                <span className="rounded-full bg-well px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-ink-mute"
                  title={`같은 번호로 ${nth.of}번 검사한 아동의 ${nth.nth}번째 검사입니다`}>
                  {nth.nth}/{nth.of}회차
                </span>
              )}
            </span>
          )
        },
      }),
      col.accessor('school_name', {
        id: 'school', header: '학교',
        meta: { sortKey: 'school', thClassName: 'whitespace-nowrap px-3', tdClassName: 'whitespace-nowrap px-3' },
        cell: ({ row }) => row.original.school_name,
      }),
      col.display({
        id: 'gradeClass', header: '학년/반',
        meta: { sortKey: 'grade', thClassName: 'whitespace-nowrap px-3', tdClassName: 'whitespace-nowrap px-3' },
        cell: ({ row }) => gradeClassLabel(row.original.grade, row.original.class_no),
      }),
      col.accessor('child_no', {
        id: 'childNo', header: '번호',
        meta: { thClassName: 'whitespace-nowrap px-3', tdClassName: 'whitespace-nowrap px-3 tabular-nums text-ink-soft' },
        cell: ({ row }) => row.original.child_no,
      }),
      col.accessor('birth_ymd', {
        id: 'birth', header: '생년월일',
        meta: { thClassName: 'whitespace-nowrap px-3', tdClassName: 'whitespace-nowrap px-3 text-ink-soft' },
        cell: ({ row }) => row.original.birth_ymd,
      }),
      col.display({
        id: 'started', header: '참여일',
        meta: { sortKey: 'started', thClassName: 'whitespace-nowrap px-3', tdClassName: 'whitespace-nowrap px-3 text-ink-soft' },
        cell: ({ row }) => new Date(row.original.started_at).toLocaleDateString('ko-KR'),
      }),
      col.display({
        id: 'submitted', header: '제출일',
        meta: { sortKey: 'submitted', thClassName: 'whitespace-nowrap px-3', tdClassName: 'whitespace-nowrap px-3 text-ink-soft' },
        cell: ({ row }) => row.original.submitted_at ? new Date(row.original.submitted_at).toLocaleDateString('ko-KR') : '—',
      }),
      col.display({
        id: 'progress', header: '진행률',
        meta: { sortKey: 'progress', thClassName: 'whitespace-nowrap px-3', tdClassName: 'px-4' },
        cell: ({ row }) => {
          // 분모는 행마다 다르다 — 그 아동의 학년 검사지 문항 수다.
          const p = sessionProgress(row.original)
          return <ProgressCell recorded={p.recorded} written={p.written} totals={p.expected} />
        },
      }),
      col.display({
        id: 'checklist', header: '체크리스트',
        meta: { thClassName: 'whitespace-nowrap px-3', tdClassName: 'whitespace-nowrap px-3' },
        cell: ({ row }) => row.original.checklist.length > 0
          // 체크리스트 선택은 경고가 아니다 — amber는 '제출 · 미완료 있음'에만 남긴다.
          ? <Badge tone="mute" size="sm">{row.original.checklist.length}개 영역</Badge>
          : <span className="text-xs text-ink-mute">—</span>,
      }),
      col.display({
        id: 'status', header: '상태',
        meta: { thClassName: 'whitespace-nowrap px-4 pr-5', tdClassName: 'whitespace-nowrap px-4 pr-5' },
        cell: ({ row }) => {
          const p = sessionProgress(row.original)
          return <StatusBadge submitted={!!row.original.submitted_at} incomplete={p.incomplete} />
        },
      }),
    ]
    // retest를 빼면 새 재검사가 들어와도 배지가 옛 회차에 머문다 — 목록을 새로고침한
    // 채점자가 "2회차"를 보고 실제로는 3회차인 세션을 열게 된다. retestOrdinals는
    // 전체 목록이 바뀔 때만 새 Map을 내므로 이 의존성이 렌더를 흔들지 않는다.
  }, [detailHref, retest])

  // tanstack table v8은 React Compiler 미호환 목록에 있으나(내부 캐시 뮤테이션),
  // 자체 메모이제이션으로 동작은 안전하다 — v9 호환판이 나올 때까지 경고만 억제.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  // ---- 행 가상화 ----
  // 스크롤 주체는 **페이지(window)**다. 표에 자체 스크롤 상자를 두면 페이지 스크롤과 겹쳐
  // 스크롤바가 둘이 되고, 휠을 굴리다 표에 닿는 순간 스크롤이 표 안에 갇힌다(실측 2026-08-15:
  // 1280×560·세션 8건에서 페이지 428px + 표 70px 이중 스크롤). 목록은 페이지의 본문이지
  // 페이지 안의 독립된 창이 아니므로, 스크롤도 페이지 하나만 갖는다.
  //
  // scrollMargin: window 가상화는 문서 최상단을 원점으로 계산하므로, 표가 문서에서
  // 시작하는 위치를 알려 줘야 한다. 빠뜨리면 필터·통계 카드 높이만큼 행이 어긋난다.
  const listRef = useRef<HTMLDivElement>(null)
  const modelRows = table.getRowModel().rows
  const rowVirtualizer = useWindowVirtualizer({
    count: modelRows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })
  // 필터 툴바와 표 헤더를 **둘 다** 화면 상단에 붙인다. 목록이 길어지면 아래로 내려간 상태에서
  // 검색·필터를 쓰려고 매번 맨 위로 올라가야 했고, 열 이름만 붙어 있으면 지금 어떤 필터가
  // 걸려 있는지도 보이지 않는다.
  //
  // 헤더의 top 오프셋을 상수로 박지 않고 재는 이유: 툴바가 flex-wrap이라 폭이 좁아지면
  // 두 줄·세 줄로 늘어난다. 박아 두면 그 순간 헤더가 툴바를 파고들거나 사이가 벌어진다.
  //
  // 첫 값은 ResizeObserver를 기다리지 않고 **직접 재서** 넣는다. 옵저버 콜백에만 맡기면
  // 그것이 늦거나(혹은 아예 발화하지 않는 환경에서) top이 0으로 남아 헤더가 툴바 뒤에
  // 겹친 채 보인다 — 화면이 깨진 상태로 첫 프레임이 나가는 셈이다. 옵저버는 그 뒤의
  // "폭이 바뀌어 툴바가 두 줄이 됐다" 같은 변화를 따라가는 역할만 맡는다.
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarH, setToolbarH] = useState(0)
  useLayoutEffect(() => {
    const el = toolbarRef.current
    if (!el) return
    setToolbarH(el.getBoundingClientRect().height)
    const ro = new ResizeObserver(([e]) => setToolbarH(e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const scrollMargin = rowVirtualizer.options.scrollMargin
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0
  const paddingBottom = virtualRows.length > 0
    ? totalSize - (virtualRows[virtualRows.length - 1].end - scrollMargin)
    : 0
  const colCount = table.getAllLeafColumns().length

  return (
    <>
      {/* 툴바가 헤더보다 위에 오도록 z를 한 단계 높인다(헤더 z-10).
          lg 미만에서는 아래 래퍼가 가로 스크롤 컨테이너가 되어 sticky 기준이 뷰포트가
          아니게 되므로, 그 폭에서는 둘 다 붙이지 않는다(래퍼 주석 참고). */}
      <div ref={toolbarRef} className="bg-white lg:sticky lg:top-0 lg:z-20">
        <FilterToolbar filters={filters} schools={schools} grades={grades}
          shownCount={rows.length} onFilters={onFilters} onReset={onReset} />
      </div>
      {/* 세로 스크롤은 페이지가 맡는다(위 주석) — 여기서는 좁은 화면의 가로 넘침만 처리한다.
          `overflow-x: auto`는 CSS 규칙상 세로도 auto로 계산시켜 **이 div를 스크롤 컨테이너로
          만든다.** 그러면 안쪽 `sticky`의 기준이 뷰포트가 아니라 이 div가 되어, 헤더가 화면에
          붙는 대신 div와 함께 위로 밀려 나간다(실측 2026-08-15: scrollY 498에서 헤더 y=-68).
          그래서 가로 스크롤은 **실제로 넘치는 폭(lg 미만)에서만** 건다 — lg 이상에서는
          overflow가 visible이라 조상에 스크롤 컨테이너가 없고, 헤더·툴바가 뷰포트에 붙는다.
          (1280px에서 가로 넘침 0, 420px에서 387px — 실측) */}
      <div ref={listRef} className="overflow-x-auto lg:overflow-x-visible">
        <table className="min-w-full text-sm">
          {/* 페이지가 스크롤 주체가 되면서 헤더가 뷰포트 상단에 붙는다 — 표 상자 안이 아니라
              화면 끝까지 따라와, 아래쪽 행을 볼 때도 열 이름이 남는다.
              top은 위 툴바 높이만큼 밀어 둘이 겹치지 않게 한다(실측값, 위 주석 참고). */}
          <thead className="bg-white lg:sticky lg:z-10" style={{ top: toolbarH }}>
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
      <BadgeLegend
        title="상태 읽는 법"
        items={[
          { badge: <Badge tone="mute">진행 중</Badge>, desc: '아직 제출하지 않은 검사입니다.' },
          {
            badge: <Badge tone="amber">제출 · 미완료 있음</Badge>,
            desc: '제출은 됐지만 녹음이나 쓰기가 비어 있습니다.',
          },
          { badge: <Badge tone="mint">제출 완료</Badge>, desc: '받아야 할 녹음·쓰기를 다 받았습니다.' },
          {
            badge: <Badge tone="mute" size="sm">3개 영역</Badge>,
            desc: '검사자가 체크리스트에서 표시한 발달 영역 수입니다.',
          },
        ]}
        note={<>진행률의 분모는 그 아동의 <b>학년 검사지</b> 기준입니다(1학년 쓰기 10문항 · 2학년 5문항).</>}
      />
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
  // 분자가 분모를 넘는 일은 없어야 하지만, 넘더라도 막대가 100%를 넘지 않도록 clamp한다(옛 데이터에 대한 방어).
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-7 text-[12px] text-ink-mute">{label}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/10">
        <span className={`block h-full rounded-full ${full ? 'bg-mint' : 'bg-rec'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-read text-[12.5px] tabular-nums ${full ? 'text-ink-soft' : 'font-bold text-rec-deep'}`}>{value}/{max}</span>
    </div>
  )
}
