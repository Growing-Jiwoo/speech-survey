// app/survey/page.tsx — 검사 진행 화면(페이지 위저드).
// 검사지대로 "한 페이지 = 한 과제 = 한 녹음" 단위로 진행한다. 페이지 종류별 UI는
// components/survey/*가 담당하고, 이 페이지는 진행 상태(현재 페이지·답 캐시)의 로드/저장과
// 페이지 간 이동만 제어한다. 진행 위치는 localStorage에 저장돼 새로고침·탭 닫힘 후에도 재개된다.
// 중단 규칙에 걸리면 visiblePages가 해당 페이지들을 빼므로, 이동 로직은 그 목록만 따라가면 된다.
'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Recording } from '@/hooks/useRecorder'
import { SECTION_FIRST_CODES, SECTION_LABEL, isRecordingPage, toggleChecklistArea } from '@/lib/items'
import { canAdvance, requiredWritingCodes, visiblePages } from '@/lib/survey-flow'
import { loadState, saveState, type SurveyState } from '@/lib/survey-state'
import { uploadRecording } from '@/lib/upload'
import { ProgressBar } from '@/components/ProgressBar'
import { ChecklistItem } from '@/components/survey/ChecklistItem'
import { MarkPage } from '@/components/survey/MarkPage'
import { MicCheck } from '@/components/survey/MicCheck'
import { ReadingPage } from '@/components/survey/ReadingPage'
import { RetryBanner } from '@/components/survey/RetryBanner'
import { SectionIntro } from '@/components/survey/SectionIntro'
import { WritingPage } from '@/components/survey/WritingPage'

