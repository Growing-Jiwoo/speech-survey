'use client'
import { useRef, useState } from 'react'

export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [prog, setProg] = useState(0)

  function toggle() {
    const a = ref.current
    if (!a) return
    if (playing) a.pause()
    else void a.play()
  }

  return (
    <div className="flex w-44 items-center gap-2">
      <button onClick={toggle} aria-label={playing ? '일시정지' : '재생'}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-white">
        {playing ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="h-1.5 flex-1 rounded-full bg-line">
        <div className="h-full rounded-full bg-blue" style={{ width: `${prog * 100}%` }} />
      </div>
      <audio ref={ref} src={src} preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProg(0) }}
        onTimeUpdate={e => { const a = e.currentTarget; if (a.duration) setProg(a.currentTime / a.duration) }} />
    </div>
  )
}
