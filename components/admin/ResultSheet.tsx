// components/admin/ResultSheet.tsx — 관리자 결과지.
// 종이 검사지(assets/forms/kodys-g*.pdf)와 같은 순서·구조로 두고,
// 각 줄에 아동의 결과물(녹음·검사 중 응답)과 채점 입력을 함께 놓는다.
// 공식 출력물은 이 화면이 아니라 검사지 PDF다(/api/admin/sessions/[id]/sheet.pdf).
// 화면 인쇄(@page, app/globals.css)는 작업 중 참고용으로만 남겨 둔다.
'use client'
import { useEffect, useState } from 'react'
import { KIND_LABEL, SECTION_LABEL, areaLabel, itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'
import { PROVISIONAL_CRITERIA, scoreSession, scoringFor, sheetPdfGate, type TaskKey } from '@/lib/scoring'
import { CEILING_N, readingCeilingHit, requiredWritingCodes } from '@/lib/survey-flow'
import { contactLabel, examinerLabel, gradeClassLabel, sheetDateLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { Badge } from '@/components/Badge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { BadgeLegend } from './BadgeLegend'
import { ScoreBand } from './sheet/ScoreBand'
import { TaskSection } from './sheet/TaskSection'
import { Subtotal } from './sheet/Subtotal'
import { WordScoreRows } from './sheet/WordScoreRows'
import { WritingChips } from './sheet/WritingChips'
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
  const [gateOpen, setGateOpen] = useState(false)
  // 중단 규칙을 새로 성립시키는 O/X — 확인 전까지 반영을 보류한다
  const [pendingMark, setPendingMark] = useState<{ code: string; v: boolean } | null>(null)

  const form = formForGrade(session.grade)
  const f = itemsFor(form)
  const { taskMax, readMax, writeMax, passMark } = scoringFor(form)
  const r = scoreSession(form, { marks, sentences, writing })
  // 중단 판정은 여기서 한 번만 — 하위 컴포넌트 여섯 곳이 각자 판정하면 어긋난다(스펙).
  const disc = r.discontinued
  // **규칙 우선**(사용자 확정 2026-08-12). 예전에는 "데이터 우선"이었다 — 응답이 남아 있으면
  // 미실시로 가리지 않았는데, 그때 소계에는 그 값이 더해져 화면과 총점이 어긋났다.
  // 이제 scoreSession이 중단 이후 과제를 총점에서 빼므로, 화면도 규칙만 보고 미실시로 적는다.
  // 수집된 값 자체는 잠긴 입력칸에 회색으로 남아 있어(오채점 확인용) 기록이 사라지지 않는다.
  const nonsenseReadNA = disc.wordReading
  const sentenceReadNA = disc.sentenceReading
  // 중단 대상 과제에 실제 수집된 값이 있는지 — 검사 당시에는 실시됐다는 뜻이다.
  const retroData = f.nonsenseReadCodes.some(c => marks[c] !== undefined)
    || f.sentenceItems.some(i => sentences[i.code] !== undefined)
  // 실시됐는데 사후 채점으로 중단이 성립한 경우 — 결과지에 이유를 밝힌다.
  const retroDisc = disc.wordReading && retroData
  // 쓰기는 반대로 **규칙 우선**이다. 중단 이후 문항은 값이 남아 있어도 총점에서 빠지므로
  // (scoreSession이 실시 문항만 더한다 — 사용자 확정 2026-08-12 항목 10), 화면에도 값을
  // 보여주면 "화면엔 O가 있는데 총점에 없는" 어긋남이 생긴다. 실시 문항 판정은 한 곳에서만 한다.
  const implementedWriting = requiredWritingCodes(f, f.writingItems, writing)
  const nonsenseWriteNA = disc.writing && f.nonsenseWriteCodes.every(c => !implementedWriting.has(c))
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

  // 채점을 고치면 이전 저장 결과 안내("저장했어요.")를 지운다 — 안 지우면 옆의
  // "저장하지 않은 채점이 있어요"와 동시에 떠서 무엇이 저장된 상태인지 알 수 없다
  // (사용자 보고 2026-08-12 항목 6).
  // 검사지 PDF 관문 — 채점이 끝나기 전에 실수로 공식 문서를 내려받지 않게 한다.
  const pdfHref = `/api/admin/sessions/${sessionId}/sheet.pdf`
  const gate = sheetPdfGate(r, dirty)
  const TASK_LABEL: Record<TaskKey, string> = {
    wordReading: SECTION_LABEL.word_reading,
    sentenceReading: SECTION_LABEL.sentence_reading,
    writing: writingLabel,
  }

  const applyMark = (code: string, v: boolean) => { setMsg(''); setMarks(m => ({ ...m, [code]: v })) }

  /** 이 O/X 하나로 중단 규칙 ①이 **새로** 성립하면, 이미 실시된 뒷 과제가 채점에서 빠진다.
   *  되돌릴 수 있는 변경이지만 결과가 크므로 반영 전에 한 번 묻는다(사용자 확정 2026-08-12). */
  const setMark = (code: string, v: boolean) => {
    const next = { ...marks, [code]: v }
    const newlyDisc = !readingCeilingHit(f, marks) && readingCeilingHit(f, next)
    if (newlyDisc && retroData) { setPendingMark({ code, v }); return }
    applyMark(code, v)
  }
  const setSentence = (code: string, v: number | undefined) => {
    setMsg('')
    setSentences(s => {
      const next = { ...s }
      if (v === undefined) delete next[code]
      else next[code] = v
      return next
    })
  }

  const readItemsOf = (kind: 'meaning' | 'nonsense') => f.readItems.filter(i => i.kind === kind)

  return (
    <section className="result-sheet">
      {/* 머리글 — 종이 검사지 상단과 같은 항목 */}
      <header className="border-b-2 border-ink/80 px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold leading-none tracking-tight">{form.title}</h1>
            <p className="mt-1 text-[12px] font-bold text-ink-mute">{form.subtitle}</p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
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
        <p className="mt-2 text-[12px] text-ink-mute">
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

      {retroDisc && (
        // 검사 당시엔 실시된 과제가 사후 채점으로 미실시가 된 상황 — 화면이 이유를 말하지 않으면
        // 점수가 왜 사라졌는지 알 수 없다. 되돌리는 방법(O/X 재수정)도 함께 적는다.
        <p className="border-b border-line bg-amber/10 px-5 py-3 text-[12.5px] leading-relaxed text-amber">
          <b>채점 결과 중단 규칙 ①이 성립했습니다</b> — 의미 낱말 첫 {CEILING_N}개가 연속 오반응입니다.
          검사 당시에는 실시된 <b>무의미 낱말·문장 읽기유창성</b>이 규칙상 미실시가 되어 채점에서
          제외됩니다(수집된 값은 아래 잠긴 칸에 그대로 남아 있고, 의미 낱말 O/X를 고치면 다시 합산됩니다).
        </p>
      )}

      <ScoreBand form={form} result={r} />

      {/* 낱말 해독 — 그룹별 sticky 플레이어 아래에서 듣면서 찍는다 */}
      <TaskSection title={SECTION_LABEL.word_reading}
        hint={`${form.limits.wordSec}초 동안 정확하게 읽은 낱말 수`}>
        <WordScoreRows items={readItemsOf('meaning')} marks={marks} onMark={setMark}
          audio={<PageAudio label={`${KIND_LABEL.meaning} 낱말`} attempts={attemptsOf('p_rw_meaning')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />} />
        <WordScoreRows items={readItemsOf('nonsense')} marks={marks} onMark={setMark}
          locked={nonsenseReadNA}
          audio={<PageAudio label={`${KIND_LABEL.nonsense} 낱말`} attempts={attemptsOf('p_rw_nonsense')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError}
            notAdministered={nonsenseReadNA} />} />
        <Subtotal
          cells={[
            { label: '의미 점수', value: r.wordMeaning, max: readMax.meaning },
            { label: '무의미 점수', value: r.wordNonsense, max: readMax.nonsense, na: nonsenseReadNA },
          ]}
          total={{ label: '총 점수', value: r.wordReading, max: taskMax.wordReading }}
          verdict={r.verdict.wordReading} complete={r.complete.wordReading}
          discontinued={disc.wordReading} />
      </TaskSection>

      <TaskSection title={SECTION_LABEL.sentence_reading}
        hint={`${form.limits.sentenceSec}초 동안 정확하게 읽은 어절 수`}>
        <SentenceRows items={f.sentenceItems} sentences={sentences} onChange={setSentence}
          attemptsFor={code => attemptsOf(`p_${code}`)} locked={sentenceReadNA}
          limitSec={form.limits.sentenceSec} onAudioError={onAudioError} />
        <Subtotal total={{ label: '총점', value: r.sentenceReading, max: taskMax.sentenceReading, na: sentenceReadNA }}
          verdict={r.verdict.sentenceReading} complete={r.complete.sentenceReading}
          discontinued={disc.sentenceReading} />
      </TaskSection>

      {/* 쓰기 과제 — 검사 중 수집분(읽기 전용). 학년에 따라 낱말 쓰기 또는 문장 쓰기다. */}
      <TaskSection title={writingLabel}
        hint={`검사 중 기록 · 정확하게 쓴 ${f.writingSection === 'word_writing' ? '낱말' : '어절'} 1점`}>
      {f.writingSection === 'word_writing' ? (
        <>
          <WritingChips items={f.writingItems} writing={writing} implemented={implementedWriting} />
          <Subtotal
            cells={[
              { label: '의미 점수', value: r.writeMeaning, max: writeMax.meaning },
              { label: '무의미 점수', value: r.writeNonsense, max: writeMax.nonsense, na: nonsenseWriteNA },
            ]}
            total={{ label: '총 점수', value: r.writing, max: taskMax.writing }}
            verdict={r.verdict.writing} complete={r.complete.writing}
            discontinued={disc.writing} />
        </>
      ) : (
        <>
          <SentenceWriteRows items={f.writingItems} writing={writing} implemented={implementedWriting} />
          <Subtotal total={{ label: '총점', value: r.writing, max: taskMax.writing }}
            verdict={r.verdict.writing} complete={r.complete.writing}
            discontinued={disc.writing} />
        </>
      )}
      </TaskSection>

      <TaskSection title={SECTION_LABEL.checklist}>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {session.checklist.length === 0
            ? <span className="text-sm text-ink-mute">선택 없음</span>
            : session.checklist.map(c => <Badge key={c} tone="mute">{areaLabel(c)}</Badge>)}
        </div>
      </TaskSection>

      {/* 저장 줄은 화면 아래에 붙여 둔다(sticky). 채점은 위에서부터 하는데 저장 버튼이 문서 끝에만
          있으면 끝까지 스크롤해야 하고, "저장하지 않은 채점이 있어요" 경고도 그때서야 보인다 —
          정작 채점하는 동안 눈에 띄어야 하는 경고다. 설명 문구는 아래 줄로 내려 띠를 얇게 유지한다. */}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 border-t border-line bg-white px-4 py-3 print:hidden">
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-blue px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40">
          {saving ? '저장 중…' : '채점 저장'}
        </button>
        {/* 공식 출력은 원본 검사지에 점수를 얹은 PDF 하나로 통일한다 — 화면 인쇄와 두 갈래면
            어느 쪽을 학교에 내는지 현장에서 헷갈린다. 이 화면은 채점 작업대로 남는다.
            채점이 끝나지 않았으면 내려받지 않고 이유를 모달로 알린다(sheetPdfGate). */}
        <a href={pdfHref} download
          onClick={e => { if (gate) { e.preventDefault(); setGateOpen(true) } }}
          className="rounded-lg border-[1.5px] border-line bg-well px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-blue">
          검사지 PDF 다운로드
        </a>
        {dirty && <span className="text-[13px] font-bold text-amber">저장하지 않은 채점이 있어요</span>}
        {msg && <span aria-live="polite" className="text-[13px] text-ink-soft">{msg}</span>}
      </div>
      {/* PDF는 DB에 저장된 점수로 만들어진다 — 저장하지 않은 수정은 빠진다. */}
      <p className="border-t border-line px-4 py-2.5 text-[12px] leading-relaxed text-ink-mute print:hidden">
        검사지 PDF는 저장한 채점 내용으로 만들어집니다
        {(!(r.complete.wordReading && r.complete.sentenceReading && r.complete.writing)
          || disc.wordReading || disc.sentenceReading || disc.writing)
          && ' · 채점이 끝나지 않은 과제는 점수 칸이 비어 나갑니다'}
      </p>

      {/* 「채점 전」이 0점으로, Pass/Fail이 확정 판정으로 읽히면 임상적 오독이다 — 화면에 상시 둔다.
          설명이 한 문장으로 끝나지 않아 1열로 둔다(2열이면 폭이 반이라 대여섯 줄로 접힌다). */}
      <ConfirmDialog open={pendingMark !== null}
        title="이 채점으로 검사가 중단됩니다"
        confirmLabel="그대로 반영" cancelLabel="취소"
        onConfirm={() => { const p = pendingMark!; setPendingMark(null); applyMark(p.code, p.v) }}
        onClose={() => setPendingMark(null)}>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
          의미 낱말 첫 {CEILING_N}개가 연속 오반응이 되어 <b>무의미 낱말·문장 읽기유창성</b>이
          채점에서 <b className="text-rec-deep">제외</b>됩니다. 검사 중 수집된 값은 지워지지 않고,
          O/X를 다시 고치면 되살아납니다.
        </p>
      </ConfirmDialog>

      {gate && (
        <ConfirmDialog open={gateOpen}
          title={gate.reason === 'dirty' ? '먼저 채점을 저장해 주세요' : '채점이 끝나지 않았어요'}
          cancelLabel="닫기"
          confirmLabel={gate.reason === 'dirty' ? '채점 저장'
            : gate.overridable ? '그래도 다운로드' : '채점 계속하기'}
          onConfirm={() => {
            setGateOpen(false)
            if (gate.reason === 'dirty') { void save(); return }
            // 결과지에서 채울 수 없는 과제(쓰기)만 남았으면 경고를 확인한 뒤 내려받는다.
            if (gate.overridable) window.location.href = pdfHref
          }}
          onClose={() => setGateOpen(false)}>
          <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
            {gate.reason === 'dirty' ? (
              <>검사지 PDF는 <b>저장된 채점</b>으로 만들어집니다. 지금 화면의 수정은 아직 저장되지 않아
                빠진 채로 나갑니다.</>
            ) : gate.overridable ? (
              <><b>{gate.tasks.map(k => TASK_LABEL[k]).join(' · ')}</b>가 검사 중에 기록되지 않았습니다.
                이 화면에서는 채울 수 없으니, 그대로 내려받으면 점수 칸이 <b>빈 채로</b> 나갑니다.</>
            ) : (
              <><b>{gate.tasks.map(k => TASK_LABEL[k]).join(' · ')}</b> 채점이 남아 있습니다.
                녹음을 듣고 채점을 마친 뒤 <b>[채점 저장]</b>을 누르면 내려받을 수 있어요.</>
            )}
          </p>
        </ConfirmDialog>
      )}

      <BadgeLegend
        columns={1}
        items={[
          {
            badge: (
              <span className="flex gap-1">
                <Badge tone="mute">채점 전</Badge><Badge tone="mute">중단</Badge>
              </span>
            ),
            desc: <>아직 채점하지 않았거나 중단 규칙으로 <b>실시하지 않은</b> 과제입니다.
              <b className="text-rec-deep"> 0점이 아닙니다</b> — 검사지 PDF에도 점수 칸이 비어 나갑니다.
              중단된 과제는 기준 점수 판정(Pass/Fail)을 하지 않습니다.</>,
          },
          {
            badge: <Badge tone="rec">미녹음</Badge>,
            desc: <>녹음이 올라오지 않은 과제입니다. 읽은 반응이 없으므로 <b>오반응(X · 0점)으로
              기본 채점</b>되어 화면·검사지 PDF에 그대로 나갑니다(사용자 확정 2026-08-12).
              녹음을 들어보고 고치면 저장한 값이 기본값을 대신합니다.</>,
          },
          {
            badge: (
              <span className="flex gap-1">
                <Badge tone="mint">Pass</Badge><Badge tone="rec">Fail</Badge>
              </span>
            ),
            desc: <>과제별 기준 점수에 따른 판정입니다. 채점이 끝난 과제에만 나오며,
              <b> 공식 검사지 PDF에는 찍히지 않습니다.</b></>,
          },
          ...(PROVISIONAL_CRITERIA ? [{
            badge: <Badge tone="amber">임시 기준 · 확정 전</Badge>,
            desc: <>Pass 기준이 담당자 기준표를 받기 전까지 쓰는 <b>임시 숫자</b>라는 표시입니다 —
              낱말 해독 {passMark.wordReading} / {taskMax.wordReading} ·
              문장 읽기유창성 {passMark.sentenceReading} / {taskMax.sentenceReading} ·
              {' '}{writingLabel} {passMark.writing} / {taskMax.writing}.
              기준표를 받으면 숫자만 교체되며 이미 채점한 세션도 저장된 점수로 다시 계산됩니다.</>,
          }] : []),
        ]}
        note={<>채점 기준({form.id}): 낱말 해독은 {form.limits.wordSec}초, 문장 읽기유창성은 {form.limits.sentenceSec}초 내
          정확 반응 수. 녹음은 마지막 반응이 잘리지 않도록 조금 더 담기므로, 기준 시간 이후 반응은 채점하지 않습니다.</>}
      />
    </section>
  )
}
