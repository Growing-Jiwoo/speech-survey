// app/review/page.tsx — 제출 전 검토 화면.
// 문항별 완료 여부를 한눈에 보여주고(미완료 강조), 번호 클릭 시 해당 문항으로 되돌아가
// 고칠 수 있게 한다. 미완료가 있어도 제출은 막지 않는다(현장에서 건너뛴 문항이 있을 수
// 있으므로 검사자 판단에 맡기고, 확인 모달에서 한 번 더 경고만 한다).
'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/Badge'
import { Blip } from '@/components/Blip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { postJson } from '@/lib/http'
import { SECTION_LABEL, isRecordingPage, areaLabel, itemsFor, pageLabel, type Section } from '@/lib/items'
import { OtherTabNotice, useOtherTabGuard } from '@/hooks/useOtherTabGuard'
import { useSurveyForm } from '@/hooks/useSurveyForm'
import { FormStatus } from '@/components/survey/FormStatus'
import { visiblePages } from '@/lib/survey-flow'
import { clearState, loadState, markSubmitted, resolveWritingMode, saveState, settleLostUploads, type SurveyState } from '@/lib/survey-state'
import { isUploading, subscribeUploads, uploadsInFlight } from '@/lib/upload-flight'

/** 상태 라벨 — 완료는 파랑, 미완료는 붉은 작은 배지 하나로만 표시(차분하게). */
function StatusPill({ done, label }: { done: boolean; label: string }) {
  return <Badge tone={done ? 'blue' : 'rec'}>{label}</Badge>
}

