// components/admin/ScoreSheet.tsx — 결과지(채점 입력 + 합산 + Pass/Fail).
// 검사지 순서 그대로: 낱말 해독(의미/무의미 O/X) → 문장 읽기유창성(어절 수) → 낱말 쓰기(검사 중 수집) → 총평.
// 낱말 O/X의 초기값은 검사 현장에서 검사자가 표시한 값(reading_marks)이고, 관리자가 녹음을 들으며 고친다.
'use client'
import { useState } from 'react'
import { ITEMS, KIND_LABEL, MEANING_READ_CODES } from '@/lib/items'
import { PASS_MARK, PROVISIONAL_CRITERIA, TASK_MAX, scoreSession, sentenceMaxWords } from '@/lib/scoring'
import { requestJson } from '@/lib/http'
import { Badge } from '@/components/Badge'

const READ_ITEMS = ITEMS.filter(i => i.section === 'word_reading')
const SENTENCE_ITEMS = ITEMS.filter(i => i.section === 'sentence_reading')

export function ScoreSheet({ sessionId, initialMarks, initialSentences, writing }: {
  sessionId: string
  initialMarks: Record<string, boolean>
  initialSentences: Record<string, number>
  /** 낱말 쓰기는 검사 중 수집돼 여기서 다시 채점하지 않는다(예=1점) */
  writing: Record<string, boolean>
}) {
  const [marks, setMarks] = useState(initialMarks)
  const [sentences, setSentences] = useState(initialSentences)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const r = scoreSession({ marks, sentences, writing })

  async function save() {
    setSaving(true); setMsg('')
    // requestJson은 init으로 { method?, body? }만 받고, body가 있으면 Content-Type과 직렬화를 스스로 한다.
    const res = await requestJson(`/api/admin/sessions/${sessionId}/scores`,
      { method: 'PUT', body: { marks, sentences } },
      '채점 저장에 실패했어요. 다시 시도해 주세요.')
    setSaving(false)
    setMsg(res.ok ? '저장했어요.' : res.error)
  }

  const verdictBadge = (v: 'pass' | 'fail') =>
    v === 'pass' ? <Badge tone="mint">Pass</Badge> : <Badge tone="rec">Fail</Badge>

  return (
    <section className="border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-[13px] font-bold text-ink-soft">결과지 — 채점</h2>
        {PROVISIONAL_CRITERIA && (
          // 임시 기준으로 나온 Pass/Fail이 실제 판정으로 학교에 전달되지 않도록 화면·인쇄물 모두에 남긴다.
          <span className="rounded-lg border border-amber/50 bg-amber/10 px-2 py-1 text-[11px] font-bold text-amber">
            임시 기준 · 확정 전
          </span>
        )}
      </div>

      {/* 낱말 해독 — 녹음을 들으며 O/X */}
      <h3 className="px-5 pt-4 text-xs font-bold text-ink-mute">낱말 해독 (30초 내 정확 반응)</h3>
      <ul className="grid gap-1.5 px-5 pt-2 sm:grid-cols-2">
        {READ_ITEMS.map(item => (
          <li key={item.code} className="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5">
            <span className="w-9 flex-none text-[10px] font-bold text-ink-mute">
              {KIND_LABEL[item.kind!]}
            </span>
            <span className="font-read min-w-0 flex-1 truncate text-base">{item.text}</span>
            <div className="flex flex-none gap-1">
              {([['O', true], ['X', false]] as const).map(([label, v]) => (
                <button key={label} type="button" aria-pressed={marks[item.code] === v}
                  aria-label={`${item.text} ${v ? '정반응' : '오반응'}`}
                  onClick={() => setMarks(m => ({ ...m, [item.code]: v }))}
                  className={`h-8 w-8 rounded-md border-[1.5px] font-read text-sm font-bold transition ${
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
      <p className="px-5 pt-2 text-xs text-ink-soft">
        의미 <b>{r.wordMeaning}</b> / {MEANING_READ_CODES.length} ·
        무의미 <b>{r.wordNonsense}</b> / {READ_ITEMS.length - MEANING_READ_CODES.length} ·
        총 <b className="text-blue">{r.wordReading}</b> / {TASK_MAX.wordReading} {verdictBadge(r.verdict.wordReading)}
      </p>

      {/* 문장 읽기유창성 — 어절 수 입력 */}
      <h3 className="px-5 pt-5 text-xs font-bold text-ink-mute">문장 읽기유창성 (40초 내 정확 어절 수)</h3>
      <ul className="flex flex-col gap-1.5 px-5 pt-2">
        {SENTENCE_ITEMS.map((item, i) => {
          const max = sentenceMaxWords(item)
          return (
            <li key={item.code} className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2">
              <span className="w-4 flex-none text-xs font-bold text-ink-mute">{i + 1}</span>
              <span className="font-read min-w-0 flex-1 whitespace-pre-line break-keep text-[13px]">{item.text}</span>
              <div className="flex flex-none items-center gap-1">
                <input type="number" min={0} max={max} inputMode="numeric"
                  aria-label={`${i + 1}번 문장 정확 어절 수 (최대 ${max})`}
                  value={sentences[item.code] ?? ''}
                  onChange={e => {
                    const n = e.target.value === '' ? undefined : Number(e.target.value)
                    setSentences(s => {
                      const next = { ...s }
                      if (n === undefined || Number.isNaN(n)) delete next[item.code]
                      else next[item.code] = Math.max(0, Math.min(Math.floor(n), max))
                      return next
                    })
                  }}
                  className="h-9 w-16 rounded-lg border-[1.5px] border-line bg-well px-2 text-center text-sm tabular-nums outline-none focus:border-blue" />
                <span className="text-xs text-ink-mute">/ {max}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="px-5 pt-2 text-xs text-ink-soft">
        총 <b className="text-blue">{r.sentenceReading}</b> / {TASK_MAX.sentenceReading} {verdictBadge(r.verdict.sentenceReading)}
      </p>

      {/* 낱말 쓰기 — 검사 중 수집분을 그대로 합산 */}
      <h3 className="px-5 pt-5 text-xs font-bold text-ink-mute">낱말 쓰기 (검사 중 기록)</h3>
      <p className="px-5 pt-2 text-xs text-ink-soft">
        총 <b className="text-blue">{r.wordWriting}</b> / {TASK_MAX.wordWriting} {verdictBadge(r.verdict.wordWriting)}
      </p>

      <div className="flex flex-wrap items-center gap-3 px-5 py-4 print:hidden">
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-blue px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40">
          {saving ? '저장 중…' : '채점 저장'}
        </button>
        <button type="button" onClick={() => window.print()}
          className="rounded-lg border-[1.5px] border-line bg-well px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-blue">
          결과지 인쇄
        </button>
        {msg && <span aria-live="polite" className="text-xs text-ink-soft">{msg}</span>}
      </div>

      <p className="border-t border-line bg-well px-5 py-3 text-[11.5px] text-ink-mute">
        Pass 기준(임시): 낱말 해독 {PASS_MARK.wordReading} / {TASK_MAX.wordReading} ·
        문장 읽기유창성 {PASS_MARK.sentenceReading} / {TASK_MAX.sentenceReading} ·
        낱말 쓰기 {PASS_MARK.wordWriting} / {TASK_MAX.wordWriting}.
        담당자에게 실제 기준표를 받으면 숫자만 교체되며, 이미 채점한 세션도 저장된 점수로 다시 계산됩니다.
      </p>
    </section>
  )
}
