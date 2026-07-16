// components/survey/ChecklistItem.tsx — 검사자 체크리스트 문항(발달 영역 다중 선택).
// '특이사항 없음'과 실제 영역은 상호 배타(토글 규칙은 lib/items.toggleChecklistArea).
'use client'
import { CHECKLIST_AREAS } from '@/lib/items'

export function ChecklistItem({ selected, onToggle }: {
  /** 선택된 영역 코드 목록 */
  selected: string[]
  onToggle: (code: string) => void
}) {
  return (
    <div className="card mt-3 p-5">
      <p className="text-sm font-bold leading-relaxed">
        학생의 발달 영역 중 확인이 필요하다고 생각되는 영역에 모두 표시해 주세요.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {CHECKLIST_AREAS.map(a => {
          const on = selected.includes(a.code)
          return (
            <li key={a.code}>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] px-4 py-3 transition ${
                on ? 'border-blue bg-blue/5' : 'border-line bg-well'}`}>
                <input type="checkbox" checked={on} className="mt-0.5 h-5 w-5 accent-[var(--color-blue)]"
                  onChange={() => onToggle(a.code)} />
                <span>
                  <span className="text-sm font-bold">{a.label}</span>
                  {a.hint && <span className="mt-0.5 block text-xs leading-relaxed text-ink-mute">{a.hint}</span>}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {selected.length === 0 &&
        <p className="mt-3 text-center text-[11px] text-ink-mute">해당 사항이 없으면 &ldquo;특이사항 없음&rdquo;을 선택해 주세요.</p>}
    </div>
  )
}
