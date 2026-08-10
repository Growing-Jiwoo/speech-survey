// components/survey/SentenceWritingPage.tsx — 문장 쓰기(G2)를 한 페이지에서 채점한다.
// 검사자가 아동이 쓴 문장을 보고 **정확하게 쓴 어절 수**를 고른다(검사지의 「0 1 2」와 같다).
// 검사지 중단 규칙 ②: 첫 문장 오반응 시 검사를 중단한다 — 그 시점부터 남은 문항을 잠근다.
//
// 검사지가 문항을 어절 단위 칸으로 쪼개 인쇄한 이유는 어절마다 1점이기 때문이다.
// 화면도 같은 모양으로 어절을 나눠 보여 주되, 점수는 어절 체크의 합이 아니라 검사자가
// 직접 고르게 한다 — 체크의 합으로 만들면 "아직 안 봄"과 "둘 다 틀림(0점)"을 구분할 수 없다.
'use client'
import { itemMaxWords } from '@/lib/scoring'
import type { FormItems, SurveyItem } from '@/lib/items'
import { requiredWritingCodes, writingCeilingHit } from '@/lib/survey-flow'

export function SentenceWritingPage({ form, items, value, onChange }: {
  form: FormItems
  items: SurveyItem[]
  /** itemCode → 정확히 쓴 어절 수(미선택은 키 없음) */
  value: Record<string, number>
  onChange: (code: string, v: number) => void
}) {
  const ceiling = writingCeilingHit(form, value)
  const requiredCodes = requiredWritingCodes(form, items, value)
  const answered = items.filter(i => requiredCodes.has(i.code) && value[i.code] !== undefined).length
  const required = requiredCodes.size

  return (
    <div className="card mx-auto w-full max-w-2xl p-5 lg:p-7">
      <p className="text-sm font-bold text-blue lg:text-base">학생이 아래 문장을 정확하게 썼나요?</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">
        정확하게 쓴 어절의 개수를 골라 주세요. 어절 하나가 1점입니다.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map(item => {
          const locked = ceiling && !requiredCodes.has(item.code)
          const words = item.text.trim().split(/\s+/)
          const max = itemMaxWords(item)
          return (
            <li key={item.code}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-white px-3 py-2.5 ${locked ? 'opacity-40' : ''}`}>
              <span className="w-5 flex-none text-xs font-bold text-ink-mute">{item.orderNo}</span>
              {/* 검사지처럼 어절을 나눠 보여 준다(칸 = 1점) */}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {words.map((w, i) => (
                  <span key={i}
                    className="font-read rounded-lg bg-well px-2 py-1 text-[20px] font-bold lg:text-[24px]">
                    {w}
                  </span>
                ))}
              </span>
              <div className="flex flex-none gap-1.5" role="group"
                aria-label={`${item.text} 정확하게 쓴 어절 수`}>
                {Array.from({ length: max + 1 }, (_, v) => (
                  <button key={v} type="button" disabled={locked}
                    aria-pressed={value[item.code] === v}
                    aria-label={`${item.text} ${v}점`}
                    onClick={() => onChange(item.code, v)}
                    className={`h-11 w-11 rounded-lg border-[1.5px] font-read text-lg font-bold transition disabled:cursor-not-allowed ${
                      value[item.code] === v ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
                    {v}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      {ceiling && (
        <p className="mt-4 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-[13px] font-bold leading-relaxed text-amber">
          첫 문장이 오반응(0점)이라, 검사지 기준에 따라 <b>문장 쓰기를 여기서 중단합니다.</b>
          마무리 단계로 넘어가 주세요.
        </p>
      )}
      {!ceiling && answered < required && (
        <p className="mt-3 text-center text-xs text-ink-mute">
          {required}개 중 {answered}개 선택됨 — 모두 선택해야 다음으로 갈 수 있어요.
        </p>
      )}
    </div>
  )
}
