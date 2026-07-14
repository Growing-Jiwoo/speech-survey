'use client'
import { useEffect, useState } from 'react'
import type { RecState } from '@/hooks/useRecorder'

const R = 52
const CIRC = 2 * Math.PI * R

export function RecordButton({ state, onStart, onStop, disabled, maxSec = 20, success = false }: {
  state: RecState; onStart: () => void; onStop: () => void; disabled?: boolean; maxSec?: number
  /** 마이크 확인 성공 등 완료 상태를 체크 표시로 나타낸다(대기 상태에서만). */
  success?: boolean
}) {
  const recording = state === 'recording'
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!recording) { setElapsed(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100)
    return () => clearInterval(id)
  }, [recording])

  return (
    <div className="relative flex h-[116px] w-[116px] items-center justify-center">
      {/* 동심원 링: 트랙(항상) + 진행(녹음 중). 버튼 바깥으로 균일하게 감싼다. */}
      <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 116 116" aria-hidden="true">
        <circle cx="58" cy="58" r={R} fill="none"
          stroke={!recording && success ? 'var(--color-mint)' : 'var(--color-line)'} strokeWidth="4" />
        {recording && (
          <circle cx="58" cy="58" r={R} fill="none" stroke="var(--color-rec)" strokeWidth="4"
            strokeLinecap="round" strokeDasharray={CIRC}
            strokeDashoffset={CIRC * Math.min(elapsed / maxSec, 1)} />
        )}
      </svg>

      {recording ? (
        <button onClick={onStop} aria-label="녹음 끝내기"
          className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-rec shadow-[0_4px_0_var(--color-rec-deep),0_16px_24px_-12px_rgba(197,58,62,.45)] transition active:translate-y-[2px]">
          <span className="h-7 w-7 rounded-lg bg-white" />
        </button>
      ) : success ? (
        <button onClick={onStart} disabled={disabled} aria-label="마이크 인식 완료 · 다시 확인"
          className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-mint text-white shadow-[0_4px_0_var(--color-mint),0_16px_24px_-12px_rgba(20,160,120,.45)] transition active:translate-y-[2px] disabled:opacity-40">
          <svg className="h-11 w-11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </button>
      ) : (
        <button onClick={onStart} disabled={disabled} aria-label="녹음 시작"
          className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-blue text-white shadow-[0_4px_0_var(--color-blue-deep),0_16px_24px_-12px_rgba(30,79,204,.5)] transition active:translate-y-[2px] disabled:opacity-40">
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
