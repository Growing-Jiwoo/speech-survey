// components/survey/WritingItem.tsx — 낱말 쓰기 문항(예/아니오).
// 아동이 낱말을 정확히 쓸 수 있는지 검사자가 관찰해 답한다(선택 전에는 [다음] 비활성).
'use client'
import type { SurveyItem } from '@/lib/items'

export function WritingItem({ item, value, onChange }: {
  item: SurveyItem
  /** 예(true)/아니오(false)/미선택(undefined) */
  value: boolean | undefined
  onChange: (v: boolean) => void
}) {
  return (
    <div className="card mt-3 p-5">
      <p className="text-sm font-bold">학생이 아래의 낱말을 정확하게 쓸 수 있나요?</p>
      <p className="no-select-callout font-read mt-5 text-center text-[38px] font-bold">{item.text}</p>
      <div className="mt-6 flex gap-2.5">
        {([['예', true], ['아니오', false]] as const).map(([label, v]) => (
          <button key={label} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
            className={`h-[52px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
              value === v ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>
      {value === undefined &&
        <p className="mt-3 text-center text-[11px] text-ink-mute">예 / 아니오를 선택해야 다음으로 갈 수 있어요.</p>}
    </div>
  )
}
