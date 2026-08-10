// components/survey/MarkPage.tsx — 낱말 해독 의미 낱말의 검사자 현장 채점(O/X).
// 검사지의 중단 규칙("의미 낱말 첫 3개 연속 오반응 시 문장·쓰기 미실시")은 검사 도중 판정해야 하므로,
// 녹음 직후 검사자가 방금 들은 반응을 표시한다. 이 값은 관리자 채점의 초기값이 된다.
// 아동이 아니라 검사자가 보는 화면임을 색·문구로 분명히 한다(아동 화면과 톤을 다르게).
'use client'
import { CEILING_N, readingCeilingHit } from '@/lib/survey-flow'
import { SECTION_LABEL, type FormItems, type SurveyItem } from '@/lib/items'

export function MarkPage({ form, items, marks, onToggle }: {
  form: FormItems
  items: SurveyItem[]
  /** itemCode → 정반응 여부(미채점은 키 없음) */
  marks: Record<string, boolean>
  onToggle: (code: string, correct: boolean) => void
}) {
  const ceiling = readingCeilingHit(form, marks)
  const done = items.filter(i => marks[i.code] !== undefined).length

  return (
    <div className="card mx-auto w-full max-w-2xl border-amber/40 bg-amber/[0.04] p-5 lg:p-7">
      <p className="text-xs font-bold text-amber lg:text-sm">검사자 확인</p>
      <h2 className="mt-1 text-[15px] font-bold lg:text-lg">방금 정확하게 읽은 낱말에 표시해 주세요</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">
        제한 시간({form.form.limits.wordSec}초) 안에 읽은 것만 정반응으로 봅니다. 나중에 녹음을 들으며 고칠 수 있어요.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, idx) => (
          <li key={item.code} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
            <span className="w-5 flex-none text-xs font-bold text-ink-mute">{idx + 1}</span>
            <span className="font-read min-w-0 flex-1 truncate text-[20px] font-medium lg:text-2xl">{item.text}</span>
            <div className="flex flex-none gap-1.5">
              {([['O', true], ['X', false]] as const).map(([label, v]) => (
                <button key={label} type="button" aria-pressed={marks[item.code] === v}
                  aria-label={`${item.text} ${v ? '정반응' : '오반응'}`}
                  onClick={() => onToggle(item.code, v)}
                  className={`h-11 w-11 rounded-lg border-[1.5px] font-read text-lg font-bold transition ${
                    marks[item.code] === v
                      ? v ? 'border-mint bg-mint/10 text-mint' : 'border-rec bg-rec/10 text-rec-deep'
                      : 'border-line bg-well text-ink-mute'}`}>
                  {label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {ceiling && (
        // 검사지: 의미 낱말 첫 3개 연속 오반응 시 문장 읽기유창성·쓰기 과제를 실시하지 않는다.
        <p className="mt-4 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-[13px] font-bold leading-relaxed text-amber">
          의미 낱말 첫 {CEILING_N}개가 모두 오반응이라, 검사지 기준에 따라{' '}
          <b>문장 읽기유창성과 {SECTION_LABEL[form.writingSection]}는 실시하지 않습니다.</b>
          무의미 낱말까지 진행한 뒤 마무리 단계로 넘어갑니다.
        </p>
      )}

      {done < items.length && (
        <p className="mt-3 text-center text-xs text-ink-mute">
          {items.length}개 중 {done}개 표시됨 — 모두 표시해야 다음으로 갈 수 있어요.
        </p>
      )}
    </div>
  )
}
