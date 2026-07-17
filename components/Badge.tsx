// components/Badge.tsx — 상태 pill 공용 컴포넌트.
// "rounded-full bg-*/10 text-* 굵은 소형 라벨" 마크업이 화면마다 복제되던 것을 tone 매핑 한 곳으로 통일.
const TONES = {
  blue: 'bg-blue/10 text-blue',
  mint: 'bg-mint/10 text-mint',
  amber: 'bg-amber/10 text-amber',
  rec: 'bg-rec/10 text-rec-deep',
  mute: 'bg-ink/5 text-ink-mute',
} as const

const SIZES = {
  sm: 'px-2.5 py-0.5',
  md: 'px-3 py-1',
  lg: 'px-3 py-1.5',
} as const

export type BadgeTone = keyof typeof TONES

export function Badge({ tone, size = 'md', className = '', children }: {
  /** 의미 색: blue(완료/선택) · mint(성공) · amber(주의) · rec(경고/누락) · mute(중립) */
  tone: BadgeTone
  size?: keyof typeof SIZES
  className?: string
  children: React.ReactNode
}) {
  return (
    <span className={`whitespace-nowrap rounded-full text-xs font-bold ${SIZES[size]} ${TONES[tone]} ${className}`}>
      {children}
    </span>
  )
}
