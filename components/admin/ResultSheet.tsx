// components/admin/ResultSheet.tsx — 관리자 결과지.
// 종이 검사지([최종] 초등 N학년 선별검사지.pdf)와 같은 순서·구조로 두고,
// 각 줄에 아동의 결과물(녹음·검사 중 응답)과 채점 입력을 함께 놓는다.
// 인쇄하면 이 화면이 그대로 A4 결과지가 된다(app/globals.css의 @page).
'use client'
import { useState } from 'react'
import { ITEMS, KIND_LABEL, WRITING_ITEMS, areaLabel } from '@/lib/items'
import { formForGrade } from '@/lib/forms'
import {
  PASS_MARK, PROVISIONAL_CRITERIA, READ_MAX, TASK_MAX, WRITE_MAX, scoreSession,
} from '@/lib/scoring'
import { contactLabel, gradeClassLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { Badge } from '@/components/Badge'
import { ScoreBand } from './sheet/ScoreBand'
import { Subtotal } from './sheet/Subtotal'
import { WordGrid } from './sheet/WordGrid'
import { SentenceRows } from './sheet/SentenceRows'
import { PageAudio, type Attempt } from './sheet/PageAudio'
import type { SessionRow } from '@/lib/db'

const READ_MEANING_ITEMS = ITEMS.filter(i => i.section === 'word_reading' && i.kind === 'meaning')
const READ_NONSENSE_ITEMS = ITEMS.filter(i => i.section === 'word_reading' && i.kind === 'nonsense')
const SENTENCE_ITEMS = ITEMS.filter(i => i.section === 'sentence_reading')
const WRITE_MEANING_ITEMS = WRITING_ITEMS.filter(i => i.kind === 'meaning')
const WRITE_NONSENSE_ITEMS = WRITING_ITEMS.filter(i => i.kind === 'nonsense')

const examinerLabel = (t: string | null | undefined) =>
  t === 'expert' ? '전문가' : t === 'teacher' ? '교사' : '기록 없음'

export function ResultSheet({ sessionId, session, writing, initialMarks, initialSentences, attemptsOf, onAudioError }: {
  sessionId: string
  session: SessionRow
  /** 낱말 쓰기는 검사 중 수집돼 여기서 다시 채점하지 않는다(예=1점) */
  writing: Record<string, boolean>
  initialMarks: Record<string, boolean>
  initialSentences: Record<string, number>
  /** 페이지 코드 → 녹음 시도들 */
  attemptsOf: (pageCode: string) => Attempt[]
  onAudioError: () => void
}) {
  const [marks, setMarks] = useState(initialMarks)
  const [sentences, setSentences] = useState(initialSentences)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const form = formForGrade(session.grade)
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

  const setMark = (code: string, v: boolean) => setMarks(m => ({ ...m, [code]: v }))
  const setSentence = (code: string, v: number | undefined) => setSentences(s => {
    const next = { ...s }
    if (v === undefined) delete next[code]
    else next[code] = v
    return next
  })

  return (
    <section className="result-sheet">
      {/* 머리글 — 종이 검사지 상단과 같은 항목 */}
      <header className="border-b-2 border-ink/80 px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold leading-none tracking-tight">{form.title}</h1>
            <p className="mt-1 text-[10.5px] font-bold text-ink-mute">{form.subtitle}</p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px]">
            {[
              ['학교', session.school_name],
              ['학년', gradeClassLabel(session.grade, session.class_no)],
              ['학생명', session.child_name],
              ['생년월일', session.birth_ymd],
              ['검사일', new Date(session.started_at).toLocaleDateString('ko-KR')],
              ['검사자', examinerLabel(session.examiner_type)],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-ink-mute">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-2 text-[10.5px] text-ink-mute">
          담임 {session.teacher_name} ({contactLabel(session.teacher_phone, session.teacher_email, session.teacher_contact)})
          {' · '}{session.submitted_at ? '제출 완료' : '진행 중'}
          {PROVISIONAL_CRITERIA && (
            // 임시 기준으로 나온 Pass/Fail이 실제 판정으로 학교에 전달되지 않도록 화면·인쇄물 모두에 남긴다.
            <span className="ml-2 rounded border border-amber/50 bg-amber/10 px-1.5 py-0.5 font-bold text-amber print:bg-amber/10">
              임시 기준 · 확정 전
            </span>
          )}
        </p>
      </header>

      <ScoreBand result={r} />

      {/* 낱말 해독 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 pb-1.5 pt-3">
        <h2 className="text-[13px] font-bold">낱말 해독
          <span className="ml-2 font-normal text-[11px] text-ink-mute">
            {form.limits.wordSec}초 동안 정확하게 읽은 낱말 수
          </span>
        </h2>
        <div className="flex flex-wrap gap-3">
          <PageAudio label={`${KIND_LABEL.meaning} 낱말`} attempts={attemptsOf('p_rw_meaning')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />
          <PageAudio label={`${KIND_LABEL.nonsense} 낱말`} attempts={attemptsOf('p_rw_nonsense')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />
        </div>
      </div>
      <WordGrid rowLabel="의미 낱말" words={READ_MEANING_ITEMS} marks={marks} onMark={setMark} />
      <WordGrid rowLabel="무의미 낱말" words={READ_NONSENSE_ITEMS} marks={marks} onMark={setMark} />
      <Subtotal
        cells={[
          { label: '의미 점수', value: r.wordMeaning, max: READ_MAX.meaning },
          { label: '무의미 점수', value: r.wordNonsense, max: READ_MAX.nonsense },
        ]}
        total={{ label: '총 점수', value: r.wordReading, max: TASK_MAX.wordReading }}
        verdict={r.verdict.wordReading} />

      {/* 문장 읽기유창성 */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">문장 읽기유창성
        <span className="ml-2 font-normal text-[11px] text-ink-mute">
          {form.limits.sentenceSec}초 동안 정확하게 읽은 어절 수
        </span>
      </h2>
      <SentenceRows items={SENTENCE_ITEMS} sentences={sentences} onChange={setSentence}
        attemptsFor={code => attemptsOf(`p_${code}`)}
        limitSec={form.limits.sentenceSec} onAudioError={onAudioError} />
      <Subtotal total={{ label: '총점', value: r.sentenceReading, max: TASK_MAX.sentenceReading }}
        verdict={r.verdict.sentenceReading} />

      {/* 낱말 쓰기 — 검사 중 수집분(읽기 전용) */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">낱말 쓰기
        <span className="ml-2 font-normal text-[11px] text-ink-mute">검사 중 기록 · 정확하게 쓴 낱말 1점</span>
      </h2>
      <WordGrid rowLabel="의미 낱말" words={WRITE_MEANING_ITEMS} marks={writing} readOnly />
      <WordGrid rowLabel="무의미 낱말" words={WRITE_NONSENSE_ITEMS} marks={writing} readOnly />
      <Subtotal
        cells={[
          { label: '의미 점수', value: r.writeMeaning, max: WRITE_MAX.meaning },
          { label: '무의미 점수', value: r.writeNonsense, max: WRITE_MAX.nonsense },
        ]}
        total={{ label: '총 점수', value: r.wordWriting, max: TASK_MAX.wordWriting }}
        verdict={r.verdict.wordWriting} />

      {/* 검사자 체크리스트 */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">검사자 체크리스트</h2>
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {session.checklist.length === 0
          ? <span className="text-sm text-ink-mute">선택 없음</span>
          : session.checklist.map(c => <Badge key={c} tone="amber">{areaLabel(c)}</Badge>)}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-4 print:hidden">
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-blue px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40">
          {saving ? '저장 중…' : '채점 저장'}
        </button>
        <button type="button" onClick={() => window.print()}
          className="rounded-lg border-[1.5px] border-line bg-well px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-blue">
          결과지 PDF · 인쇄
        </button>
        {msg && <span aria-live="polite" className="text-xs text-ink-soft">{msg}</span>}
      </div>

      <p className="border-t border-line bg-well px-4 py-2.5 text-[10.5px] leading-relaxed text-ink-mute">
        채점 기준({form.id}): 낱말 해독은 {form.limits.wordSec}초, 문장 읽기유창성은 {form.limits.sentenceSec}초 내 정확 반응 수.
        녹음은 마지막 반응이 잘리지 않도록 조금 더 담기므로, 기준 시간 이후 반응은 채점하지 않습니다.
        {PROVISIONAL_CRITERIA && (
          <> Pass 기준은 <b>임시값</b>입니다 — 낱말 해독 {PASS_MARK.wordReading} / {TASK_MAX.wordReading} ·
          문장 읽기유창성 {PASS_MARK.sentenceReading} / {TASK_MAX.sentenceReading} ·
          낱말 쓰기 {PASS_MARK.wordWriting} / {TASK_MAX.wordWriting}.
          실제 기준표를 받으면 숫자만 교체되며, 이미 채점한 세션도 저장된 점수로 다시 계산됩니다.</>
        )}
      </p>
    </section>
  )
}
