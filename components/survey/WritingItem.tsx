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
    <div className="card mx-auto w-full max-w-lg p-6 lg:p-8">
      {/* 안내 문구 색을 녹음 문항의 "아래 문장을 소리 내어…"와 같은 파랑으로 통일 */}
      <p className="text-sm font-bold text-blue lg:text-base">학생이 아래의 낱말을 정확하게 쓸 수 있나요?</p>
      {/* 녹음 문항 카드와 같은 고정 최소 높이·중앙 배치(시청 거리 보정 스케일) */}
      <div className="flex min-h-[124px] items-center justify-center lg:min-h-[184px]">
        <p className="no-select-callout font-read text-center text-[44px] font-bold lg:text-[72px]">{item.text}</p>
      </div>
      <div className="mt-2 flex gap-3">
        {([['예', true], ['아니오', false]] as const).map(([label, v]) => (
          <button key={label} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
            className={`h-[60px] flex-1 rounded-xl border-[1.5px] text-base font-bold transition lg:h-[64px] lg:text-lg ${
              value === v ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>
      {value === undefined &&
        <p className="mt-3 text-center text-xs text-ink-mute">예 / 아니오를 선택해야 다음으로 갈 수 있어요.</p>}
    </div>
  )
}
