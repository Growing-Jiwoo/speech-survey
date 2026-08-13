// app/survey/page.tsx — 검사 진행 화면(페이지 위저드).
// 검사지대로 "한 페이지 = 한 과제 = 한 녹음" 단위로 진행한다. 페이지 종류별 UI는
// components/survey/*가 담당하고, 이 페이지는 진행 상태(현재 페이지·답 캐시)의 로드/저장과
// 페이지 간 이동만 제어한다. 진행 위치는 localStorage에 저장돼 새로고침·탭 닫힘 후에도 재개된다.
'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import type { Recording } from '@/hooks/useRecorder'
import { SECTION_LABEL, isRecordingPage, itemsFor, toggleChecklistArea } from '@/lib/items'
import { formForGrade } from '@/lib/forms'
import { canAdvance, visiblePages } from '@/lib/survey-flow'
import { loadState, saveState, type SurveyState } from '@/lib/survey-state'
import { uploadRecording } from '@/lib/upload'
import { Blip } from '@/components/Blip'
import { ProgressBar } from '@/components/ProgressBar'
import { ChecklistItem } from '@/components/survey/ChecklistItem'
import { MicCheck } from '@/components/survey/MicCheck'
import { PracticeAsk } from '@/components/survey/PracticeAsk'
import { PracticeEnd } from '@/components/survey/PracticeEnd'
import { ReadingPage } from '@/components/survey/ReadingPage'
import { RetryBanner } from '@/components/survey/RetryBanner'
import { SectionIntro } from '@/components/survey/SectionIntro'
import { SentenceWritingPage } from '@/components/survey/SentenceWritingPage'
import { WritingPage } from '@/components/survey/WritingPage'

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
  // 검사자가 직접 누르는 일시정지(화면을 덮어 아동의 오터치도 막는다). 녹음 중에는 잠근다.
  const [paused, setPaused] = useState(false)
  // 일시정지 오버레이도 다이얼로그이므로 ConfirmDialog와 같은 포커스 트랩을 쓴다
  // (초기 포커스·Tab 순환·Esc로 재개·해제 시 포커스 복귀).
  const pauseRef = useFocusTrap(paused, () => setPaused(false))
  // 페이지 이동 중 업로드가 실패한 녹음: 다른 페이지로 넘어가도 배너에서 재시도할 수 있다
  const [pendingRetries, setPendingRetries] = useState<Record<string, Recording>>({})
  const fromReview = params.get('from') === 'review'

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    // ?p=N 딥링크(검토 화면에서 페이지 클릭): 해당 페이지로 이동한 상태로 복원하고 즉시 저장한다.
    const p = Number(params.get('p'))
    const total = visiblePages(itemsFor(formForGrade(s.grade)), s).length
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

  /** 낙관적 완료 표시를 되돌린다 — 업로드가 실패했으면 그 녹음은 실제로 없다.
   *  되돌리지 않으면 검토 화면이 "녹음 완료"라 말하는데 서버에는 파일이 없다. */
  const undoSaved = useCallback((code: string, rec: Recording) => {
    patch(prev => ({
      recorded: { ...prev.recorded, [code]: Math.max(0, (prev.recorded[code] ?? 1) - 1) },
    }))
    setPendingRetries(prev => ({ ...prev, [code]: rec }))
  }, [patch])

  if (!st) return null

  if (st.phase === 'mic')
    return <MicCheck onOk={() => patch({ micDone: true, phase: 'practiceAsk' })} />

  // 학년이 검사지(양식)를 정하고, 양식이 문항·페이지·중단 규칙을 정한다.
  const f = itemsFor(formForGrade(st.grade))

  if (st.phase === 'practiceAsk')
    return <PracticeAsk onChoose={practice => patch({ practice, phase: 'page', pageIdx: 0 })} />

  // 중단 규칙·연습 실시 여부를 반영한 진행 목록. marks가 바뀌면 목록이 줄어들 수 있으므로
  // 인덱스를 clamp한다.
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
    markSaved(code)
    if (page.practice) return   // 연습은 서버에 남기지 않는다
    setUploading(n => n + 1)
    void uploadRecording({ sessionId: st!.sessionId, sessionToken: st!.sessionToken, itemCode: code, attemptNo, rec })
      .then(ok => { if (!ok) undoSaved(code, rec) })
      .finally(() => setUploading(n => n - 1))
  }

  function tryNext() {
    // 연습 페이지에서는 곧바로 본 검사로 넘기지 않고 "연습이 끝났다"를 한 화면 보여준다
    // (연습과 본 검사의 경계가 화면에 없다는 피드백 — 2026-08-12).
    if (!fromReview && page.practice) { setPracticeEnd(true); return }
    goNext()
  }

  function changeWriting(code: string, v: number) {
    patch(prev => ({ writing: { ...prev.writing, [code]: v } }))
  }

  async function retryUpload(code: string) {
    const rec = pendingRetries[code]
    if (!rec || !st) return
    const ok = await uploadRecording({ sessionId: st.sessionId, sessionToken: st.sessionToken,
      itemCode: code, attemptNo: (st.recorded[code] ?? 0) + 1, rec })
    if (ok) markSaved(code)
  }

  // 다음으로 넘어갈 수 있는 조건(페이지 종류별)은 survey-flow의 canAdvance가 판정한다.
  // 녹음 중에는 이 화면에서 항상 잠근다(busy). 업로드는 뒤에서 돌아가므로 잠그지 않는다.
  const canNext = !busy && canAdvance(f, page, st)

  // 녹음 페이지를 한 번도 녹음하지 않고 넘어가는 경우: 주 버튼을 "모르겠어요"로 바꿔(+약한 스타일)
  // 오터치 한 번으로 페이지가 조용히 통과되지 않도록 의도를 드러낸다(진행 자체는 허용 —
  // 응답 거부·모름도 유효한 관찰이다). 담당자 확정: 별도 버튼을 만들지 않고 이 라벨을 쓴다.
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
            <button type="button" onClick={() => setPaused(true)} disabled={busy}
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
                  onRecorded={handleRecorded} />
              )}

              <RetryBanner form={f} codes={Object.keys(pendingRetries)} onRetry={retryUpload} />

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
