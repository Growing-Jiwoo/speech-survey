// components/survey/RecordingItem.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import type { SurveyItem } from '@/lib/items'

/** 녹음 문항: 타이머(낱말 30초/문장 40초) 카운트다운, 즉시 업로드, 재생 없음(완료 여부만) */
export function RecordingItem({ item, sessionId, attemptCount, onSaved, onRecordingChange, onBusyChange }: {
  item: SurveyItem; sessionId: string; attemptCount: number; onSaved: () => void
  /** 녹음 중 여부를 부모에 알려 [다음] 버튼을 잠근다 */
  onRecordingChange?: (recording: boolean) => void
  /** 업로드 중 여부를 부모에 알려 [다음] 이동을 막는다(업로드 실패 시 재시도 UI 언마운트 방지) */
  onBusyChange?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lowVolume, setLowVolume] = useState(false)
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const [lastRec, setLastRec] = useState<Recording | null>(null)

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
      setLowVolume(rec.peak < MIC_MIN_PEAK)
      onSaved()
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  function handleComplete(rec: Recording) { setLastRec(rec); void upload(rec) }
  const recorder = useRecorder(item.maxSec, handleComplete)
  const recording = recorder.state === 'recording'

  useEffect(() => {
    onRecordingChange?.(recording)
    return () => onRecordingChange?.(false)
  }, [recording, onRecordingChange])

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicErr(null) }
    catch (e) { setMicErr(classifyRecorderError(e)) }
  }

  const saved = attemptCount > 0
  const word = item.section === 'word_reading'

  return (
    <>
      <div className="card mt-3 p-5">
        <p className="text-xs font-bold text-blue">
          {word ? '아래 낱말을 소리 내어 읽어 주세요' : '아래 문장을 소리 내어 읽어 주세요'}
        </p>
        <p className={`font-read mt-2 break-keep font-medium leading-relaxed ${
          word ? 'text-center text-[38px]' : 'whitespace-pre-line text-[22px]'}`}>
          {item.text}
        </p>
      </div>

      {micErr && (
        <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
          {micErr === 'unsupported'
            ? '이 브라우저에서는 녹음을 지원하지 않아요. Safari나 Chrome 최신 버전에서 다시 시도해 주세요.'
            : micErr === 'denied'
              ? <>마이크를 쓸 수 없어요. 브라우저 설정에서 이 사이트의 마이크를 <b>허용</b>으로 바꾼 뒤 다시 시도해 주세요.</>
              : '마이크를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'}
        </p>
      )}

      {saved && !recording && !busy && !err && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </span>
          <p className="text-sm text-ink-soft" aria-live="polite">
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

      <div className="mt-8 flex flex-col items-center gap-5">
        <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop}
          disabled={busy} maxSec={item.maxSec} elapsedMs={recorder.elapsedMs} />
        <p className="text-sm font-bold text-ink-soft">
          {recording ? '다 읽었으면 버튼을 눌러 주세요'
            : saved ? '다시 녹음하려면 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
        </p>
        {recording && (
          <div className="flex flex-col items-center gap-2.5">
            <LevelMeter level={recorder.level} />
            <div className="flex items-center gap-2">
              <span className="blip-antpulse motion-reduce:animate-none inline-block h-2 w-2 rounded-full bg-rec" />
              <span className="text-[13px] font-bold text-rec-deep" aria-live="polite">남은 시간 {recorder.remainingSec}초</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
