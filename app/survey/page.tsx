// app/survey/page.tsx — 검사 진행 화면(페이지 위저드).
// 검사지대로 "한 페이지 = 한 과제 = 한 녹음" 단위로 진행한다. 페이지 종류별 UI는
// components/survey/*가 담당하고, 이 페이지는 진행 상태(현재 페이지·답 캐시)의 로드/저장과
// 페이지 간 이동만 제어한다. 진행 위치는 localStorage에 저장돼 새로고침·탭 닫힘 후에도 재개된다.
'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { OtherTabNotice, useOtherTabGuard } from '@/hooks/useOtherTabGuard'
import type { Recording } from '@/hooks/useRecorder'
import { SECTION_LABEL, isRecordingPage, itemsFor, toggleChecklistArea } from '@/lib/items'
import { useSurveyForm } from '@/hooks/useSurveyForm'
import { canAdvance, visiblePages } from '@/lib/survey-flow'
import {
  clearState, loadState, saveState, settleLostUploads, updateSavedState, withPendingUpload, withoutPendingUpload,
  type SurveyState,
} from '@/lib/survey-state'
import { uploadRecording, type UploadResult } from '@/lib/upload'
import { pageLabel } from '@/lib/items'
import { Blip } from '@/components/Blip'
import { ProgressBar } from '@/components/ProgressBar'
import { ChecklistItem } from '@/components/survey/ChecklistItem'
import { FormStatus } from '@/components/survey/FormStatus'
import { MicCheck } from '@/components/survey/MicCheck'
import { PracticeAsk } from '@/components/survey/PracticeAsk'
import { PracticeEnd } from '@/components/survey/PracticeEnd'
import { ReadingPage } from '@/components/survey/ReadingPage'
import { RetryBanner } from '@/components/survey/RetryBanner'
import { SectionIntro } from '@/components/survey/SectionIntro'
import { SentenceWritingPage } from '@/components/survey/SentenceWritingPage'
import { WritingPage } from '@/components/survey/WritingPage'

/** 이 탭에서 지금 올리고 있는 녹음(`세션:페이지:시도`). 모듈 범위라 검사 ↔ 검토 화면을 오가도 남고, 새로고침이면
 *  비어 있다 — 저장 상태의 「올리는 중」 가운데 여기 없는 것이 끊긴 업로드다(lib/survey-state settleLostUploads). */
const inFlight = new Set<string>()
const flightKey = (sessionId: string, code: string, attemptNo: number) => `${sessionId}:${code}:${attemptNo}`

