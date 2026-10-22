// app/survey/page.tsx — 검사 진행 화면(페이지 위저드).
// 검사지대로 "한 페이지 = 한 과제 = 한 녹음" 단위로 진행한다. 페이지 종류별 UI는
// components/survey/*가 담당하고, 이 페이지는 진행 상태(현재 페이지·답 캐시)의 로드/저장과
// 페이지 간 이동만 제어한다. 진행 위치는 localStorage에 저장돼 새로고침·탭 닫힘 후에도 재개된다.
'use client'
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { OtherTabNotice, useOtherTabGuard } from '@/hooks/useOtherTabGuard'
import type { Recording } from '@/hooks/useRecorder'
import { SECTION_LABEL, isRecordingPage, itemsFor, toggleChecklistArea } from '@/lib/items'
import { isFatalFormError, useSurveyForm } from '@/hooks/useSurveyForm'
import { canAdvance, recordingNav, skippedAfter, visiblePages } from '@/lib/survey-flow'
import {
  clearState, loadState, nextAttemptNo, resolveWritingMode, saveState, saveWritingModePref, settleLostUploads, unsavedPages,
  updateSavedState, withPendingUpload, withoutPendingUpload, type SurveyState, type WritingMode,
} from '@/lib/survey-state'
import { uploadRecording, type UploadResult } from '@/lib/upload'
import {
  beginUpload, clearFailedUpload, endUpload, failedUploads, isUploading, pageUnloading, setFailedUpload, subscribeUploads,
  uploadsInFlight,
} from '@/lib/upload-flight'
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
import { ScanWritingPanel, WritingModeToggle } from '@/components/survey/WritingMode'


/** 다시 보낼 녹음이 없을 때의 빈 값 — useSyncExternalStore 스냅숏은 같은 객체여야 한다 */
const NO_FAILED: ReturnType<typeof failedUploads> = {}
/** 주 버튼 두 번 누름을 하나로 보는 시간(위 lastMainTap) — 녹음 버튼의 연타 방어(useRecorder TAP_GUARD_MS)·OS 더블클릭 간격과 같은 감각 */
const NAV_GUARD_MS = 500
/** 연결이 끊겨 실패한 업로드를 처리하기 전에 기다리는 시간 — 그사이 pagehide가 오면 페이지가 닫히는 중이다 */
const UNLOAD_SETTLE_MS = 400

