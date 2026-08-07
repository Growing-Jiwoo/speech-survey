// components/admin/sheet/Subtotal.tsx — 검사지의 소계 행.
// 종이 검사지와 같이 연한 배경 띠 위에 '의미 __/7 · 무의미 __/7 · 총 __/14'를 둔다.
// 채점 결과가 잘 안 보인다는 피드백에 따라 숫자를 본문보다 크게, 총점은 색으로 강조한다.
import { Badge } from '@/components/Badge'
import type { Verdict } from '@/lib/scoring'

interface Cell { label: string; value: number; max: number }

export function Subtotal({ cells, total, verdict }: {
  /** 의미/무의미 같은 부분 점수. 없으면(문장) 총점만 표시한다 */
  cells?: Cell[]
  total: Cell
  verdict?: Verdict
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 border-y border-amber/30 bg-amber/10 px-4 py-2.5 print:bg-amber/10">
      {cells?.map(c => (
        <span key={c.label} className="text-[13px] text-ink-soft">
          {c.label} <b className="text-[15px] tabular-nums text-ink">{c.value}</b>
          <span className="text-ink-mute"> / {c.max}</span>
        </span>
      ))}
      <span className="text-[13px] font-bold text-ink-soft">
        {total.label} <b className="text-[19px] tabular-nums text-blue">{total.value}</b>
        <span className="text-ink-mute"> / {total.max}</span>
      </span>
      {verdict && (
        verdict === 'pass'
          ? <Badge tone="mint" size="lg">Pass</Badge>
          : <Badge tone="rec" size="lg">Fail</Badge>
      )}
    </div>
  )
}
