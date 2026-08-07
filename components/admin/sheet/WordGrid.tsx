// components/admin/sheet/WordGrid.tsx — 검사지의 낱말 격자(가로 배열).
// 낱말 해독은 채점자가 O/X를 찍고(readOnly=false), 낱말 쓰기는 검사 중 기록을 보여준다(readOnly=true).
// 좁은 화면에서는 가로 스크롤로 살린다 — 검사지의 가로 배열을 세로로 접으면 양식이 무너진다.
'use client'

export function WordGrid({ rowLabel, words, marks, onMark, readOnly = false }: {
  /** 행 이름 (예: '의미 낱말') */
  rowLabel: string
  /** { code, text } 순서대로 */
  words: { code: string; text: string }[]
  marks: Partial<Record<string, boolean>>
  onMark?: (code: string, v: boolean) => void
  readOnly?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-stretch border-b border-line/60">
        <div className="flex w-24 flex-none items-center bg-amber/10 px-3 py-2 text-[11.5px] font-bold text-ink-soft print:bg-amber/10">
          {rowLabel}
        </div>
        {words.map(w => {
          const v = marks[w.code]
          return (
            <div key={w.code}
              className="flex w-[92px] flex-none flex-col items-center gap-1 border-l border-line/60 px-1 py-2">
              <span className="font-read text-[15px]">{w.text}</span>
              {readOnly ? (
                // 검사 중 기록 — 채점자가 여기서 바꾸지 않는다. 응답 없음은 '—'.
                <span aria-label={`${w.text} ${v === undefined ? '미응답' : v ? '정반응' : '오반응'}`}
                  className={`font-read text-[15px] font-bold ${
                    v === undefined ? 'text-ink-mute' : v ? 'text-mint' : 'text-rec-deep'}`}>
                  {v === undefined ? '—' : v ? 'O' : 'X'}
                </span>
              ) : (
                <div className="flex gap-0.5">
                  {([['O', true], ['X', false]] as const).map(([label, want]) => (
                    <button key={label} type="button" aria-pressed={v === want}
                      aria-label={`${w.text} ${want ? '정반응' : '오반응'}`}
                      onClick={() => onMark?.(w.code, want)}
                      className={`h-8 w-8 rounded-md border-[1.5px] font-read text-sm font-bold transition print:hidden ${
                        v === want
                          ? want ? 'border-mint bg-mint/10 text-mint' : 'border-rec bg-rec/10 text-rec-deep'
                          : 'border-line bg-well text-ink-mute'}`}>
                      {label}
                    </button>
                  ))}
                  {/* 인쇄물에는 버튼 대신 선택된 표시만 남긴다 (종이 검사지와 같은 모양) */}
                  <span aria-hidden className={`hidden font-read text-[15px] font-bold print:block ${
                    v === undefined ? 'text-ink-mute' : v ? 'text-mint' : 'text-rec-deep'}`}>
                    {v === undefined ? '—' : v ? 'O' : 'X'}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
