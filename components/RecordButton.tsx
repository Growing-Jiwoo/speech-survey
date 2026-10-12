// components/RecordButton.tsx — 대형 녹음 버튼(아동 터치 타깃) + 남은 시간 진행 링.
'use client'
import { useEffect, useRef } from 'react'
import type { RecState } from '@/hooks/useRecorder'

// 진행 링: 반지름 R의 원 둘레(CIRC)를 strokeDasharray로 깔고, 경과 비율만큼
// strokeDashoffset을 늘려 링이 "줄어드는" 카운트다운으로 보이게 한다(-rotate-90으로 12시 시작).
const R = 52
const CIRC = 2 * Math.PI * R

export function RecordButton({ state, onStart, onStop, disabled, maxSec = 20, elapsedMs = 0, success = false }: {
  state: RecState; onStart: () => void; onStop: () => void; disabled?: boolean; maxSec?: number
  /** 녹음 경과(ms) — useRecorder의 단일 시계에서 전달 */
  elapsedMs?: number
  /** 마이크 확인 성공 등 완료 상태를 체크 표시로 나타낸다(대기 상태에서만). */
  success?: boolean
}) {
  const recording = state === 'recording'
  const progress = Math.min(elapsedMs / 1000 / maxSec, 1)

  // 상태가 바뀌면 버튼이 통째로 바뀐다(시작 ↔ 끝내기) — 초점이 이 안에 있었으면 새 버튼으로 옮긴다. 안 옮기면 키보드로 녹음을
  // 시작한 검사자가 멈추려고 Tab을 여러 번 눌러야 했다(2026-10-12 점검). 표시는 초점이 **다른 요소로 옮겨 갔을 때만** 지운다 —
  // 버튼이 DOM에서 빠질 때 브라우저에 따라 상대 없는 blur가 오는데, 그것까지 지우면 옮길 때를 놓친다.
  const wrapRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)
  useEffect(() => {
    if (focusedRef.current) wrapRef.current?.querySelector('button')?.focus()
  }, [recording, success])

  return (
    <div ref={wrapRef} className="relative flex h-[116px] w-[116px] items-center justify-center"
      onFocus={() => { focusedRef.current = true }}
      onBlur={e => {
        const to = e.relatedTarget as Node | null
        if (to && !e.currentTarget.contains(to)) focusedRef.current = false
      }}>
      <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 116 116" aria-hidden="true">
        <circle cx="58" cy="58" r={R} fill="none"
          stroke={!recording && success ? 'var(--color-mint)' : 'var(--color-line)'} strokeWidth="4" />
        {recording && (
          <circle cx="58" cy="58" r={R} fill="none" stroke="var(--color-rec)" strokeWidth="4"
            strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * progress} />
        )}
      </svg>

      {recording ? (
        <button onClick={onStop} aria-label="녹음 끝내기"
          className="-translate-y-0.5 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-rec shadow-[0_4px_0_var(--color-rec-deep),0_16px_24px_-12px_rgba(197,58,62,.45)] transition active:translate-y-[2px]">
          <span className="h-7 w-7 rounded-lg bg-white" />
        </button>
      ) : success ? (
        <button onClick={onStart} disabled={disabled} aria-label="마이크 인식 완료 · 다시 확인"
          className="-translate-y-0.5 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-mint text-white shadow-[0_4px_0_var(--color-mint),0_16px_24px_-12px_rgba(20,160,120,.45)] transition active:translate-y-[2px] disabled:opacity-40">
          <svg className="h-11 w-11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </button>
      ) : (
        <button onClick={onStart} disabled={disabled} aria-label="녹음 시작"
          className="-translate-y-0.5 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-blue text-white shadow-[0_4px_0_var(--color-blue-deep),0_16px_24px_-12px_rgba(30,79,204,.5)] transition active:translate-y-[2px] disabled:opacity-40">
          <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
          </svg>
        </button>
      )}
    </div>
  )
}