function SurveyInner() {
  const router = useRouter()
  const params = useSearchParams()
  // 진행 상태의 단일 소스 — 현재 페이지(pageIdx)·단계(phase)도 여기에만 둔다.
  const [st, setSt] = useState<SurveyState | null>(null)
  const [busy, setBusy] = useState(false)
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
  /** 녹음을 시도했는데 저장되지 않은 페이지(lib/survey-state unsavedPages) — 다시 녹음할 때까지 알린다 */
  const [lostUploads, setLostUploads] = useState<string[]>([])
  /** 그 녹음만 저장할 수 없었던 경우(한 화면 10번 상한·파일 문제)의 안내 */
  const [uploadNotice, setUploadNotice] = useState('')
  /** 이 검사를 더 진행할 수 없다(세션 만료·이미 제출) — 처음 화면으로 보낸다 */
  const [fatal, setFatal] = useState<UploadResult['fatal']>(null)
  const fromReview = params.get('from') === 'review'
  const otherTab = useOtherTabGuard(st?.sessionId)
  const sessionId = st?.sessionId
  // 이 탭에서 올리고 있는 녹음 수와 다시 보낼 녹음(저장 실패) — 바깥 저장소(lib/upload-flight)라 검토 화면을 오가거나
  // [저장하고 나가기] → [이어서 하기]를 해도 남는다. 종전에는 이 화면의 상태라 다시 열면 0부터 셌고(「자동 저장됨」인데 실제로는
  // 올리는 중), 실패한 녹음은 경고 없이 사라졌다(2026-10-12 점검).
  // 다시 보낼 녹음 — **attemptNo를 blob과 함께 들고 있어야 한다**: 재시도 때 다시 매기면 그사이 저장된 다른 시도를 덮는다.
  const uploading = useSyncExternalStore(subscribeUploads, () => (sessionId ? uploadsInFlight(sessionId) : 0), () => 0)
  const pendingRetries = useSyncExternalStore(subscribeUploads,
    () => (sessionId ? failedUploads(sessionId) : NO_FAILED), () => NO_FAILED)

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    // 새로고침·탭 닫기로 끊긴 업로드의 「녹음 완료」 표시를 거둔다 — 같은 탭에서 화면만 옮겼다 온 것(lib/upload-flight)은 그대로
    const settled = settleLostUploads(s, (code, no) => isUploading(s.sessionId, code, no))
    if (settled.lost.length > 0) saveState(settled.state)
    // 서버 프리렌더와 첫 페인트를 일치시키기 위해(하이드레이션 불일치 방지) localStorage는
    // 마운트 후 1회 읽어 복원한다 — 이 setState는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(settled.state)
    // 끊긴 업로드만이 아니라 시도했는데 저장되지 않은 페이지 전부 — 실패한 녹음을 다시 보내지 못한 채 새로고침한 것도 든다
    setLostUploads(unsavedPages(settled.state, failedUploads(s.sessionId)))
  }, [router])

  // 뒤에서 도는 업로드가 끝날 때마다(성공·실패) **저장 상태의 녹음 기록을 화면 상태로 다시 읽는다.** 업로드를 시작한 화면이
  // 그사이 사라졌다 다시 열렸으면(검토 왕복·나가기 뒤 이어하기) 끝난 업로드는 옛 화면의 상태만 고쳤다 — 새 화면은 지워진 「올리는
  // 중」 표시를 들고 있다가 다음 저장 때 되살려, 이미 올라간 녹음이 「저장되지 않았어요」로 거둬졌다(2026-10-12 점검).
  // 업로드 쪽은 저장 상태를 다 고친 뒤에 끝을 알린다(lib/upload-flight). 업데이터 안에서 읽어야 그보다 앞선 저장(patch)을 덮지 않는다.
  useEffect(() => {
    if (!sessionId) return
    return subscribeUploads(() => {
      setSt(prev => {
        if (!prev || prev.sessionId !== sessionId) return prev
        const saved = loadState()
        if (saved?.sessionId !== sessionId) return prev
        return { ...prev, recorded: saved.recorded, skipped: saved.skipped, pendingUploads: saved.pendingUploads,
          attempted: saved.attempted, tries: saved.tries }
      })
    })
  }, [sessionId])

  // 검사지는 서버가 세션 토큰을 확인하고 내려준다(문항을 공개 JS에 싣지 않으려고 — hooks/useSurveyForm).
  // 마이크 확인 화면은 양식이 필요 없어 그동안 받아 두므로, 첫 검사에서는 기다림이 보이지 않는다.
  const formQ = useSurveyForm(st)
  const form = formQ.data

  // ?p=N 딥링크(검토 화면에서 페이지 클릭): 해당 페이지로 이동한 상태로 복원하고 즉시 저장한다.
  // 범위 검사에 페이지 수가 필요하므로 양식을 받은 뒤에 처리하고, 마운트당 한 번만 소비한다
  // (URL에서 p가 지워지기 전에 다시 돌면 같은 이동을 거듭 저장한다).
  const deepLinked = useRef(false)
  /** 가운데 밴드(실제로 스크롤되는 곳) — 페이지를 옮길 때 맨 위로 되돌린다. window는 스크롤되지 않는다 */
  const bandRef = useRef<HTMLDivElement>(null)
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

  // 녹음 중·업로드 중·**다시 보낼 녹음이 남은 동안** 새로고침·탭 닫기 실수 방지(그 녹음이 사라지므로 확인창을 띄운다).
  // 낙관적 완료 표시 뒤에도 업로드는 남아 있으므로 uploading까지 본다. 실패한 녹음은 이 탭의 메모리에만 있다(lib/upload-flight).
  const failedCount = Object.keys(pendingRetries).length
  useEffect(() => {
    if (!busy && uploading === 0 && failedCount === 0) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy, uploading, failedCount])

  // 주 버튼 두 번 톡 방지 — 직전 주 버튼 누름 바로 뒤의 누름은 무시한다. [시작하기]·[본 검사 시작하기]·[다음]이 같은 자리에 있어,
  // 0.2초 간격으로 두 번 누르면 다음 녹음 화면이 「모르겠어요」로 넘어갔다(아이패드 터치 포함 — 2026-10-12 점검).
  // 화면이 바뀐 시각이 아니라 **누른 시각**으로 잰다 — 이어하기로 막 열린 화면의 첫 누름까지 삼키지 않게.
  const lastMainTap = useRef(-Infinity)
  /** 직전 주 버튼 누름 뒤 NAV_GUARD_MS 안의 누름인가 — 아니면 이 누름을 기록한다(이벤트 시각 기준) */
  const tooSoon = (e: React.MouseEvent) => {
    if (e.timeStamp - lastMainTap.current < NAV_GUARD_MS) return true
    lastMainTap.current = e.timeStamp
    return false
  }

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

  // 녹음 중에 화면이 가려지면(태블릿 홈 버튼·알림·화면 잠금·다른 앱) 일시정지를 누른 것과 같이 멈춘다. 가려진 동안
  // 마이크가 끊겨 뒤가 빈 녹음이 「녹음이 완료됐어요」로 저장됐다 — 소리 판정은 가장 큰 소리만 보므로 앞에 읽은 소리가
  // 있으면 통과한다. 녹음 중이 아니면 아무 일도 하지 않는다(사용자 확정 2026-10-21 — 태블릿 점검, 담당자 회신 아님)
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && stopRecording.current) pause() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [pause])

  // 뒤로 가기(아이패드 Safari의 화면 왼쪽 가장자리 쓸기·안드로이드 뒤로 버튼 포함)는 검사를 떠나지 않고 일시정지로 바꾼다 — 아이
  // 손이 가장자리를 쓸면 시작 화면으로 나가고 녹음 중이던 시도는 버려졌다. 같은 주소를 한 칸 더 쌓아 두고, 뒤로 가면 **앞으로 한 칸
  // 되돌린다**(그 자리에서 다시 쌓지 않는다 — 검토 화면에서 `?p=N`으로 들어온 검사는 아래 칸의 주소에 옛 p가 남아 있어, 그 주소로
  // 다시 쌓으면 새로고침 때 저장된 위치 대신 옛 문항으로 튀었다). 떠나는 길은 헤더의 [저장하고 나가기]다.
  // ⚠️ 칸은 **화면을 누른 순간**(click) 쌓는다 — Safari·크롬은 사용자가 누르지 않은 채 스크립트가 쌓은 기록을 뒤로 가기 버튼·제스처에서
  // 건너뛴다(뒤로 가기 가로채기 차단). 화면이 뜰 때 쌓았더니 아이패드 Safari의 [<]가 그 칸을 건너뛰어 검사를 떠났다(iPad 시뮬레이터
  // 2026-10-21 — 스크립트의 history.back()은 건너뛰지 않아 브라우저 패널 시험에서는 통과로 보였다). 검사는 선생님이 [시작하기]부터
  // 눌러 진행하므로 첫 누름에 칸이 생긴다.
  // 문항 화면이 떠 있을 때만 건다 — 마이크 확인·연습 선택·양식을 못 받은 화면·이어 할 수 없는 화면·다른 탭 알림에는
  // 덮을 일시정지 화면이 없어, 뒤로 가기가 아무 반응 없이 삼켜진다(사용자 확정 2026-10-21 — 태블릿 점검, 담당자 회신 아님)
  const trapBack = st?.phase === 'page' && !!form && !fatal && !otherTab
  useEffect(() => {
    if (!trapBack) return
    const arm = () => history.pushState(history.state, '', location.href)
    document.addEventListener('click', arm, { capture: true, once: true })
    const onPop = () => { history.forward(); pause() }
    window.addEventListener('popstate', onPop)
    return () => {
      document.removeEventListener('click', arm, { capture: true })
      window.removeEventListener('popstate', onPop)
    }
  }, [trapBack, pause])

  /** 상태 갱신 + localStorage 저장(항상 함께 — 저장 누락으로 재개 위치가 어긋나지 않도록) */
  const patch = useCallback((p: Partial<SurveyState> | ((prev: SurveyState) => Partial<SurveyState>)) => {
    setSt(prev => {
      const merged = { ...prev!, ...(typeof p === 'function' ? p(prev!) : p) }
      saveState(merged)
      return merged
    })
  }, [])

  const markSaved = useCallback((sessionId: string, code: string, attemptNo: number, uploads: boolean) => {
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
        tries: { ...prev.tries, [code]: Math.max(prev.tries?.[code] ?? 0, attemptNo) },
      }
      // 올리는 녹음이면 「시도함」도 적는다 — 제출 때 서버가 저장 실패를 가린다(lib/survey-state `attempted`)
      return uploads
        ? withPendingUpload({ ...next, attempted: [...new Set([...(prev.attempted ?? []), code])] }, code, attemptNo)
        : next
    })
    // 다시 녹음했으면 그 페이지의 다시 보낼 녹음은 거둔다 — 새 녹음이 그 화면의 녹음이다(앞 시도의 번호는 그대로 비워 둔다)
    clearFailedUpload(sessionId, code)
    setLostUploads(prev => prev.filter(c => c !== code))
    setUploadNotice('')
  }, [patch])

  /** 업로드가 끝났다(성공이든 실패든) — 「올리는 중」 표시를 저장 상태에서 직접 지운다(컴포넌트 생존과 무관). */
  const settleUpload = useCallback((sessionId: string, code: string, attemptNo: number) => {
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
   * 제출까지 통과한 다음 `withUnrecordedFixed`가 오반응(X·0점)으로 고정 채점한다 —
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
    if (r.retry) setFailedUpload(sessionId, code, { rec, attemptNo })
    else setUploadNotice(r.status === 400 && attemptNo > 10
      ? '이 화면은 10번까지만 저장돼요. 마지막 녹음은 저장돼 있어요.'
      : '이 녹음은 저장할 수 없었어요. 다시 녹음해 주세요.')
  }, [])

  if (!st) return null
  if (otherTab) return <OtherTabNotice kind={otherTab} />
  // 세션 만료(24시간)·이미 제출된 검사는 더 올릴 수 없다 — 양식 조회의 같은 오류(FormStatus)와 같이 진행 상태를 지우고
  // 처음 화면으로. 남겨 두면 시작 화면이 「이어서 하기」를 다시 권해 같은 오류로 돌아온다.
  if (fatal) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h1 className="text-xl font-bold">
        {fatal === 'expired' ? '검사를 시작한 지 오래되어 이어서 할 수 없어요'
          : fatal === 'gone' ? '이 검사 기록을 찾을 수 없어요' : '이미 제출된 검사예요'}
      </h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        {fatal === 'expired'
          ? <>방금 녹음은 저장되지 않았어요. 처음 화면에서 이 학생을 다시 골라 <b>처음부터</b> 검사해 주세요.</>
          : fatal === 'gone'
            ? <>담당자가 기록을 정리했을 수 있어요. 방금 녹음은 저장되지 않았어요. 처음 화면에서 이 학생을 다시 골라 <b>처음부터</b> 검사해 주세요.</>
            : <>다른 탭이나 기기에서 이 검사가 제출됐어요. 방금 녹음은 저장되지 않았어요.</>}
      </p>
      <button type="button" className="cta mt-2 max-w-60" onClick={() => { clearState(); router.replace('/') }}>처음 화면으로</button>
    </main>
  )

  // 이어서 할 수 없는 검사(지워짐·오래됨·이미 제출)면 마이크 확인부터 시키지 않는다 — 양식은 마이크 확인과 함께 받아
  // 두므로 결과가 먼저 와 있는데, 아이에게 「안녕하세요」를 녹음시킨 뒤에야 「이어서 할 수 없어요」가 떴다(2026-10-12 점검).
  if (formQ.error && isFatalFormError(formQ.error))
    return <FormStatus error={formQ.error} onRetry={() => void formQ.refetch()} />

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
    bandRef.current?.scrollTo(0, 0)
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
    // 줄지 않는 시도 번호 — 앞 시도가 실패해 저장 수가 줄어도 이미 올라간 시도의 번호를 다시 쓰지 않는다(lib/survey-state tries)
    const attemptNo = nextAttemptNo(st!, code)
    const { sessionId, sessionToken } = st!
    if (page.practice) { markSaved(sessionId, code, attemptNo, false); return }   // 연습은 서버에 남기지 않는다
    beginUpload(sessionId, code, attemptNo)
    markSaved(sessionId, code, attemptNo, true)
    void (async () => {
      const r = await uploadRecording({ sessionId, sessionToken, itemCode: code, attemptNo, rec })
      // 연결이 끊겨 실패했으면 잠깐 기다려 **이 페이지가 닫히는 중인지** 본다 — 새로고침·탭 닫기는 올리던 요청을 끊고, 그 끊김을
      // 실패로 처리하면 「올리는 중」 표시가 지워져 다시 열었을 때 끊긴 업로드를 알아보지 못했다(lib/upload-flight pageUnloading).
      if (!r.ok && r.status === 0) await new Promise(res => setTimeout(res, UNLOAD_SETTLE_MS))
      if (pageUnloading()) return
      settleUpload(sessionId, code, attemptNo)
      if (!r.ok) undoSaved(sessionId, code, rec, attemptNo, r)
      // 저장 상태를 다 고친 뒤에 끝을 알린다 — 검토 화면·다시 연 검사 화면이 알림을 받자마자 저장 상태를 다시 읽는다
      endUpload(sessionId, code, attemptNo)
    })()
  }

  function tryNext(e: React.MouseEvent) {
    if (tooSoon(e)) return   // 두 번 톡의 두 번째 누름(위 lastMainTap)
    // 연습 페이지에서는 곧바로 본 검사로 넘기지 않고 "연습이 끝났다"를 한 화면 보여준다
    // (연습과 본 검사의 경계가 화면에 없다는 피드백 — 2026-08-12).
    if (!fromReview && page.practice) { setPracticeEnd(true); return }
    // 쓰기 페이지를 떠날 때 **그때 보이던 방식**을 이 검사에 고정한다 — 토글을 안 누르면 방식은 기기 기본값에서
    // 읽히는데, 같은 기기의 다른 탭에서 기본값이 바뀌면 제출 때 다른 방식으로 나가 화면에서 고른 쓰기가 버려진다.
    if (page.section === f.writingSection && st && !st.writingMode) patch({ writingMode })
    goNext()
  }

  /** [모르겠어요] — 녹음 없이 넘긴 화면이면 검토 화면이 「미녹음」과 구분하도록 남긴다(담당자 확정 2026-09-21).
   *  녹음이 있으면 남기지 않고 넘어가기만 한다 — 읽은 데까지는 그 녹음으로 채점한다(lib/survey-flow `skippedAfter`). */
  function skipPage(e: React.MouseEvent) {
    if (tooSoon(e)) return   // 두 번 톡이면 다음 화면의 [모르겠어요]까지 눌려 두 화면을 건너뛴다(위 lastMainTap)
    patch(prev => ({ skipped: skippedAfter(prev, page.code) }))
    goNext()
  }

  function changeWriting(code: string, v: number) {
    patch(prev => ({ writing: { ...prev.writing, [code]: v } }))
  }

  /** 쓰기 방식 — 이 검사에 기록하고, 다음 아이를 위해 기기 기본값으로도 남긴다(사용자 확정 2026-09-30). */
  function changeWritingMode(m: WritingMode) {
    saveWritingModePref(m)
    patch({ writingMode: m })
  }

  async function retryUpload(code: string) {
    // attemptNo를 다시 계산하지 않고 실패 시점 값을 그대로 쓴다(pendingRetries 주석 참고).
    const pending = pendingRetries[code]
    if (!pending || !st) return
    const { sessionId } = st
    // 정상 녹음과 같이 「올리는 중」으로 센다 — 검토 화면이 끝날 때까지 제출을 잠그고(lib/upload-flight), 헤더도 「저장 중」
    beginUpload(sessionId, code, pending.attemptNo)
    const r = await uploadRecording({ sessionId, sessionToken: st.sessionToken,
      itemCode: code, attemptNo: pending.attemptNo, rec: pending.rec })
    if (r.ok) {
      // 이미 올라갔다 — 저장 상태를 직접 고친다(그사이 검토 화면으로 옮겨 이 화면이 사라졌어도 「녹음 완료」가 남게)
      const saved = (s: SurveyState) => ({ ...s, recorded: { ...s.recorded, [code]: (s.recorded[code] ?? 0) + 1 },
        skipped: s.skipped.filter(c => c !== code) })
      updateSavedState(sessionId, saved)
      setSt(prev => prev && prev.sessionId === sessionId ? saved(prev) : prev)
      clearFailedUpload(sessionId, code)
      setLostUploads(prev => prev.filter(c => c !== code))
      setUploadNotice('')
      endUpload(sessionId, code, pending.attemptNo)
      return
    }
    endUpload(sessionId, code, pending.attemptNo)
    if (r.fatal) { setFatal(r.fatal); return }
    // 재시도도 4xx면 배너를 거둔다 — 더 눌러도 같다
    if (!r.retry) {
      clearFailedUpload(sessionId, code)
      setUploadNotice('이 녹음은 저장할 수 없었어요. 다시 녹음해 주세요.')
    }
  }

  // 다음으로 넘어갈 수 있는 조건(페이지 종류별)은 survey-flow의 canAdvance가 판정한다.
  // 녹음 중에는 이 화면에서 항상 잠근다(busy). 업로드는 뒤에서 돌아가므로 잠그지 않는다.
  const writingMode = resolveWritingMode(st)
  const canNext = !busy && canAdvance(f, page, { ...st, writingMode })

  // 녹음 페이지 아래는 [이전] [모르겠어요] [다음]이다 — 녹음을 멈춘 뒤에도 [모르겠어요]를 누를 수 있다(담당자 요청 2026-10-22).
  // 녹음 전에는 [다음]이 꺼져 있다 — 오터치 한 번으로 화면이 조용히 넘어가지 않게(진행 자체는 [모르겠어요]로 허용 — 응답 거부·
  // 모름도 유효한 관찰이다). 종전(담당자 확정 2026-08-07)에는 별도 버튼 없이 녹음 전에만 [다음]의 라벨이 바뀌었다.
  // **다시 녹음할 화면(올리기 실패·저장되지 않은 시도)에는 [모르겠어요]가 없다** — 아이는 읽었고 저장만 안 됐다. 모르겠어요로
  // 넘기면 검토가 완료로 보고 관리자는 「저장 실패」로 본다(사용자 확정 2026-10-08·10-12, 담당자 회신 아님). 그 화면은 [다음]으로
  // 넘어가고 검토 화면에는 「미녹음」(미완료)으로 남는다. 판정은 lib/survey-flow `recordingNav`.
  const nav = recordingNav(page, st, { fromReview, isLast, retrying: page.code in pendingRetries })

  // 섹션(주제) 진입 안내: 각 섹션의 첫 페이지에 처음 도달하면 안내 화면을 먼저 보여준다.
  // "첫 페이지"는 **진행 목록(pages) 기준**이다 — 양식의 고정 목록으로 판정하면 연습을
  // 건너뛴 검사에서 낱말 해독 안내가 아예 나오지 않는다(첫 페이지가 연습 페이지이므로).
  const showIntro = !fromReview && !practiceEnd
    && pages.find(p => p.section === page.section)?.code === page.code
    && !st.introsSeen.includes(page.section)

  return (
    // 고정 3분할 레이아웃: 헤더(상단 고정) · 콘텐츠(가운데 밴드) · 내비(하단 고정).
    // 화면 높이가 낮으면(short — app/globals.css) 위아래 여백을 줄인다 — 녹음 뒤 알림이 밴드 안에 남게(2026-10-12 점검)
    // 넓은 배치는 tab(700px — app/globals.css)부터다 — 검사 화면(components/survey/*)이 모두 같은 기준을 쓴다. 종전 lg(1024px)에서는
    // 세로로 놓은 태블릿(iPad mini 744 ~ 834px)이 휴대폰 배치로 떨어져 낱말이 26px, 읽기판이 400px였고 문장이 문장 중간에서 접혔다.
    // 검사 도중 태블릿을 돌리면 자극 크기가 바뀌었다(사용자 확정 2026-10-21 — 태블릿 점검, 담당자 회신 아님). 낱말 크기는 ReadingPage 주석
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-6 pb-6 pt-8 tab:max-w-4xl tab:pt-6 short:pb-3 short:pt-3 tab:short:pt-3">
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
        {/* 주 버튼(「검토로 돌아가기」)과 같은 조건일 때만 보인다 — 녹음 중에 떠나 잘린 녹음이 올라가거나, 체크리스트를 비운 채·
            쓰기를 덜 채운 채 검토로 돌아가 그대로 제출되는 길이었다(2026-10-08 야간 점검) */}
        {fromReview && canNext && (
          <Link href="/review" className="mt-2 inline-block py-1 text-xs text-ink-mute underline">← 검토 화면으로 돌아가기</Link>
        )}
        {!showIntro && !practiceEnd && (
          // 자동 저장 안내는 별도 줄을 만들지 않고 이 줄의 남는 오른쪽 공간에 얹는다 —
          // 세로 공간이 빠듯해(가운데 밴드가 밀려 불필요한 스크롤이 생김) 한 줄도 아깝다.
          <div className="mt-4 flex items-baseline justify-between gap-2 short:mt-2">
            <h1 className="text-xs font-bold text-ink-mute">
              {SECTION_LABEL[page.section]}{page.practice && ' · 연습'}
            </h1>
            {/* 업로드가 남아 있는 동안만 "저장 중"으로 바뀐다 — 진행을 막지 않고 상태만 알린다. */}
            {/* 실패한 녹음이 있으면 「자동 저장됨」이라 말하지 않는다 — 아래 재시도 배너와 같은 사실을 헤더도 말한다 */}
            <p className={`flex-none text-[12px] ${failedCount > 0 && uploading === 0 ? 'font-bold text-rec-deep' : 'text-ink-mute'}`} aria-live="polite">
              {uploading > 0 ? '저장 중…' : failedCount > 0 ? `저장 실패 ${failedCount}개` : '자동 저장됨'}
            </p>
          </div>
        )}
      </header>

      {/* 가운데 밴드: 남는 높이를 모두 차지하고 내용을 세로 중앙 정렬. 내용이 밴드보다 크면
          이 구역 안에서만 스크롤(헤더·내비는 그대로). */}
      <div ref={bandRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-center py-4 short:py-2">
          {practiceEnd ? (
            <PracticeEnd />
          ) : showIntro ? (
            <SectionIntro section={page.section} sections={f.sections} />
          ) : (
            <>
              {/* 저장 실패 안내는 읽기판 **위**에 둔다 — 아래에 두면 1024×768·1366×768에서 화면 밖으로 밀려 헤더의 작은
                  「저장 실패 1개」만 보였다(2026-10-12 점검). 화면이 바뀌면 이 밴드는 맨 위부터 보인다. */}
              <RetryBanner form={f} codes={Object.keys(pendingRetries)} onRetry={retryUpload} />
              {/* 시도했는데 저장되지 않은 녹음(끊긴 업로드·실패한 채 새로고침) — 파일이 없으니 재시도가 아니라 다시 녹음이다 */}
              {lostUploads.length > 0 && (
                <p role="alert" className="mb-3 rounded-[14px] border border-amber/40 bg-amber/10 p-3 text-xs leading-relaxed text-amber">
                  <b>{lostUploads.map(c => pageLabel(f, c)).join(', ')}</b> 녹음이 저장되지 않았어요.
                  그 화면에서 다시 녹음해 주세요.
                </p>
              )}
              {uploadNotice && (
                <p role="alert" className="mb-3 rounded-[14px] border border-amber/40 bg-amber/10 p-3 text-xs leading-relaxed text-amber">{uploadNotice}</p>
              )}

              {page.role === 'child' && isRecordingPage(page) && (
                <ReadingPage key={page.code} page={page}
                  attemptCount={st.recorded[page.code] ?? 0} onRecordingChange={setBusy}
                  onRecorded={handleRecorded} stopRef={stopRecording} />
              )}

              {/* 쓰기는 방식을 먼저 고른다 — 스캔본 방식이면 표시 없이 넘어가고 담당자가 스캔본을 채점한다. */}
              {page.section === f.writingSection && writingMode === 'scan' && (
                <ScanWritingPanel toggle={<WritingModeToggle mode={writingMode} onChange={changeWritingMode} />}
                  items={page.items} kind={page.section === 'word_writing' ? 'word' : 'sentence'}
                  childNo={st.childNo} childName={st.childName}
                  screenMarks={page.items.filter(i => st.writing[i.code] !== undefined).length} />
              )}

              {page.section === 'word_writing' && writingMode === 'screen' && (
                <WritingPage items={page.items} value={st.writing}
                  toggle={<WritingModeToggle mode={writingMode} onChange={changeWritingMode} />}
                  onChange={changeWriting}
                  onSetAll={v => patch(prev => ({
                    // 아직 고르지 않은 칸만 채운다 — 이미 고른 값을 덮지 않는다(WritingPage 주석)
                    writing: { ...Object.fromEntries(page.items.map(i => [i.code, v])), ...prev.writing },
                  }))} />
              )}

              {page.section === 'sentence_writing' && writingMode === 'screen' && (
                <SentenceWritingPage items={page.items} value={st.writing}
                  toggle={<WritingModeToggle mode={writingMode} onChange={changeWritingMode} />}
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

      <nav className="flex flex-none gap-2.5 pt-4 short:pt-2">
        <button onClick={() => goToIdx(idx - 1)} disabled={idx === 0 || busy}
          className="btn-ghost h-[52px] flex-1">
          이전
        </button>
        {practiceEnd ? (
          <button onClick={e => { if (tooSoon(e)) return; setPracticeEnd(false); goNext() }}
            className="btn-primary h-[52px] flex-[2]">
            본 검사 시작하기
          </button>
        ) : showIntro ? (
          <button onClick={e => { if (tooSoon(e)) return; patch(prev => ({ introsSeen: [...prev.introsSeen, page.section] })) }}
            className="btn-primary h-[52px] flex-[2]">
            시작하기
          </button>
        ) : (
          <>
            {nav.skip && (
              <button onClick={skipPage} disabled={busy} className="btn-ghost h-[52px] flex-1">
                모르겠어요
              </button>
            )}
            <button onClick={tryNext} disabled={!canNext || !nav.next} className="btn-primary h-[52px] flex-[2]">
              {fromReview ? '검토로 돌아가기' : isLast ? '검토' : '다음'}
            </button>
          </>
        )}
      </nav>

      {paused && (
        // 화면 전체를 덮어 아동이 문항을 보거나 잘못 누르지 못하게 한다(잠깐 자리를 비우는 상황용).
        <div ref={pauseRef} role="dialog" aria-modal="true" aria-label="검사 일시정지"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/95 px-6 text-center backdrop-blur">
          <Blip variant="idle" className="h-24 w-[100px]" />
          <h2 className="text-2xl font-bold">잠시 쉬는 중이에요</h2>
          <p className="text-sm leading-relaxed text-ink-soft">
            {/* 저장 실패가 남았는데 「저장돼 있어요」라고 하면 안 된다(2026-10-12 점검) */}
            {failedCount > 0
              ? <>저장하지 못한 녹음이 <b className="text-rec-deep">{failedCount}개</b> 있어요.<br />이어서 한 뒤 [다시 저장]을 눌러 주세요.</>
              : <>지금까지 한 내용은 저장돼 있어요.<br />준비되면 아래 버튼을 눌러 주세요.</>}
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
