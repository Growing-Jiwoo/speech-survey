'use client'
import { useState } from 'react'
import type { SchoolStat } from '@/lib/adminStats'

const VISIBLE = 6

/**
 * 학교별 참여·제출 현황.
 * 막대 하나에 두 값이 겹쳐 있다 — 연한 부분은 **참여 인원**(최다 학교 대비), 진한 부분은
 * **제출 완료**다. 범례 없이 두니 "0% 인데 막대가 차 있다"로 읽혔다(실사용 지적).
 * 인코딩은 유용하므로 유지하고 목록 아래에 읽는 법을 한 줄 둔다.
 */
export function SchoolBreakdown({ stats, activeSchool, onSelect }: {
  stats: SchoolStat[]; activeSchool: string | null; onSelect: (school: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (stats.length === 0) return null
  const max = stats[0].total
  const shown = expanded ? stats : stats.slice(0, VISIBLE)
  return (
    <div className="border-b border-line px-5 py-4">
      <p className="mb-2 text-[13px] font-bold text-ink-soft">학교별 현황</p>
      <ul className="flex flex-col gap-1">
        {shown.map(st => {
          const on = activeSchool === st.school
          return (
            <li key={st.school}>
              <button type="button" onClick={() => onSelect(st.school)} aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${
                  on ? 'bg-blue/5 ring-[1.5px] ring-blue' : 'hover:bg-well'}`}>
                <span className="w-40 truncate text-sm font-bold lg:w-56" title={st.school}>{st.school}</span>
                <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-ink/5">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-blue/25"
                    style={{ width: `${(st.total / max) * 100}%` }} />
                  <span className="absolute inset-y-0 left-0 rounded-full bg-mint"
                    style={{ width: `${(st.submitted / max) * 100}%` }} />
                </span>
                <span className="w-32 shrink-0 text-right text-xs text-ink-soft">
                  <b className="font-read text-ink">{st.submitted}</b>/{st.total}명 제출
                  <span className="ml-1 text-ink-mute">({Math.round(st.rate * 100)}%)</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-mute">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-5 rounded-full bg-mint" />제출 완료
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-5 rounded-full bg-blue/25" />참여 인원(가장 많은 학교 대비)
        </span>
      </p>
      {stats.length > VISIBLE && (
        <button type="button" onClick={() => setExpanded(v => !v)}
          className="mt-2 text-xs font-bold text-blue">
          {expanded ? '접기' : `전체 ${stats.length}개 학교 보기`}
        </button>
      )}
    </div>
  )
}
