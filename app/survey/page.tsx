'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { LevelMeter } from '@/components/LevelMeter'
import { ProgressBar } from '@/components/ProgressBar'
import { RecordButton } from '@/components/RecordButton'
import { Blip } from '@/components/Blip'

interface Question { id: number; order_no: number; text: string }
interface Survey { sessionId: string; questions: Question[]; name: string }
type Phase = 'mic' | 'question'

const MAX_SEC = 20
const SILENT_PEAK = 0.01
const MIC_OK_PEAK = 0.1

export default function SurveyPage() {
  const router = useRouter()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [phase, setPhase] = useState<Phase>('mic')
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [qIdx, setQIdx] = useState(0)
  const [attemptNo, setAttemptNo] = useState(1)
  const [saved, setSaved] = useState(false)
  const [lowVolume, setLowVolume] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [micDenied, setMicDenied] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [lastRec, setLastRec] = useState<Recording | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('survey')
    if (!raw) { router.replace('/'); return }
    setSurvey(JSON.parse(raw))
  }, [router])

  const q = survey?.questions[qIdx]

  async function upload(rec: Recording) {
    if (!survey || !q) return
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.set('audio', rec.blob, 'audio')
      fd.set('sessionId', survey.sessionId)
      fd.set('questionId', String(q.id))
      fd.set('orderNo', String(q.order_no))
      fd.set('attemptNo', String(attemptNo))
      fd.set('durationSec', rec.durationSec.toFixed(2))
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      if (!res.ok) { setErr('저장에 문제가 생겼어요. 다시 시도해 주세요.'); return }
      setSaved(true)
      setLowVolume(rec.peak < SILENT_PEAK)
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  async function handleComplete(rec: Recording) {
    setLastRec(rec)
    if (phase === 'mic') { setMicOk(rec.peak > MIC_OK_PEAK ? 'ok' : 'quiet'); return }
    await upload(rec)
  }

  const recorder = useRecorder(MAX_SEC, handleComplete)

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicDenied(false) }
    catch { setMicDenied(true) }
  }

  function retryRecord() {
    setAttemptNo(n => n + 1)
    setSaved(false); setLowVolume(false)
    void startRecording()
  }

  function resetForQuestion() {
    setSaved(false); setLowVolume(false); setErr(''); setConfirmSkip(false); setLastRec(null)
  }

  async function next() {
    if (!survey) return
    if (qIdx + 1 >= survey.questions.length) {
      await fetch('/api/sessions/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: survey.sessionId }),
      })
      sessionStorage.removeItem('survey')
      router.push('/done')
      return
    }
    setQIdx(i => i + 1); setAttemptNo(1); resetForQuestion()
  }

  async function skip() {
    if (!survey || !q) return
    await fetch('/api/responses/skip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: survey.sessionId, questionId: q.id }),
    })
    await next()
  }

  if (!survey) return null

  if (micDenied) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h2 className="text-xl font-bold">마이크를 쓸 수 없어요</h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        브라우저 주소창의 자물쇠 아이콘을 눌러<br />마이크를 <b>허용</b>으로 바꾼 뒤 다시 눌러 주세요.
      </p>
      <button onClick={startRecording} className="cta mt-2 max-w-60">다시 시도</button>
    </main>
  )

  if (phase === 'mic') return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">말하기 설문</span>
      </div>
      <h1 className="mt-14 text-2xl font-bold">마이크 확인</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        버튼을 누르고<br /><b>&ldquo;안녕하세요&rdquo;</b>라고 말해 주세요.
      </p>
      <div className="mt-9">
        <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop} maxSec={MAX_SEC} />
      </div>
      <div className="mt-6"><LevelMeter level={recorder.level} /></div>
      <p className="mt-2 text-[11px] text-ink-mute">목소리가 들리면 막대가 움직여요.</p>
      {micOk === 'quiet' && (
        <p className="mt-3 text-sm text-ink-soft">목소리가 잘 안 들려요. 마이크 가까이에서 다시 한번 해 주세요.</p>
      )}
      <div className="mt-auto w-full pb-2">
        {micOk === 'ok' && (
          <button onClick={() => { setPhase('question'); resetForQuestion() }} className="cta">설문 시작</button>
        )}
      </div>
    </main>
  )

  const recording = recorder.state === 'recording'
  const showRecordButton = recording || (!saved && !busy)
  const canSkip = !recording && !busy && !saved
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8">
      <ProgressBar current={qIdx + 1} total={survey.questions.length} />
      <div className="card mt-5 p-5">
        <p className="text-xs font-bold text-blue">아래 문장을 소리 내어 읽어 주세요</p>
        <p className="font-read mt-2 text-[22px] font-medium leading-snug">{q!.text}</p>
      </div>

      {recording && (
        <div className="mt-4 flex items-center gap-3">
          <Blip variant="recording" className="h-[50px] w-[53px]" />
          <span className="blip-antpulse inline-block h-2 w-2 rounded-full bg-rec" />
          <span className="text-[13px] font-bold text-rec-deep">녹음 중</span>
          <LevelMeter level={recorder.level} />
        </div>
      )}

      {busy && <p className="mt-4 text-sm text-ink-mute">저장하고 있어요…</p>}

      {saved && !recording && !busy && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </span>
          <p className="text-sm text-ink-soft">
            {lowVolume ? '목소리가 잘 안 담긴 것 같아요. 한 번 더 말해 볼까요?' : '목소리가 잘 담겼어요.'}
          </p>
        </div>
      )}

      {err && !busy && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p role="alert" className="text-center text-sm text-ink-soft">{err}</p>
          {lastRec && <button onClick={() => upload(lastRec)} className="cta max-w-60">다시 시도</button>}
        </div>
      )}

      <div className="mt-auto flex flex-col items-center gap-2.5 pb-2 pt-6">
        {showRecordButton && (
          <>
            <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop}
              disabled={busy} maxSec={MAX_SEC} />
            <p className="text-xs font-bold text-ink-soft">
              {recording ? '다 읽었으면 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
            </p>
          </>
        )}
        {saved && !recording && !busy && (
          <>
            <button onClick={next} className="cta">다음 문장</button>
            <button onClick={retryRecord} className="text-[13px] text-ink-mute underline">다시 녹음하기</button>
          </>
        )}
        {canSkip && (confirmSkip ? (
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span>정말 건너뛸까요?</span>
            <button onClick={skip} className="rounded-full bg-ink/10 px-4 py-1">네</button>
            <button onClick={() => setConfirmSkip(false)} className="rounded-full bg-ink/10 px-4 py-1">아니요</button>
          </div>
        ) : (
          <button onClick={() => setConfirmSkip(true)} className="mt-1 text-xs text-ink-mute underline">
            이 문장 건너뛰기
          </button>
        ))}
      </div>
    </main>
  )
}
