'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface Recording { blob: Blob; durationSec: number; mime: string; peak: number }
export type RecState = 'idle' | 'recording'

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return ''
}

/** maxSec 도달 시 자동 종료. 완료 시 onComplete 호출(수동/자동 공통 경로). */
export function useRecorder(maxSec: number, onComplete: (r: Recording) => void) {
  const [state, setState] = useState<RecState>('idle')
  const [level, setLevel] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const peakRef = useRef(0)
  const startedRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cleanupRef = useRef<() => void>(() => {})
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const stop = useCallback(() => {
    clearTimeout(timerRef.current)
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }, [])

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }) // 거부 시 throw → 호출부 처리
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let p = 0
      for (const v of buf) p = Math.max(p, Math.abs(v - 128) / 128)
      peakRef.current = Math.max(peakRef.current, p)
      setLevel(p)
      raf = requestAnimationFrame(tick)
    }
    tick()

    const mime = pickMimeType()
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = e => chunks.push(e.data)
    cleanupRef.current = () => {
      cancelAnimationFrame(raf)
      ctx.close()
      stream.getTracks().forEach(t => t.stop())
    }
    rec.onstop = () => {
      cleanupRef.current()
      setState('idle'); setLevel(0)
      onCompleteRef.current({
        blob: new Blob(chunks, { type: rec.mimeType }),
        durationSec: (Date.now() - startedRef.current) / 1000,
        mime: rec.mimeType, peak: peakRef.current,
      })
    }
    recRef.current = rec
    peakRef.current = 0
    startedRef.current = Date.now()
    rec.start()
    setState('recording')
    timerRef.current = setTimeout(stop, maxSec * 1000)
  }, [maxSec, stop])

  useEffect(() => () => { clearTimeout(timerRef.current); cleanupRef.current() }, [])
  return { state, level, start, stop }
}
