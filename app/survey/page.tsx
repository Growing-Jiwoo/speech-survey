'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CHECKLIST_AREAS, ITEMS, SECTION_LABEL, toggleChecklistArea } from '@/lib/items'
import { loadState, saveState, type SurveyState } from '@/lib/survey-state'
import { ProgressBar } from '@/components/ProgressBar'
import { MicCheck } from '@/components/survey/MicCheck'
import { RecordingItem } from '@/components/survey/RecordingItem'

function SurveyInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [st, setSt] = useState<SurveyState | null>(null)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'mic' | 'item'>('item')
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fromReview = params.get('from') === 'review'

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    setSt(s)
    const q = Number(params.get('q'))
    if (Number.isInteger(q) && q >= 1 && q <= ITEMS.length) {
      setIdx(q - 1); setPhase('item')
    } else {
      setIdx(s.idx ?? 0)
      setPhase(s.phase ?? (s.micDone ? 'item' : 'mic'))
    }
  }, [router, params])

  if (!st) return null

  function patch(p: Partial<SurveyState> | ((prev: SurveyState) => Partial<SurveyState>)) {
    setSt(prev => {
      const merged = { ...prev!, ...(typeof p === 'function' ? p(prev!) : p) }
      saveState(merged)
      return merged
    })
  }

  // 문항 이동 시 현재 위치를 상태에 저장(새로고침·탭 닫힘 후 재개용)
  function goToIdx(n: number) { setIdx(n); patch({ idx: n }); window.scrollTo(0, 0) }

  if (phase === 'mic')
    return <MicCheck onOk={() => { patch({ micDone: true, phase: 'item' }); setPhase('item') }} />

  const item = ITEMS[idx]
  const isLast = idx === ITEMS.length - 1
  // 녹음 쓰기 문항은 예/아니오 필수, 녹음·업로드 중에는 이동 불가
  const canNext = (item.section !== 'word_writing' || st.writing[item.code] !== undefined)
    && !isRecording && !isUploading

  function goNext() {
    if (isLast) { router.push('/review'); return }
    goToIdx(idx + 1)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8">
      <ProgressBar current={idx + 1} total={ITEMS.length} />
      {fromReview && (
        <Link href="/review" className="mt-2 text-xs text-ink-mute underline">← 검토 화면으로 돌아가기</Link>
      )}
      <p className="mt-4 text-xs font-bold text-ink-mute">
        {item.orderNo}. {SECTION_LABEL[item.section]}
      </p>

      {(item.section === 'word_reading' || item.section === 'sentence_reading') && (
        <RecordingItem key={item.code} item={item} sessionId={st.sessionId} sessionToken={st.sessionToken}
          attemptCount={st.recorded[item.code] ?? 0}
          onRecordingChange={setIsRecording} onBusyChange={setIsUploading}
          onSaved={() => patch(prev => ({ recorded: { ...prev.recorded, [item.code]: (prev.recorded[item.code] ?? 0) + 1 } }))} />
      )}

      {item.section === 'word_writing' && (
        <div className="card mt-3 p-5">
          <p className="text-sm font-bold">학생이 아래의 낱말을 정확하게 쓸 수 있나요?</p>
          <p className="font-read mt-5 text-center text-[38px] font-bold">{item.text}</p>
          <div className="mt-6 flex gap-2.5">
            {([['예', true], ['아니오', false]] as const).map(([label, v]) => (
              <button key={label} type="button" aria-pressed={st.writing[item.code] === v}
                onClick={() => patch(prev => ({ writing: { ...prev.writing, [item.code]: v } }))}
                className={`h-[52px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
                  st.writing[item.code] === v ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
                {label}
              </button>
            ))}
          </div>
          {st.writing[item.code] === undefined &&
            <p className="mt-3 text-center text-[11px] text-ink-mute">예 / 아니오를 선택해야 다음으로 갈 수 있어요.</p>}
        </div>
      )}

      {item.section === 'checklist' && (
        <div className="card mt-3 p-5">
          <p className="text-sm font-bold leading-relaxed">
            학생의 발달 영역 중 확인이 필요하다고 생각되는 영역에 모두 표시해 주세요.
          </p>
          <p className="mt-1 text-[11px] text-ink-mute">해당 사항이 없으면 표시하지 않아도 됩니다.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {CHECKLIST_AREAS.map(a => {
              const on = st.checklist.includes(a.code)
              return (
                <li key={a.code}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] px-4 py-3 transition ${
                    on ? 'border-blue bg-blue/5' : 'border-line bg-well'}`}>
                    <input type="checkbox" checked={on} className="mt-0.5 h-5 w-5 accent-[var(--color-blue)]"
                      onChange={() => patch(prev => ({ checklist: toggleChecklistArea(prev.checklist, a.code) }))} />
                    <span>
                      <span className="text-sm font-bold">{a.label}</span>
                      {a.hint && <span className="mt-0.5 block text-xs leading-relaxed text-ink-mute">{a.hint}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mt-auto flex gap-2.5 pb-2 pt-6">
        <button onClick={() => goToIdx(idx - 1)} disabled={idx === 0 || isRecording || isUploading}
          className="h-[52px] flex-1 rounded-xl border-[1.5px] border-line bg-well text-[15px] font-bold text-ink-soft transition disabled:opacity-40">
          이전
        </button>
        <button onClick={goNext} disabled={!canNext}
          className="h-[52px] flex-[2] rounded-xl bg-blue text-[15px] font-bold text-white shadow-[0_3px_0_var(--color-blue-deep)] transition active:translate-y-[2px] disabled:opacity-40">
          {isLast ? '검토' : '다음'}
        </button>
      </div>
    </main>
  )
}

export default function SurveyPage() {
  return <Suspense fallback={null}><SurveyInner /></Suspense>
}
