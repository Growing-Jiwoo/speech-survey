// components/admin/sheet/SentenceWriteRows.tsx — 검사지의 문장 쓰기 칸(G2).
// 검사 중 검사자가 기록한 값이라 여기서 다시 채점하지 않는다(읽기 전용).
// 검사지가 어절마다 칸을 나눠 인쇄한 것과 같은 모양으로 보여 준다 — 어절 하나가 1점이다.
import { itemMaxWords } from '@/lib/scoring'
import type { SurveyItem } from '@/lib/items'

export function SentenceWriteRows({ items, writing, implemented }: {
  items: SurveyItem[]
  /** itemCode → 정확히 쓴 어절 수(미응답은 키 없음) */
  writing: Partial<Record<string, number>>
  /** 실제로 실시된 문항 코드 — 중단 규칙 ② 이후 문항은 값이 남아 있어도 '미실시'로 적는다
   *  (총점에서도 빠진다 — lib/scoring.ts의 scoreSession). */
  implemented: Set<string>
}) {
  return (
    <div>
      <div className="flex items-center border-b border-line/60 bg-well px-4 py-1.5 text-[12.5px] font-bold text-ink-soft">
        <span className="flex-1">문항</span>
        <span className="w-20 text-right">점수</span>
      </div>
      {items.map((item, i) => {
        const na = !implemented.has(item.code)
        const v = na ? undefined : writing[item.code]
        const max = itemMaxWords(item)
        return (
          <div key={item.code}
            className={`flex items-center gap-3 border-b border-line/60 px-4 py-2 ${na ? 'opacity-60' : ''}`}>
            <span className="w-4 flex-none text-xs font-bold text-ink-mute">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {item.text.trim().split(/\s+/).map((w, k) => (
                <span key={k} className="font-read rounded bg-well px-1.5 py-0.5 text-[16px]">
                  {w}
                </span>
              ))}
            </span>
            <span className="w-20 flex-none text-right text-[13px]"
              aria-label={`${item.text} ${na ? '미실시' : v === undefined ? '미응답' : `${v}점`}`}>
              {/* 미응답은 '—' — 0점(두 어절 모두 오답)과 구분해야 한다. 중단 이후 문항은
                  '미실시'로 적어 미응답과도 구분한다(실시하지 않았으므로 채점 대상이 아니다).
                  0점을 경고색으로 칠하지 않는 이유: 이 숫자는 받은 점수를 적은 것뿐이고
                  판정이 아니다(인쇄물의 「0 1 2」 동그라미와 같은 규칙). */}
              {na ? (
                <b className="text-[12px] font-bold text-ink-mute">미실시</b>
              ) : (
                <>
                  <b className={`font-read text-[16px] tabular-nums ${v === undefined ? 'text-ink-mute' : 'text-ink'}`}>
                    {v === undefined ? '—' : v}
                  </b>
                  <span className="text-ink-mute"> / {max}</span>
                </>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
