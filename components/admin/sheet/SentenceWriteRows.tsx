// components/admin/sheet/SentenceWriteRows.tsx — 검사지의 문장 쓰기 칸(G2).
// 검사 중 검사자가 기록한 값이라 여기서 다시 채점하지 않는다(읽기 전용).
// 검사지가 어절마다 칸을 나눠 인쇄한 것과 같은 모양으로 보여 준다 — 어절 하나가 1점이다.
import { itemMaxWords } from '@/lib/scoring'
import type { SurveyItem } from '@/lib/items'

export function SentenceWriteRows({ items, writing }: {
  items: SurveyItem[]
  /** itemCode → 정확히 쓴 어절 수(미응답은 키 없음) */
  writing: Partial<Record<string, number>>
}) {
  return (
    <div>
      <div className="flex items-center border-b border-line/60 bg-well px-4 py-1.5 text-[12.5px] font-bold text-ink-soft">
        <span className="flex-1">문항</span>
        <span className="w-20 text-right">점수</span>
      </div>
      {items.map((item, i) => {
        const v = writing[item.code]
        const max = itemMaxWords(item)
        return (
          <div key={item.code} className="flex items-center gap-3 border-b border-line/60 px-4 py-2">
            <span className="w-4 flex-none text-xs font-bold text-ink-mute">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {item.text.trim().split(/\s+/).map((w, k) => (
                <span key={k} className="font-read rounded bg-well px-1.5 py-0.5 text-[16px]">
                  {w}
                </span>
              ))}
            </span>
            <span className="w-20 flex-none text-right text-[13px]"
              aria-label={`${item.text} ${v === undefined ? '미응답' : `${v}점`}`}>
              {/* 미응답은 '—' — 0점(두 어절 모두 오답)과 구분해야 한다 */}
              <b className={`font-read text-[16px] tabular-nums ${v === undefined ? 'text-ink-mute' : v === 0 ? 'text-rec-deep' : 'text-ink'}`}>
                {v === undefined ? '—' : v}
              </b>
              <span className="text-ink-mute"> / {max}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
