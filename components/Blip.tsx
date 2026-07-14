import { useId } from 'react'

type Variant = 'logo' | 'idle' | 'recording'

/** 블립 — 로고 + 녹음 상태등. 감정 연출(축하·응원) 변형은 만들지 않는다(스펙: 평가 비노출). */
export function Blip({ variant = 'idle', className }: { variant?: Variant; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const g = `blip-g-${uid}`, e = `blip-e-${uid}`
  const defs = (
    <defs>
      <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5A90FF" /><stop offset="1" stopColor="#2454DB" />
      </linearGradient>
      <radialGradient id={e} cx="38%" cy="32%" r="75%">
        <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#DCE6FF" />
      </radialGradient>
    </defs>
  )

  if (variant === 'logo') return (
    <svg viewBox="0 0 56 60" className={className} role="img" aria-label="말하기 설문 로고">
      {defs}
      <line x1="28" y1="12" x2="28" y2="5" stroke="#22335C" strokeWidth="3" strokeLinecap="round" />
      <circle cx="28" cy="4" r="3.5" fill="#2F6BFF" />
      <rect x="4" y="13" width="48" height="42" rx="15" fill={`url(#${g})`} />
      <circle cx="20" cy="31" r="7" fill={`url(#${e})`} /><circle cx="36" cy="31" r="7" fill={`url(#${e})`} />
      <g className="blip-blink">
        <circle cx="21" cy="32" r="3.5" fill="#0E1526" /><circle cx="37" cy="32" r="3.5" fill="#0E1526" />
      </g>
      <path d="M21 43 Q28 48 35 43" fill="none" stroke="#0E1526" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )

  const rec = variant === 'recording'
  const eyeY = rec ? 66 : 68
  return (
    <svg viewBox="0 0 140 132" className={className} role="img" aria-label={rec ? '녹음 중' : '블립'}>
      {defs}
      <ellipse cx="70" cy="124" rx="40" ry="7" fill="#1E3A86" opacity=".12" />
      <line x1="70" y1="30" x2="70" y2="15" stroke="#22335C" strokeWidth="4.5" strokeLinecap="round" />
      <circle className={rec ? 'blip-antpulse' : undefined} cx="70" cy="11" r="7.5"
        fill={rec ? '#E5484D' : '#2F6BFF'} />
      <rect x="28" y="32" width="84" height="76" rx="27" fill={`url(#${g})`} />
      <rect x="38" y="41" width="48" height="17" rx="8.5" fill="#fff" opacity=".14" />
      <circle cx="54" cy={eyeY} r="13" fill={`url(#${e})`} /><circle cx="86" cy={eyeY} r="13" fill={`url(#${e})`} />
      <g className="blip-blink">
        <circle cx="56" cy={eyeY + 2} r="6.5" fill="#0E1526" /><circle cx="88" cy={eyeY + 2} r="6.5" fill="#0E1526" />
      </g>
      {rec
        ? <ellipse cx="70" cy="92" rx="7" ry="9" fill="#0E1526" />
        : <path d="M58 89 Q70 96 82 89" fill="none" stroke="#0E1526" strokeWidth="4" strokeLinecap="round" />}
      <rect x="46" y="108" width="18" height="11" rx="5.5" fill="#2454DB" />
      <rect x="76" y="108" width="18" height="11" rx="5.5" fill="#2454DB" />
    </svg>
  )
}
