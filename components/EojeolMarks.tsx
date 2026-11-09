// components/EojeolMarks.tsx — 문장 쓰기(G2) 한 문장의 **어절별 O/X** 입력(담당자 확정 2026-11-09).
// 검사 화면(SentenceWritingPage)과 관리자 스캔본 채점(ScanWritingRows)이 같은 부품을 쓴다.
//
// 처음에는 아무것도 눌려 있지 않다 — 기본값을 O로 두면 「아직 안 봄」과 「다 맞음」을 구분할 수 없다.
// 어절을 다 누르기 전의 값은 이 부품 안에만 둔다: 위로는 **문장이 완성됐을 때만** 'OX' 같은 글자로 올린다
// (덜 누른 문장을 저장하면 점수가 없는 행이 생긴다). 그래서 덜 누른 채 다른 화면으로 가면 그 문장은 비어 있다.
// 위에서 받은 값이 숫자(어절별 기록이 없는 옛 기록)면 어느 어절인지 모르므로 아무것도 눌리지 않은 것으로 보인다.
'use client'
import { useState } from 'react'
import type { WriteValue } from '@/lib/scoring'

export function EojeolMarks({ text, value, onChange, wordClass }: {
  text: string
  value: WriteValue | undefined
  onChange: (marks: string) => void
  /** 어절 칩의 글자 크기 등 — 화면마다 다르다 */
  wordClass: string
}) {
  const words = text.trim().split(/\s+/)
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (typeof value === 'string' ? value : '-'.repeat(words.length))

  const press = (k: number, c: 'O' | 'X') => {
    const next = shown.slice(0, k) + c + shown.slice(k + 1)
    if (next.includes('-')) setDraft(next)
    else { setDraft(null); onChange(next) }
  }

  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-2">
      {words.map((w, k) => (
        <span key={k} role="group" aria-label={`${w} 정확하게 썼나요`} className="flex flex-col items-center gap-1.5">
          <span className={`font-read rounded bg-well px-1.5 py-0.5 ${wordClass}`}>{w}</span>
          <span className="flex gap-1.5">
            {(['O', 'X'] as const).map(c => (
              <button key={c} type="button" aria-pressed={shown[k] === c}
                aria-label={`${w} ${c === 'O' ? '정반응' : '오반응'}`}
                onClick={() => press(k, c)}
                className={`h-11 w-11 rounded-lg border-[1.5px] font-read text-lg font-bold transition ${
                  shown[k] === c
                    ? c === 'O' ? 'border-mint bg-mint/10 text-mint' : 'border-rec bg-rec/10 text-rec-deep'
                    : 'border-line bg-well text-ink-mute'}`}>
                {c}
              </button>
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}
