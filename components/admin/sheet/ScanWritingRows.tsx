// components/admin/sheet/ScanWritingRows.tsx — 스캔본 방식 검사의 쓰기 채점 입력(담당자가 스캔본을 보며 찍는다).
// 화면 방식 검사의 쓰기는 여전히 읽기 전용이다(WritingChips·SentenceWriteRows) — 그 값은 검사 중 입력이 유일한
// 채점 경로라서다. 이 부품은 **쓰기 방식이 scan일 때만** 쓴다(사용자 확정 2026-09-30).
//
// 번호는 기록지 칸 번호다(lib/writing-sheet sheetBoxNo — 받아쓰기 목록·기록지와 같은 번호).
// 낱말 쓰기(G1)는 O/X, 문장 쓰기(G2)는 정확히 쓴 어절 수(0~문항 어절 수). 점수 버튼에는 색을 쓰지 않는다 —
// 0점은 판정이 아니라 받은 점수다(sheet/README 「색은 판정에만」).
import { KIND_LABEL, type SurveyItem } from '@/lib/items'
import { itemMaxWords } from '@/lib/scoring'
import { sheetBoxNo } from '@/lib/writing-sheet'

export function ScanWritingRows({ items, kind, writing, onChange }: {
  items: SurveyItem[]
  kind: 'word' | 'sentence'
  /** itemCode → 정확히 쓴 어절 수(낱말은 0/1). 아직 안 찍은 칸은 키 없음 */
  writing: Partial<Record<string, number>>
  onChange: (code: string, v: number) => void
}) {
  const no = sheetBoxNo(items)   // 기록지 칸 번호(받아쓰기 목록·기록지와 같은 번호)
  if (kind === 'sentence') return (
    <ul className="px-4 py-2">
      {items.map(item => {
        const v = writing[item.code]
        return (
          <li key={item.code} className="flex flex-wrap items-center gap-3 border-b border-line/60 py-2 last:border-b-0">
            <span className="w-5 flex-none text-right text-xs font-bold text-ink-mute">{no.get(item.code)}</span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {item.text.trim().split(/\s+/).map((w, k) => (
                <span key={k} className="font-read rounded bg-well px-1.5 py-0.5 text-[16px]">{w}</span>
              ))}
            </span>
            <span role="group" aria-label={`${item.text} 정확히 쓴 어절 수`} className="flex flex-none gap-1.5">
              {Array.from({ length: itemMaxWords(item) + 1 }, (_, n) => (
                <button key={n} type="button" aria-pressed={v === n} onClick={() => onChange(item.code, n)}
                  className={`h-11 w-11 rounded-lg border-[1.5px] font-read text-lg font-bold tabular-nums transition ${
                    v === n ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-mute'}`}>
                  {n}
                </button>
              ))}
            </span>
          </li>
        )
      })}
    </ul>
  )
  const groups = (['meaning', 'nonsense'] as const)
    .map(k => ({ kind: k, items: items.filter(i => i.kind === k) }))
    .filter(g => g.items.length > 0)
  return (
    <div className="px-4 py-2">
      {groups.map(g => {
        const nos = g.items.map(i => no.get(i.code)!)
        return (
          <div key={g.kind} className="py-1">
            <p className="flex items-baseline justify-between border-b-2 border-line py-2 text-[13.5px] font-bold">
              {KIND_LABEL[g.kind]} 낱말
              <span className="text-[12px] font-normal text-ink-mute">기록지 {Math.min(...nos)}~{Math.max(...nos)}번</span>
            </p>
            <ul>
              {g.items.map(item => {
                const v = writing[item.code]
                const ok = v === undefined ? undefined : v >= 1
                return (
                  <li key={item.code} className="flex items-center gap-3 border-b border-line/60 py-1.5 last:border-b-0">
                    <span className="w-5 flex-none text-right text-xs font-bold text-ink-mute">{no.get(item.code)}</span>
                    <span className="font-read min-w-0 flex-1 truncate text-[20px]">{item.text}</span>
                    <span className="flex flex-none gap-1.5">
                      {([['O', 1], ['X', 0]] as const).map(([label, val]) => (
                        <button key={label} type="button" aria-pressed={ok === (val === 1)}
                          aria-label={`${item.text} ${val === 1 ? '정반응' : '오반응'}`}
                          onClick={() => onChange(item.code, val)}
                          className={`h-11 w-11 rounded-lg border-[1.5px] font-read text-lg font-bold transition ${
                            ok === (val === 1)
                              ? val === 1 ? 'border-mint bg-mint/10 text-mint' : 'border-rec bg-rec/10 text-rec-deep'
                              : 'border-line bg-well text-ink-mute'}`}>
                          {label}
                        </button>
                      ))}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
