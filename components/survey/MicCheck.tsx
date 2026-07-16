// components/survey/MicCheck.tsx
'use client'
import { useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { CHILD_NOTICE } from '@/lib/consent'
import { micPermissionHint } from '@/lib/platform'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import { Blip } from '@/components/Blip'

const MAX_SEC = 20

export function MicCheck({ onOk }: { onOk: () => void }) {
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const recorder = useRecorder(MAX_SEC, (r: Recording) => setMicOk(r.peak > MIC_MIN_PEAK ? 'ok' : 'quiet'))

  async function start() {
    setMicOk('none') // 자리 이동·기기 변경 후 재확인 허용(성공 뒤에도 다시 눌러 확인 가능)
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
            ? micPermissionHint(typeof navigator !== 'undefined' ? navigator.userAgent : '')
            : <>마이크를 시작하지 못했어요.<br />잠시 후 다시 눌러 주세요.</>}
      </p>
      {micErr !== 'unsupported' && <button onClick={start} className="cta mt-2 max-w-60">다시 시도</button>}
    </main>
  )

  return (
    // lg+: 검사 화면과 같은 무대 원칙 — 넓힌 컨테이너에 수직 중앙 정렬(흐름·버튼은 동일).
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10 lg:max-w-2xl lg:justify-center lg:pt-6">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-14 text-2xl font-bold lg:mt-10 lg:text-3xl">마이크 확인</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        버튼을 누르고<br /><b>&ldquo;안녕하세요&rdquo;</b>라고 말해 주세요.
      </p>
      <div className="mt-12">
        <RecordButton state={recorder.state} onStart={start} onStop={recorder.stop}
          maxSec={MAX_SEC} elapsedMs={recorder.elapsedMs} success={micOk === 'ok'} />
      </div>
      <div className="mt-8"><LevelMeter level={recorder.level} /></div>
      {/* 항상 마운트된 단일 라이브 리전 — 조건부로 갈아끼우면 스크린리더 낭독이 보장되지 않는다 */}
      <p aria-live="polite" className={`mt-3 ${
        micOk === 'ok' ? 'flex items-center gap-1.5 text-sm font-bold text-mint'
          : micOk === 'quiet' ? 'text-sm text-ink-soft' : 'text-[11px] text-ink-mute'}`}>
        {micOk === 'ok' ? (
          <>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l5 5L20 6" />
            </svg>
            마이크가 잘 인식됐어요!
          </>
        ) : micOk === 'quiet'
          ? '목소리가 잘 안 들려요. 마이크 가까이에서 다시 한번 해 주세요.'
          : '목소리가 들리면 막대가 움직여요.'}
      </p>
      <div className="mt-auto w-full pb-2 lg:mt-10 lg:max-w-md lg:pb-0">
        {/* 아동용 쉬운 고지(개인정보보호법 제22조의2 제3항) — 검사(녹음) 시작 직전에 보여준다 */}
        <p className="mb-3 text-center text-xs leading-relaxed text-ink-mute">{CHILD_NOTICE}</p>
        <button onClick={onOk} disabled={micOk !== 'ok'} className="cta disabled:opacity-40">검사 시작</button>
      </div>
    </main>
  )
}
