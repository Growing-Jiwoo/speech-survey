'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { LevelMeter } from '@/components/LevelMeter'
import { ProgressBar } from '@/components/ProgressBar'
import { RecordButton } from '@/components/RecordButton'

interface Question { id: number; order_no: number; text: string }
interface Survey { sessionId: string; questions: Question[]; name: string }
type Phase = 'mic' | 'question'

export default function SurveyPage() {
  const router = useRouter()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [phase, setPhase] = useState<Phase>('mic')
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [qIdx, setQIdx] = useState(0)
  const [attemptNo, setAttemptNo] = useState(1)
  const [sttText, setSttText] = useState<string | null>(null) // null=시도 전
  const [audioUrl, setAudioUrl] = useState('')
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

  // 언마운트 시 마지막 blob URL 정리(누수 방지). 최신 값은 ref로 추적.
  const audioUrlRef = useRef('')
  audioUrlRef.current = audioUrl
  useEffect(() => () => { if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current) }, [])

  const q = survey?.questions[qIdx]

  // 녹음 완료 blob을 서버로 전송(변환 요청). 최초 녹음과 "다시 시도"(재녹음 없음) 양쪽에서 호출.
  async function sendForTranscription(rec: Recording) {
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
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? '변환에 실패했어요. 다시 시도해 주세요.'); return }
      setSttText(json.sttText)
      setAudioUrl(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(rec.blob) })
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  async function handleComplete(rec: Recording) {
    setLastRec(rec)
    if (phase === 'mic') {
      setMicOk(rec.peak > 0.1 ? 'ok' : 'quiet')
      return
    }
    await sendForTranscription(rec)
  }

  const recorder = useRecorder(20, handleComplete)

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicDenied(false) }
    catch { setMicDenied(true) }
  }

  function resetForQuestion() {
    setSttText(null); setErr(''); setConfirmSkip(false); setLastRec(null)
    setAudioUrl(old => { if (old) URL.revokeObjectURL(old); return '' })
  }

  function retry() { setAttemptNo(n => n + 1); setSttText(null); setErr('') }

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

  // ---------- 마이크 권한 거부 안내 ----------
  if (micDenied) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">🙉</div>
      <h2 className="text-2xl">마이크를 쓸 수 없어요</h2>
      <p className="text-ink/70">브라우저 주소창의 자물쇠(🔒)를 눌러<br />마이크를 <b>허용</b>으로 바꾼 뒤 다시 눌러 주세요.</p>
      <button onClick={startRecording} className="rounded-full bg-peach-deep px-8 py-3 text-lg text-white">다시 시도</button>
    </main>
  )

  // ---------- 마이크 테스트 ----------
  if (phase === 'mic') return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="text-5xl">🎤✨</div>
      <h2 className="text-2xl">마이크 테스트</h2>
      <p className="text-ink/70">버튼을 누르고 <b>&ldquo;Hello!&rdquo;</b> 라고 말한 뒤<br />버튼을 다시 눌러 주세요.</p>
      <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop} />
      <LevelMeter level={recorder.level} />
      {micOk === 'ok' && (
        <>
          <p className="text-mint-700 text-lg">잘 들려요! 🎉</p>
          <button onClick={() => { setPhase('question'); resetForQuestion() }}
            className="rounded-full bg-mint px-10 py-4 text-xl shadow-md active:scale-95">설문 시작 →</button>
        </>
      )}
      {micOk === 'quiet' && <p className="text-berry">소리가 잘 안 들려요. 마이크 가까이에서 다시 한번!</p>}
    </main>
  )

  // ---------- 문항 ----------
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-5 p-6 pt-10">
      <ProgressBar current={qIdx + 1} total={survey.questions.length} />
      <div className="w-full rounded-3xl bg-white p-8 text-center shadow-lg shadow-sky/40">
        <p className="mb-2 text-sm text-ink/50">아래 문장을 읽어 주세요 🗣️</p>
        <p className="font-sans text-2xl leading-relaxed">{q!.text}</p>
      </div>

      <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop} disabled={busy} />
      {recorder.state === 'recording' && <LevelMeter level={recorder.level} />}
      {busy && <p className="animate-pulse text-ink/60">듣고 있어요… ⏳</p>}
      {err && !busy && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-berry">{err}</p>
          {lastRec && (
            <button onClick={() => sendForTranscription(lastRec)}
              className="rounded-full bg-peach-deep px-6 py-3 text-white shadow-md active:scale-95">
              ⚠️ 다시 시도
            </button>
          )}
        </div>
      )}

      {sttText !== null && !busy && (
        <div className="w-full rounded-3xl bg-sky/30 p-5 text-center">
          <p className="mb-1 text-sm text-ink/50">들린 말</p>
          {sttText
            ? <p className="font-sans text-xl">{sttText}</p>
            : <p className="text-berry">잘 안 들렸어요. 다시 한번 말해 볼까요?</p>}
          {audioUrl && <audio controls src={audioUrl} className="mx-auto mt-3 w-full" />}
        </div>
      )}

      <div className="flex items-center gap-3">
        {sttText !== null && !busy && (
          <button onClick={retry} className="rounded-full border-2 border-peach-deep px-6 py-3 text-peach-deep active:scale-95">
            🔁 다시 말하기
          </button>
        )}
        {!!sttText && !busy && (
          <button onClick={next} className="rounded-full bg-peach-deep px-8 py-3 text-white shadow-md active:scale-95">
            다음 →
          </button>
        )}
      </div>

      {!confirmSkip
        ? <button onClick={() => setConfirmSkip(true)} className="mt-2 text-sm text-ink/40 underline">건너뛰기</button>
        : (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span>정말 건너뛸까요?</span>
            <button onClick={skip} className="rounded-full bg-ink/10 px-4 py-1">네</button>
            <button onClick={() => setConfirmSkip(false)} className="rounded-full bg-ink/10 px-4 py-1">아니요</button>
          </div>
        )}
    </main>
  )
}
