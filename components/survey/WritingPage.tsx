// components/survey/WritingPage.tsx — 낱말 쓰기(G1)를 한 페이지에서 체크한다.
// 검사자가 아동이 쓴 결과를 보고 낱말마다 예/아니오를 표시한다(의미 5 + 무의미 5).
// 값은 "정확히 쓴 어절 수"라 낱말 하나짜리 문항에서는 1(예) / 0(아니오)이다
// — 문장 쓰기(G2)와 채점 규칙이 같아 저장 모양을 공유한다(lib/scoring.ts의 itemMaxWords).
'use client'
import { KIND_LABEL, type SurveyItem } from '@/lib/items'

export function WritingPage({ items, value, onChange, onSetAll }: {
  items: SurveyItem[]
  /** itemCode → 정확히 쓴 어절 수(1=예 / 0=아니오 / 미선택은 키 없음) */
  value: Record<string, number>
  onChange: (code: string, v: number) => void
  /** 전체 선택 — 문항 수가 10개라 하나씩 누르는 부담을 덜어 준다 */
  onSetAll: (v: number) => void
}) {
  const answered = items.filter(i => value[i.code] !== undefined).length
  const required = items.length

  return (
    <div className="card mx-auto w-full max-w-2xl p-5 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-blue lg:text-base">학생이 아래 낱말을 정확하게 썼나요?</p>
        <div className="flex gap-1.5">
          {([['모두 예', 1], ['모두 아니오', 0]] as const).map(([label, v]) => (
            <button key={label} type="button" onClick={() => onSetAll(v)}
              className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, idx) => {
          // 의미/무의미가 바뀌는 지점에 구분선을 넣어 검사지와 같은 두 묶음으로 보이게 한다.
          const groupStart = idx === 0 || items[idx - 1].kind !== item.kind
          return (
            <li key={item.code} className={groupStart && idx > 0 ? 'mt-3 border-t border-line pt-3' : ''}>
              {groupStart && (
                <p className="mb-1.5 text-[12px] font-bold text-ink-mute">{KIND_LABEL[item.kind!]} 낱말</p>
              )}
              <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
                <span className="w-5 flex-none text-xs font-bold text-ink-mute">{item.orderNo}</span>
                <span className="font-read min-w-0 flex-1 truncate text-[22px] font-bold lg:text-[28px]">{item.text}</span>
                <div className="flex flex-none gap-1.5">
                  {([['예', 1], ['아니오', 0]] as const).map(([label, v]) => (
                    <button key={label} type="button"
                      aria-pressed={value[item.code] === v} aria-label={`${item.text} ${label}`}
                      onClick={() => onChange(item.code, v)}
                      className={`h-11 min-w-[58px] rounded-lg border-[1.5px] px-2 text-sm font-bold transition ${
                        value[item.code] === v ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {answered < required && (
        <p className="mt-3 text-center text-xs text-ink-mute">
          {required}개 중 {answered}개 선택됨 — 모두 선택해야 다음으로 갈 수 있어요.
        </p>
      )}
    </div>
  )
}
