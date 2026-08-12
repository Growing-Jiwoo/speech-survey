// components/admin/sheet/WritingChips.tsx — 낱말 쓰기(검사 중 기록, 읽기 전용) 칩 흐름.
// 읽기 전용 정보에 채점 행과 같은 높이(10행)를 쓸 이유가 없다 — 낱말+O/X 칩을 줄바꿈으로
// 흘려 한두 줄에 담는다. 가로 스크롤 없음.
import { KIND_LABEL, type SurveyItem } from '@/lib/items'

export function WritingChips({ items, writing, implemented }: {
  items: SurveyItem[]
  /** itemCode → 정확히 쓴 어절 수(낱말 쓰기는 0/1). 미응답은 키 없음 */
  writing: Partial<Record<string, number>>
  /** 실제로 실시된 문항 코드 — 중단 규칙 ② 이후 문항은 값이 남아 있어도 '미실시'로 적는다.
   *  총점에서도 빠지므로(scoreSession), 여기서 O/X를 보여주면 총점과 어긋난다. */
  implemented: Set<string>
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
            const na = !implemented.has(item.code)
            const v = na ? undefined : writing[item.code]
            const ok = v === undefined ? undefined : v >= 1
            return (
              <span key={item.code}
                aria-label={`${item.text} ${na ? '미실시' : ok === undefined ? '미응답' : ok ? '정반응' : '오반응'}`}
                className={`inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 ${
                  na ? 'bg-well opacity-60' : 'bg-white'}`}>
                <span className="font-read text-[16px]">{item.text}</span>
                <b className={`font-read text-[15px] ${
                  ok === undefined ? 'text-ink-mute' : ok ? 'text-mint' : 'text-rec-deep'}`}>
                  {na ? <span className="text-[11px] font-bold">미실시</span> : ok === undefined ? '—' : ok ? 'O' : 'X'}
                </b>
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
