// components/admin/sheet/WritingChips.tsx — 낱말 쓰기(검사 중 기록, 읽기 전용) 칩 흐름.
// 읽기 전용 정보에 채점 행과 같은 높이(10행)를 쓸 이유가 없다 — 낱말+O/X 칩을 줄바꿈으로
// 흘려 한두 줄에 담는다. 가로 스크롤 없음.
import { KIND_LABEL, type SurveyItem } from '@/lib/items'

export function WritingChips({ items, writing }: {
  items: SurveyItem[]
  /** itemCode → 정확히 쓴 어절 수(낱말 쓰기는 0/1). 미응답은 키 없음 */
  writing: Partial<Record<string, number>>
}) {
  const groups = (['meaning', 'nonsense'] as const)
    .map(kind => ({ kind, items: items.filter(i => i.kind === kind) }))
    .filter(g => g.items.length > 0)
  return (
    // 위아래를 같게 준다 — pb만 있어 과제 제목 띠에 첫 줄이 붙어 있었다.
    <div className="flex flex-col gap-3 px-4 py-3">
      {groups.map(g => (
        <div key={g.kind} className="flex flex-wrap items-center gap-2">
          <span className="w-16 flex-none text-[12.5px] font-bold text-ink-mute">
            {KIND_LABEL[g.kind]} 낱말
          </span>
          {g.items.map(item => {
            const v = writing[item.code]
            const ok = v === undefined ? undefined : v >= 1
            return (
              <span key={item.code}
                aria-label={`${item.text} ${ok === undefined ? '미응답' : ok ? '정반응' : '오반응'}`}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5">
                <span className="font-read text-[16px]">{item.text}</span>
                {/* 미응답은 '—' — 0점(오반응)과 구분해야 한다. */}
                <b className={`font-read text-[15px] ${
                  ok === undefined ? 'text-ink-mute' : ok ? 'text-mint' : 'text-rec-deep'}`}>
                  {ok === undefined ? '—' : ok ? 'O' : 'X'}
                </b>
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
