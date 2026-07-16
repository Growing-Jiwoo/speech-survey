// components/AudioPlayer.tsx — 채점용 오디오 플레이어(wavesurfer.js v7).
// 파형 클릭/드래그 시크 · 배속(0.5~1.5×) · 키보드(Space/←/→) · 동시재생 1개 · onError 복구.
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useAudioBus } from '@/components/AudioBus'
import { Select } from '@/components/Select'

const RATES = [0.5, 0.75, 1, 1.25, 1.5] as const
const RATE_OPTIONS = RATES.map(r => ({ value: String(r), label: `${r}×` }))

/** canvas fillStyle은 CSS var()를 해석하지 못하므로, globals.css 변수를 실제 값으로 읽어 온다. */
function cssVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioPlayer({ src, onError }: { src: string; onError?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  // 최신 콜백 유지(latest-ref). 렌더 중 ref 쓰기는 금지라 커밋 후 effect에서 갱신한다.
  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError })
  const bus = useAudioBus()

  const [visible, setVisible] = useState(false)   // 화면 진입 전에는 인스턴스 미생성(지연 로드)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)

  // 1) 화면에 들어온 행만 wavesurfer 인스턴스를 만든다(결과지당 최대 ~26개 동시 생성 방지).
  useEffect(() => {
    const el = rootRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  // 2) visible + src 확정 시 인스턴스 생성/정리.
  useEffect(() => {
    if (!visible || !waveRef.current) return
    const ws = WaveSurfer.create({
      container: waveRef.current,
      url: src,
      height: 32,
      waveColor: cssVar('--color-line') || '#E3E8F3',
      progressColor: cssVar('--color-blue') || '#2F6BFF',
      cursorColor: cssVar('--color-blue-deep') || '#1E4FCC',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      dragToSeek: true, // v7 기본값은 false — 드래그 시크 요건 충족을 위해 명시적으로 켠다.
    })
    wsRef.current = ws
    const stop = () => { ws.pause() }
    ws.on('ready', (duration: number) => { setReady(true); setDur(duration); ws.setPlaybackRate(rate) })
    ws.on('play', () => { setPlaying(true); bus.play(stop) })
    ws.on('pause', () => { setPlaying(false); bus.clear(stop) })
    ws.on('finish', () => { setPlaying(false); bus.clear(stop) })
    ws.on('timeupdate', (t: number) => setCur(t))
    ws.on('error', () => { onErrorRef.current?.() })
    return () => {
      bus.clear(stop)
      ws.destroy()
      wsRef.current = null
      setReady(false); setPlaying(false); setCur(0); setDur(0)
    }
    // rate는 ready 이후 setPlaybackRate로만 반영(재생성 방지) → 의존성 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, src, bus])

  const toggle = useCallback(() => { void wsRef.current?.playPause() }, [])
  const changeRate = useCallback((v: string) => {
    const next = Number(v)
    setRate(next)
    wsRef.current?.setPlaybackRate(next)
  }, [])

  // 3) 플레이어 포커스 시 키보드: Space 재생/정지, ←/→ 5초 이동.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); void wsRef.current?.playPause() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); wsRef.current?.skip(-5) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); wsRef.current?.skip(5) }
  }, [])

  return (
    <div ref={rootRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="녹음 재생기"
      className="flex w-full max-w-[280px] items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue/40">
      <button type="button" onClick={toggle} disabled={!ready} aria-label={playing ? '일시정지' : '재생'}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-white disabled:opacity-40">
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
      <div ref={waveRef} className="h-8 min-w-0 flex-1" aria-hidden="true" />
      <span className="flex-none font-read text-[11px] tabular-nums text-ink-mute">{fmt(cur)}/{fmt(dur)}</span>
      <Select value={String(rate)} options={RATE_OPTIONS} placeholder="배속" onChange={changeRate}
        ariaLabel="재생 속도" disabled={!ready} size="sm" className="w-[84px] flex-none" />
    </div>
  )
}