function SurveyInner() {
  const router = useRouter()
  const params = useSearchParams()
  // 진행 상태의 단일 소스 — 현재 페이지(pageIdx)·단계(phase)도 여기에만 둔다.
  const [st, setSt] = useState<SurveyState | null>(null)
  const [busy, setBusy] = useState(false)
  // 백그라운드 업로드 진행 수(낙관적 완료 표시 뒤에도 계속 돌아간다). 화면을 막지 않고
  // "저장 중"만 알리며, 새로고침·탭 닫기 경고의 근거가 된다.
  const [uploading, setUploading] = useState(0)
  // 연습 종료 안내 화면(연습 페이지에서 [다음]을 누른 직후 한 번). 페이지를 옮기면 초기화된다.
  const [practiceEnd, setPracticeEnd] = useState(false)
  // 검사자가 직접 누르는 일시정지(화면을 덮어 아동의 오터치도 막는다).
  // **녹음 중에도 누를 수 있다** — 신청 화면 안내 「학생이 힘들어하면 일시정지 버튼을 눌러 언제든
  // 멈출 수 있습니다」는 담당자 확정(2026-09-21)이고, 그 문구에 화면을 맞춰 녹음 중에도 눌리게 한
  // 동작은 사용자 확정(2026-09-22 — 담당자 회신 아님)이다. 종전에는
  // `disabled={busy}`로 잠가 두어, 아이가 힘들어하는 바로 그 순간(대개 녹음 중)에
  // 안내가 가리키는 버튼이 눌리지 않았다.
  const [paused, setPaused] = useState(false)
  // 녹음을 멈출 손잡이(ReadingPage가 녹음 중에만 채운다) — 아래 pause()가 쓴다.
  const stopRecording = useRef<(() => void) | null>(null)
  // 일시정지 오버레이도 다이얼로그이므로 ConfirmDialog와 같은 포커스 트랩을 쓴다
  // (초기 포커스·Tab 순환·Esc로 재개·해제 시 포커스 복귀).
  const pauseRef = useFocusTrap(paused, () => setPaused(false))
  // 페이지 이동 중 업로드가 실패한 녹음: 다른 페이지로 넘어가도 배너에서 재시도할 수 있다.
  // **attemptNo를 blob과 함께 들고 있어야 한다** — 재시도 때 다시 계산하면 그 사이에 성공한
  // 재녹음의 번호를 집어, 스토리지 upsert가 최신 녹음을 옛 소리로 덮어쓴다(같은 경로
  // `{sessionId}/{itemCode}_{attemptNo}`). 실패한 시도의 번호는 그때 고정된 값이다.
  const [pendingRetries, setPendingRetries] =
    useState<Record<string, { rec: Recording; attemptNo: number }>>({})
  /** 끊긴 업로드로 「녹음 완료」 표시를 거둔 페이지 — 다시 녹음할 때까지 알린다 */
  const [lostUploads, setLostUploads] = useState<string[]>([])
  /** 그 녹음만 저장할 수 없었던 경우(한 화면 10번 상한·파일 문제)의 안내 */
  const [uploadNotice, setUploadNotice] = useState('')
  /** 이 검사를 더 진행할 수 없다(세션 만료·이미 제출) — 처음 화면으로 보낸다 */
  const [fatal, setFatal] = useState<UploadResult['fatal']>(null)
  const fromReview = params.get('from') === 'review'
  const otherTab = useOtherTabGuard(st?.sessionId)

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    // 새로고침·탭 닫기로 끊긴 업로드의 「녹음 완료」 표시를 거둔다 — 같은 탭에서 화면만 옮겼다 온 것(inFlight)은 그대로
    const settled = settleLostUploads(s, (code, no) => inFlight.has(flightKey(s.sessionId, code, no)))
    if (settled.lost.length > 0) saveState(settled.state)
    // 서버 프리렌더와 첫 페인트를 일치시키기 위해(하이드레이션 불일치 방지) localStorage는
    // 마운트 후 1회 읽어 복원한다 — 이 setState는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(settled.state)
    setLostUploads(settled.lost)
  }, [router])

  // 검사지는 서버가 세션 토큰을 확인하고 내려준다(문항을 공개 JS에 싣지 않으려고 — hooks/useSurveyForm).
  // 마이크 확인 화면은 양식이 필요 없어 그동안 받아 두므로, 첫 검사에서는 기다림이 보이지 않는다.
  const formQ = useSurveyForm(st)
  const form = formQ.data

  // ?p=N 딥링크(검토 화면에서 페이지 클릭): 해당 페이지로 이동한 상태로 복원하고 즉시 저장한다.
  // 범위 검사에 페이지 수가 필요하므로 양식을 받은 뒤에 처리하고, 마운트당 한 번만 소비한다
  // (URL에서 p가 지워지기 전에 다시 돌면 같은 이동을 거듭 저장한다).
  const deepLinked = useRef(false)
  useEffect(() => {
    if (!form || deepLinked.current) return
    deepLinked.current = true
    if (!params.has('p')) return
    const p = Number(params.get('p'))
    // 양식 도착에 맞춰 1회 적용하는 복원이다(마운트 복원과 같은 패턴).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(prev => {
      if (!prev) return prev
      const total = visiblePages(itemsFor(form), prev).length
      if (!(Number.isInteger(p) && p >= 1 && p <= total)) return prev
      const jumped = { ...prev, pageIdx: p - 1, phase: 'page' as const }
      saveState(jumped)
      return jumped
    })
    // p는 URL에서 제거한다(from은 유지) — 이후 페이지를 이동한 뒤 새로고침해도
    // stale p가 저장된 위치를 덮어쓰지 않도록.
    const sp = new URLSearchParams(params.toString())
    sp.delete('p')
    router.replace(sp.toString() ? `/survey?${sp}` : '/survey', { scroll: false })
  }, [form, params, router])

  // 녹음 중·업로드 중 새로고침·탭 닫기 실수 방지(해당 시도의 소리가 유실되므로 확인창을 띄운다).
  // 낙관적 완료 표시 뒤에도 업로드는 남아 있으므로 uploading까지 본다.
  useEffect(() => {
    if (!busy && uploading === 0) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy, uploading])

  // 검사 중 화면 자동 잠금 방지(교사 설명이 길어져도 화면이 꺼지지 않게). 미지원 브라우저는 무시하고,
  // 탭이 백그라운드로 갔다 오면 잠금이 해제되므로 visible 복귀 시 재획득한다.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      if (!('wakeLock' in navigator)) return
      try { sentinel = await navigator.wakeLock.request('screen') } catch { /* 배터리 절약 모드 등 — 무시 */ }
    }
    void acquire()
    const onVisible = () => { if (document.visibilityState === 'visible' && !cancelled) void acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [])

  /**
   * 일시정지 — 녹음 중이면 **먼저 끊는다.** 그냥 덮기만 하면 오버레이 뒤에서 녹음이 계속
   * 돌아 아이가 그만둔 뒤의 침묵까지 그 시도에 담기고, 제한 시간에 도달해 그대로 저장된다.
   * 끊으면 그때까지 읽은 소리는 평소처럼 저장된다(녹음 버튼으로 멈출 때와 같은 규칙) —
   * 이어서 할 때 검사자가 다시 녹음하면 새 시도로 쌓인다.
   */
  const pause = useCallback(() => {
    stopRecording.current?.()
    setPaused(true)
  }, [])

  /** 상태 갱신 + localStorage 저장(항상 함께 — 저장 누락으로 재개 위치가 어긋나지 않도록) */
  const patch = useCallback((p: Partial<SurveyState> | ((prev: SurveyState) => Partial<SurveyState>)) => {
    setSt(prev => {
      const merged = { ...prev!, ...(typeof p === 'function' ? p(prev!) : p) }
      saveState(merged)
      return merged
    })
  }, [])

  const markSaved = useCallback((code: string, attemptNo: number, uploads: boolean) => {
    // 「모르겠어요」로 넘겼던 페이지에 돌아와 녹음했으면 그 표시를 거둔다 — 녹음이 있는데
    // 검토 화면이 「모르겠어요」라고 말하면 안 된다(둘은 상호 배타다).
    // 올리는 녹음이면 올리는 중 표시도 함께 적는다 — 끝나면 settleUpload가 지운다(끊기면 다음에 열 때 거둔다).
    // 연습은 올리지 않으므로 적지 않는다 — 적었다 바로 지우면 지우는 쪽(저장 상태 직접 수정)이 이 업데이터보다
    // 먼저 돌아 표시가 저장 상태에 남고, 그 사이 새로고침하면 연습 녹음에 「저장되지 않았어요」가 뜬다.
    patch(prev => {
      const next = {
        ...prev,
        recorded: { ...prev.recorded, [code]: (prev.recorded[code] ?? 0) + 1 },
        skipped: prev.skipped.filter(c => c !== code),
      }
      return uploads ? withPendingUpload(next, code, attemptNo) : next
    })
    setPendingRetries(prev => {
      if (!(code in prev)) return prev
      const { [code]: _removed, ...rest } = prev
      return rest
    })
    setLostUploads(prev => prev.filter(c => c !== code))
    setUploadNotice('')
  }, [patch])

  /** 업로드가 끝났다(성공이든 실패든) — 「올리는 중」 표시를 저장 상태에서 직접 지운다(컴포넌트 생존과 무관). */
  const settleUpload = useCallback((sessionId: string, code: string, attemptNo: number) => {
    inFlight.delete(flightKey(sessionId, code, attemptNo))
    updateSavedState(sessionId, s => withoutPendingUpload(s, code, attemptNo))
    setSt(prev => prev && prev.sessionId === sessionId ? withoutPendingUpload(prev, code, attemptNo) : prev)
  }, [])

  /**
   * 낙관적 완료 표시를 되돌린다 — 업로드가 실패했으면 그 녹음은 실제로 없다.
   * 되돌리지 않으면 검토 화면이 "녹음 완료"라 말하는데 서버에는 파일이 없다.
   *
   * ⚠️ localStorage를 `patch`(=setState 업데이터) 안에서 고치지 말 것. 업로드는 화면을
   * 잠그지 않고 백그라운드로 도는데, 검사자가 [저장하고 나가기]나 검토 화면으로 옮겨
   * 이 컴포넌트가 언마운트된 뒤 실패가 도착하면 **업데이터가 실행되지 않아 롤백이 통째로
   * 사라진다.** 그러면 저장된 상태에 "녹음 완료"가 남고, 검토 화면이 그것을 그대로 믿어
   * 제출까지 통과한 다음 `withUnrecordedDefaults`가 오반응(X·0점)으로 기본 채점한다 —
   * README가 경계하는 "조용히 실패하는 부류"가 정확히 이 경로다.
   * 그래서 저장된 상태를 직접 읽어 고치고(컴포넌트 생존과 무관), 화면 상태는 살아 있을
   * 때만 따라 갱신한다. 둘은 각자의 현재 값에서 1을 빼므로 이중 차감이 되지 않는다.
   * (사용자 확정 2026-08-21 — 임상 규칙 아님, 개발 판단)
   */
  const undoSaved = useCallback((sessionId: string, code: string, rec: Recording, attemptNo: number, r: UploadResult) => {
    const dec = (n: number | undefined) => Math.max(0, (n ?? 1) - 1)
    // 세션 id로 찾는다(`loadState`는 다른 탭이 다른 아이를 시작했으면 그 아이를 돌려준다)
    updateSavedState(sessionId, s => ({ ...s, recorded: { ...s.recorded, [code]: dec(s.recorded[code]) } }))
    setSt(prev => prev && prev.sessionId === sessionId ? ({ ...prev, recorded: { ...prev.recorded, [code]: dec(prev.recorded[code]) } }) : prev)
    if (r.fatal) { setFatal(r.fatal); return }
    // 다시 보내면 될 수도 있는 실패만 재시도 배너로 — 4xx는 눌러도 영원히 실패한다
    if (r.retry) setPendingRetries(prev => ({ ...prev, [code]: { rec, attemptNo } }))
    else setUploadNotice(r.status === 400 && attemptNo > 10
      ? '이 화면은 10번까지만 저장돼요 — 마지막 녹음이 저장돼 있어요.'
      : '이 녹음은 저장할 수 없었어요. 다시 녹음해 주세요.')
  }, [])

  if (!st) return null
  if (otherTab) return <OtherTabNotice />
  // 세션 만료(24시간)·이미 제출된 검사는 더 올릴 수 없다 — 양식 조회의 같은 오류(FormStatus)와 같이 진행 상태를 지우고
  // 처음 화면으로. 남겨 두면 시작 화면이 「이어서 하기」를 다시 권해 같은 오류로 돌아온다.
  if (fatal) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h1 className="text-xl font-bold">{fatal === 'expired' ? '검사를 시작한 지 오래되어 이어서 할 수 없어요' : '이미 제출된 검사예요'}</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        {fatal === 'expired'
          ? <>방금 녹음은 저장되지 않았어요. 처음 화면에서 이 학생을 다시 골라 <b>처음부터</b> 검사해 주세요.</>
          : <>다른 탭이나 기기에서 이 검사가 제출됐어요. 방금 녹음은 저장되지 않았어요.</>}
      </p>
      <button type="button" className="cta mt-2 max-w-60" onClick={() => { clearState(); router.replace('/') }}>처음 화면으로</button>
    </main>
  )

  if (st.phase === 'mic')
    return <MicCheck onOk={() => patch({ micDone: true, phase: 'practiceAsk' })} />

  // 학년이 검사지(양식)를 정하고, 양식이 문항·페이지를 정한다. 양식은 서버에서 온다(위 useSurveyForm).
  if (!form) return <FormStatus error={formQ.error} onRetry={() => void formQ.refetch()} />
  const f = itemsFor(form)

  if (st.phase === 'practiceAsk')
    return <PracticeAsk onChoose={practice => patch({ practice, phase: 'page', pageIdx: 0 })} />

  // 연습 실시 여부를 반영한 진행 목록 — 연습을 건너뛰면 목록이 줄어드므로 인덱스를 clamp한다.
  const pages = visiblePages(f, st)
  const idx = Math.min(st.pageIdx, pages.length - 1)
  const page = pages[idx]
  const isLast = idx === pages.length - 1
  // 진행률은 **채점 대상 페이지**로 센다 — 연습 페이지를 분모에 넣으면 연습을 건너뛴 검사와
  // 숫자가 달라진다.
  const scoredTotal = pages.filter(p => !p.practice).length
  const scoredNo = pages.slice(0, idx + 1).filter(p => !p.practice).length

  function goToIdx(n: number) {
    patch({ pageIdx: n })
    setPracticeEnd(false)
    window.scrollTo(0, 0)
  }

  function goNext() {
    // 검토에서 넘어온 경우(from=review) 순차 진행 대신 검토 화면으로 복귀한다.
    if (fromReview || isLast) { router.push('/review'); return }
    goToIdx(idx + 1)
  }

  /** 녹음 완료 — 화면에는 즉시 완료로 표시하고 업로드는 뒤에서 진행한다(낙관적 저장).
   *  업로드를 기다리는 동안 화면을 잠그면 [다음]이 "모르겠어요"로 보이고 몇 초씩 멈춰 있어
   *  검사 흐름이 끊긴다(사용자 보고 2026-08-12). 실패하면 표시를 되돌리고 재시도 배너를 낸다. */
  function handleRecorded(rec: Recording) {
    const code = page.code
    const attemptNo = (st!.recorded[code] ?? 0) + 1
    const { sessionId, sessionToken } = st!
    if (page.practice) { markSaved(code, attemptNo, false); return }   // 연습은 서버에 남기지 않는다
    inFlight.add(flightKey(sessionId, code, attemptNo))
    markSaved(code, attemptNo, true)
    setUploading(n => n + 1)
    void uploadRecording({ sessionId, sessionToken, itemCode: code, attemptNo, rec })
      .then(r => { settleUpload(sessionId, code, attemptNo); if (!r.ok) undoSaved(sessionId, code, rec, attemptNo, r) })
      .finally(() => setUploading(n => n - 1))
  }

  function tryNext() {
    // 연습 페이지에서는 곧바로 본 검사로 넘기지 않고 "연습이 끝났다"를 한 화면 보여준다
    // (연습과 본 검사의 경계가 화면에 없다는 피드백 — 2026-08-12).
    if (!fromReview && page.practice) { setPracticeEnd(true); return }
    // [모르겠어요]로 넘긴 페이지를 기록한다 — 검토 화면이 「미녹음」과 구분해야 한다
    // (담당자 확정 2026-09-21). 버튼 라벨을 정하는 `skipping`과 **같은 조건**을 쓴다:
    // 화면이 「모르겠어요」라고 말한 그 누름만 기록해야 둘이 어긋나지 않는다.
    if (skipping) patch(prev => ({ skipped: [...new Set([...prev.skipped, page.code])] }))
    goNext()
  }

  function changeWriting(code: string, v: number) {
    patch(prev => ({ writing: { ...prev.writing, [code]: v } }))
  }

  async function retryUpload(code: string) {
    // attemptNo를 다시 계산하지 않고 실패 시점 값을 그대로 쓴다(pendingRetries 주석 참고).
    const pending = pendingRetries[code]
    if (!pending || !st) return
    const { sessionId } = st
    const r = await uploadRecording({ sessionId, sessionToken: st.sessionToken,
      itemCode: code, attemptNo: pending.attemptNo, rec: pending.rec })
    if (r.ok) { markSaved(code, pending.attemptNo, false); return }   // 이미 올라갔다 — 올리는 중 표시가 필요 없다
    if (r.fatal) { setFatal(r.fatal); return }
    // 재시도도 4xx면 배너를 거둔다 — 더 눌러도 같다
    if (!r.retry) {
      setPendingRetries(prev => { const { [code]: _removed, ...rest } = prev; return rest })
      setUploadNotice('이 녹음은 저장할 수 없었어요. 다시 녹음해 주세요.')
    }
  }

  // 다음으로 넘어갈 수 있는 조건(페이지 종류별)은 survey-flow의 canAdvance가 판정한다.
  // 녹음 중에는 이 화면에서 항상 잠근다(busy). 업로드는 뒤에서 돌아가므로 잠그지 않는다.
  const canNext = !busy && canAdvance(f, page, st)

  // 녹음 페이지를 한 번도 녹음하지 않고 넘어가는 경우: 주 버튼을 "모르겠어요"로 바꿔(+약한 스타일)
  // (누르면 `tryNext`가 그 페이지를 `skipped`에 남겨 검토 화면이 미녹음과 구분한다 — 2026-09-21)
  // 오터치 한 번으로 페이지가 조용히 통과되지 않도록 의도를 드러낸다(진행 자체는 허용 —
  // 응답 거부·모름도 유효한 관찰이다). 담당자 확정(2026-08-07): 별도 버튼을 만들지 않고
  // 기존 건너뛰기 버튼의 라벨만 바꾼다 — 근거 docs/superpowers/plans/2026-08-07-survey-session-controls.md
  // (연습 페이지는 제외한다 — 연습을 건너뛰는 것은 "모름"의 관찰이 아니라 그냥 넘기는 것이다.)
  const skipping = !fromReview && !isLast && !page.practice
    && isRecordingPage(page) && (st.recorded[page.code] ?? 0) === 0

  // 섹션(주제) 진입 안내: 각 섹션의 첫 페이지에 처음 도달하면 안내 화면을 먼저 보여준다.
  // "첫 페이지"는 **진행 목록(pages) 기준**이다 — 양식의 고정 목록으로 판정하면 연습을
  // 건너뛴 검사에서 낱말 해독 안내가 아예 나오지 않는다(첫 페이지가 연습 페이지이므로).
  const showIntro = !fromReview && !practiceEnd
    && pages.find(p => p.section === page.section)?.code === page.code
    && !st.introsSeen.includes(page.section)

  return (
    // 고정 3분할 레이아웃: 헤더(상단 고정) · 콘텐츠(가운데 밴드) · 내비(하단 고정).
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-6 pb-6 pt-8 lg:max-w-4xl lg:pt-6">
      <header className="flex-none">
        <div className="mb-2 flex items-center justify-between gap-2">
          {st.childName ? (
            <p className="min-w-0 truncate text-xs font-bold text-ink-soft">
              <b className="text-blue">{st.childName}</b> 학생
            </p>
          ) : <span />}
          {/* 검사자용 조작 — 아동의 큰 [이전/다음] 버튼과 떨어뜨려 헤더에 작게 둔다.
              녹음 중에는 눌리지 않게 잠근다(그 시도의 소리가 유실되므로). */}
          <div className="flex flex-none gap-1.5">
            {/* 녹음 중에도 눌린다(위 paused 주석) — 누르면 pause()가 녹음을 먼저 끊는다.
                옆의 [저장하고 나가기]는 그대로 잠근다: 그건 멈추는 것이 아니라 화면을 떠나는
                것이라, 녹음 중 이탈로 그 시도의 소리를 잃는 사고를 계속 막아야 한다. */}
            <button type="button" onClick={pause}
              className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1.5 text-[12px] font-bold text-ink-soft transition hover:border-blue disabled:opacity-40">
              일시정지
            </button>
            <button type="button" onClick={() => router.push('/')} disabled={busy}
              className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1.5 text-[12px] font-bold text-ink-soft transition hover:border-blue disabled:opacity-40">
              저장하고 나가기
            </button>
          </div>
        </div>
        {/* 연습 중에는 진행률 대신 연습 띠를 둔다 — 연습 페이지는 채점 대상이 아니어서
            진행률 분모에 들어가지 않고, "지금이 연습"이 헤더에서 바로 보여야 한다. */}
        {page.practice ? (
          <div className={`flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 ${
            practiceEnd ? 'border-mint/50 bg-mint/10' : 'border-amber/50 bg-amber/10'}`}>
            <span className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${
              practiceEnd ? 'bg-mint' : 'bg-amber'}`}>연습</span>
            <p className={`text-[12.5px] font-bold ${practiceEnd ? 'text-mint' : 'text-amber'}`}>
              {practiceEnd ? '연습을 마쳤어요 · 이제 본 검사예요' : '연습 중이에요 · 점수에 들어가지 않아요'}
            </p>
          </div>
        ) : (
          <ProgressBar current={scoredNo} total={scoredTotal} />
        )}
        {fromReview && (
          <Link href="/review" className="mt-2 inline-block py-1 text-xs text-ink-mute underline">← 검토 화면으로 돌아가기</Link>
        )}
        {!showIntro && !practiceEnd && (
          // 자동 저장 안내는 별도 줄을 만들지 않고 이 줄의 남는 오른쪽 공간에 얹는다 —
          // 세로 공간이 빠듯해(가운데 밴드가 밀려 불필요한 스크롤이 생김) 한 줄도 아깝다.
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <h1 className="text-xs font-bold text-ink-mute">
              {SECTION_LABEL[page.section]}{page.practice && ' · 연습'}
            </h1>
            {/* 업로드가 남아 있는 동안만 "저장 중"으로 바뀐다 — 진행을 막지 않고 상태만 알린다. */}
            <p className="flex-none text-[12px] text-ink-mute" aria-live="polite">
              {uploading > 0 ? '저장 중…' : '자동 저장됨'}
            </p>
          </div>
        )}
      </header>

      {/* 가운데 밴드: 남는 높이를 모두 차지하고 내용을 세로 중앙 정렬. 내용이 밴드보다 크면
          이 구역 안에서만 스크롤(헤더·내비는 그대로). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-center py-4">
          {practiceEnd ? (
            <PracticeEnd />
          ) : showIntro ? (
            <SectionIntro section={page.section} sections={f.sections} />
          ) : (
            <>
              {page.role === 'child' && isRecordingPage(page) && (
                <ReadingPage key={page.code} page={page}
                  attemptCount={st.recorded[page.code] ?? 0} onRecordingChange={setBusy}
                  onRecorded={handleRecorded} stopRef={stopRecording} />
              )}

              <RetryBanner form={f} codes={Object.keys(pendingRetries)} onRetry={retryUpload} />
              {/* 끊긴 업로드(새로고침·탭 닫기) — 파일이 없으니 재시도가 아니라 다시 녹음이다 */}
              {lostUploads.length > 0 && (
                <p role="alert" className="mt-3 rounded-[14px] border border-amber/40 bg-amber/10 p-3 text-xs leading-relaxed text-amber">
                  <b>{lostUploads.map(c => pageLabel(f, c)).join(', ')}</b> 녹음이 저장되기 전에 화면이 닫혀 저장되지 않았어요.
                  그 화면에서 다시 녹음해 주세요.
                </p>
              )}
              {uploadNotice && (
                <p role="alert" className="mt-3 rounded-[14px] border border-amber/40 bg-amber/10 p-3 text-xs leading-relaxed text-amber">{uploadNotice}</p>
              )}

              {page.section === 'word_writing' && (
                <WritingPage items={page.items} value={st.writing}
                  onChange={changeWriting}
                  onSetAll={v => patch(prev => ({
                    writing: { ...prev.writing, ...Object.fromEntries(page.items.map(i => [i.code, v])) },
                  }))} />
              )}

              {page.section === 'sentence_writing' && (
                <SentenceWritingPage items={page.items} value={st.writing}
                  onChange={changeWriting} />
              )}

              {page.section === 'checklist' && (
                <ChecklistItem selected={st.checklist}
                  onToggle={code => patch(prev => ({ checklist: toggleChecklistArea(prev.checklist, code) }))} />
              )}
            </>
          )}
        </div>
      </div>

      <nav className="flex flex-none gap-2.5 pt-4">
        <button onClick={() => goToIdx(idx - 1)} disabled={idx === 0 || busy}
          className="btn-ghost h-[52px] flex-1">
          이전
        </button>
        {practiceEnd ? (
          <button onClick={() => { setPracticeEnd(false); goNext() }}
            className="btn-primary h-[52px] flex-[2]">
            본 검사 시작하기
          </button>
        ) : showIntro ? (
          <button onClick={() => patch(prev => ({ introsSeen: [...prev.introsSeen, page.section] }))}
            className="btn-primary h-[52px] flex-[2]">
            시작하기
          </button>
        ) : (
          <button onClick={tryNext} disabled={!canNext}
            className={`${skipping ? 'btn-ghost' : 'btn-primary'} h-[52px] flex-[2]`}>
            {fromReview ? '검토로 돌아가기' : isLast ? '검토' : skipping ? '모르겠어요' : '다음'}
          </button>
        )}
      </nav>

      {paused && (
        // 화면 전체를 덮어 아동이 문항을 보거나 잘못 누르지 못하게 한다(잠깐 자리를 비우는 상황용).
        <div ref={pauseRef} role="dialog" aria-modal="true" aria-label="검사 일시정지"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/95 px-6 text-center backdrop-blur">
          <Blip variant="idle" className="h-24 w-[100px]" />
          <h2 className="text-2xl font-bold">잠시 쉬는 중이에요</h2>
          <p className="text-sm leading-relaxed text-ink-soft">
            지금까지 한 내용은 저장돼 있어요.<br />준비되면 아래 버튼을 눌러 주세요.
          </p>
          <button type="button" onClick={() => setPaused(false)} className="cta max-w-60">이어서 하기</button>
        </div>
      )}
    </main>
  )
}

export default function SurveyPage() {
  return <Suspense fallback={null}><SurveyInner /></Suspense>
}
