// components/admin/ResultSheet.tsx — 관리자 결과지.
// 종이 검사지(assets/forms/kodys-g*.pdf)와 같은 순서·구조로 두고,
// 각 줄에 아동의 결과물(녹음·검사 중 응답)과 채점 입력을 함께 놓는다.
// 공식 출력물은 이 화면이 아니라 검사지 PDF다(/api/admin/sessions/[id]/sheet.pdf).
// 화면 인쇄(@page, app/globals.css)는 작업 중 참고용으로만 남겨 둔다.
'use client'
import { useEffect, useState } from 'react'
import { KIND_LABEL, SECTION_LABEL, areaLabel, itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'
import { PROVISIONAL_CRITERIA, scoreSession, scoringFor } from '@/lib/scoring'
import { contactLabel, examinerLabel, gradeClassLabel, sheetDateLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { Badge } from '@/components/Badge'
import { ScoreBand } from './sheet/ScoreBand'
import { Subtotal } from './sheet/Subtotal'
import { WordGrid } from './sheet/WordGrid'
import { SentenceRows } from './sheet/SentenceRows'
import { SentenceWriteRows } from './sheet/SentenceWriteRows'
import { PageAudio, type Attempt } from './sheet/PageAudio'
import type { SessionRow } from '@/lib/db'

export function ResultSheet({ sessionId, session, writing, initialMarks, initialSentences, attemptsOf, onAudioError, onDirtyChange }: {
  sessionId: string
  session: SessionRow
  /** 쓰기 과제는 검사 중 수집돼 여기서 다시 채점하지 않는다. 값은 정확히 쓴 어절 수. */
  writing: Partial<Record<string, number>>
  initialMarks: Partial<Record<string, boolean>>
  /** 문장 읽기유창성 점수만 (문장 쓰기는 writing으로 들어온다) */
  initialSentences: Partial<Record<string, number>>
  /** 페이지 코드 → 녹음 시도들 */
  attemptsOf: (pageCode: string) => Attempt[]
  onAudioError: () => void
  /** 저장하지 않은 채점이 있는지 — 상위가 아동 이동·이탈을 막는 데 쓴다 */
  onDirtyChange?: (dirty: boolean) => void
}) {
  const [marks, setMarks] = useState(initialMarks)
  const [sentences, setSentences] = useState(initialSentences)
  // 저장에 성공한 값 — 화면 상태와 비교해 "저장 안 한 변경"을 판단한다
  const [savedMarks, setSavedMarks] = useState(initialMarks)
  const [savedSentences, setSavedSentences] = useState(initialSentences)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const form = formForGrade(session.grade)
  const f = itemsFor(form)
  const { taskMax, readMax, writeMax, passMark } = scoringFor(form)
  const r = scoreSession(form, { marks, sentences, writing })
  const writingLabel = SECTION_LABEL[f.writingSection]

  // 저장 전 채점은 화면에만 있다. 아동을 옮기면 사라지므로(다른 아동 화면은 다시 마운트된다)
  // 상위가 막을 수 있도록 알린다. 저장된 값과 비교해 판단한다 — 되돌리면 다시 깨끗해진다.
  const dirty = JSON.stringify(marks) !== JSON.stringify(savedMarks)
    || JSON.stringify(sentences) !== JSON.stringify(savedSentences)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])   // 언마운트 시 해제

  // 탭 닫기·새로고침은 앱이 막을 수 없으므로 브라우저 기본 경고에 맡긴다(검사 화면과 같은 방식).
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  async function save() {
    setSaving(true); setMsg('')
    // requestJson은 init으로 { method?, body? }만 받고, body가 있으면 Content-Type과 직렬화를 스스로 한다.
    const res = await requestJson(`/api/admin/sessions/${sessionId}/scores`,
      { method: 'PUT', body: { marks, sentences } },
      '채점 저장에 실패했어요. 다시 시도해 주세요.')
    setSaving(false)
    setMsg(res.ok ? '저장했어요.' : res.error)
    if (res.ok) { setSavedMarks(marks); setSavedSentences(sentences) }
  }

  const setMark = (code: string, v: boolean) => setMarks(m => ({ ...m, [code]: v }))
  const setSentence = (code: string, v: number | undefined) => setSentences(s => {
    const next = { ...s }
    if (v === undefined) delete next[code]
    else next[code] = v
    return next
  })

  const readItemsOf = (kind: 'meaning' | 'nonsense') => f.readItems.filter(i => i.kind === kind)
  // 낱말 쓰기 격자는 O/X로 보여 준다 — 문항 만점이 1이라 1=정반응이다.
  const writingMarks = Object.fromEntries(
    Object.entries(writing).map(([c, v]) => [c, v === undefined ? undefined : v >= 1]),
  )
  const writeItemsOf = (kind: 'meaning' | 'nonsense') => f.writingItems.filter(i => i.kind === kind)

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
              ['성별', session.gender],
              ['생년월일', session.birth_ymd],
              ['검사일', sheetDateLabel(session.started_at)],
              ['검사자', examinerLabel(session.examiner_type)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-mute">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-2 text-[10.5px] text-ink-mute">
          담임 {session.teacher_name} ({contactLabel(session.teacher_phone, session.teacher_email, session.teacher_contact)})
          {' · '}{session.submitted_at ? '제출 완료' : '진행 중'}
          {' · '}
          {/* 법정대리인 동의 확인 기록(개인정보보호법 제22조의2) — 도입 전 수집분은 '기록 없음' */}
          {session.guardian_consented_at
            ? `보호자 동의 확인 ${new Date(session.guardian_consented_at).toLocaleDateString('ko-KR')}`
            : '보호자 동의 기록 없음'}
          {PROVISIONAL_CRITERIA && (
            // 임시 기준으로 나온 Pass/Fail이 실제 판정으로 학교에 전달되지 않도록 화면·인쇄물 모두에 남긴다.
            <span className="ml-2 rounded border border-amber/50 bg-amber/10 px-1.5 py-0.5 font-bold text-amber print:bg-amber/10">
              임시 기준 · 확정 전
            </span>
          )}
        </p>
      </header>

      <ScoreBand form={form} result={r} />

      {/* 낱말 해독 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 pb-1.5 pt-3">
        <h2 className="text-[13px] font-bold">{SECTION_LABEL.word_reading}
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
      <WordGrid rowLabel="의미 낱말" words={readItemsOf('meaning')} marks={marks} onMark={setMark} />
      <WordGrid rowLabel="무의미 낱말" words={readItemsOf('nonsense')} marks={marks} onMark={setMark} />
      <Subtotal
        cells={[
          { label: '의미 점수', value: r.wordMeaning, max: readMax.meaning },
          { label: '무의미 점수', value: r.wordNonsense, max: readMax.nonsense },
        ]}
        total={{ label: '총 점수', value: r.wordReading, max: taskMax.wordReading }}
        verdict={r.verdict.wordReading} complete={r.complete.wordReading} />

      {/* 문장 읽기유창성 */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">{SECTION_LABEL.sentence_reading}
        <span className="ml-2 font-normal text-[11px] text-ink-mute">
          {form.limits.sentenceSec}초 동안 정확하게 읽은 어절 수
        </span>
      </h2>
      <SentenceRows items={f.sentenceItems} sentences={sentences} onChange={setSentence}
        attemptsFor={code => attemptsOf(`p_${code}`)}
        limitSec={form.limits.sentenceSec} onAudioError={onAudioError} />
      <Subtotal total={{ label: '총점', value: r.sentenceReading, max: taskMax.sentenceReading }}
        verdict={r.verdict.sentenceReading} complete={r.complete.sentenceReading} />

      {/* 쓰기 과제 — 검사 중 수집분(읽기 전용). 학년에 따라 낱말 쓰기 또는 문장 쓰기다. */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">{writingLabel}
        <span className="ml-2 font-normal text-[11px] text-ink-mute">
          검사 중 기록 · 정확하게 쓴 {f.writingSection === 'word_writing' ? '낱말' : '어절'} 1점
        </span>
      </h2>
      {f.writingSection === 'word_writing' ? (
        <>
          <WordGrid rowLabel="의미 낱말" words={writeItemsOf('meaning')} marks={writingMarks} readOnly />
          <WordGrid rowLabel="무의미 낱말" words={writeItemsOf('nonsense')} marks={writingMarks} readOnly />
          <Subtotal
            cells={[
              { label: '의미 점수', value: r.writeMeaning, max: writeMax.meaning },
              { label: '무의미 점수', value: r.writeNonsense, max: writeMax.nonsense },
            ]}
            total={{ label: '총 점수', value: r.writing, max: taskMax.writing }}
            verdict={r.verdict.writing} complete={r.complete.writing} />
        </>
      ) : (
        <>
          <SentenceWriteRows items={f.writingItems} writing={writing} />
          <Subtotal total={{ label: '총점', value: r.writing, max: taskMax.writing }}
            verdict={r.verdict.writing} complete={r.complete.writing} />
        </>
      )}

      {/* 검사자 체크리스트 */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">{SECTION_LABEL.checklist}</h2>
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
        {/* 공식 출력은 원본 검사지에 점수를 얹은 PDF 하나로 통일한다 — 화면 인쇄와 두 갈래면
            어느 쪽을 학교에 내는지 현장에서 헷갈린다. 이 화면은 채점 작업대로 남는다. */}
        <a href={`/api/admin/sessions/${sessionId}/sheet.pdf`} download
          className="rounded-lg border-[1.5px] border-line bg-well px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-blue">
          검사지 PDF 다운로드
        </a>
        {/* PDF는 DB에 저장된 점수로 만들어진다 — 저장하지 않은 수정은 빠진다. */}
        <span className="text-[11px] text-ink-mute">
          저장한 채점 내용으로 만들어집니다
          {!(r.complete.wordReading && r.complete.sentenceReading && r.complete.writing)
            && ' · 채점이 끝나지 않은 과제는 점수 칸이 비어 나갑니다'}
        </span>
        {dirty && <span className="text-xs font-bold text-amber">저장하지 않은 채점이 있어요</span>}
        {msg && <span aria-live="polite" className="text-xs text-ink-soft">{msg}</span>}
      </div>

      <p className="border-t border-line bg-well px-4 py-2.5 text-[10.5px] leading-relaxed text-ink-mute">
        채점 기준({form.id}): 낱말 해독은 {form.limits.wordSec}초, 문장 읽기유창성은 {form.limits.sentenceSec}초 내 정확 반응 수.
        녹음은 마지막 반응이 잘리지 않도록 조금 더 담기므로, 기준 시간 이후 반응은 채점하지 않습니다.
        {PROVISIONAL_CRITERIA && (
          <> Pass 기준은 <b>임시값</b>입니다 — 낱말 해독 {passMark.wordReading} / {taskMax.wordReading} ·
          문장 읽기유창성 {passMark.sentenceReading} / {taskMax.sentenceReading} ·
          {' '}{writingLabel} {passMark.writing} / {taskMax.writing}.
          실제 기준표를 받으면 숫자만 교체되며, 이미 채점한 세션도 저장된 점수로 다시 계산됩니다.</>
        )}
      </p>
    </section>
  )
}