export default function ReviewPage() {
  const router = useRouter()
  const [st, setSt] = useState<SurveyState | null>(null)
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /** 제출이 서버에서 거절돼 더 진행할 수 없다(이미 제출·세션 만료·지워짐) — 처음 화면으로 보낸다 */
  const [fatal, setFatal] = useState<'submitted' | 'expired' | null>(null)
  /** 끊긴 업로드로 「녹음 완료」 표시를 거둔 페이지 — 검사 화면과 같은 판정·같은 안내 */
  const [lostUploads, setLostUploads] = useState<string[]>([])

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    // 검사 화면과 같이 끊긴 업로드를 거둔다 — 올리는 중에 이 화면에서 새로고침하면 파일은 사라지고
    // 「녹음 완료」만 남아 그대로 제출된다. 같은 탭에서 아직 올리고 있는 것은 그대로 둔다.
    const settled = settleLostUploads(s, (code, no) => isUploading(s.sessionId, code, no))
    if (settled.lost.length > 0) saveState(settled.state)
    // 서버 프리렌더와 첫 페인트를 일치시키기 위해(하이드레이션 불일치 방지) localStorage는
    // 마운트 후 1회 읽어 복원한다 — 이 setState는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(settled.state)
    setLostUploads(settled.lost)
  }, [router])

  // 이 탭에서 아직 올리고 있는 녹음 수 — 있으면 제출을 막는다(lib/upload-flight 머리 주석). 바깥 저장소라
  // useSyncExternalStore로 읽는다 — 마운트와 구독 사이에 업로드가 끝나 알림을 놓치면 「녹음 저장 중…」에 갇혔다.
  const sessionId = st?.sessionId
  const uploading = useSyncExternalStore(subscribeUploads,
    () => (sessionId ? uploadsInFlight(sessionId) : 0), () => 0)
  // 업로드가 끝날 때마다 저장 상태를 다시 읽는다. 실패한 녹음은 검사 화면이 저장 상태에서 「녹음 완료」를 거두므로
  // (undoSaved) 다시 읽으면 여기서도 미녹음으로 보인다.
  useEffect(() => {
    if (!sessionId) return
    return subscribeUploads(() => {
      const s = loadState()
      if (s?.sessionId === sessionId) setSt(s)
    })
  }, [sessionId])

  // 올리는 중 새로고침·탭 닫기 실수 방지(검사 화면과 같다 — 그 녹음이 사라진다)
  useEffect(() => {
    if (uploading === 0) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  // 검사지는 서버가 내려준다(hooks/useSurveyForm) — 검사 화면에서 이미 받았으면 캐시로 즉시 뜬다.
  const formQ = useSurveyForm(st)
  const otherTab = useOtherTabGuard(st?.sessionId)

  if (!st) return null
  if (otherTab) return <OtherTabNotice />
  if (!formQ.data) return <FormStatus error={formQ.error} onRetry={() => void formQ.refetch()} />
  const state = st

  // 미완료 판정: 녹음 페이지는 저장된 시도 0회, 쓰기 과제는 점수 미선택.
  // 체크리스트는 진행 화면이 최소 1개를 강제하지만, 비어 있으면 **여기서도 미완료로 센다** — 비운 채 검토로 돌아오는
  // 길이 있었고(헤더 링크, 2026-10-08 야간 점검) 서버는 빈 목록도 받는다.
  // 연습 페이지는 서버에 남기지 않으므로 완료 판정에서 제외한다.
  // **[모르겠어요]로 넘긴 페이지도 제외한다**(담당자 확정 2026-09-21) — 검사자가 의도적으로
  // 넘긴 것은 "아직 못 한 것"이 아니다. 모름 3개를 넘겼는데 "아직 3개가 완료되지 않았어요"가
  // 뜨면 검사자는 돌아가서 뭘 해야 하는 줄 알고, 진짜 빠뜨린 문항과도 섞여 버린다.
  const f = itemsFor(formQ.data)
  const pages = visiblePages(f, state)
  // 스캔본 방식이면 쓰기는 「아직 못 한 것」이 아니다 — 담당자가 스캔본을 보고 채점한다(검사 화면과 같은 판정).
  const scanWriting = resolveWritingMode(state) === 'scan'
  const skipped = (p: typeof pages[number]) => state.skipped.includes(p.code)
  const missingPages = pages.filter(p =>
    isRecordingPage(p) && !p.practice && !(state.recorded[p.code] > 0) && !skipped(p)).length
  const missingWriting = scanWriting ? 0 : pages
    .filter(p => p.section === f.writingSection)
    .flatMap(p => p.items)
    .filter(i => state.writing[i.code] === undefined).length
  const missingChecklist = state.checklist.length === 0 ? 1 : 0
  const missing = missingPages + missingWriting + missingChecklist

  /** 섹션 하나를 카드로 렌더 — 얇은 구분선 행 + 작은 상태 배지의 차분한 목록. */
  function renderSection(section: Section) {
    const rows = pages.filter(p => p.section === section)
    if (rows.length === 0) return null   // 빈 섹션 카드는 그리지 않는다
    return (
      <section className="card p-4 lg:p-5">
        <h2 className="text-[13px] font-bold text-ink-soft">{SECTION_LABEL[section]}</h2>
        <ul className="mt-1 flex flex-col">
          {rows.map(p => {
            const no = pages.indexOf(p) + 1
            let pill: React.ReactNode
            if (p.practice) {
              pill = <span className="text-right text-xs text-ink-mute">연습 (채점 안 함)</span>
            } else if (isRecordingPage(p)) {
              // 세 갈래다 — 녹음 완료 / 모르겠어요 / 미녹음. 「모르겠어요」는 검사자가 의도적으로
              // 넘긴 **관찰 결과**이지 빠뜨린 것이 아니므로 누락 색(rec)을 쓰지 않는다
              // (담당자 확정 2026-09-21: 미녹음과 구분해 보여줄 것).
              pill = (state.recorded[p.code] ?? 0) > 0 ? <StatusPill done label="녹음 완료" />
                : skipped(p) ? <Badge tone="amber">모르겠어요</Badge>
                  : <StatusPill done={false} label="미녹음" />
            } else if (p.section === f.writingSection) {
              const done = p.items.filter(i => state.writing[i.code] !== undefined).length
              pill = scanWriting ? <Badge tone="blue">스캔 예정</Badge>
                : <StatusPill done={done === p.items.length} label={`${done} / ${p.items.length}`} />
            } else {
              pill = state.checklist.length > 0 ? (
                <span className="text-right text-xs text-ink-soft">{state.checklist.map(areaLabel).join(', ')}</span>
              ) : <StatusPill done={false} label="선택 안 함" />
            }
            // 문장은 어느 문장이었는지가 곧 그 단계라 전문을 보여준다(두 줄까지). 나머지는 이름·개수만 —
            // 낱말 7개를 이어 붙이면 어느 폭에서도 뒤가 잘려 아무것도 알려주지 못한다.
            const sentence = p.section === 'sentence_reading'
            // ?p=<순번>&from=review — 진행 화면이 해당 페이지로 열리고 "검토로 돌아가기" 링크를 보여준다
            return (
              <li key={p.code} className="flex items-center justify-between gap-3 border-t border-line/60 py-2.5 first:border-t-0">
                <Link href={`/survey?p=${no}&from=review`} className="flex min-w-0 items-center gap-2.5">
                  <span className="w-6 flex-none text-sm font-bold text-blue">{no}</span>
                  <span className={`font-read min-w-0 text-sm ${sentence ? 'line-clamp-2 leading-snug' : 'truncate'}`}>
                    {sentence ? p.items[0].text.replace('\n', ' ') : pageLabel(f, p.code)}
                  </span>
                </Link>
                {pill}
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  async function submit() {
    if (!st || uploadsInFlight(st.sessionId) > 0) return
    setBusy(true); setErr('')
    // 스캔본 방식이면 화면에 남아 있는 예/아니오를 보내지 않는다 — 쓰기 채점은 담당자가 스캔본으로 한다.
    const writingMode = resolveWritingMode(st)
    const r = await postJson('/api/sessions/submit', {
      sessionId: st.sessionId, sessionToken: st.sessionToken, writingMode,
      writing: writingMode === 'scan' ? {} : st.writing, checklist: st.checklist,
    }, '제출에 문제가 생겼어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) {
      // 다시 눌러도 같은 답인 거절은 빠져나갈 길을 준다 — 409는 응답만 끊겼고 서버는 이미 받은 경우가 대부분이다
      // (같은 오류가 계속 반복되고 시작 화면은 이 아이를 「이어서 하기」로 다시 권했다 — 2026-10-08 야간 점검)
      if (r.status === 409) { setModal(false); setFatal('submitted'); return }
      if (r.status === 401 || r.status === 404) { setModal(false); setFatal('expired'); return }
      setErr(r.error); return
    }
    markSubmitted(st.sessionId)   // 종료 화면은 이 세션의 흔적만 치운다(lib/survey-state clearSessionState)
    clearState()
    router.replace('/done')       // 뒤로가기로 이 검토 화면(제출된 검사)에 돌아오지 않게
  }

  if (fatal) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h1 className="text-xl font-bold">{fatal === 'submitted' ? '이미 제출된 검사예요' : '이 검사는 더 이어갈 수 없어요'}</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        {fatal === 'submitted'
          ? <>{state.childNo}번 {state.childName} 학생의 검사는 제출이 끝났어요. 다음 학생을 검사해 주세요.</>
          : <>검사를 시작한 지 오래됐거나 담당자가 기록을 정리했어요. 처음 화면에서 이 학생을 다시 골라 <b>처음부터</b> 검사해 주세요.</>}
      </p>
      <button type="button" className="cta mt-2 max-w-60" onClick={() => { clearState(); router.replace('/') }}>처음 화면으로</button>
    </main>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8 lg:max-w-4xl">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">검사 검토</span>
      </div>
      {/* 누구의 검사를 검토하는지 — 같은 컴퓨터에서 탭을 두 개 쓰면 마지막에 저장된 아이가 여기 올라온다.
          이름이 없으면 선생님은 A를 검토한다고 믿고 B를 제출할 수 있다 */}
      <p className="mt-6 text-sm font-bold text-blue">{st.childNo}번 {st.childName} 학생</p>
      <h1 className="mt-1 text-xl font-bold">단계별 완료 여부를 확인해 주세요</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        단계 번호를 누르면 해당 화면으로 이동해요.
        {missing > 0 && <> 아직 <b className="text-rec-deep">{missing}개</b>가 완료되지 않았어요.</>}
      </p>
      {lostUploads.length > 0 && (
        <p role="alert" className="mt-3 rounded-[14px] border border-amber/40 bg-amber/10 p-3 text-xs leading-relaxed text-amber">
          <b>{lostUploads.map(c => pageLabel(f, c)).join(', ')}</b> 녹음이 저장되기 전에 화면이 닫혀 저장되지 않았어요.
          번호를 눌러 그 화면에서 다시 녹음해 주세요.
        </p>
      )}

      {/* 데스크톱(lg+): 2열로 좌우 높이를 맞춘다. 좌=낱말 해독(14문항), 우=문장(4)+낱말 쓰기(10).
          검사자 체크리스트(1문항)는 아래 전폭 밴드로 빼 좌우 불균형을 만들지 않는다.
          모바일은 이 순서 그대로 세로로 쌓여 문항 번호 순서(1→29)가 유지된다. */}
      <div className="mt-5 space-y-4">
        <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
          <div>{renderSection('word_reading')}</div>
          <div className="space-y-4">
            {renderSection('sentence_reading')}
            {renderSection(f.writingSection)}
          </div>
        </div>
        {renderSection('checklist')}
      </div>

      <div className="mt-6 flex gap-2.5 pb-2">
        <button onClick={() => router.push(`/survey?p=${pages.length}`)} className="btn-ghost h-[52px] flex-1">
          이전
        </button>
        <button onClick={() => setModal(true)} disabled={uploading > 0} className="btn-primary h-[52px] flex-[2]">
          {uploading > 0 ? '녹음 저장 중…' : '제출'}
        </button>
      </div>
      {uploading > 0 && (
        <p role="status" className="text-center text-xs text-ink-soft">
          방금 녹음 {uploading}개를 저장하고 있어요. 끝나면 제출할 수 있어요.
        </p>
      )}

      <ConfirmDialog open={modal} busy={busy} error={err}
        title={<>녹음이 잘 되었는지<br />모두 확인하셨습니까?</>}
        confirmLabel={missing > 0 ? '그래도 제출하기' : '제출하기'} cancelLabel="돌아가기"
        onConfirm={submit} onClose={() => setModal(false)}>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
          ※ 녹음이 잘 되지 않았을 경우 재검사 요청이 갈 수 있습니다.
        </p>
        {missing > 0 && (
          <p className="mt-3 rounded-xl bg-rec/10 px-3 py-2 text-center text-[13px] font-bold text-rec-deep">
            아직 {missing}개가 완료되지 않았어요.
          </p>
        )}
      </ConfirmDialog>
      <LoadingOverlay show={busy} />
    </main>
  )
}
