// components/admin/sheet/SentenceRows.tsx — 문장 읽기유창성 채점 행.
// 문장 하나가 곧 녹음 페이지 하나이므로 문장·플레이어·채점 입력을 한 행에 둔다.
// 채점 입력은 둘이다 — 읽은 시간(초)과 정확 어절 수. 시간 칸은 담당자가 짚은 자리(문장과 어절 칸 사이)에
// 둔다(담당자 확정 2026-09-29 「초를 쓸 수 있는 란을 내가 체크한 곳에」). 총점 계산은 lib/scoring이 한다.
// 플레이어는 문장 바로 밑(같은 칸)에 둔다 — 시간·배속과 뭉치던 밀집(실사용 피드백)을 풀고, 입력 칸 높이와 무관하게 붙는다.
// 녹음 없는 문장은 입력 칸 대신 계산에 쓰는 값(제한 시간 · 0어절)을 같은 자리에 고정해 보여 준다(lib/scoring withUnrecordedFixed).
'use client'
import { useState } from 'react'
import { itemMaxWords, parseReadSec } from '@/lib/scoring'
import type { SurveyItem } from '@/lib/items'
import { PageAudio, type Attempt } from './PageAudio'

export function SentenceRows({
  items, sentences, onChange, times, locked, onTimeChange, maxSec, attemptsFor, limitSec, onAudioError,
}: {
  items: SurveyItem[]
  sentences: Partial<Record<string, number>>
  onChange: (code: string, v: number | undefined) => void
  /** 채점자가 넣은 읽은 시간(초) */
  times: Partial<Record<string, number>>
  /** 잠긴(녹음 없는) 문항 코드 — 제한 시간 · 0어절로 고정된다 */
  locked: ReadonlySet<string>
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
            {/* 좁은 폭에서는 입력 칸 묶음(시간·어절 ≈ 260px)이 오른쪽 아래로 내려간다 — 한 줄에 두면
                문장이 한두 어절씩 끊겨 읽을 수 없었다(375px 실측). 넓은 폭에서는 한 줄이다.
                플레이어는 문장과 같은 칸에 둔다 — 입력 칸(44px)과 한 줄로 묶으면 한 줄짜리 문장 밑에
                그 높이만큼 빈 간격이 생겼다. */}
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span className="w-5 flex-none pt-1 text-[13px] font-bold text-ink-mute">{i + 1}</span>
              <div className="min-w-[12rem] flex-1">
                <p className="font-read whitespace-pre-line break-keep text-[15px] leading-relaxed">
                  {item.text}
                </p>
                {/* 라벨 없이 플레이어만 — 바로 위에 번호와 문장 전문이 있어 '1번 문장'은 군더더기다 */}
                <div className="mt-2">
                  <PageAudio attempts={attemptsFor(item.code)}
                    limitSec={limitSec} onAudioError={onAudioError} />
                </div>
              </div>
              {/* 입력 묶음은 행의 세로 가운데 — 위에 붙이면 문장·플레이어 두 줄 옆에서 떠 보인다.
                  「/ N」 칸 폭을 고정해 「/ 14」인 줄만 묶음이 왼쪽으로 밀리지 않게 한다. */}
              {locked.has(item.code) ? (
                // 입력 칸과 같은 크기의 점선 상자 — 행마다 값의 자리가 같아 세로로 훑어 읽힌다
                <div className="ml-auto flex flex-none items-center gap-1.5 self-center"
                  title={`녹음이 없어 ${limitSec}초 · 0어절로 계산해요`}>
                  <FixedCell label={`${i + 1}번 문장 읽은 시간(초), 녹음 없음`} value={limitSec} />
                  <span className="mr-3 text-[13px] text-ink-mute">초</span>
                  <FixedCell label={`${i + 1}번 문장 정확 어절 수, 녹음 없음`} value={0} />
                  <span className="w-7 text-[13px] text-ink-mute">/ {max}</span>
                </div>
              ) : (
              <div className="ml-auto flex flex-none items-center gap-1.5 self-center">
                <SecondsInput label={`${i + 1}번 문장 읽은 시간(초)`} max={maxSec}
                  value={times[item.code]}
                  onChange={v => onTimeChange(item.code, v)} />
                <span className="mr-3 text-[13px] text-ink-mute">초</span>
                {/* type="number"가 아니다 — 포인터를 칸 위에 둔 채 휠로 화면을 내리면 값이 조용히 바뀌어 1.5초 뒤 저장됐다
                    (Chrome·Edge, 2026-10-08 야간 점검). 시간 칸(SecondsInput)과 같이 글자 칸 + 숫자 키패드로 받는다. */}
                <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2}
                  aria-label={`${i + 1}번 문장 정확 어절 수 (최대 ${max})`}
                  value={sentences[item.code] ?? ''}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '')
                    if (raw === '') { onChange(item.code, undefined); return }
                    const n = Number(raw)
                    if (Number.isNaN(n)) return
                    onChange(item.code, Math.max(0, Math.min(Math.floor(n), max)))
                  }}
                  className="h-11 w-16 rounded-lg border-[1.5px] border-line bg-well px-2 text-center text-base tabular-nums outline-none focus:border-blue" />
                <span className="w-7 text-[13px] text-ink-mute">/ {max}</span>
              </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** 잠긴 칸 — 계산에 들어가는 값을 보여 주기만 한다(입력이 아님을 점선·흐린 글자로 드러낸다) */
function FixedCell({ label, value }: { label: string; value: number }) {
  return (
    <span role="img" aria-label={`${label} ${value}`}
      className="flex h-11 w-16 items-center justify-center rounded-lg border-[1.5px] border-dashed border-line text-base tabular-nums text-ink-mute">
      {value}
    </span>
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
 */
function SecondsInput({ label, value, max, onChange }: {
  label: string
  value: number | undefined
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
      title={invalid ? `0.1초 단위로 ${max}초까지 적을 수 있어요` : undefined}
      onChange={e => {
        const t = e.target.value
        setText(t)
        const v = parseReadSec(t, max)
        onChange(v === null ? undefined : v)
      }}
      className={`h-11 w-16 rounded-lg border-[1.5px] bg-well px-2 text-center text-base tabular-nums outline-none ${
        invalid ? 'border-rec focus:border-rec-deep' : 'border-line focus:border-blue'}`} />
  )
}
