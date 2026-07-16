// app/survey/page.tsx — 검사 진행 화면(29문항 위저드).
// 문항 타입별 UI는 components/survey/*가 담당하고, 이 페이지는 진행 상태(현재 문항·답 캐시)의
// 로드/저장과 문항 간 이동만 제어한다. 진행 위치는 localStorage에 저장돼 새로고침·탭 닫힘
// 후에도 같은 문항에서 재개된다.
'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Recording } from '@/hooks/useRecorder'
import { ITEMS, SECTION_LABEL, toggleChecklistArea } from '@/lib/items'
import { loadState, saveState, type SurveyState } from '@/lib/survey-state'
import { uploadRecording } from '@/lib/upload'
import { ProgressBar } from '@/components/ProgressBar'
import { ChecklistItem } from '@/components/survey/ChecklistItem'
import { MicCheck } from '@/components/survey/MicCheck'
import { RecordingItem } from '@/components/survey/RecordingItem'
import { RetryBanner } from '@/components/survey/RetryBanner'
import { WritingItem } from '@/components/survey/WritingItem'

function SurveyInner() {
  const router = useRouter()
  const params = useSearchParams()
  // 진행 상태의 단일 소스 — 현재 문항(idx)·단계(phase)도 여기에만 둔다
  // (별도 useState로 이중 보관하면 재개 위치가 어긋나는 버그 여지가 생긴다).
  const [st, setSt] = useState<SurveyState | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  // 문항 이동 중 업로드가 실패한 녹음: 다른 문항으로 넘어가도 사라지지 않고 배너에서 재시도할 수 있다
  const [pendingRetries, setPendingRetries] = useState<Record<string, Recording>>({})
  const fromReview = params.get('from') === 'review'

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    // ?q=N 딥링크(검토 화면에서 문항 클릭): 해당 문항으로 이동한 상태로 복원하고 즉시 저장한다.
    const q = Number(params.get('q'))
    const jumped = Number.isInteger(q) && q >= 1 && q <= ITEMS.length
      ? { ...s, idx: q - 1, phase: 'item' as const }
      : s
    if (jumped !== s) {
      saveState(jumped)
      // q는 1회만 소비하고 URL에서 제거한다(from은 유지) — 이후 문항을 이동한 뒤 새로고침해도
      // stale q가 저장된 위치(idx)를 덮어쓰지 않도록(B10). q 제거로 이 effect가 한 번 더 돌지만
      // 그때는 q가 없어 되돌아온 상태를 그대로 로드하므로 루프가 아니다.
      const sp = new URLSearchParams(params.toString())
      sp.delete('q')
      router.replace(sp.toString() ? `/survey?${sp}` : '/survey', { scroll: false })
    }
    // 서버 프리렌더와 첫 페인트를 일치시키기 위해(하이드레이션 불일치 방지) localStorage는
    // 마운트 후 1회 읽어 복원한다 — 이 setState는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(jumped)
  }, [router, params])

  // 녹음 중 새로고침·탭 닫기 실수 방지(해당 시도의 소리가 유실되므로 확인창을 띄운다)
  useEffect(() => {
    if (!isRecording) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isRecording])

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

  if (!st) return null

  /** 상태 갱신 + localStorage 저장(항상 함께 — 저장 누락으로 재개 위치가 어긋나지 않도록) */
  function patch(p: Partial<SurveyState> | ((prev: SurveyState) => Partial<SurveyState>)) {
    setSt(prev => {
      const merged = { ...prev!, ...(typeof p === 'function' ? p(prev!) : p) }
      saveState(merged)
      return merged
    })
  }

  function goToIdx(n: number) { patch({ idx: n }); window.scrollTo(0, 0) }

  if (st.phase === 'mic')
    return <MicCheck onOk={() => patch({ micDone: true, phase: 'item' })} />

  const item = ITEMS[st.idx]
  const isLast = st.idx === ITEMS.length - 1
  const isRecordingSection = item.section === 'word_reading' || item.section === 'sentence_reading'
  // 낱말 쓰기 문항은 예/아니오 필수, 체크리스트는 최소 1개 선택 필수, 녹음 중에는 이동 불가.
  // (업로드는 이동 후에도 계속 진행되고, 실패하면 RetryBanner로 재시도할 수 있어 이동을 막지 않는다)
  const canNext = (item.section !== 'word_writing' || st.writing[item.code] !== undefined)
    && (item.section !== 'checklist' || st.checklist.length > 0)
    && !isRecording
  // 녹음 문항을 한 번도 녹음하지 않고 넘어가는 경우: 주 버튼을 "건너뛰기"로 바꿔(+약한 스타일)
  // 아동의 오터치 한 번으로 문항이 조용히 통과되지 않도록 의도를 드러낸다. 진행 자체는 허용
  // (응답 거부도 유효한 관찰일 수 있어 완전 차단하지 않음).
  const skipping = !fromReview && !isLast && isRecordingSection && (st.recorded[item.code] ?? 0) === 0

  function goNext() {
    // 검토에서 넘어온 경우(from=review) 순차 진행 대신 검토 화면으로 복귀한다.
    if (fromReview || isLast) { router.push('/review'); return }
    goToIdx(st!.idx + 1)
  }

  /** 업로드 성공 반영: 시도 수 +1, 재시도 대기 목록에서 제거 */
  function markSaved(code: string) {
    patch(prev => ({ recorded: { ...prev.recorded, [code]: (prev.recorded[code] ?? 0) + 1 } }))
    setPendingRetries(prev => {
      if (!(code in prev)) return prev
      const { [code]: _removed, ...rest } = prev
      return rest
    })
  }

  async function retryUpload(code: string) {
    const rec = pendingRetries[code]
    if (!rec || !st) return
    const ok = await uploadRecording({ sessionId: st.sessionId, sessionToken: st.sessionToken,
      itemCode: code, attemptNo: (st.recorded[code] ?? 0) + 1, rec })
    if (ok) markSaved(code)
  }

  return (
    // 고정 3분할 레이아웃: 헤더(상단 고정) · 콘텐츠(가운데 밴드) · 내비(하단 고정).
    // 화면 전체(h-dvh)를 세 구역으로 나눠, 문항 내용 크기가 바뀌어도 헤더와 [이전/다음] 버튼은
    // 절대 움직이지 않는다(꿀렁임 제거). 페이지는 스크롤되지 않고, 내용이 넘칠 때만 가운데
    // 구역 안에서만 스크롤된다. 데스크톱은 폭만 넓혀(2xl) 무대를 크게 보인다.
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-6 pb-6 pt-8 lg:max-w-4xl lg:pt-6">
      <header className="flex-none">
        {/* 누구의 검사인지 상단에 표시 — 이어하기로 진입했을 때 대상 아동을 바로 확인할 수 있게 */}
        {st.childName && (
          <p className="mb-2 text-xs font-bold text-ink-soft">
            <b className="text-blue">{st.childName}</b> 학생
          </p>
        )}
        <ProgressBar current={st.idx + 1} total={ITEMS.length} />
        {fromReview && (
          <Link href="/review" className="mt-2 inline-block py-1 text-xs text-ink-mute underline">← 검토 화면으로 돌아가기</Link>
        )}
        <h1 className="mt-4 text-xs font-bold text-ink-mute">
          {item.orderNo}. {SECTION_LABEL[item.section]}
        </h1>
      </header>

      {/* 가운데 밴드: 남는 높이를 모두 차지하고 내용을 세로 중앙 정렬. 내용이 밴드보다 크면
          이 구역 안에서만 스크롤(헤더·내비는 그대로) — 페이지 스크롤이 생기지 않는다. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-center py-4">
          {(item.section === 'word_reading' || item.section === 'sentence_reading') && (
            <RecordingItem key={item.code} item={item} sessionId={st.sessionId} sessionToken={st.sessionToken}
              attemptCount={st.recorded[item.code] ?? 0} onRecordingChange={setIsRecording}
              onUploadFailed={rec => setPendingRetries(prev => ({ ...prev, [item.code]: rec }))}
              onSaved={() => markSaved(item.code)} />
          )}

          <RetryBanner codes={Object.keys(pendingRetries)} onRetry={retryUpload} />

          {item.section === 'word_writing' && (
            <WritingItem item={item} value={st.writing[item.code]}
              onChange={v => patch(prev => ({ writing: { ...prev.writing, [item.code]: v } }))} />
          )}

          {item.section === 'checklist' && (
            <ChecklistItem selected={st.checklist}
              onToggle={code => patch(prev => ({ checklist: toggleChecklistArea(prev.checklist, code) }))} />
          )}
        </div>
      </div>

      <nav className="flex flex-none gap-2.5 pt-4">
        <button onClick={() => goToIdx(st.idx - 1)} disabled={st.idx === 0 || isRecording}
          className="btn-ghost h-[52px] flex-1">
          이전
        </button>
        <button onClick={goNext} disabled={!canNext}
          className={`${skipping ? 'btn-ghost' : 'btn-primary'} h-[52px] flex-[2]`}>
          {fromReview ? '검토로 돌아가기' : isLast ? '검토' : skipping ? '건너뛰기' : '다음'}
        </button>
      </nav>
    </main>
  )
}

export default function SurveyPage() {
  return <Suspense fallback={null}><SurveyInner /></Suspense>
}
