// components/admin/sheet/ScanWritingRows.tsx — 스캔본 방식 검사의 쓰기 채점 입력(담당자가 스캔본을 보며 찍는다).
// 화면 방식 검사의 쓰기는 여전히 읽기 전용이다(WritingChips·SentenceWriteRows) — 그 값은 검사 중 입력이 유일한
// 채점 경로라서다. 이 부품은 **쓰기 방식이 scan일 때만** 쓴다(사용자 확정 2026-09-30).
//
// 번호는 기록지 칸 번호다(lib/writing-sheet sheetBoxNo — 받아쓰기 목록·기록지와 같은 번호).
// 낱말 쓰기(G1)는 낱말마다 O/X, 문장 쓰기(G2)는 **어절마다 O/X**(담당자 확정 2026-11-09 — components/EojeolMarks).
// 어절별 채점 전에 받은 1점 문장은 migration 011이 지웠다 — 담당자가 스캔본을 보고 다시 누른다.
import { KIND_LABEL, type SurveyItem } from '@/lib/items'
import { EojeolMarks } from '@/components/EojeolMarks'
import type { WriteValue } from '@/lib/scoring'
import { sheetBoxNo } from '@/lib/writing-sheet'

export function ScanWritingRows({ items, kind, writing, onChange }: {
  items: SurveyItem[]
  kind: 'word' | 'sentence'
  /** itemCode → 낱말은 0/1, 문장은 어절별 O/X 글자. 아직 안 찍은 칸은 키 없음 */
  writing: Partial<Record<string, WriteValue>>
  onChange: (code: string, v: WriteValue) => void
}) {
  const no = sheetBoxNo(items)   // 기록지 칸 번호(받아쓰기 목록·기록지와 같은 번호)
  if (kind === 'sentence') return (
    <ul className="px-4 py-2">
      {items.map(item => (
        <li key={item.code} className="flex items-start gap-3 border-b border-line/60 py-2 last:border-b-0">
          <span className="w-5 flex-none pt-1 text-right text-xs font-bold text-ink-mute">{no.get(item.code)}</span>
          <EojeolMarks text={item.text} value={writing[item.code]} onChange={m => onChange(item.code, m)}
            wordClass="text-[16px]" />
        </li>
      ))}
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
                const ok = v === undefined ? undefined : Number(v) >= 1
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
