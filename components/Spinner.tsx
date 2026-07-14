/** 인라인 로딩 스피너 — 크기·색은 className으로 조정(기본 currentColor 상속) */
export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg role="status" aria-label="로딩 중" className={`animate-spin ${className}`}
      viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
