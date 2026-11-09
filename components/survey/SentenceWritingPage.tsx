// components/survey/SentenceWritingPage.tsx — 문장 쓰기(G2)를 한 페이지에서 채점한다.
// 검사자가 아동이 쓴 문장을 보고 **어절마다 O/X**를 누른다(담당자 확정 2026-11-09 — 어느 어절이 틀렸는지 데이터에
// 남기려고. 그전에는 문장마다 맞힌 어절 수 0·1·2를 골랐다). 문장 점수는 O의 개수다.
// 처음에는 아무것도 눌려 있지 않고, 한 문장의 어절을 다 눌러야 그 문장이 「선택됨」이 된다(components/EojeolMarks).
'use client'
import { EojeolMarks } from '@/components/EojeolMarks'
import type { SurveyItem } from '@/lib/items'
import type { WriteValue } from '@/lib/scoring'

export function SentenceWritingPage({ items, value, onChange, toggle }: {
  items: SurveyItem[]
  /** 쓰기 방식 고르기(WritingModeToggle) — 카드 맨 위에 둔다 */
  toggle?: React.ReactNode
  /** itemCode → 어절별 O/X(예 'XO'). 다 누르지 않은 문장은 키 없음 */
  value: Record<string, WriteValue>
  onChange: (code: string, marks: string) => void
}) {
  const answered = items.filter(i => value[i.code] !== undefined).length
  const required = items.length

  return (
    <div className="card mx-auto w-full max-w-2xl p-5 tab:max-w-4xl tab:p-7">
      {toggle && <div className="mb-4">{toggle}</div>}
      <p className="text-sm font-bold text-blue tab:text-base">학생이 아래 문장을 정확하게 썼나요?</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">
        어절마다 맞게 썼으면 O, 틀렸으면 X를 눌러 주세요. 어절 하나가 1점이에요.
        {/* [다음]이 꺼진 이유 — 목록 아래에 두면 1024×768에서 접힌 아래로 밀려 보이지 않았다(2026-10-12 점검) */}
        {answered < required && <> <b className="font-bold text-ink-soft">{required}문장 중 {answered}문장 완료</b> — 모두 눌러야 다음으로 갈 수 있어요.</>}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map(item => (
          <li key={item.code}
            className="flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
            <span className="w-5 flex-none pt-1 text-xs font-bold text-ink-mute">{item.orderNo}</span>
            <EojeolMarks text={item.text} value={value[item.code]} onChange={m => onChange(item.code, m)}
              wordClass="text-[20px] font-bold tab:text-[24px]" />
          </li>
        ))}
      </ul>

    </div>
  )
}
