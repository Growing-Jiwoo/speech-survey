// components/admin/sheet/SentenceRows.tsx — 문장 읽기유창성 채점 행.
// 문장 하나가 곧 녹음 페이지 하나이므로 문장·플레이어·점수 입력을 한 행에 둔다.
// 플레이어는 문장 아래 자기 줄을 가진다 — 시간·배속과 뭉치던 밀집(실사용 피드백)을 푼다.
'use client'
import { itemMaxWords } from '@/lib/scoring'
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
      {items.map((item, i) => {
        const max = itemMaxWords(item)
        return (
          <div key={item.code} className="border-t border-line/60 px-4 py-3 first:border-t-0">
            <div className="flex items-start gap-3">
              <span className="w-5 flex-none pt-1 text-[13px] font-bold text-ink-mute">{i + 1}</span>
              <p className="font-read min-w-0 flex-1 whitespace-pre-line break-keep text-[15px] leading-relaxed">
                {item.text}
              </p>
              <div className="flex flex-none items-center gap-1.5 pt-0.5">
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
                  className="h-11 w-16 rounded-lg border-[1.5px] border-line bg-well px-2 text-center text-base tabular-nums outline-none focus:border-blue" />
                <span className="text-[13px] text-ink-mute">/ {max}</span>
              </div>
            </div>
            {/* 라벨 없이 플레이어만 — 바로 위에 번호와 문장 전문이 있어 '1번 문장'은 군더더기다 */}
            <div className="mt-2 pl-8">
              <PageAudio attempts={attemptsFor(item.code)}
                limitSec={limitSec} onAudioError={onAudioError} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
