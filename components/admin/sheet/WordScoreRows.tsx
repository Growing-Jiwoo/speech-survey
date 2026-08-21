// components/admin/sheet/WordScoreRows.tsx — 낱말 해독 채점: 그룹(의미/무의미) 하나의
// sticky 플레이어 바 + 낱말 행 리스트.
//
// 가로 격자(WordGrid)를 세로 행으로 바꾼 이유: 격자는 종이 검사지 재현이 목적이었는데
// 공식 출력물이 PDF 스탬핑으로 옮겨가며 그 목적이 사라졌고, 좁은 화면 가로 스크롤과
// 92px 칸의 밀집만 남았다.
//
// 플레이어 바를 sticky로 두는 이유: 행이 세로로 길어져(7행) 스크롤 중 플레이어가 화면
// 밖으로 나간다 — "들으면서 찍기"가 이 화면의 핵심 동선이므로 지금 듣는 그룹의 플레이어가
// 항상 보여야 한다. 그룹 래퍼가 relative라 다음 그룹에 닿으면 자연스럽게 교대한다.
'use client'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { SurveyItem } from '@/lib/items'

export function WordScoreRows({ audio, items, marks, onMark }: {
  /** sticky 바에 앉는 플레이어(그룹 라벨 포함 — PageAudio) */
  audio: ReactNode
  items: SurveyItem[]
  marks: Partial<Record<string, boolean>>
  onMark: (code: string, v: boolean) => void
}) {
  // sticky 바 높이를 실측해 아래 O/X 버튼의 scroll-margin으로 넘긴다.
  // 왜 실측인가: 키보드로 O/X를 거슬러 올라가면(Shift+Tab) 브라우저는 "화면 안에 있다"고
  // 보고 스크롤하지 않는데, 그 자리가 이 바에 덮여 있어 포커스한 버튼이 보이지 않았다
  // (E2E 2026-08-20 항목 5.18에서 elementFromPoint로 확인). scroll-margin을 주면 브라우저가
  // 확장된 상자를 기준으로 판단해 바 아래로 밀어 준다.
  // 상수로 박지 않는 이유는 같은 파일 SessionTable의 toolbarH와 같다 — PageAudio가
  // flex-wrap이라 재녹음 칩·초과 배지가 붙거나 폭이 좁아지면 두 줄로 늘어난다.
  const barRef = useRef<HTMLDivElement>(null)
  const [barH, setBarH] = useState(0)
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    setBarH(el.getBoundingClientRect().height)
      // ⚠️ contentRect는 **content box**(패딩·보더 제외)다 — 이 바는 py-2.5 + border-b-2라
      // 실제 높이보다 22px 작게 보고돼 포커스한 버튼의 위쪽이 그만큼 덮였다(실측 2026-08-21).
      // 테두리까지 포함한 값이 필요하므로 borderBoxSize를 쓰고, 없으면 실측으로 떨어진다.
    const ro = new ResizeObserver(([e]) =>
      setBarH(e.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="relative border-t border-line"
      // 아래 채점 컨트롤이 이 값을 scroll-margin-top으로 쓴다(globals.css의 .result-sheet 규칙).
      style={{ '--sheet-top-bar': `${barH}px` } as React.CSSProperties}>
      {/* 그룹 머리 — 과제 제목(연한 밴드)보다 한 단계 아래. 아래 경계선을 굵게 둬서
          행 묶음이 어디서 시작하는지 눈에 걸리게 한다. sticky는 배경이 불투명해야 한다. */}
      <div ref={barRef} className="sticky top-0 z-10 border-b-2 border-line bg-white px-4 py-2.5">
        {audio}
      </div>
      {/* 640px부터 2열 — 세로 길이를 절반으로 줄이고, 한 행이 넓어져 낱말과 O/X가
          멀어지는 것도 막는다(행 폭이 좁을수록 낱말↔버튼 시선 이동이 짧다) */}
      <ul className="grid gap-x-10 px-4 py-3 sm:grid-cols-2">
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