function SurveyInner() {
  const router = useRouter()
  const params = useSearchParams()
  // 진행 상태의 단일 소스 — 현재 페이지(pageIdx)·단계(phase)도 여기에만 둔다.
  const [st, setSt] = useState<SurveyState | null>(null)
  const [busy, setBusy] = useState(false)
  // 페이지 이동 중 업로드가 실패한 녹음: 다른 페이지로 넘어가도 배너에서 재시도할 수 있다
  const [pendingRetries, setPendingRetries] = useState<Record<string, Recording>>({})
  const fromReview = params.get('from') === 'review'

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    // ?p=N 딥링크(검토 화면에서 페이지 클릭): 해당 페이지로 이동한 상태로 복원하고 즉시 저장한다.
    const p = Number(params.get('p'))
    const total = visiblePages(s).length
    const jumped = Number.isInteger(p) && p >= 1 && p <= total
      ? { ...s, pageIdx: p - 1, phase: 'page' as const }
      : s
    if (jumped !== s) {
      saveState(jumped)
      // p는 1회만 소비하고 URL에서 제거한다(from은 유지) — 이후 페이지를 이동한 뒤 새로고침해도
      // stale p가 저장된 위치를 덮어쓰지 않도록.
      const sp = new URLSearchParams(params.toString())
      sp.delete('p')
      router.replace(sp.toString() ? `/survey?${sp}` : '/survey', { scroll: false })
    }
    // 서버 프리렌더와 첫 페인트를 일치시키기 위해(하이드레이션 불일치 방지) localStorage는
    // 마운트 후 1회 읽어 복원한다 — 이 setState는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(jumped)
  }, [router, params])

  // 녹음 중 새로고침·탭 닫기 실수 방지(해당 시도의 소리가 유실되므로 확인창을 띄운다)
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

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

  /** 상태 갱신 + localStorage 저장(항상 함께 — 저장 누락으로 재개 위치가 어긋나지 않도록) */
  const patch = useCallback((p: Partial<SurveyState> | ((prev: SurveyState) => Partial<SurveyState>)) => {
    setSt(prev => {
      const merged = { ...prev!, ...(typeof p === 'function' ? p(prev!) : p) }
      saveState(merged)
      return merged
    })
  }, [])

  const markSaved = useCallback((code: string) => {
    patch(prev => ({ recorded: { ...prev.recorded, [code]: (prev.recorded[code] ?? 0) + 1 } }))
    setPendingRetries(prev => {
      if (!(code in prev)) return prev
      const { [code]: _removed, ...rest } = prev
      return rest
    })
  }, [patch])

  if (!st) return null

  if (st.phase === 'mic')
    return <MicCheck onOk={() => patch({ micDone: true, phase: 'page' })} />

  // 중단 규칙을 반영한 진행 목록. marks가 바뀌면 목록이 줄어들 수 있으므로 인덱스를 clamp한다.
  const pages = visiblePages(st)
  const idx = Math.min(st.pageIdx, pages.length - 1)
  const page = pages[idx]
  const isLast = idx === pages.length - 1

  function goToIdx(n: number) { patch({ pageIdx: n }); window.scrollTo(0, 0) }

  function goNext() {
    // 검토에서 넘어온 경우(from=review) 순차 진행 대신 검토 화면으로 복귀한다.
    if (fromReview || isLast) { router.push('/review'); return }
    goToIdx(idx + 1)
  }

  async function retryUpload(code: string) {
    const rec = pendingRetries[code]
    if (!rec || !st) return
    const ok = await uploadRecording({ sessionId: st.sessionId, sessionToken: st.sessionToken,
      itemCode: code, attemptNo: (st.recorded[code] ?? 0) + 1, rec })
    if (ok) markSaved(code)
  }

  // 다음으로 넘어갈 수 있는 조건(페이지 종류별)은 survey-flow의 canAdvance가 판정한다.
  // 녹음/카운트다운 중에는 이 화면에서 항상 잠근다(busy).
  const canNext = !busy && canAdvance(page, st)

  // 녹음 페이지를 한 번도 녹음하지 않고 넘어가는 경우: 주 버튼을 "건너뛰기"로 바꿔
  // 오터치 한 번으로 페이지가 조용히 통과되지 않도록 의도를 드러낸다(진행 자체는 허용).
  const skipping = !fromReview && !isLast && isRecordingPage(page) && (st.recorded[page.code] ?? 0) === 0

  // 섹션(주제) 진입 안내: 각 섹션의 첫 페이지에 처음 도달하면 안내 화면을 먼저 보여준다.
  const showIntro = !fromReview && SECTION_FIRST_CODES.has(page.code) && !st.introsSeen.includes(page.section)

  return (
    // 고정 3분할 레이아웃: 헤더(상단 고정) · 콘텐츠(가운데 밴드) · 내비(하단 고정).
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-6 pb-6 pt-8 lg:max-w-4xl lg:pt-6">
      <header className="flex-none">
        {st.childName && (
          <p className="mb-2 text-xs font-bold text-ink-soft">
            <b className="text-blue">{st.childName}</b> 학생
          </p>
        )}
        <ProgressBar current={idx + 1} total={pages.length} />
        {fromReview && (
          <Link href="/review" className="mt-2 inline-block py-1 text-xs text-ink-mute underline">← 검토 화면으로 돌아가기</Link>
        )}
        {!showIntro && (
          <h1 className="mt-4 text-xs font-bold text-ink-mute">
            {SECTION_LABEL[page.section]}{page.practice && ' · 연습'}
          </h1>
        )}
      </header>

      {/* 가운데 밴드: 남는 높이를 모두 차지하고 내용을 세로 중앙 정렬. 내용이 밴드보다 크면
          이 구역 안에서만 스크롤(헤더·내비는 그대로). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-center py-4">
          {showIntro ? (
            <SectionIntro section={page.section} />
          ) : (
            <>
              {page.role === 'child' && isRecordingPage(page) && (
                <ReadingPage key={page.code} page={page} sessionId={st.sessionId} sessionToken={st.sessionToken}
                  attemptCount={st.recorded[page.code] ?? 0} onRecordingChange={setBusy}
                  onUploadFailed={rec => setPendingRetries(prev => ({ ...prev, [page.code]: rec }))}
                  onSaved={() => markSaved(page.code)} />
              )}

              <RetryBanner codes={Object.keys(pendingRetries)} onRetry={retryUpload} />

              {page.code === 'p_rw_meaning_mark' && (
                <MarkPage items={page.items} marks={st.marks}
                  onToggle={(code, correct) => patch(prev => ({ marks: { ...prev.marks, [code]: correct } }))} />
              )}

              {page.section === 'word_writing' && (
                <WritingPage items={page.items} value={st.writing}
                  onChange={(code, v) => patch(prev => ({ writing: { ...prev.writing, [code]: v } }))}
                  onSetAll={v => patch(prev => {
                    // 중단 규칙 ②를 무시하고 10문항 전부에 v를 쓰면, 이 클릭 자체가 중단을 유발하는 경우
                    // (예: "모두 아니오"를 첫 클릭으로) 중단 이후 문항에도 실제로 실시하지 않은 값이
                    // 남는다. tentative 상태에서 requiredWritingCodes로 다시 판정해, 그 판정에 필요한
                    // 코드에만 값을 반영한다 — 문항별로 하나씩 눌러 같은 잠금에 도달했을 때와 동일한 결과.
                    const tentative = { ...prev.writing, ...Object.fromEntries(page.items.map(i => [i.code, v])) }
                    const required = requiredWritingCodes(page.items, tentative)
                    const applied = Object.fromEntries(
                      page.items.filter(i => required.has(i.code)).map(i => [i.code, v]),
                    )
                    return { writing: { ...prev.writing, ...applied } }
                  })} />
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
        {showIntro ? (
          <button onClick={() => patch(prev => ({ introsSeen: [...prev.introsSeen, page.section] }))}
            className="btn-primary h-[52px] flex-[2]">
            시작하기
          </button>
        ) : (
          <button onClick={goNext} disabled={!canNext}
            className={`${skipping ? 'btn-ghost' : 'btn-primary'} h-[52px] flex-[2]`}>
            {fromReview ? '검토로 돌아가기' : isLast ? '검토' : skipping ? '건너뛰기' : '다음'}
          </button>
        )}
      </nav>
    </main>
  )
}

export default function SurveyPage() {
  return <Suspense fallback={null}><SurveyInner /></Suspense>
}
