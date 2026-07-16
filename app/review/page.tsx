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
import { ITEMS, SECTION_LABEL, areaLabel, isRecordingItem, type Section } from '@/lib/items'
import { clearState, loadState, type SurveyState } from '@/lib/survey-state'

const SECTIONS: Section[] = ['word_reading', 'sentence_reading', 'word_writing', 'checklist']

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

  // 미완료 판정: 녹음 문항은 저장된 시도 0회, 낱말쓰기는 예/아니오 미선택.
  // (체크리스트는 설문 화면에서 최소 1개 선택을 강제하므로 여기서는 세지 않는다)
  const missing = ITEMS.filter(i =>
    (isRecordingItem(i) && !(st.recorded[i.code] > 0)) ||
    (i.section === 'word_writing' && st.writing[i.code] === undefined)).length

  async function submit() {
    if (!st) return
    setBusy(true); setErr('')
    const r = await postJson('/api/sessions/submit', {
      sessionId: st.sessionId, sessionToken: st.sessionToken, writing: st.writing, checklist: st.checklist,
    }, '제출에 문제가 생겼어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    clearState()
    router.push('/done')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">검사 검토</span>
      </div>
      <h1 className="mt-6 text-xl font-bold">문항별 완료 여부를 확인해 주세요</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        문항 번호를 누르면 해당 문항으로 이동해요.
        {missing > 0 && <> 아직 <b className="text-rec-deep">{missing}개</b> 문항이 완료되지 않았어요.</>}
      </p>

      {SECTIONS.map(section => (
        <section key={section} className="card mt-4 p-4">
          <h2 className="text-[13px] font-bold text-ink-soft">{SECTION_LABEL[section]}</h2>
          <ul className="mt-2 flex flex-col">
            {ITEMS.filter(i => i.section === section).map(i => {
              let pill: React.ReactNode
              if (isRecordingItem(i)) {
                const done = (st!.recorded[i.code] ?? 0) > 0
                pill = <StatusPill done={done} label={done ? '녹음 완료' : '미녹음'} />
              } else if (i.section === 'word_writing') {
                const v = st!.writing[i.code]
                pill = <StatusPill done={v !== undefined} label={v === true ? '예' : v === false ? '아니오' : '미선택'} />
              } else {
                pill = (
                  <span className="text-right text-xs text-ink-soft">
                    {st!.checklist.length > 0 ? st!.checklist.map(areaLabel).join(', ') : '선택 없음'}
                  </span>
                )
              }
              return (
                <li key={i.code} className="flex items-center justify-between gap-3 border-t border-line/60 py-2.5 first:border-t-0">
                  {/* ?q=<orderNo>&from=review — 설문 화면이 해당 문항으로 열리고 "검토로 돌아가기" 링크를 보여준다 */}
                  <Link href={`/survey?q=${i.orderNo}&from=review`} className="flex min-w-0 items-center gap-2.5">
                    <span className="w-7 flex-none text-sm font-bold text-blue underline">{i.orderNo}</span>
                    <span className="font-read truncate text-sm">{i.text || '검사자 체크리스트'}</span>
                  </Link>
                  {pill}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <div className="mt-6 flex gap-2.5 pb-2">
        <button onClick={() => router.push(`/survey?q=${ITEMS.length}`)} className="btn-ghost h-[52px] flex-1">
          이전
        </button>
        <button onClick={() => setModal(true)} className="btn-primary h-[52px] flex-[2]">
          제출
        </button>
      </div>

      <ConfirmDialog open={modal} busy={busy} error={err}
        title={<>녹음이 잘 되었는지<br />모두 확인하셨습니까?</>}
        confirmLabel="네" cancelLabel="아니오"
        onConfirm={submit} onClose={() => setModal(false)}>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
          ※ 녹음이 잘 되지 않았을 경우 재검사 요청이 갈 수 있습니다.
        </p>
        {missing > 0 && (
          <p className="mt-3 rounded-xl bg-rec/10 px-3 py-2 text-center text-[13px] font-bold text-rec-deep">
            아직 {missing}개 문항이 완료되지 않았어요.
          </p>
        )}
      </ConfirmDialog>
      <LoadingOverlay show={busy} />
    </main>
  )
}
