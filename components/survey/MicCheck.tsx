// components/survey/MicCheck.tsx
'use client'
import { useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import { Blip } from '@/components/Blip'

const MAX_SEC = 20

export function MicCheck({ onOk }: { onOk: () => void }) {
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const recorder = useRecorder(MAX_SEC, (r: Recording) => setMicOk(r.peak > MIC_MIN_PEAK ? 'ok' : 'quiet'))

  async function start() {
    try { await recorder.start(); setMicErr(null) }
    catch (e) { setMicErr(classifyRecorderError(e)) }
  }

  if (micErr) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h2 className="text-xl font-bold">
        {micErr === 'unsupported' ? '녹음을 지원하지 않는 브라우저예요' : '마이크를 쓸 수 없어요'}
      </h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        {micErr === 'unsupported'
          ? <>Safari나 Chrome 최신 버전에서<br />다시 열어 주세요.</>
          : micErr === 'denied'
            ? <>브라우저 설정에서 이 사이트의 마이크를<br /><b>허용</b>으로 바꾼 뒤 다시 눌러 주세요.</>
            : <>마이크를 시작하지 못했어요.<br />잠시 후 다시 눌러 주세요.</>}
      </p>
      {micErr !== 'unsupported' && <button onClick={start} className="cta mt-2 max-w-60">다시 시도</button>}
    </main>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-14 text-2xl font-bold">마이크 확인</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        버튼을 누르고<br /><b>&ldquo;안녕하세요&rdquo;</b>라고 말해 주세요.
      </p>
      <div className="mt-12">
        <RecordButton state={recorder.state} onStart={start} onStop={recorder.stop}
          maxSec={MAX_SEC} elapsedMs={recorder.elapsedMs} success={micOk === 'ok'} />
      </div>
      <div className="mt-8"><LevelMeter level={recorder.level} /></div>
      {micOk === 'ok' ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-mint" aria-live="polite">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12l5 5L20 6" />
          </svg>
          마이크가 잘 인식됐어요!
        </p>
      ) : micOk === 'quiet' ? (
        <p className="mt-3 text-sm text-ink-soft" aria-live="polite">목소리가 잘 안 들려요. 마이크 가까이에서 다시 한번 해 주세요.</p>
      ) : (
        <p className="mt-3 text-[11px] text-ink-mute">목소리가 들리면 막대가 움직여요.</p>
      )}
      <div className="mt-auto w-full pb-2">
        <button onClick={onOk} disabled={micOk !== 'ok'} className="cta disabled:opacity-40">검사 시작</button>
      </div>
    </main>
  )
}
