// components/survey/ReadingPage.tsx — 낱말/문장 읽기 페이지(페이지 전체 = 1녹음).
// 검사지대로 한 페이지의 문항 전체를 제한 시간 안에 읽는다. 카운트다운 후 녹음이 시작되고,
// 제한 시간(limitSec)에 도달하면 "여기까지예요" 안내가 뜨며 여유 시간(GRACE_SEC) 뒤 자동 종료된다.
// 연습 페이지(page.practice)는 동작이 동일하되 업로드하지 않는다.
'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { maxRecSec, type SurveyPage } from '@/lib/items'
import { micPermissionHint } from '@/lib/platform'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import { Spinner } from '@/components/Spinner'
import { Countdown } from '@/components/survey/Countdown'
import { uploadRecording } from '@/lib/upload'

export function ReadingPage({ page, sessionId, sessionToken, attemptCount, onSaved, onRecordingChange, onUploadFailed }: {
  page: SurveyPage; sessionId: string; sessionToken: string; attemptCount: number; onSaved: () => void
  /** 녹음/카운트다운 중 여부를 부모에 알려 [다음] 버튼을 잠근다 */
  onRecordingChange?: (busy: boolean) => void
  /** 업로드 실패를 부모에 알려 페이지 이동 후에도 재시도할 수 있게 한다 */
  onUploadFailed?: (rec: Recording) => void
}) {
  const [counting, setCounting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lowVolume, setLowVolume] = useState(false)
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const [lastRec, setLastRec] = useState<Recording | null>(null)
  const words = page.section === 'word_reading'
  const hardStopSec = maxRecSec(page)

  async function upload(rec: Recording) {
    setBusy(true); setErr('')
    const ok = await uploadRecording({
      sessionId, sessionToken, itemCode: page.code, attemptNo: attemptCount + 1, rec,
    })
    if (!ok) { setErr('저장에 문제가 생겼어요. 다시 시도해 주세요.'); onUploadFailed?.(rec); setBusy(false); return }
    setLowVolume(rec.peak < MIC_MIN_PEAK)
    setBusy(false)
    onSaved()
  }

  function handleComplete(rec: Recording) {
    setLastRec(rec)
    // 연습 페이지는 서버에 남기지 않는다 — 완료 표시만 하고 버린다.
    if (page.practice) { setLowVolume(rec.peak < MIC_MIN_PEAK); onSaved(); return }
    void upload(rec)
  }

  const recorder = useRecorder(hardStopSec, handleComplete)
  const recording = recorder.state === 'recording'
  // 제한 시간을 넘겨 여유 구간에 들어섰는지 — 채점은 limitSec까지만이므로 아동에게 종료를 알린다.
  const pastLimit = recording && recorder.elapsedMs / 1000 >= page.limitSec

  useEffect(() => {
    onRecordingChange?.(recording || counting)
    return () => onRecordingChange?.(false)
  }, [recording, counting, onRecordingChange])

  const startAfterCountdown = useCallback(async () => {
    setCounting(false)
    try { await recorder.start(); setMicErr(null) }
    catch (e) { setMicErr(classifyRecorderError(e)) }
  }, [recorder])

  function begin() { setErr(''); setMicErr(null); setCounting(true) }

  const saved = attemptCount > 0
  const savedMessage = lowVolume
    ? '목소리가 잘 안 담긴 것 같아요. 한 번 더 해 볼까요?'
    : page.practice ? '잘했어요! 이제 진짜로 해 볼게요.' : '녹음이 완료됐어요.'

  return (
    <>
      <div className="card p-5 lg:p-6">
        <p className="text-xs font-bold text-blue lg:text-sm">
          {page.practice ? '연습이에요. 아래 낱말을 소리 내어 읽어 주세요'
            : words ? '아래 낱말을 모두 소리 내어 읽어 주세요'
              : '아래 문장을 소리 내어 읽어 주세요'}
        </p>
        {/* 낱말 페이지는 검사지처럼 두 줄 격자(4+3)로 배치하고, 문장은 원문 그대로 보인다.
            제시어는 길게 눌러도 선택·iOS 콜아웃이 뜨지 않게 한다(아동 오터치 방지). */}
        {/* 최소 높이는 "낱말 페이지와 문장 페이지의 카드 높이를 비슷하게 맞춰 녹음 버튼이 위아래로
            움직이지 않게" 하는 장치다. 실제로 필요한 높이는 낱말 격자 138px · 가장 긴 문장 85px이라
            lg 220px은 과했고, 그 여유분이 가운데 밴드를 밀어 불필요한 스크롤을 만들었다(176px로 조정). */}
        <div className="flex min-h-[152px] items-center justify-center lg:min-h-[176px]">
          {words ? (
            <div className="grid w-full grid-cols-4 gap-x-2 gap-y-4 lg:gap-y-7">
              {page.items.map(i => (
                <span key={i.code}
                  className="no-select-callout font-read break-keep text-center text-[26px] font-medium leading-tight lg:text-[44px]">
                  {i.text}
                </span>
              ))}
            </div>
          ) : (
            <p className="no-select-callout font-read whitespace-pre-line break-keep text-center text-[22px] font-medium leading-relaxed lg:text-[26px]">
              {page.items[0].text}
            </p>
          )}
        </div>
      </div>

      {/* 항상 마운트된 단일 라이브 리전 — 조건부로 갈아끼우면 스크린리더 낭독이 보장되지 않는다 */}
      <p className="sr-only" aria-live="polite">
        {busy ? '녹음을 저장하고 있어요' : err ? err : saved && !recording ? savedMessage : ''}
      </p>

      <div className="mt-6 flex flex-col items-center gap-5">
        {counting ? (
          <div className="flex min-h-[116px] items-center"><Countdown onDone={startAfterCountdown} /></div>
        ) : (
          <RecordButton state={recorder.state} onStart={begin} onStop={recorder.stop}
            disabled={busy} maxSec={page.limitSec} elapsedMs={recorder.elapsedMs} />
        )}
        <p className="text-sm font-bold text-ink-soft">
          {counting ? '곧 시작해요'
            : recording ? '다 읽었으면 버튼을 눌러 주세요'
              : saved ? '다시 하려면 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
        </p>

        {/* 상태 표시는 버튼 아래 이 고정 높이 슬롯 한 곳에만 나타난다 — 상태가 바뀌어도 버튼이 밀리지 않도록 */}
        <div className="flex min-h-[92px] w-full flex-col items-center justify-start gap-2.5">
          {recording ? (
            <>
              <LevelMeter level={recorder.level} />
              <div className="flex items-center gap-2">
                <span className="blip-antpulse motion-reduce:animate-none inline-block h-2 w-2 rounded-full bg-rec" />
                {pastLimit
                  ? <span className="text-[13px] font-bold text-amber">여기까지예요! 버튼을 눌러 주세요</span>
                  : <span className="text-[13px] font-bold text-ink-soft">읽는 중이에요</span>}
              </div>
            </>
          ) : busy ? (
            <div className="flex items-center gap-2 rounded-[14px] border border-line bg-well px-4 py-3">
              <Spinner className="h-4 w-4 text-blue" />
              <p className="text-sm text-ink-soft">저장 중…</p>
            </div>
          ) : err ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-center text-sm font-bold text-rec-deep">{err}</p>
              {lastRec && <button onClick={() => upload(lastRec)} className="cta max-w-60">다시 시도</button>}
            </div>
          ) : micErr ? (
            <p className="text-center text-sm leading-relaxed text-ink-soft">
              {micErr === 'unsupported'
                ? '이 브라우저에서는 녹음을 지원하지 않아요. Safari나 Chrome 최신 버전에서 다시 시도해 주세요.'
                : micErr === 'denied'
                  ? micPermissionHint(typeof navigator !== 'undefined' ? navigator.userAgent : '')
                  : '마이크를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'}
            </p>
          ) : saved && lowVolume ? (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-amber/40 bg-amber/10 px-4 py-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-amber/20 text-amber">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 7v6" /><path d="M12 17h.01" />
                </svg>
              </span>
              <p className="text-sm font-bold text-amber">{savedMessage}</p>
            </div>
          ) : saved ? (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12l5 5L20 6" />
                </svg>
              </span>
              <p className="text-sm text-ink-soft">{savedMessage}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
