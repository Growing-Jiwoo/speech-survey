'use client'
import { useEffect, useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import type { SurveyItem } from '@/lib/items'

const SILENT_PEAK = 0.01

/** 녹음 문항: 타이머(낱말 30초/문장 40초) 카운트다운, 즉시 업로드, 재생 없음(완료 여부만) */
export function RecordingItem({ item, sessionId, attemptCount, onSaved }: {
  item: SurveyItem; sessionId: string; attemptCount: number; onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lowVolume, setLowVolume] = useState(false)
  const [micDenied, setMicDenied] = useState(false)
  const [lastRec, setLastRec] = useState<Recording | null>(null)
  const [remaining, setRemaining] = useState(item.maxSec)

  async function upload(rec: Recording) {
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.set('audio', rec.blob, 'audio')
      fd.set('sessionId', sessionId)
      fd.set('itemCode', item.code)
      fd.set('attemptNo', String(attemptCount + 1))
      fd.set('durationSec', rec.durationSec.toFixed(2))
      const res = await fetch('/api/recordings', { method: 'POST', body: fd })
      if (!res.ok) { setErr('저장에 문제가 생겼어요. 다시 시도해 주세요.'); return }
      setLowVolume(rec.peak < SILENT_PEAK)
      onSaved()
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  function handleComplete(rec: Recording) { setLastRec(rec); void upload(rec) }
  const recorder = useRecorder(item.maxSec, handleComplete)
  const recording = recorder.state === 'recording'

  useEffect(() => {
    if (!recording) { setRemaining(item.maxSec); return }
    const t0 = Date.now()
    const id = setInterval(() =>
      setRemaining(Math.max(0, Math.ceil(item.maxSec - (Date.now() - t0) / 1000))), 200)
    return () => clearInterval(id)
  }, [recording, item.maxSec])

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicDenied(false) } catch { setMicDenied(true) }
  }

  const saved = attemptCount > 0
  const word = item.section === 'word_reading'

  return (
    <>
      <div className="card mt-3 p-5">
        <p className="text-xs font-bold text-blue">
          {word ? '아래 낱말을 소리 내어 읽어 주세요' : '아래 문장을 소리 내어 읽어 주세요'}
        </p>
        <p className={`font-read mt-2 whitespace-pre-line font-medium leading-snug ${
          word ? 'text-center text-[38px]' : 'text-[22px]'}`}>
          {item.text}
        </p>
      </div>

      {micDenied && (
        <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
          마이크를 쓸 수 없어요. 주소창의 자물쇠 아이콘에서 마이크를 <b>허용</b>으로 바꿔 주세요.
        </p>
      )}

      {recording && (
        <div className="mt-4 flex items-center gap-3">
          <span className="blip-antpulse inline-block h-2 w-2 rounded-full bg-rec" />
          <span className="whitespace-nowrap text-[13px] font-bold text-rec-deep">남은 시간 {remaining}초</span>
          <LevelMeter level={recorder.level} />
        </div>
      )}

      {busy && <p className="mt-4 text-sm text-ink-mute">저장하고 있어요…</p>}

      {saved && !recording && !busy && !err && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </span>
          <p className="text-sm text-ink-soft">
            {lowVolume ? '목소리가 잘 안 담긴 것 같아요. 한 번 더 해 볼까요?' : '녹음이 완료됐어요.'}
          </p>
        </div>
      )}

      {err && !busy && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p role="alert" className="text-center text-sm text-ink-soft">{err}</p>
          {lastRec && <button onClick={() => upload(lastRec)} className="cta max-w-60">다시 시도</button>}
        </div>
      )}

      <div className="mt-6 flex flex-col items-center gap-2.5">
        <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop}
          disabled={busy} maxSec={item.maxSec} />
        <p className="text-xs font-bold text-ink-soft">
          {recording ? '다 읽었으면 버튼을 눌러 주세요'
            : saved ? '다시 녹음하려면 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
        </p>
      </div>
    </>
  )
}
