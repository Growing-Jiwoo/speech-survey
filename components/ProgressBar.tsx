export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full">
      <p className="mb-1.5 text-xs text-ink-mute">
        문항 <b className="font-read font-semibold text-ink-soft">{current} / {total}</b>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E7ECF8]">
        <div className="h-full rounded-full bg-blue transition-all"
          style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  )
}
