// components/survey/WritingPage.tsx — 낱말 쓰기(G1)를 한 페이지에서 체크한다.
// 검사자가 아동이 쓴 결과를 보고 낱말마다 예/아니오를 표시한다(의미 5 + 무의미 5).
// 값은 "정확히 쓴 어절 수"라 낱말 하나짜리 문항에서는 1(예) / 0(아니오)이다
// — 문장 쓰기(G2)와 채점 규칙이 같아 저장 모양을 공유한다(lib/scoring.ts의 itemMaxWords).
'use client'
import { KIND_LABEL, type SurveyItem } from '@/lib/items'

export function WritingPage({ items, value, onChange, onSetAll, toggle }: {
  items: SurveyItem[]
  /** 쓰기 방식 고르기(WritingModeToggle) — 카드 맨 위에 둔다 */
  toggle?: React.ReactNode
  /** itemCode → 정확히 쓴 어절 수(1=예 / 0=아니오 / 미선택은 키 없음) */
  value: Record<string, number>
  onChange: (code: string, v: number) => void
  /** 남은 칸 일괄 선택 — 문항 수가 10개라 하나씩 누르는 부담을 덜어 준다. **고르지 않은 칸만** 채운다:
   *  하나씩 고른 뒤 잘못 누르면 확인 없이 전부 덮였고, 검토 화면은 개수만 보여 잡을 수 없었다(2026-10-08 야간 점검).
   *  그래서 하나라도 고르면 라벨이 「남은 칸 …」으로 바뀌고, 다 고르면 꺼진다. */
  onSetAll: (v: number) => void
}) {
  const answered = items.filter(i => value[i.code] !== undefined).length
  const required = items.length

  // 의미·무의미 두 묶음 — 큰 화면(lg)에서는 기록지처럼 두 열로 나란히 둔다. 한 열이면 1024×768(아이패드 가로)에서 화면 높이를
  // 400px 넘게 넘어 아래 낱말과 안내 줄을 스크롤해야 보였다(2026-10-12 점검).
  const groups: SurveyItem[][] = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last[0].kind === item.kind) last.push(item)
    else groups.push([item])
  }

  return (
    <div className="card mx-auto w-full max-w-2xl p-5 md:max-w-4xl md:p-7">
      {toggle && <div className="mb-4">{toggle}</div>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-blue md:text-base">학생이 아래 낱말을 정확하게 썼나요?</p>
        <div className="flex gap-1.5">
          {([['예', 1], ['아니오', 0]] as const).map(([label, v]) => (
            <button key={label} type="button" onClick={() => onSetAll(v)} disabled={answered === required}
              className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-40">
              {answered === 0 ? `모두 ${label}` : `남은 칸 ${label}`}
            </button>
          ))}
        </div>
      </div>
      {/* [다음]이 꺼진 이유 — 목록 아래에 두면 작은 화면에서 접힌 아래로 밀려 보이지 않았다(2026-10-12 점검) */}
      {answered < required && (
        <p className="mt-1.5 text-xs text-ink-mute">
          {required}개 중 {answered}개 선택됨 — 모두 선택해야 다음으로 갈 수 있어요.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-5">
        {groups.map((group, gi) => (
          // 묶음이 바뀌는 지점에 구분선 — 한 열(좁은 화면)에서만. 두 열이면 열 자체가 나눈다.
          <div key={group[0].code} className={gi > 0 ? 'border-t border-line pt-3 md:border-t-0 md:pt-0' : ''}>
            <p className="mb-1.5 text-[12px] font-bold text-ink-mute">{KIND_LABEL[group[0].kind!]} 낱말</p>
            <ul className="flex flex-col gap-2">
              {group.map(item => (
                <li key={item.code}>
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
                    <span className="w-5 flex-none text-xs font-bold text-ink-mute">{item.orderNo}</span>
                    <span className="font-read min-w-0 flex-1 truncate text-[22px] font-bold md:text-[28px]">{item.text}</span>
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
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
