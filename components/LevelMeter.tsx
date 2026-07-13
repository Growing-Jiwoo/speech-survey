'use client'
/** 녹음 중 목소리 크기를 토끼 귀 바 5개로 표시 */
export function LevelMeter({ level }: { level: number }) {
  const bars = [0.05, 0.15, 0.3, 0.5, 0.7]
  return (
    <div className="flex h-10 items-end justify-center gap-1.5" aria-label="목소리 크기">
      {bars.map((t, i) => (
        <div key={i}
          className={`w-3 rounded-full transition-all duration-75 ${level > t ? 'bg-mint' : 'bg-ink/10'}`}
          style={{ height: `${(i + 1) * 8}px` }} />
      ))}
    </div>
  )
}
