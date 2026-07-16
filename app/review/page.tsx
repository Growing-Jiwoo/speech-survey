'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { ITEMS, SECTION_LABEL, areaLabel, type Section } from '@/lib/items'
import { clearState, loadState, type SurveyState } from '@/lib/survey-state'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const SECTIONS: Section[] = ['word_reading', 'sentence_reading', 'word_writing', 'checklist']

function StatusPill({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
      done ? 'bg-blue/10 text-blue' : 'bg-rec/10 text-rec-deep'}`}>
      {label}
    </span>
  )
}

export default function ReviewPage() {
  const router = useRouter()
  const [st, setSt] = useState<SurveyState | null>(null)
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const closeModal = useCallback(() => { if (!busy) setModal(false) }, [busy])
  const trapRef = useFocusTrap(modal, closeModal)

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    setSt(s)
  }, [router])

  if (!st) return null

  const missing = ITEMS.filter(i =>
    (i.maxSec > 0 && !(st.recorded[i.code] > 0)) ||
    (i.section === 'word_writing' && st.writing[i.code] === undefined)).length

  async function submit() {
    if (!st) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/sessions/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: st.sessionId, sessionToken: st.sessionToken, writing: st.writing, checklist: st.checklist }),
      })
      if (!res.ok) { setErr('제출에 문제가 생겼어요. 다시 시도해 주세요.'); return }
      clearState()
      router.push('/done')
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
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
              if (i.maxSec > 0) {
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
        <button onClick={() => router.push(`/survey?q=${ITEMS.length}`)}
          className="h-[52px] flex-1 rounded-xl border-[1.5px] border-line bg-well text-[15px] font-bold text-ink-soft">
          이전
        </button>
        <button onClick={() => setModal(true)}
          className="h-[52px] flex-[2] rounded-xl bg-blue text-[15px] font-bold text-white shadow-[0_3px_0_var(--color-blue-deep)] transition active:translate-y-[2px]">
          제출
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6"
          onClick={closeModal}>
          <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-[20px] bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 id="confirm-title" className="text-center text-lg font-bold leading-relaxed">
              녹음이 잘 되었는지<br />모두 확인하셨습니까?
            </h2>
            <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
              ※ 녹음이 잘 되지 않았을 경우 재검사 요청이 갈 수 있습니다.
            </p>
            {missing > 0 && (
              <p className="mt-3 rounded-xl bg-rec/10 px-3 py-2 text-center text-[13px] font-bold text-rec-deep">
                아직 {missing}개 문항이 완료되지 않았어요.
              </p>
            )}
            {err && <p role="alert" className="mt-3 text-center text-sm text-rec-deep">{err}</p>}
            <div className="mt-5 flex gap-2.5">
              <button onClick={() => setModal(false)} disabled={busy}
                className="h-[50px] flex-1 rounded-xl border-[1.5px] border-line bg-well text-[15px] font-bold text-ink-soft disabled:opacity-40">
                아니오
              </button>
              <button onClick={submit} disabled={busy}
                className="h-[50px] flex-1 rounded-xl bg-blue text-[15px] font-bold text-white disabled:opacity-40">
                네
              </button>
            </div>
          </div>
        </div>
      )}
      <LoadingOverlay show={busy} />
    </main>
  )
}
