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
    // ?q=N 딥링크(검토 화면에서 문항 클릭): 해당 문항으로 이동한 상태로 복원하고 즉시 저장한다
    // — 이후 새로고침해도 같은 문항이 열린다.
    const q = Number(params.get('q'))
    const jumped = Number.isInteger(q) && q >= 1 && q <= ITEMS.length
      ? { ...s, idx: q - 1, phase: 'item' as const }
      : s
    if (jumped !== s) saveState(jumped)
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
  // 낱말 쓰기 문항은 예/아니오 필수, 체크리스트는 최소 1개 선택 필수, 녹음 중에는 이동 불가.
  // (업로드는 이동 후에도 계속 진행되고, 실패하면 RetryBanner로 재시도할 수 있어 이동을 막지 않는다)
  const canNext = (item.section !== 'word_writing' || st.writing[item.code] !== undefined)
    && (item.section !== 'checklist' || st.checklist.length > 0)
    && !isRecording

  function goNext() {
    if (isLast) { router.push('/review'); return }
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8">
      <ProgressBar current={st.idx + 1} total={ITEMS.length} />
      {fromReview && (
        <Link href="/review" className="mt-2 inline-block py-2 text-xs text-ink-mute underline">← 검토 화면으로 돌아가기</Link>
      )}
      <h1 className="mt-4 text-xs font-bold text-ink-mute">
        {item.orderNo}. {SECTION_LABEL[item.section]}
      </h1>

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

      <div className="mt-auto flex gap-2.5 pb-2 pt-6">
        <button onClick={() => goToIdx(st.idx - 1)} disabled={st.idx === 0 || isRecording}
          className="btn-ghost h-[52px] flex-1">
          이전
        </button>
        <button onClick={goNext} disabled={!canNext} className="btn-primary h-[52px] flex-[2]">
          {isLast ? '검토' : '다음'}
        </button>
      </div>
    </main>
  )
}

export default function SurveyPage() {
  return <Suspense fallback={null}><SurveyInner /></Suspense>
}
