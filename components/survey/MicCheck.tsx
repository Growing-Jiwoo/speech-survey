'use client'
import { useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import { Blip } from '@/components/Blip'

const MAX_SEC = 20
const MIC_OK_PEAK = 0.1

export function MicCheck({ onOk }: { onOk: () => void }) {
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [micDenied, setMicDenied] = useState(false)
  const recorder = useRecorder(MAX_SEC, (r: Recording) => setMicOk(r.peak > MIC_OK_PEAK ? 'ok' : 'quiet'))

  async function start() {
    try { await recorder.start(); setMicDenied(false) } catch { setMicDenied(true) }
  }

  if (micDenied) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h2 className="text-xl font-bold">마이크를 쓸 수 없어요</h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        브라우저 주소창의 자물쇠 아이콘을 눌러<br />마이크를 <b>허용</b>으로 바꾼 뒤 다시 눌러 주세요.
      </p>
      <button onClick={start} className="cta mt-2 max-w-60">다시 시도</button>
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
      <div className="mt-9">
        <RecordButton state={recorder.state} onStart={start} onStop={recorder.stop} maxSec={MAX_SEC} />
      </div>
      <div className="mt-6"><LevelMeter level={recorder.level} /></div>
      <p className="mt-2 text-[11px] text-ink-mute">목소리가 들리면 막대가 움직여요.</p>
      {micOk === 'quiet' && (
        <p className="mt-3 text-sm text-ink-soft">목소리가 잘 안 들려요. 마이크 가까이에서 다시 한번 해 주세요.</p>
      )}
      <div className="mt-auto w-full pb-2">
        {micOk === 'ok' && <button onClick={onOk} className="cta">검사 시작</button>}
      </div>
    </main>
  )
}
