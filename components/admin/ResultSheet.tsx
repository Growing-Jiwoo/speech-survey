// components/admin/ResultSheet.tsx — 관리자 결과지.
// 종이 검사지(assets/forms/kodys-g*.pdf)와 같은 순서·구조로 두고,
// 각 줄에 아동의 결과물(녹음·검사 중 응답)과 채점 입력을 함께 놓는다.
// 공식 출력물은 이 화면이 아니라 검사지 PDF다(/api/admin/sessions/[id]/sheet.pdf).
// 화면 인쇄(@page, app/globals.css)는 작업 중 참고용으로만 남겨 둔다.
'use client'
import { useCallback, useEffect, useState } from 'react'
import { KIND_LABEL, SECTION_LABEL, areaLabel, itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'
import { PROVISIONAL_CRITERIA, scoreSession, scoringFor, sheetPdfGate, type TaskKey } from '@/lib/scoring'
import { contactLabel, gradeClassLabel, sheetDateLabel } from '@/lib/format'
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

/** 자동 저장 디바운스(ms). 채점자가 O/X를 연달아 찍는 속도보다 길고, 화면을 떠나기 전에
 *  끝날 만큼은 짧게 — 손을 멈춘 뒤 한 번만 저장되게 하는 값이다. */
const AUTOSAVE_DELAY_MS = 1500

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
  // 자동 저장이 실패한 뒤에는 채점자가 무언가 고칠 때까지 다시 시도하지 않는다 —
  // dirty가 그대로라 조건이 계속 참이어서, 이 플래그가 없으면 실패하는 엔드포인트를
  // 1.5초마다 영원히 두드린다.
  const [autoFailed, setAutoFailed] = useState(false)

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
  // 떠날 때 dirty를 내린다 — 빠뜨리면 결과지를 벗어난 뒤에도 상위가 "저장 안 한 채점이 있다"고
  // 믿어, 다음 아동으로 넘어갈 때마다 없는 채점을 두고 경고 모달이 뜬다.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // 탭 닫기·새로고침은 앱이 막을 수 없으므로 브라우저 기본 경고에 맡긴다(검사 화면과 같은 방식).
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useCallback(async (auto = false) => {
    setSaving(true)
    if (!auto) setMsg('')
    // requestJson은 init으로 { method?, body? }만 받고, body가 있으면 Content-Type과 직렬화를 스스로 한다.
    const res = await requestJson(`/api/admin/sessions/${sessionId}/scores`,
      { method: 'PUT', body: { marks, sentences } },
      '채점 저장에 실패했어요. 다시 시도해 주세요.')
    setSaving(false)
    if (res.ok) {
      setSavedMarks(marks); setSavedSentences(sentences); setAutoFailed(false)
      // 자동 저장은 검사 진행 화면과 같은 말을 쓴다("자동 저장됨") — 채점자가 누른 적 없는
      // 동작을 "저장했어요."로 알리면 자기가 저장한 것으로 오해한다.
      setMsg(auto ? '자동 저장됨' : '저장했어요.')
    } else {
      setMsg(res.error)
      if (auto) setAutoFailed(true)
    }
  }, [marks, sentences, sessionId])

  /**
   * 자동 저장 — dirty가 생기면 잠시 뒤 스스로 저장한다.
   *
   * 왜 경고가 아니라 저장인가: **브라우저 뒤로가기는 앱이 막을 수 없다.** SPA popstate는
   * beforeunload도 확인 모달도 타지 않아, 채점자가 뒤로가기(또는 트랙패드 스와이프) 한 번에
   * 녹음 14개를 듣고 찍은 판단이 조용히 사라졌다(브라우저에서 재현 확인, 리뷰 G-06).
   * 그런데 이 화면의 동선이 목록↔결과지를 계속 오가는 것이라 그 경로가 유난히 잦다.
   * 경고를 하나 더 붙이는 것보다 **잃을 것 자체를 없애는 쪽**이 맞다.
   *
   * 채점은 제출 여부와 무관하게 언제든 다시 고칠 수 있으므로(saveScores docblock) 중간
   * 상태가 저장돼도 해가 없다. 저장 의미는 explicit save와 완전히 같다 — 화면에 보이는
   * 그대로를 보내고, 문장 점수는 "보낸 것이 전부"로 취급된다.
   *
   * [채점 저장] 버튼은 그대로 둔다: 자동 저장이 실패했을 때 다시 시도하는 손잡이이고,
   * 검사지 PDF 관문 모달도 그 동작을 호출한다.
   */
  useEffect(() => {
    if (!dirty || saving || autoFailed) return
    const t = setTimeout(() => { void save(true) }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(t)
    // save는 marks·sentences가 바뀌면 새로 만들어진다 — 그래서 타이핑 중에는 타이머가
    // 계속 미뤄지고(디바운스), 손을 멈춘 뒤에 한 번만 저장된다.
  }, [dirty, saving, autoFailed, save])

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

  // 채점을 고치면 자동 저장 재시도를 다시 허용한다 — 실패가 그 값 때문이었을 수 있고,
  // 무엇보다 채점자가 방금 한 작업은 반드시 저장 시도를 한 번 더 받아야 한다.
  const setMark = (code: string, v: boolean) => {
    setMsg(''); setAutoFailed(false); setMarks(m => ({ ...m, [code]: v }))
  }
  const setSentence = (code: string, v: number | undefined) => {
    setMsg(''); setAutoFailed(false)
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
              ['번호', String(session.child_no)],
              ['학생명', session.child_name],
              ['성별', session.gender],
              ['생년월일', session.birth_ymd],
              ['검사일', sheetDateLabel(session.started_at)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-ink-mute">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-2 text-[12px] text-ink-mute">
          담임 {session.teacher_name} ({contactLabel(session.teacher_phone, session.teacher_email)})
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

      {/* 낱말 해독 — 그룹별 sticky 플레이어 아래에서 듣면서 찍는다 */}
      <TaskSection title={SECTION_LABEL.word_reading}
        hint={`${form.limits.wordSec}초 동안 정확하게 읽은 낱말 수`}>
        <WordScoreRows items={readItemsOf('meaning')} marks={marks} onMark={setMark}
          audio={<PageAudio label={`${KIND_LABEL.meaning} 낱말`} attempts={attemptsOf('p_rw_meaning')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />} />
        <WordScoreRows items={readItemsOf('nonsense')} marks={marks} onMark={setMark}
          audio={<PageAudio label={`${KIND_LABEL.nonsense} 낱말`} attempts={attemptsOf('p_rw_nonsense')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />} />
        <Subtotal
          cells={[
            { label: '의미 점수', value: r.wordMeaning, max: readMax.meaning },
            { label: '무의미 점수', value: r.wordNonsense, max: readMax.nonsense },
          ]}
          total={{ label: '총 점수', value: r.wordReading, max: taskMax.wordReading }}
          verdict={r.verdict.wordReading} complete={r.complete.wordReading} />
      </TaskSection>

      <TaskSection title={SECTION_LABEL.sentence_reading}
        hint={`${form.limits.sentenceSec}초 동안 정확하게 읽은 어절 수`}>
        <SentenceRows items={f.sentenceItems} sentences={sentences} onChange={setSentence}
          attemptsFor={code => attemptsOf(`p_${code}`)}
          limitSec={form.limits.sentenceSec} onAudioError={onAudioError} />
        <Subtotal total={{ label: '총점', value: r.sentenceReading, max: taskMax.sentenceReading }}
          verdict={r.verdict.sentenceReading} complete={r.complete.sentenceReading} />
      </TaskSection>

      {/* 쓰기 과제 — 검사 중 수집분(읽기 전용). 학년에 따라 낱말 쓰기 또는 문장 쓰기다. */}
      <TaskSection title={writingLabel}
        hint={`검사 중 기록 · 정확하게 쓴 ${f.writingSection === 'word_writing' ? '낱말' : '어절'} 1점`}>
      {f.writingSection === 'word_writing' ? (
        <>
          <WritingChips items={f.writingItems} writing={writing} />
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
        {/* 이벤트 객체가 auto 인자로 새지 않게 감싼다 — onClick={save}로 두면 MouseEvent가
            첫 인자로 들어가 자동 저장으로 오해된다(타입체커가 잡았다). */}
        <button type="button" onClick={() => void save()} disabled={saving}
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
        {!(r.complete.wordReading && r.complete.sentenceReading && r.complete.writing)
          && ' · 채점이 끝나지 않은 과제는 점수 칸이 비어 나갑니다'}
      </p>

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

      {/* 「채점 전」이 0점으로, Pass/Fail이 확정 판정으로 읽히면 임상적 오독이다 — 화면에 상시 둔다.
          설명이 한 문장으로 끝나지 않아 1열로 둔다(2열이면 폭이 반이라 대여섯 줄로 접힌다). */}
      <BadgeLegend
        columns={1}
        items={[
          {
            badge: <Badge tone="mute">채점 전</Badge>,
            desc: <>아직 채점하지 않은 과제입니다. <b className="text-rec-deep">0점이 아닙니다</b> —
              검사지 PDF에도 점수 칸이 비어 나갑니다.</>,
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
              기준표를 받으면 숫자만 교체되며 이미 채점한 검사도 저장된 점수로 다시 계산됩니다.</>,
          }] : []),
        ]}
        note={<>채점 기준({form.id}): 낱말 해독은 {form.limits.wordSec}초, 문장 읽기유창성은 {form.limits.sentenceSec}초 내
          정확 반응 수. 녹음은 마지막 반응이 잘리지 않도록 조금 더 담기므로, 기준 시간 이후 반응은 채점하지 않습니다.</>}
      />
    </section>
  )
}
