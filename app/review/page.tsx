// app/review/page.tsx — 제출 전 검토 화면.
// 문항별 완료 여부를 한눈에 보여주고(미완료 강조), 번호 클릭 시 해당 문항으로 되돌아가
// 고칠 수 있게 한다. 미완료가 있어도 제출은 막지 않는다(현장에서 건너뛴 문항이 있을 수
// 있으므로 검사자 판단에 맡기고, 확인 모달에서 한 번 더 경고만 한다).
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/Badge'
import { Blip } from '@/components/Blip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { postJson } from '@/lib/http'
import { SECTION_LABEL, isRecordingPage, areaLabel, type Section } from '@/lib/items'
import { visiblePages } from '@/lib/survey-flow'
import { clearState, loadState, type SurveyState } from '@/lib/survey-state'

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

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    // 서버 프리렌더와 첫 페인트를 일치시키기 위해(하이드레이션 불일치 방지) localStorage는
    // 마운트 후 1회 읽어 복원한다 — 이 setState는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(s)
  }, [router])

  if (!st) return null
  const state = st

  // 미완료 판정: 녹음 페이지는 저장된 시도 0회, 낱말쓰기는 예/아니오 미선택.
  // (체크리스트는 진행 화면에서 최소 1개 선택을 강제하므로 여기서는 세지 않는다)
  // 연습 페이지는 서버에 남기지 않으므로 완료 판정에서 제외한다.
  const pages = visiblePages(state)
  const missingPages = pages.filter(p => isRecordingPage(p) && !p.practice && !(state.recorded[p.code] > 0)).length
  const missingWriting = pages
    .filter(p => p.section === 'word_writing')
    .flatMap(p => p.items)
    .filter(i => state.writing[i.code] === undefined).length
  const missing = missingPages + missingWriting

  /** 섹션 하나를 카드로 렌더 — 얇은 구분선 행 + 작은 상태 배지의 차분한 목록. */
  function renderSection(section: Section) {
    const rows = pages.filter(p => p.section === section)
    if (rows.length === 0) return null   // 중단 규칙으로 미실시된 섹션
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
              const done = (state.recorded[p.code] ?? 0) > 0
              pill = <StatusPill done={done} label={done ? '녹음 완료' : '미녹음'} />
            } else if (p.code === 'p_rw_meaning_mark') {
              const done = p.items.every(i => state.marks[i.code] !== undefined)
              pill = <StatusPill done={done} label={done ? '표시 완료' : '표시 안 함'} />
            } else if (p.section === 'word_writing') {
              const done = p.items.filter(i => state.writing[i.code] !== undefined).length
              pill = <StatusPill done={done === p.items.length} label={`${done} / ${p.items.length}`} />
            } else {
              pill = (
                <span className="text-right text-xs text-ink-soft">
                  {state.checklist.length > 0 ? state.checklist.map(areaLabel).join(', ') : '선택 없음'}
                </span>
              )
            }
            // ?p=<순번>&from=review — 진행 화면이 해당 페이지로 열리고 "검토로 돌아가기" 링크를 보여준다
            const label = p.section === 'checklist' ? '검사자 체크리스트'
              : p.code === 'p_rw_meaning_mark' ? '검사자 확인 (의미 낱말 채점)'
                : p.items.map(i => i.text).join(' · ')
            return (
              <li key={p.code} className="flex items-center justify-between gap-3 border-t border-line/60 py-2.5 first:border-t-0">
                <Link href={`/survey?p=${no}&from=review`} className="flex min-w-0 items-center gap-2.5">
                  <span className="w-6 flex-none text-sm font-bold text-blue">{no}</span>
                  <span className="font-read truncate text-sm">{label}</span>
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
    if (!st) return
    setBusy(true); setErr('')
    const r = await postJson('/api/sessions/submit', {
      sessionId: st.sessionId, sessionToken: st.sessionToken,
      writing: st.writing, checklist: st.checklist, marks: st.marks,
    }, '제출에 문제가 생겼어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    clearState()
    router.push('/done')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8 lg:max-w-4xl">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">검사 검토</span>
      </div>
      <h1 className="mt-6 text-xl font-bold">단계별 완료 여부를 확인해 주세요</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        단계 번호를 누르면 해당 화면으로 이동해요.
        {missing > 0 && <> 아직 <b className="text-rec-deep">{missing}개</b>가 완료되지 않았어요.</>}
      </p>

      {/* 데스크톱(lg+): 2열로 좌우 높이를 맞춘다. 좌=낱말 해독(14문항), 우=문장(4)+낱말 쓰기(10).
          검사자 체크리스트(1문항)는 아래 전폭 밴드로 빼 좌우 불균형을 만들지 않는다.
          모바일은 이 순서 그대로 세로로 쌓여 문항 번호 순서(1→29)가 유지된다. */}
      <div className="mt-5 space-y-4">
        <div className="space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
          <div>{renderSection('word_reading')}</div>
          <div className="space-y-4">
            {renderSection('sentence_reading')}
            {renderSection('word_writing')}
          </div>
        </div>
        {renderSection('checklist')}
      </div>

      <div className="mt-6 flex gap-2.5 pb-2">
        <button onClick={() => router.push(`/survey?p=${pages.length}`)} className="btn-ghost h-[52px] flex-1">
          이전
        </button>
        <button onClick={() => setModal(true)} className="btn-primary h-[52px] flex-[2]">
          제출
        </button>
      </div>

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
