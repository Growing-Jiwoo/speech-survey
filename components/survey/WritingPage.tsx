// components/survey/WritingPage.tsx — 낱말 쓰기(G1)를 한 페이지에서 체크한다.
// 검사자가 아동이 쓴 결과를 보고 낱말마다 예/아니오를 표시한다(의미 5 + 무의미 5).
// 검사지 중단 규칙 ②: 의미 낱말 첫 3개 연속 오반응 시 이후 문항을 실시하지 않는다 —
// 해당 시점부터 남은 문항의 입력을 잠그고 안내한다.
// 값은 "정확히 쓴 어절 수"라 낱말 하나짜리 문항에서는 1(예) / 0(아니오)이다
// — 문장 쓰기(G2)와 채점 규칙이 같아 저장 모양을 공유한다(lib/scoring.ts의 itemMaxWords).
'use client'
import { KIND_LABEL, type FormItems, type SurveyItem } from '@/lib/items'
import { CEILING_N, requiredWritingCodes, writingCeilingHit } from '@/lib/survey-flow'

export function WritingPage({ form, items, value, onChange, onSetAll }: {
  form: FormItems
  items: SurveyItem[]
  /** itemCode → 정확히 쓴 어절 수(1=예 / 0=아니오 / 미선택은 키 없음) */
  value: Record<string, number>
  onChange: (code: string, v: number) => void
  /** 전체 선택 — 문항 수가 10개라 하나씩 누르는 부담을 덜어 준다 */
  onSetAll: (v: number) => void
}) {
  const ceiling = writingCeilingHit(form, value)
  const meaningCount = form.meaningWriteCodes.length
  // 중단 시 잠기지 않는 문항 = 중단 판정에 실제로 쓰인 의미 낱말 코드(앞 N개) — lib/survey-flow.ts의
  // requiredWritingCodes가 문항 코드 기준으로 판정하므로, 문항의 나열 순서가 나중에
  // 바뀌더라도(의미/무의미가 섞이더라도) 잠금이 항상 올바른 문항에 걸린다.
  const requiredCodes = requiredWritingCodes(form, items, value)
  const answered = items.filter(i => requiredCodes.has(i.code) && value[i.code] !== undefined).length
  const required = requiredCodes.size

  return (
    <div className="card mx-auto w-full max-w-2xl p-5 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-blue lg:text-base">학생이 아래 낱말을 정확하게 썼나요?</p>
        <div className="flex gap-1.5">
          {([['모두 예', 1], ['모두 아니오', 0]] as const).map(([label, v]) => (
            <button key={label} type="button" onClick={() => onSetAll(v)} disabled={ceiling}
              className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-40">
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, idx) => {
          const locked = ceiling && !requiredCodes.has(item.code)
          // 의미/무의미가 바뀌는 지점에 구분선을 넣어 검사지와 같은 두 묶음으로 보이게 한다.
          const groupStart = idx === 0 || items[idx - 1].kind !== item.kind
          return (
            <li key={item.code} className={groupStart && idx > 0 ? 'mt-3 border-t border-line pt-3' : ''}>
              {groupStart && (
                <p className="mb-1.5 text-[11px] font-bold text-ink-mute">{KIND_LABEL[item.kind!]} 낱말</p>
              )}
              <div className={`flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 ${locked ? 'opacity-40' : ''}`}>
                <span className="w-5 flex-none text-xs font-bold text-ink-mute">{item.orderNo}</span>
                <span className="font-read min-w-0 flex-1 truncate text-[22px] font-bold lg:text-[28px]">{item.text}</span>
                <div className="flex flex-none gap-1.5">
                  {([['예', 1], ['아니오', 0]] as const).map(([label, v]) => (
                    <button key={label} type="button" disabled={locked}
                      aria-pressed={value[item.code] === v} aria-label={`${item.text} ${label}`}
                      onClick={() => onChange(item.code, v)}
                      className={`h-11 min-w-[58px] rounded-lg border-[1.5px] px-2 text-sm font-bold transition disabled:cursor-not-allowed ${
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

      {ceiling && (
        <p className="mt-4 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-[13px] font-bold leading-relaxed text-amber">
          의미 낱말 {meaningCount}개 중 첫 {CEILING_N}개가 모두 오반응이라, 검사지 기준에 따라 <b>낱말 쓰기를 여기서 중단합니다.</b>
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
