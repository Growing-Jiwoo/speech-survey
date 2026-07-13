'use client'
import type { RecState } from '@/hooks/useRecorder'

export function RecordButton({ state, onStart, onStop, disabled }: {
  state: RecState; onStart: () => void; onStop: () => void; disabled?: boolean
}) {
  const recording = state === 'recording'
  return (
    <button
      onClick={recording ? onStop : onStart} disabled={disabled}
      className={`h-24 w-24 rounded-full text-4xl shadow-lg transition active:scale-95 disabled:opacity-40
        ${recording ? 'animate-pulse bg-berry text-white' : 'bg-peach-deep text-white'}`}
      aria-label={recording ? '녹음 끝내기' : '녹음 시작'}>
      {recording ? '⏹' : '🎤'}
    </button>
  )
}
