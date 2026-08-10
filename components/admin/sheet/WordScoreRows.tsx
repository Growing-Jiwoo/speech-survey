// components/admin/sheet/WordScoreRows.tsx — 낱말 해독 채점: 그룹(의미/무의미) 하나의
// sticky 플레이어 바 + 낱말 행 리스트.
//
// 가로 격자(WordGrid)를 세로 행으로 바꾼 이유: 격자는 종이 검사지 재현이 목적이었는데
// 공식 출력물이 PDF 스탬핑으로 옮겨가며 그 목적이 사라졌고, 좁은 화면 가로 스크롤과
// 92px 칸의 밀집만 남았다. 행 리스트는 검사 진행 화면 MarkPage에서 이미 검증된 패턴이다.
//
// 플레이어 바를 sticky로 두는 이유: 행이 세로로 길어져(7행) 스크롤 중 플레이어가 화면
// 밖으로 나간다 — "들으면서 찍기"가 이 화면의 핵심 동선이므로 지금 듣는 그룹의 플레이어가
// 항상 보여야 한다. 그룹 래퍼가 relative라 다음 그룹에 닿으면 자연스럽게 교대한다.
'use client'
import type { ReactNode } from 'react'
import type { SurveyItem } from '@/lib/items'

export function WordScoreRows({ audio, items, marks, onMark }: {
  /** sticky 바에 앉는 플레이어(그룹 라벨 포함 — PageAudio) */
  audio: ReactNode
  items: SurveyItem[]
  marks: Partial<Record<string, boolean>>
  onMark: (code: string, v: boolean) => void
}) {
  return (
    <div className="relative border-t border-line/60">
      <div className="sticky top-0 z-10 border-b border-line/60 bg-white px-4 py-2.5">
        {audio}
      </div>
      {/* 640px부터 2열 — 세로 길이를 절반으로 줄이고, 한 행이 넓어져 낱말과 O/X가
          멀어지는 것도 막는다(행 폭이 좁을수록 낱말↔버튼 시선 이동이 짧다) */}
      <ul className="grid gap-x-10 px-4 py-2 sm:grid-cols-2">
        {items.map(item => {
          const v = marks[item.code]
          return (
            <li key={item.code}
              className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5">
              <span className="font-read min-w-0 truncate text-[20px]">{item.text}</span>
              <div className="flex flex-none gap-1.5">
                {([['O', true], ['X', false]] as const).map(([label, want]) => (
                  <button key={label} type="button" aria-pressed={v === want}
                    aria-label={`${item.text} ${want ? '정반응' : '오반응'}`}
                    onClick={() => onMark(item.code, want)}
                    className={`h-11 w-11 rounded-lg border-[1.5px] font-read text-lg font-bold transition ${
                      v === want
                        ? want ? 'border-mint bg-mint/10 text-mint' : 'border-rec bg-rec/10 text-rec-deep'
                        : 'border-line bg-well text-ink-mute'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
