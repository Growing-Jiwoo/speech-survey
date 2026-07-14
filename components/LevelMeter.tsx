'use client'
/** 목소리 크기 막대 5개 — "기계가 듣고 있다"는 기능 피드백 (칭찬 신호 아님) */
const BARS = [
  { h: 16, t: 0.05 }, { h: 30, t: 0.15 }, { h: 44, t: 0.3 }, { h: 28, t: 0.5 }, { h: 18, t: 0.7 },
]

export function LevelMeter({ level }: { level: number }) {
  return (
    <div className="flex h-11 items-end justify-center gap-[7px]" aria-label="목소리 크기">
      {BARS.map((b, i) => (
        <div key={i}
          className={`w-2 rounded-full transition-colors duration-75 ${level > b.t ? 'bg-blue' : 'bg-line'}`}
          style={{ height: b.h }} />
      ))}
    </div>
  )
}
