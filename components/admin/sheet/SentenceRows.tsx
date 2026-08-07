// components/admin/sheet/SentenceRows.tsx — 검사지의 문장 읽기유창성 칸.
// 문장 하나가 곧 녹음 페이지 하나이므로, 문장·녹음·점수 입력을 한 줄에 둔다.
'use client'
import { sentenceMaxWords } from '@/lib/scoring'
import type { SurveyItem } from '@/lib/items'
import { PageAudio, type Attempt } from './PageAudio'

export function SentenceRows({ items, sentences, onChange, attemptsFor, limitSec, onAudioError }: {
  items: SurveyItem[]
  sentences: Partial<Record<string, number>>
  onChange: (code: string, v: number | undefined) => void
  /** 문항 코드 → 그 문장 페이지의 녹음 시도들 */
  attemptsFor: (code: string) => Attempt[]
  limitSec: number
  onAudioError: () => void
}) {
  return (
    <div>
      <div className="flex items-center border-b border-line/60 bg-amber/10 px-4 py-1.5 text-[11.5px] font-bold text-ink-soft print:bg-amber/10">
        <span className="flex-1">문항</span>
        <span className="w-24 text-right">점수</span>
      </div>
      {items.map((item, i) => {
        const max = sentenceMaxWords(item)
        return (
          <div key={item.code} className="flex items-start gap-3 border-b border-line/60 px-4 py-2.5">
            <span className="w-4 flex-none pt-1 text-xs font-bold text-ink-mute">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-read whitespace-pre-line break-keep text-[14px] leading-relaxed">{item.text}</p>
              <div className="mt-1.5">
                <PageAudio label={`${i + 1}번 문장`} attempts={attemptsFor(item.code)}
                  limitSec={limitSec} onAudioError={onAudioError} />
              </div>
            </div>
            <div className="flex w-24 flex-none items-center justify-end gap-1.5 pt-0.5">
              <input type="number" min={0} max={max} inputMode="numeric"
                aria-label={`${i + 1}번 문장 정확 어절 수 (최대 ${max})`}
                value={sentences[item.code] ?? ''}
                onChange={e => {
                  const raw = e.target.value
                  if (raw === '') { onChange(item.code, undefined); return }
                  const n = Number(raw)
                  if (Number.isNaN(n)) return
                  onChange(item.code, Math.max(0, Math.min(Math.floor(n), max)))
                }}
                className="h-9 w-14 rounded-lg border-[1.5px] border-line bg-well px-2 text-center text-sm tabular-nums outline-none focus:border-blue print:border-0 print:bg-transparent print:text-[15px] print:font-bold" />
              <span className="text-xs text-ink-mute">/ {max}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
