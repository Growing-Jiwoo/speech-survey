// components/admin/sheet/SentenceRows.tsx — 문장 읽기유창성 채점 행.
// 문장 하나가 곧 녹음 페이지 하나이므로 문장·플레이어·채점 입력을 한 행에 둔다.
// 채점 입력은 둘이다 — 읽은 시간(초)과 정확 어절 수. 시간 칸은 담당자가 짚은 자리(문장과 어절 칸 사이)에
// 둔다(담당자 확정 2026-09-29 「초를 쓸 수 있는 란을 내가 체크한 곳에」). 총점 계산은 lib/scoring이 한다.
// 플레이어는 문장 아래 자기 줄을 가진다 — 시간·배속과 뭉치던 밀집(실사용 피드백)을 푼다.
'use client'
import { useState } from 'react'
import { itemMaxWords, parseReadSec } from '@/lib/scoring'
import type { SurveyItem } from '@/lib/items'
import { PageAudio, type Attempt } from './PageAudio'

export function SentenceRows({
  items, sentences, onChange, times, timeDefaults, onTimeChange, maxSec, attemptsFor, limitSec, onAudioError,
}: {
  items: SurveyItem[]
  sentences: Partial<Record<string, number>>
  onChange: (code: string, v: number | undefined) => void
  /** 채점자가 넣은 읽은 시간(초) */
  times: Partial<Record<string, number>>
  /** 녹음 없는 문장의 시간 기본값 — 칸에 흐린 글자로만 보인다(저장하지 않는다) */
  timeDefaults: Partial<Record<string, number>>
  onTimeChange: (code: string, v: number | undefined) => void
  /** 읽은 시간 입력 상한(초) — 오타 방지용(lib/scoring readSecMax) */
  maxSec: number
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
            {/* 좁은 폭에서는 입력 칸 묶음(시간·어절 ≈ 260px)이 다음 줄 오른쪽으로 내려간다 — 한 줄에 두면
                문장이 한두 어절씩 끊겨 읽을 수 없었다(375px 실측). 넓은 폭에서는 종전처럼 한 줄이다. */}
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span className="w-5 flex-none pt-1 text-[13px] font-bold text-ink-mute">{i + 1}</span>
              <p className="font-read min-w-[12rem] flex-1 whitespace-pre-line break-keep text-[15px] leading-relaxed">
                {item.text}
              </p>
              <div className="ml-auto flex flex-none items-center gap-1.5 pt-0.5">
                <SecondsInput label={`${i + 1}번 문장 읽은 시간(초)`} max={maxSec}
                  value={times[item.code]} fallback={timeDefaults[item.code]}
                  onChange={v => onTimeChange(item.code, v)} />
                <span className="mr-3 text-[13px] text-ink-mute">초</span>
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

/**
 * 읽은 시간 칸. **친 글자는 칸이 직접 들고 있고** 부모에는 해석한 숫자만 올린다.
 *
 * number 입력으로 두면 「4.」·「0」처럼 치는 도중의 글자를 값으로 나타낼 수 없어, 부모 값으로 다시
 * 그리는 순간 친 글자가 지워진다(0.5를 치려고 0을 누르면 칸이 빈다). 그래서 text + 소수 키패드로 두고,
 * 해석은 저장 라우트와 같은 규칙(lib/scoring `parseReadSec`)이 한다.
 *
 * 형식·범위를 벗어난 글자는 붉은 테두리로 드러나고, 그동안 그 문장의 시간은 「없음」으로 올라간다 —
 * 잘못 친 값으로 조용히 계산하지 않고 채점 완료를 막는다(다른 칸의 자동 저장은 막지 않는다).
 * 녹음 없는 문장은 계산에 쓰는 기본값(제한 시간)을 흐린 글자로 보여 준다 — 채점자가 넣은 값과 구분된다.
 */
function SecondsInput({ label, value, fallback, max, onChange }: {
  label: string
  value: number | undefined
  fallback: number | undefined
  max: number
  onChange: (v: number | undefined) => void
}) {
  // 처음 한 번만 부모 값으로 채운다 — 이후 값은 이 칸에서만 바뀐다(결과지는 아동마다 다시 마운트된다).
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const invalid = parseReadSec(text, max) === null
  return (
    <input type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
      aria-label={label} aria-invalid={invalid || undefined}
      value={text}
      placeholder={fallback === undefined ? undefined : String(fallback)}
      title={invalid ? `0.1초 단위로 ${max}초까지 적을 수 있어요`
        : fallback !== undefined && text === '' ? `녹음이 없어 ${fallback}초로 계산해요` : undefined}
      onChange={e => {
        const t = e.target.value
        setText(t)
        const v = parseReadSec(t, max)
        onChange(v === null ? undefined : v)
      }}
      className={`h-11 w-16 rounded-lg border-[1.5px] bg-well px-2 text-center text-base tabular-nums outline-none placeholder:text-ink-mute/50 ${
        invalid ? 'border-rec focus:border-rec-deep' : 'border-line focus:border-blue'}`} />
  )
}
