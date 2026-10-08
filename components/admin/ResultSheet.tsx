// components/admin/ResultSheet.tsx — 관리자 결과지.
// 종이 검사지(assets/forms/kodys-g*.pdf)와 같은 순서·구조로 두고,
// 각 줄에 아동의 결과물(녹음·검사 중 응답)과 채점 입력을 함께 놓는다.
// 공식 출력물은 이 화면이 아니라 결과보고서 PDF다(/api/admin/sessions/[id]/sheet.pdf).
// 화면 인쇄(@page, app/globals.css)는 작업 중 참고용으로만 남겨 둔다.
'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { KIND_LABEL, SECTION_LABEL, areaLabel, itemsFor } from '@/lib/items'
import type { SurveyForm } from '@/lib/forms'
import {
  FLUENCY_UNIT, PROVISIONAL_CRITERIA, fluencyLabel, readSecLabel, readSecMax, scoreSession, scoringFor,
  sheetPdfGate, unrecordedItemCodes, withUnrecordedFixed, type TaskKey,
} from '@/lib/scoring'
import { birthLabel, classLabel, contactLabel, reportDateLabel, sheetDateLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { Badge } from '@/components/Badge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { BadgeLegend } from './BadgeLegend'
import { StatusBadge } from './StatusBadge'
import { ScoreBand } from './sheet/ScoreBand'
import { TaskSection } from './sheet/TaskSection'
import { Subtotal } from './sheet/Subtotal'
import { WordScoreRows } from './sheet/WordScoreRows'
import { WritingChips } from './sheet/WritingChips'
import { SentenceRows } from './sheet/SentenceRows'
import { SentenceWriteRows } from './sheet/SentenceWriteRows'
import { ScanViewer } from './sheet/ScanViewer'
import { ScanWritingRows } from './sheet/ScanWritingRows'
import { PageAudio, type Attempt } from './sheet/PageAudio'
import type { SessionRow } from '@/lib/db'

/** 자동 저장 디바운스(ms). 채점자가 O/X를 연달아 찍는 속도보다 길고, 화면을 떠나기 전에
 *  끝날 만큼은 짧게 — 손을 멈춘 뒤 한 번만 저장되게 하는 값이다. */
const AUTOSAVE_DELAY_MS = 1500
const NO_CODES: ReadonlySet<string> = new Set()
const SCAN_CHANGED_NOTICE = '그사이 선생님이 스캔본을 올리거나 바꿨어요. 저장하지 않은 쓰기 채점을 지웠으니 새 스캔본을 보고 다시 채점해 주세요.'

export function ResultSheet({
  sessionId, session, form, writing, initialMarks, initialSentences, initialTimes,
  incomplete, attemptsOf, onAudioError, onDirtyChange, onUnmountFlush, discardOnLeave, saveRef, scan, onScanUnlinked, onScanStale, onSaved,
}: {
  sessionId: string
  session: SessionRow
  /** 받아야 할 녹음·쓰기가 비었는지 — 머리글 상태 배지가 목록과 같은 3단계를 쓰도록 상위가 넘긴다 */
  incomplete: boolean
  /** 세션 학년의 검사지 — 상세 API 응답에서 온다(이 화면이 lib/forms를 import하지 않도록) */
  form: SurveyForm
  /** 쓰기 답 — 값은 정확히 쓴 어절 수. 화면 방식 검사는 검사 중 수집분이라 여기서 다시 채점하지 않고,
   *  스캔본 방식 검사(session.writing_mode === 'scan')만 담당자가 이 화면에서 채점한다(처음 값으로만 쓴다). */
  writing: Partial<Record<string, number>>
  initialMarks: Partial<Record<string, boolean>>
  /** 문장 읽기유창성 점수만 (문장 쓰기는 writing으로 들어온다) */
  initialSentences: Partial<Record<string, number>>
  /** 문장 읽기유창성의 읽은 시간 — 채점자가 저장한 값 */
  initialTimes: Partial<Record<string, number>>
  /** 페이지 코드 → 녹음 시도들 */
  attemptsOf: (pageCode: string) => Attempt[]
  onAudioError: () => void
  /** 저장하지 않은 채점이 있는지 — 상위가 아동 이동·이탈을 막는 데 쓴다 */
  onDirtyChange?: (dirty: boolean) => void
  /** 저장하지 않은 채점을 떠나는 순간 보냈다 — 상위가 그 아이의 상세 캐시를 비운다(아래 언마운트 효과) */
  onUnmountFlush?: (sessionId: string) => void
  /** 떠날 때 저장하지 않은 채점을 **버리기로** 했는지(「저장하지 않고 이동」) — 그러면 위 즉시 저장을 건너뛴다 */
  discardOnLeave?: (sessionId: string) => boolean
  /** 상위가 「저장하고 이동」에서 부를 일반 저장(아래 `save`) — 실패 문구를 돌려준다(성공이면 null, lib/sheet-leave) */
  saveRef?: React.RefObject<(() => Promise<string | null>) | null>
  /** 쓰기 기록지 스캔본(스캔본 방식이고 선생님이 올렸을 때만) — 서명 URL. 서명에 실패하면 url이 null
   *  (파일이 없으면 missing) */
  scan?: { url: string | null; missing?: boolean; uploadedAt: string } | null
  /** 「연결 해제」가 끝났다 — 상위가 상세를 다시 받는다(스캔본이 사라진 화면) */
  onScanUnlinked?: () => void
  /** 가진 스캔본 정보가 낡았다(저장이 「그사이 바뀜」 409로 막혔거나 그림 링크가 만료됐다) — 상위가 상세를 다시 받는다 */
  onScanStale?: () => void
  /** 저장에 성공한 값 — 상위가 캐시를 고친다. 안 고치면 목록을 다녀왔을 때 옛 캐시로 화면이 초기화되고,
   *  다음 자동 저장이 그 옛 값으로 방금 저장한 채점을 덮는다 */
  onSaved?: (v: { marks: Partial<Record<string, boolean>>; sentences: Partial<Record<string, number>>
    times: Partial<Record<string, number>>; writing?: Partial<Record<string, number>> }) => void
}) {
  const f = itemsFor(form)
  // 미녹음 문항은 잠근다 — 들을 녹음이 없어 채점자가 판단할 것이 없다(lib/scoring withUnrecordedFixed).
  // **제출된 검사만**: 진행 중인 검사의 빈 녹음은 "안 읽었다"가 아니라 "아직 안 했다"이다.
  const hasRecording = (pageCode: string) => attemptsOf(pageCode).length > 0
  const locked = session.submitted_at ? unrecordedItemCodes(f, hasRecording) : NO_CODES
  // 잠긴 문항의 예전 저장값(잠그기 전에 넣은 값)은 채점 상태에 싣지 않는다 — 계산은 어차피 보지 않고,
  // 다음 저장 요청에서 빠지므로 문장 점수·시간은 그때 DB에서도 지워진다. 여는 것만으로 저장되지는 않는다.
  const unlocked = <T,>(m: Partial<Record<string, T>>) =>
    Object.fromEntries(Object.entries(m).filter(([c]) => !locked.has(c))) as Partial<Record<string, T>>
  const [marks, setMarks] = useState(() => unlocked(initialMarks))
  const [sentences, setSentences] = useState(() => unlocked(initialSentences))
  const [times, setTimes] = useState(() => unlocked(initialTimes))
  // 스캔본 방식이면 쓰기도 이 화면의 채점 상태다(담당자가 스캔본을 보고 찍는다). 화면 방식은 prop 그대로(읽기 전용).
  const scanMode = session.writing_mode === 'scan'
  const [written, setWritten] = useState(writing)
  // 저장에 성공한 값 — 화면 상태와 비교해 "저장 안 한 변경"을 판단한다
  const [savedMarks, setSavedMarks] = useState(marks)
  const [savedSentences, setSavedSentences] = useState(sentences)
  const [savedTimes, setSavedTimes] = useState(times)
  const [savedWritten, setSavedWritten] = useState(written)
  // 상위 콜백은 최신 것을 참조만 한다 — 저장 함수가 부모의 렌더마다 새로 만들어지면 자동 저장 타이머가 계속 밀린다
  const onSavedRef = useRef(onSaved)
  useEffect(() => { onSavedRef.current = onSaved })
  const seenScanAt = scan?.uploadedAt ?? null
  // 스캔본이 바뀐 것을 알았을 때(409 뒤 다시 받은 상세, 뒤에서 다시 받은 상세) 옛 그림을 보고 찍은 **저장 전** 쓰기는
  // 버린다 — 그대로 두면 새 올린 시각과 함께 저장돼 새 그림에 옛 그림의 점수가 붙는다. 렌더 중에 비교한다
  // (이전 값 보관 — 효과에서 고치면 그 사이 자동 저장 타이머가 새 시각으로 한 번 돈다).
  /** 저장된 쓰기가 있다 — 스캔본 없이 넣었으면 선생님은 올릴 수 없다(lib/scan-mapping 「채점됨」) */
  const hasSavedWriting = Object.keys(savedWritten).length > 0
  const [prevScanAt, setPrevScanAt] = useState(seenScanAt)
  const [scanNotice, setScanNotice] = useState('')
  if (prevScanAt !== seenScanAt) {
    setPrevScanAt(seenScanAt)
    if (JSON.stringify(written) !== JSON.stringify(savedWritten)) { setWritten(savedWritten); setScanNotice(SCAN_CHANGED_NOTICE) }
  }
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [unlinkErr, setUnlinkErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [gateOpen, setGateOpen] = useState(false)
  // 자동 저장이 실패한 뒤에는 채점자가 무언가 고칠 때까지 다시 시도하지 않는다 —
  // dirty가 그대로라 조건이 계속 참이어서, 이 플래그가 없으면 실패하는 엔드포인트를
  // 1.5초마다 영원히 두드린다.
  const [autoFailed, setAutoFailed] = useState(false)

  // 하단 저장 줄(sticky)의 높이 — 채점 컨트롤의 scroll-margin-bottom으로 넘긴다.
  // 위쪽 그룹 플레이어 바와 같은 이유(E2E 5.18): 키보드로 아래 방향으로 내려가면
  // 브라우저가 스크롤하지 않고, 그 자리가 이 줄에 덮인다. flex-wrap이라 좁은 폭에서
  // 두 줄이 되므로 상수로 박지 않는다(WordScoreRows·SessionTable과 같은 관례).
  const saveBarRef = useRef<HTMLDivElement>(null)
  const [saveBarH, setSaveBarH] = useState(0)
  useLayoutEffect(() => {
    const el = saveBarRef.current
    if (!el) return
    setSaveBarH(el.getBoundingClientRect().height)
      // ⚠️ contentRect는 **content box**(패딩·보더 제외)다 — 이 바는 py-2.5 + border-b-2라
      // 실제 높이보다 22px 작게 보고돼 포커스한 버튼의 위쪽이 그만큼 덮였다(실측 2026-08-21).
      // 테두리까지 포함한 값이 필요하므로 borderBoxSize를 쓰고, 없으면 실측으로 떨어진다.
    const ro = new ResizeObserver(([e]) =>
      setSaveBarH(e.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { taskMax, sentenceWordsMax, readMax, writeMax, passMark } = scoringFor(form)
  // 결과보고서 PDF 라우트·교사 결과지와 같은 함수로 미녹음을 고정한 뒤 계산한다 — 저장 전에도 화면과 인쇄물이 같다.
  const entered = { marks, sentences, times, writing: scanMode ? written : writing }
  const r = scoreSession(form, session.submitted_at ? withUnrecordedFixed(f, entered, hasRecording) : entered)
  const writingLabel = SECTION_LABEL[f.writingSection]

  // 저장 전 채점은 화면에만 있다. 아동을 옮기면 사라지므로(다른 아동 화면은 다시 마운트된다)
  // 상위가 막을 수 있도록 알린다. 저장된 값과 비교해 판단한다 — 되돌리면 다시 깨끗해진다.
  const dirty = JSON.stringify(marks) !== JSON.stringify(savedMarks)
    || JSON.stringify(sentences) !== JSON.stringify(savedSentences)
    || JSON.stringify(times) !== JSON.stringify(savedTimes)
    || (scanMode && JSON.stringify(written) !== JSON.stringify(savedWritten))
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  // 떠날 때 dirty를 내린다 — 빠뜨리면 결과지를 벗어난 뒤에도 상위가 "저장 안 한 채점이 있다"고
  // 믿어, 다음 아동으로 넘어갈 때마다 없는 채점을 두고 경고 모달이 뜬다.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  /**
   * 떠나는 순간 저장하지 않은 채점을 **바로 보낸다.** 자동 저장은 1.5초 디바운스라, 찍고 1.5초 안에 브라우저
   * 뒤로가기(popstate — 확인 모달도 beforeunload도 못 막는다)를 하면 타이머만 취소되고 그 채점은 사라졌다.
   * `keepalive`라 페이지가 사라져도 요청은 끝까지 간다. 응답은 받을 수 없으니 상위가 그 아이의 상세 캐시를
   * 비워(onUnmountFlush), 다시 열면 서버에서 새로 받게 한다 — 옛 캐시로 초기화된 화면이 방금 보낸 값을 되덮지
   * 않게. 같은 값을 자동 저장과 두 번 보내도 PUT이라 결과는 같다.
   * 이 요청은 실패를 삼킨다 — 그래서 확인 창의 「저장하고 이동」은 여기에 맡기지 않고 일반 저장(`save`, saveRef)을 기다린다.
   * 단 채점자가 「저장하지 않고 이동」을 골랐으면 보내지 않는다(`discardOnLeave`) — 확인 창이 「사라집니다」라고
   * 말한 값을 몰래 저장하면 버리려던 O/X가 임상 기록에 남는다(사용자 확정 2026-10-07).
   * 본문은 아래 `save`와 **같은 규칙**이어야 한다 — 읽은 시간(`times`)을 빠뜨리면 시간을 넣고 바로 떠날 때 그 값만
   * 사라지고, 스캔본 쓰기는 고쳤을 때만 본 스캔본의 올린 시각과 함께 싣는다. 연결 해제 창이 열려 있거나 해제 중이면
   * 쓰기는 싣지 않는다 — 자동 저장을 멈추는 것과 같은 이유(해제가 지운 쓰기 채점을 되살리지 않게).
   * 응답이 오면(앱 안에서 화면만 옮긴 경우) 저장 성공과 똑같이 `onSaved`를 부른다 — 쓰기를 보냈으면 목록의
   * 「스캔본 채점」 표시가 바뀌어야 한다. 비운 상세 캐시에는 패치가 아무것도 하지 않고, 그사이 다시 열었으면 새 캐시를 맞춘다.
   */
  type FlushBody = Parameters<NonNullable<typeof onSaved>>[0] & { scanUploadedAt?: string | null }
  const flushBody = (): FlushBody => {
    const writingDirty = scanMode && !unlinking && !unlinkOpen && JSON.stringify(written) !== JSON.stringify(savedWritten)
    return { marks, sentences, times, ...(writingDirty ? { writing: written, scanUploadedAt: seenScanAt } : {}) }
  }
  const latestRef = useRef({ dirty: false, body: flushBody() })
  useEffect(() => { latestRef.current = { dirty, body: flushBody() } })
  const onUnmountFlushRef = useRef(onUnmountFlush)
  useEffect(() => { onUnmountFlushRef.current = onUnmountFlush })
  const discardOnLeaveRef = useRef(discardOnLeave)
  useEffect(() => { discardOnLeaveRef.current = discardOnLeave })
  useEffect(() => () => {
    const l = latestRef.current
    const discard = discardOnLeaveRef.current?.(sessionId) ?? false
    if (!l.dirty || discard) return
    const { scanUploadedAt: _seen, ...saved } = l.body
    void fetch(`/api/admin/sessions/${sessionId}/scores`, {
      method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(l.body),
    }).then(r => { if (r.ok) onSavedRef.current?.(saved) }).catch(() => undefined)
    onUnmountFlushRef.current?.(sessionId)
  }, [sessionId])

  // 탭 닫기·새로고침은 앱이 막을 수 없으므로 브라우저 기본 경고에 맡긴다(검사 화면과 같은 방식).
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // 실패 문구를 돌려준다(성공이면 null) — 「저장하고 이동」이 이 결과를 보고 떠날지 정한다(saveRef).
  const save = useCallback(async (auto = false): Promise<string | null> => {
    setSaving(true)
    if (!auto) setMsg('')
    // requestJson은 init으로 { method?, body? }만 받고, body가 있으면 Content-Type과 직렬화를 스스로 한다.
    // 쓰기는 스캔본 방식이고 **고쳤을 때만** 싣는다 — 화면 방식 검사에 실으면 라우트가 409로 거부하고(쓰기 소유권),
    // 고치지 않은 쓰기를 읽기 저장마다 다시 보내면 연결 해제와 겹쳤을 때 지운 채점을 되살린다.
    // 본 스캔본의 올린 시각을 함께 보낸다 — 그사이 선생님이 바꿨으면 라우트가 409로 막는다.
    const writingDirty = scanMode && JSON.stringify(written) !== JSON.stringify(savedWritten)
    const res = await requestJson(`/api/admin/sessions/${sessionId}/scores`,
      { method: 'PUT', body: { marks, sentences, times,
        ...(writingDirty ? { writing: written, scanUploadedAt: seenScanAt } : {}) } },
      '채점 저장에 실패했어요. 다시 시도해 주세요.')
    setSaving(false)
    if (!res.ok && res.status === 409 && writingDirty) {
      // 그사이 선생님이 스캔본을 올리거나 바꿨다(이 요청의 올린 시각이 낡았다). 옛 그림을 보고 찍은 쓰기는 버리고
      // 새 스캔본을 받는다 — 요청 전체가 거부됐으므로 읽기 채점은 다음 자동 저장이 쓰기 없이 다시 보낸다.
      // 그냥 문구만 띄우면 목록을 다녀와도 같은 캐시로 다시 열려 409가 되풀이되고 읽기 저장까지 막힌다.
      setWritten(savedWritten); setScanNotice(SCAN_CHANGED_NOTICE); setMsg('')
      onScanStale?.()
      return SCAN_CHANGED_NOTICE
    }
    if (res.ok) {
      setSavedMarks(marks); setSavedSentences(sentences); setSavedTimes(times); setSavedWritten(written); setAutoFailed(false)
      onSavedRef.current?.({ marks, sentences, times, ...(writingDirty ? { writing: written } : {}) })
      // 자동 저장은 검사 진행 화면과 같은 말을 쓴다("자동 저장됨") — 채점자가 누른 적 없는
      // 동작을 "저장했어요."로 알리면 자기가 저장한 것으로 오해한다.
      setMsg(auto ? '자동 저장됨' : '저장했어요.')
      return null
    }
    setMsg(res.error)
    if (auto) setAutoFailed(true)
    return res.error
  }, [marks, sentences, times, written, savedWritten, scanMode, seenScanAt, sessionId, onScanStale])
  // 「저장하고 이동」은 떠날 때 즉시 저장(위 keepalive)에 맡기지 않고 이 저장을 기다린다 — keepalive는 실패(로그인 만료 401,
  // 스캔본이 바뀐 409)를 삼켜 버려서, 저장을 약속한 버튼이 채점을 조용히 잃었다. 성공하면 저장값이 화면 값과 같아져
  // dirty가 내려가므로 이어지는 언마운트에서 keepalive가 다시 나가지 않는다.
  useEffect(() => { if (saveRef) saveRef.current = () => save(false) })

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
   * 그대로를 보내고, 문장 점수·읽은 시간은 "보낸 것이 전부"로 취급된다.
   *
   * [채점 저장] 버튼은 그대로 둔다: 자동 저장이 실패했을 때 다시 시도하는 손잡이이고,
   * 결과보고서 PDF 관문 모달도 그 동작을 호출한다.
   */
  useEffect(() => {
    // 연결 해제 창이 열려 있거나 해제 중이면 저장하지 않는다 — 해제가 지운 쓰기 채점을 뒤늦은 자동 저장이 되살린다.
    if (!dirty || saving || autoFailed || unlinking || unlinkOpen) return
    const t = setTimeout(() => { void save(true) }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(t)
    // save는 marks·sentences가 바뀌면 새로 만들어진다 — 그래서 타이핑 중에는 타이머가
    // 계속 미뤄지고(디바운스), 손을 멈춘 뒤에 한 번만 저장된다.
  }, [dirty, saving, autoFailed, unlinking, unlinkOpen, save])

  // 채점을 고치면 이전 저장 결과 안내("저장했어요.")를 지운다 — 안 지우면 옆의
  // "저장하지 않은 채점이 있어요"와 동시에 떠서 무엇이 저장된 상태인지 알 수 없다
  // (사용자 보고 2026-08-12 항목 6).
  // 결과보고서 PDF 관문 — 채점이 끝나기 전에 실수로 공식 문서를 내려받지 않게 한다.
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
  const setTime = (code: string, v: number | undefined) => {
    setMsg(''); setAutoFailed(false)
    setTimes(t => {
      const next = { ...t }
      if (v === undefined) delete next[code]
      else next[code] = v
      return next
    })
  }

  const setWrite = (code: string, v: number) => {
    setMsg(''); setScanNotice(''); setAutoFailed(false); setWritten(w => ({ ...w, [code]: v }))
  }

  /** 「이 아이 기록지가 아니에요 — 연결 해제」: 스캔본과 그것을 보고 넣은 쓰기 채점을 지워 스캔 대기로 되돌린다. */
  async function unlink() {
    setUnlinking(true); setUnlinkErr('')
    const res = await requestJson(`/api/admin/sessions/${sessionId}/scan`, { method: 'DELETE' },
      '연결 해제에 실패했어요. 다시 시도해 주세요.')
    setUnlinking(false)
    if (!res.ok) { setUnlinkErr(res.error); return }
    setWritten({}); setSavedWritten({}); setUnlinkOpen(false)
    setMsg(scan ? '연결을 해제했어요. 선생님이 맞는 기록지를 올리면 여기에 보여요.' : '쓰기 채점을 지웠어요.')
    onScanUnlinked?.()
  }

  const readItemsOf = (kind: 'meaning' | 'nonsense') => f.readItems.filter(i => i.kind === kind)
  // 낱말은 그룹(의미/무의미) 하나가 녹음 한 페이지라 그룹 단위로 잠긴다
  const groupLocked = (kind: 'meaning' | 'nonsense') => readItemsOf(kind).some(i => locked.has(i.code))

  return (
    <section className="result-sheet"
      // 채점 컨트롤이 이 값을 scroll-margin-bottom으로 쓴다(globals.css)
      style={{ '--sheet-bottom-bar': `${saveBarH}px` } as React.CSSProperties}>
      {/* 머리글 — 「누구의 검사인가」가 먼저 읽히게 아이 이름을 가장 크게 둔다(사용자 확정 2026-09-29).
          채점자는 아이를 넘기며 이름으로 확인한다 — 일곱 칸을 같은 굵기로 한 줄에 늘어놓았더니 이름이
          묻혔다. 양식·상태는 오른쪽 위 배지로, 채점 중 거의 안 보는 담임·동의는 아래 작은 줄로 내린다.
          날짜·생년월일은 결과보고서 PDF와 같은 표기(birthLabel·reportDateLabel)다. */}
      <header className="border-b-2 border-ink/80 px-5 pb-3.5 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[26px] font-bold leading-none tracking-tight">{session.child_name}</h1>
              <span className="text-[14px] text-ink-soft">{session.gender} · {birthLabel(session.birth_ymd)}</span>
            </div>
            <p className="mt-2.5 text-[14px] text-ink-soft">
              {session.school_name} {classLabel(session.grade, session.class_no)} {session.child_no}번
              {' · '}검사일 {reportDateLabel(session.started_at)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:flex-col sm:items-end sm:gap-2">
            {/* 양식은 학년이 정한다 — 어떤 검사지로 채점했는지 기록에 남기는 식별자라 작게라도 늘 보인다 */}
            <span title={form.subtitle}
              className="rounded-md border border-line px-2 py-0.5 text-[12px] font-bold tracking-tight text-ink-mute">
              {form.title}
            </span>
            <div className="flex flex-wrap gap-1.5 sm:justify-end">
              <StatusBadge submitted={!!session.submitted_at} incomplete={incomplete} />
              {/* 임시 기준으로 나온 Pass/Fail이 실제 판정으로 학교에 전달되지 않도록 화면에 남긴다 — 결과보고서
                  PDF는 담당자 양식을 그대로 따르므로 이 표시가 없다. 기준표 전에는 이 화면이 유일한 경고다. */}
              {PROVISIONAL_CRITERIA && <Badge tone="amber">임시 기준 · 확정 전</Badge>}
            </div>
          </div>
        </div>
        <p className="mt-4 border-t border-line pt-2.5 text-[12px] text-ink-mute">
          담임 {session.teacher_name} · {contactLabel(session.teacher_phone, session.teacher_email)}
          {' · '}
          {/* 법정대리인 동의 확인 기록(개인정보보호법 제22조의2) — 도입 전 수집분은 '기록 없음' */}
          {session.guardian_consented_at
            ? `보호자 동의 확인 ${reportDateLabel(session.guardian_consented_at)}`
            : '보호자 동의 기록 없음'}
        </p>
      </header>

      <ScoreBand form={form} result={r} />

      {/* 낱말 해독 — 그룹별 sticky 플레이어 아래에서 듣면서 찍는다 */}
      <TaskSection title={SECTION_LABEL.word_reading}
        hint={`${form.limits.wordSec}초 동안 정확하게 읽은 낱말 수`}>
        <WordScoreRows items={readItemsOf('meaning')} marks={marks} onMark={setMark} locked={groupLocked('meaning')}
          audio={<PageAudio label={`${KIND_LABEL.meaning} 낱말`} attempts={attemptsOf('p_rw_meaning')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />} />
        <WordScoreRows items={readItemsOf('nonsense')} marks={marks} onMark={setMark} locked={groupLocked('nonsense')}
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

      {/* 문장마다 읽은 시간(초)과 정확 어절을 넣고, 총점은 어절 합 ÷ 시간 합(담당자 확정 2026-09-29,
          lib/scoring `CountTaskKey` 주석). 시간은 녹음을 듣고 채점자가 판단해 넣는다 — 녹음 없는 문장은 잠긴다. */}
      <TaskSection title={SECTION_LABEL.sentence_reading}
        hint="문장마다 읽은 시간(초)과 정확하게 읽은 어절 수 · 총점 = 어절 ÷ 시간">
        <SentenceRows items={f.sentenceItems} sentences={sentences} onChange={setSentence}
          times={times} locked={locked} onTimeChange={setTime} maxSec={readSecMax(form)}
          attemptsFor={code => attemptsOf(`p_${code}`)}
          limitSec={form.limits.sentenceSec} onAudioError={onAudioError} />
        <Subtotal
          cells={[
            { label: '정확 어절', value: r.sentenceWords, max: sentenceWordsMax },
            { label: '읽은 시간', value: readSecLabel(r.sentenceSec), unit: '초' },
          ]}
          total={{ label: '총점', value: fluencyLabel(r.sentenceReading), unit: FLUENCY_UNIT }}
          verdict={r.verdict.sentenceReading} complete={r.complete.sentenceReading} />
      </TaskSection>

      {/* 쓰기 과제 — 학년에 따라 낱말 쓰기 또는 문장 쓰기다. 화면 방식은 검사 중 수집분(읽기 전용),
          스캔본 방식은 담당자가 왼쪽 스캔본을 보며 오른쪽 칸을 찍는다(사용자 확정 2026-09-30).
          스캔본이 아직 없어도 찍을 수 있다 — 판독이 어려워 종이를 따로 받아 채점하는 경우의 길이다. */}
      <TaskSection title={writingLabel}
        hint={`${scanMode ? '스캔본을 보고 채점' : '검사 중 기록'} · 정확하게 쓴 ${f.writingSection === 'word_writing' ? '낱말' : '어절'} 1점`}
        aside={scanMode && (scan
          ? <Badge tone="blue" size="sm">스캔본 · {sheetDateLabel(scan.uploadedAt)} 선생님이 올림</Badge>
          : hasSavedWriting
            ? <Badge tone="blue" size="sm">스캔본 없이 채점 중</Badge>
            : <Badge tone="amber" size="sm">스캔 대기 · 아직 안 올라왔어요</Badge>)}>
      {scanMode && (
        <div className="grid gap-4 px-4 py-3 lg:grid-cols-2">
          {scanNotice && (
            <p role="alert" className="rounded-xl border border-amber/40 bg-amber/10 px-3.5 py-2.5 text-[13px] font-bold text-amber lg:col-span-2">
              {scanNotice}
            </p>
          )}
          <div>
            {scan?.url ? (
              <ScanViewer url={scan.url} alt={`${session.child_name} ${writingLabel} 기록지 스캔본`} onExpired={onScanStale} />
            ) : (
              <div className="flex min-h-48 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-well px-4 py-8 text-center">
                {scan?.missing ? (
                  // 행은 있는데 파일이 없다(정리가 중간에 끊긴 경우) — 연결을 해제하면 선생님이 다시 올릴 수 있다
                  <>
                    <p className="text-[13.5px] font-bold text-rec-deep">스캔본 파일을 찾지 못했어요</p>
                    <p className="text-[12.5px] leading-relaxed text-ink-mute">아래 「스캔본 연결 해제」 뒤 선생님께 다시 올려 달라고 해 주세요.</p>
                  </>
                ) : scan ? (
                  // 파일은 있을 수 있다(스토리지 일시 오류) — 해제는 스캔본과 쓰기 채점을 지우므로 권하지 않는다
                  <>
                    <p className="text-[13.5px] font-bold text-ink-soft">스캔본을 불러오지 못했어요</p>
                    <p className="text-[12.5px] leading-relaxed text-ink-mute">잠시 뒤 결과지를 새로 열어 주세요.</p>
                  </>
                ) : hasSavedWriting ? (
                  // 스캔본 없이 쓰기를 넣기 시작했다(종이로 채점) — 선생님 화면에서는 이미 「채점이 시작됨」이라 올릴 수 없다
                  <>
                    <p className="text-[13.5px] font-bold text-ink-soft">스캔본 없이 쓰기를 채점하고 있어요</p>
                    <p className="text-[12.5px] leading-relaxed text-ink-mute">
                      쓰기 칸이 채워져 있어 선생님은 스캔본을 올릴 수 없어요.<br />올리게 하려면 아래 「쓰기 채점 지우기」를 누르세요.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[13.5px] font-bold text-ink-soft">아직 스캔본이 올라오지 않았어요</p>
                    <p className="text-[12.5px] leading-relaxed text-ink-mute">
                      선생님이 결과지 화면에서 올리면 여기에 보여요.<br />종이를 따로 받았다면 바로 채점해도 돼요.
                    </p>
                  </>
                )}
              </div>
            )}
            {/* 스캔본이 있으면 「다른 아이 기록지」 해제. 스캔본 없이 쓰기가 들어가 있으면 그것을 지우는 길 —
                없으면 잘못 누른 칸 하나로 「채점 시작」이 되어 선생님이 스캔본을 영영 못 올린다. 같은 해제 동작이다. */}
            {(scan || hasSavedWriting) && (
              <button type="button" onClick={() => { setUnlinkErr(''); setUnlinkOpen(true) }} disabled={saving || unlinking}
                className="mt-2 text-[12.5px] font-bold text-ink-soft underline underline-offset-2 transition hover:text-rec-deep disabled:opacity-40 print:hidden">
                {scan?.missing ? '스캔본 연결 해제 — 선생님이 다시 올릴 수 있게'
                  : scan ? '이 아이 기록지가 아니에요 — 연결 해제' : '쓰기 채점 지우기 — 선생님이 스캔본을 올릴 수 있게'}
              </button>
            )}
          </div>
          <ScanWritingRows items={f.writingItems} kind={f.writingSection === 'word_writing' ? 'word' : 'sentence'}
            writing={written} onChange={setWrite} />
        </div>
      )}
      {f.writingSection === 'word_writing' ? (
        <>
          {!scanMode && <WritingChips items={f.writingItems} writing={writing} />}
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
          {!scanMode && <SentenceWriteRows items={f.writingItems} writing={writing} />}
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
      <div ref={saveBarRef} className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 border-t border-line bg-white px-4 py-3 print:hidden">
        {/* 이벤트 객체가 auto 인자로 새지 않게 감싼다 — onClick={save}로 두면 MouseEvent가
            첫 인자로 들어가 자동 저장으로 오해된다(타입체커가 잡았다). */}
        <button type="button" onClick={() => void save()} disabled={saving}
          className="rounded-lg bg-blue px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40">
          {saving ? '저장 중…' : '채점 저장'}
        </button>
        {/* 공식 출력은 담당자 양식의 결과보고서 PDF 하나로 통일한다 — 화면 인쇄와 두 갈래면
            어느 쪽을 학교에 내는지 현장에서 헷갈린다. 이 화면은 채점 작업대로 남는다.
            채점이 끝나지 않았으면 내려받지 않고 이유를 모달로 알린다(sheetPdfGate). */}
        <a href={pdfHref} download
          onClick={e => { if (gate) { e.preventDefault(); setGateOpen(true) } }}
          className="rounded-lg border-[1.5px] border-line bg-well px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-blue">
          결과보고서 PDF 다운로드
        </a>
        {dirty && <span className="text-[13px] font-bold text-amber">저장하지 않은 채점이 있어요</span>}
        {msg && <span aria-live="polite" className="text-[13px] text-ink-soft">{msg}</span>}
      </div>
      {/* PDF는 DB에 저장된 점수로 만들어진다 — 저장하지 않은 수정은 빠진다. */}
      <p className="border-t border-line px-4 py-2.5 text-[12px] leading-relaxed text-ink-mute print:hidden">
        결과보고서 PDF는 저장한 채점 내용으로 만들어집니다
        {!(r.complete.wordReading && r.complete.sentenceReading && r.complete.writing)
          && ' · 채점이 끝나지 않은 과제는 판정 칸이 비어 나갑니다'}
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
            // 쓰기만 남았으면 경고를 확인한 뒤 내려받는다(화면 방식은 여기서 채울 수 없고, 스캔본 방식도 A안이라 받게 둔다).
            // 페이지 이동이 아니라 PDF 다운로드다 — router.push로 바꾸면 파일이 아니라 라우트로 이동해 깨진다.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            if (gate.overridable) window.location.href = pdfHref
          }}
          onClose={() => setGateOpen(false)}>
          <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
            {gate.reason === 'dirty' ? (
              <>결과보고서 PDF는 <b>저장된 채점</b>으로 만들어집니다. 지금 화면의 수정은 아직 저장되지 않아
                빠진 채로 나갑니다.</>
            ) : gate.overridable && scanMode ? (
              // 스캔본 방식은 이 화면에서 쓰기를 채울 수 있다 — 「채울 수 없으니」라고 하면 틀린 안내다
              <><b>{gate.tasks.map(k => TASK_LABEL[k]).join(' · ')}</b> 채점이 남아 있습니다. 스캔본을 보고 채점하면
                판정이 채워지고, 그대로 내려받으면 판정 칸이 <b>빈 채로</b> 나갑니다.</>
            ) : gate.overridable ? (
              <><b>{gate.tasks.map(k => TASK_LABEL[k]).join(' · ')}</b>가 검사 중에 기록되지 않았습니다.
                이 화면에서는 채울 수 없으니, 그대로 내려받으면 판정 칸이 <b>빈 채로</b> 나갑니다.</>
            ) : (
              <><b>{gate.tasks.map(k => TASK_LABEL[k]).join(' · ')}</b> 채점이 남아 있습니다.
                녹음을 듣고 채점을 마친 뒤 <b>[채점 저장]</b>을 누르면 내려받을 수 있어요.</>
            )}
          </p>
        </ConfirmDialog>
      )}

      {/* busy에 saving도 넣는다 — 창이 열리기 전에 떠난 자동 저장이 도착하기 전에 해제하면, 늦게 도착한 저장이
          지운 쓰기 채점을 되살린다(창이 열려 있는 동안 새 자동 저장은 위 효과가 멈춘다). */}
      <ConfirmDialog open={unlinkOpen} busy={unlinking || saving} error={unlinkErr} danger
        title={scan?.missing ? '스캔본 연결을 해제할까요?' : scan ? '이 아이 기록지가 아닌가요?' : '쓰기 채점을 지울까요?'}
        confirmLabel={unlinking ? '지우는 중…' : scan ? '연결 해제' : '쓰기 채점 지우기'}
        onConfirm={() => void unlink()} onClose={() => setUnlinkOpen(false)}>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
          {scan ? '스캔본과 이 스캔본을 보고 넣은 ' : '이 검사에 넣은 '}
          <b className="text-rec-deep">{writingLabel} 채점이 지워지고</b> 「스캔 대기」로 돌아가요.
          {scan && (scan.missing
            ? ' 담임 선생님께 기록지를 다시 올려 달라고 알려 주세요(연락처는 맨 위).'
            : ' 담임 선생님께 맞는 기록지를 올려 달라고 알려 주세요(연락처는 맨 위).')}
        </p>
      </ConfirmDialog>

      {/* 「채점 전」이 0점으로, Pass/Fail이 확정 판정으로 읽히면 임상적 오독이다 — 화면에 상시 둔다.
          설명이 한 문장으로 끝나지 않아 1열로 둔다(2열이면 폭이 반이라 대여섯 줄로 접힌다). */}
      <BadgeLegend
        columns={1}
        items={[
          {
            badge: <Badge tone="mute">채점 전</Badge>,
            desc: <>아직 채점하지 않은 과제입니다. <b className="text-rec-deep">0점이 아닙니다</b> —
              결과보고서 PDF에도 판정 칸이 비어 나갑니다.</>,
          },
          {
            badge: <Badge tone="rec">미녹음</Badge>,
            // 미녹음 채점은 사용자 확정(2026-08-12 기본 채점 → 2026-09-29 고정)이다. 출처는 여기(주석)에만 둔다 —
            // 담당자가 읽는 화면이라, 화면에 찍힌 개발용 표기는 뜻 없이 혼란만 준다.
            // 문장의 시간(제한 시간)은 담당자 확정(2026-09-29)이다(lib/scoring unrecordedTimes).
            desc: <>녹음이 올라오지 않은 과제입니다(「모르겠어요」로 넘긴 것 포함). 들을 녹음이 없으므로 <b>오반응(X ·
              0점)으로 고정</b>되어 칸이 잠기고, 화면·결과보고서 PDF에 그대로 나갑니다. 문장 읽기유창성은 그 문장의 읽은 시간을 <b>제한 시간({form.limits.sentenceSec}초)</b>으로 계산합니다.</>,
          },
          {
            badge: (
              <span className="flex gap-1">
                <Badge tone="mint">Pass</Badge><Badge tone="rec">Fail</Badge>
              </span>
            ),
            desc: <>과제별 기준 점수에 따른 판정입니다. 채점이 끝난 과제에만 나오며, 결과보고서 PDF의
              결과 요약에 <b>PASS/FAIL</b>로 찍힙니다. 최종결과는 셋 중 둘 이상 Fail이면 Fail입니다.</>,
          },
          ...(PROVISIONAL_CRITERIA ? [{
            badge: <Badge tone="amber">임시 기준 · 확정 전</Badge>,
            desc: <>Pass 기준이 담당자 기준표를 받기 전까지 쓰는 <b>임시 숫자</b>라는 표시입니다 —
              낱말 해독 {passMark.wordReading} / {taskMax.wordReading} ·
              문장 읽기유창성 {fluencyLabel(passMark.sentenceReading)} {FLUENCY_UNIT} ·
              {' '}{writingLabel} {passMark.writing} / {taskMax.writing}.
              기준표를 받으면 숫자만 교체되며 이미 채점한 검사도 저장된 점수로 다시 계산됩니다.</>,
          }] : []),
        ]}
        // 「기준 시간 이후 반응은 채점하지 않는다」는 낱말 해독에만 남긴다 — 문장은 20초를 넘겨 읽었을 때
        // 어디까지 셀지 담당자가 듣고 판단한다(lib/scoring readSecMax 주석). 앱이 규칙을 대신 말하지 않는다.
        note={<>채점 기준({form.id}): 낱말 해독은 {form.limits.wordSec}초 내 정확 반응 수 — 녹음은 마지막 반응이
          잘리지 않도록 조금 더 담기므로, 기준 시간 이후 반응은 채점하지 않습니다. 문장 읽기유창성은 정확하게 읽은
          어절 수의 합을 읽은 시간(초)의 합으로 나눈 값({FLUENCY_UNIT})입니다.</>}
      />
    </section>
  )
}
