'use client'
import { useState } from 'react'
import type { SchoolStat } from '@/lib/adminStats'

const VISIBLE = 6

/**
 * 학교별 참여·제출 현황. 막대는 **제출률 하나만** 나타낸다(100% = 폭 전체).
 *
 * 이 막대에 인원 규모를 겹쳐 넣던 인코딩(막대 길이 = 최다 학교 대비 인원)은 두 번 오독을
 * 불렀다 — "0%인데 막대가 차 있다", 그리고 "1/1명 100%인데 쥐꼬리만큼 찬다"(2026-08-12).
 * 값 두 개를 막대 하나에 넣는 것을 포기했다: 인원은 오른쪽 "1/1명"이 이미 말한다.
 */
export function SchoolBreakdown({ stats, activeSchool, onSelect }: {
  stats: SchoolStat[]; activeSchool: string | null; onSelect: (school: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (stats.length === 0) return null
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
                {/* 막대는 **제출률 하나만** 나타낸다 — 100%면 폭을 끝까지 채운다.
                    인원 규모를 막대 길이에 겹쳐 넣던 인코딩은 버렸다(사용자 확정 2026-08-12):
                    1/1명 100% 학교가 "조금만 제출한" 것처럼 보였다. 인원은 옆의 "1/1명"이 말한다. */}
                <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-ink/5">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-mint"
                    style={{ width: `${st.rate * 100}%` }} />
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
          <span aria-hidden className="h-2.5 w-5 rounded-full bg-mint" />제출 완료 비율 (막대가 꽉 차면 100%)
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
