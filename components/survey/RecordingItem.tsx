// components/survey/RecordingItem.tsx — 녹음 문항(낱말 30초/문장 40초).
// 녹음 종료 즉시 업로드하며(재생 없음 — 완료 여부만 추적), 실패 시 부모의 RetryBanner로 위임한다.
'use client'
import { useEffect, useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { micPermissionHint } from '@/lib/platform'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import { Spinner } from '@/components/Spinner'
import { uploadRecording } from '@/lib/upload'
import type { SurveyItem } from '@/lib/items'

// 남은 시간 텍스트를 노출하기 시작하는 임계(초) — 이 전까지는 시간 압박 신호를 숨긴다.
const COUNTDOWN_WARN_SEC = 10

export function RecordingItem({ item, sessionId, sessionToken, attemptCount, onSaved, onRecordingChange, onUploadFailed }: {
  item: SurveyItem; sessionId: string; sessionToken: string; attemptCount: number; onSaved: () => void
  /** 녹음 중 여부를 부모에 알려 [다음] 버튼을 잠근다 */
  onRecordingChange?: (recording: boolean) => void
  /** 업로드 실패를 부모에 알려 문항 이동 후에도 재시도할 수 있게 한다(실패한 녹음이 조용히 사라지지 않도록) */
  onUploadFailed?: (rec: Recording) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lowVolume, setLowVolume] = useState(false)
  const [autoStopped, setAutoStopped] = useState(false)
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const [lastRec, setLastRec] = useState<Recording | null>(null)

  async function upload(rec: Recording) {
    setBusy(true); setErr('')
    const ok = await uploadRecording({ sessionId, sessionToken, itemCode: item.code, attemptNo: attemptCount + 1, rec })
    if (!ok) { setErr('저장에 문제가 생겼어요. 다시 시도해 주세요.'); onUploadFailed?.(rec); setBusy(false); return }
    setLowVolume(rec.peak < MIC_MIN_PEAK)
    // 제한 시간에 걸려 자동 종료된 녹음이면 완료 문구를 다르게 안내한다(아동이 끊긴 이유를 알도록)
    setAutoStopped(rec.durationSec >= item.maxSec - 0.5)
    setBusy(false)
    onSaved()
  }

  function handleComplete(rec: Recording) { setLastRec(rec); void upload(rec) }
  const recorder = useRecorder(item.maxSec, handleComplete)
  const recording = recorder.state === 'recording'

  useEffect(() => {
    onRecordingChange?.(recording)
    return () => onRecordingChange?.(false)
  }, [recording, onRecordingChange])

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicErr(null) }
    catch (e) { setMicErr(classifyRecorderError(e)) }
  }

  const saved = attemptCount > 0
  const word = item.section === 'word_reading'
  const savedMessage = lowVolume
    ? '목소리가 잘 안 담긴 것 같아요. 한 번 더 해 볼까요?'
    : autoStopped
      ? '시간이 다 되어 자동으로 저장했어요.'
      : '녹음이 완료됐어요.'

  return (
    <>
      <div className="card mt-3 p-5">
        <p className="text-xs font-bold text-blue">
          {word ? '아래 낱말을 소리 내어 읽어 주세요' : '아래 문장을 소리 내어 읽어 주세요'}
        </p>
        {/* 제시어는 길게 눌러도 선택·iOS 콜아웃이 뜨지 않게 한다(아동 오터치로 검사 흐름 방해 방지) */}
        <p className={`no-select-callout font-read mt-2 break-keep font-medium leading-relaxed ${
          word ? 'text-center text-[38px]' : 'whitespace-pre-line text-[22px]'}`}>
          {item.text}
        </p>
      </div>

      {micErr && (
        <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
          {micErr === 'unsupported'
            ? '이 브라우저에서는 녹음을 지원하지 않아요. Safari나 Chrome 최신 버전에서 다시 시도해 주세요.'
            : micErr === 'denied'
              ? micPermissionHint(typeof navigator !== 'undefined' ? navigator.userAgent : '')
              : '마이크를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'}
        </p>
      )}

      {/* 저장 상태 안내 스크린리더용 라이브 리전 — 조건부 마운트되는 요소의 aria-live는
          낭독이 보장되지 않으므로, 항상 존재하는 요소 하나에 텍스트만 바꿔 넣는다. */}
      <p className="sr-only" aria-live="polite">
        {busy ? '녹음을 저장하고 있어요' : err ? err : saved && !recording ? savedMessage : ''}
      </p>

      {busy && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-[14px] border border-line bg-well px-4 py-3">
          <Spinner className="h-4 w-4 text-blue" />
          <p className="text-sm text-ink-soft">저장 중…</p>
        </div>
      )}

      {saved && !recording && !busy && !err && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </span>
          <p className="text-sm text-ink-soft">{savedMessage}</p>
        </div>
      )}

      {err && !busy && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-center text-sm font-bold text-rec-deep">{err}</p>
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
              {/* 아동 시간 압박 완화: 남은 시간이 충분할 때는 "녹음 중"만 보이고(진행 링·레벨미터가
                  녹음 상태를 알려줌), 종료 임박(≤10초)에만 중립색으로 남은 시간을 부드럽게 알린다.
                  매초 바뀌는 값에는 aria-live를 붙이지 않는다(스크린리더 낭독 스팸 방지). */}
              {recorder.remainingSec <= COUNTDOWN_WARN_SEC
                ? <span className="text-[13px] font-bold tabular-nums text-ink-soft">곧 끝나요 · {recorder.remainingSec}초</span>
                : <span className="text-[13px] font-bold text-ink-soft">녹음 중이에요</span>}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
