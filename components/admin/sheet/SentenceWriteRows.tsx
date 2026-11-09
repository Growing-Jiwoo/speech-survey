// components/admin/sheet/SentenceWriteRows.tsx — 검사지의 문장 쓰기 칸(G2).
// 검사 중 검사자가 기록한 값이라 여기서 다시 채점하지 않는다(읽기 전용).
// 어절마다 O/X로 보여 준다(담당자 확정 2026-11-09) — 어절 하나가 1점이다. 어절별 채점 전에 받은 문장은
// 맞힌 어절 수만 있어 어느 어절인지 모르므로 숫자만 보인다.
import { itemMaxWords, marksWords, type WriteValue } from '@/lib/scoring'
import type { SurveyItem } from '@/lib/items'

export function SentenceWriteRows({ items, writing }: {
  items: SurveyItem[]
  /** itemCode → 어절별 O/X 글자 또는 (옛 기록) 맞힌 어절 수. 미응답은 키 없음 */
  writing: Partial<Record<string, WriteValue>>
}) {
  return (
    <div>
      <div className="flex items-center border-b border-line/60 bg-well px-4 py-1.5 text-[12.5px] font-bold text-ink-soft">
        <span className="flex-1">문항</span>
        <span className="w-20 text-right">점수</span>
      </div>
      {items.map((item, i) => {
        const v = writing[item.code]
        const marks = typeof v === 'string' ? v : undefined
        const score = typeof v === 'string' ? marksWords(v) : v
        const max = itemMaxWords(item)
        return (
          <div key={item.code}
            className="flex items-center gap-3 border-b border-line/60 px-4 py-2">
            <span className="w-4 flex-none text-xs font-bold text-ink-mute">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
              {item.text.trim().split(/\s+/).map((w, k) => (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className="font-read rounded bg-well px-1.5 py-0.5 text-[16px]">{w}</span>
                  {/* O/X는 받은 점수를 적은 것 — 판정이 아니라 색을 약하게만 쓴다(인쇄물의 동그라미와 같은 규칙) */}
                  {marks && <b className={`font-read text-[15px] ${marks[k] === 'O' ? 'text-mint' : 'text-rec-deep'}`}>{marks[k]}</b>}
                </span>
              ))}
            </span>
            <span className="w-20 flex-none text-right text-[13px]"
              aria-label={`${item.text} ${score === undefined ? '미응답' : `${score}점`}`}>
              {/* 미응답은 '—' — 0점(두 어절 모두 오답)과 구분해야 한다. */}
              <b className={`font-read text-[16px] tabular-nums ${score === undefined ? 'text-ink-mute' : 'text-ink'}`}>
                {score === undefined ? '—' : score}
              </b>
              <span className="text-ink-mute"> / {max}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
