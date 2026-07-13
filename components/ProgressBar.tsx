export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full">
      <p className="mb-1 text-center text-sm text-ink/70">{current} / {total}</p>
      <div className="h-3 w-full overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-sky" style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  )
}
