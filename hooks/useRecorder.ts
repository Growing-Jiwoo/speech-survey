'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RecorderError, remainingSec as calcRemaining } from '@/lib/audio'

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
  const [elapsedMs, setElapsedMs] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const peakRef = useRef(0)
  const startedRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cleanupRef = useRef<() => void>(() => {})
  // 최신 콜백 유지(latest-ref). 렌더 중 ref 쓰기는 금지라 커밋 후 effect에서 갱신한다.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete })

  const stop = useCallback(() => {
    clearTimeout(timerRef.current)
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }, [])

  const start = useCallback(async () => {
    // 미지원 브라우저는 getUserMedia 이전에 구분 (권한 문제로 오표시 방지)
    const mime = pickMimeType()
    if (typeof MediaRecorder === 'undefined' || mime === '')
      throw new RecorderError('unsupported', '이 브라우저는 녹음을 지원하지 않습니다.')

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }) // 거부 시 throw
    // 스트림 확보 즉시 정리 콜백 등록 → 이후 어느 줄에서 throw해도 마이크 트랙 정지
    let raf = 0
    let ctx: AudioContext | null = null
    cleanupRef.current = () => {
      cancelAnimationFrame(raf)
      if (ctx && ctx.state !== 'closed') void ctx.close()
      stream.getTracks().forEach(t => t.stop())
    }

    try {
      ctx = new AudioContext()
      await ctx.resume() // iOS: suspended로 시작하면 레벨미터가 0 고정되는 문제 방지
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let p = 0
        for (const v of buf) p = Math.max(p, Math.abs(v - 128) / 128)
        peakRef.current = Math.max(peakRef.current, p)
        setLevel(p)
        setElapsedMs(Date.now() - startedRef.current)
        raf = requestAnimationFrame(tick)
      }

      const rec = new MediaRecorder(stream, { mimeType: mime })
      const chunks: Blob[] = []
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = () => {
        cleanupRef.current()
        setState('idle'); setLevel(0); setElapsedMs(0)
        onCompleteRef.current({
          blob: new Blob(chunks, { type: rec.mimeType }),
          durationSec: (Date.now() - startedRef.current) / 1000,
          mime: rec.mimeType, peak: peakRef.current,
        })
      }
      recRef.current = rec
      peakRef.current = 0
      startedRef.current = Date.now()
      rec.start() // NotSupportedError 등은 아래 catch에서 분류
      tick()
      setState('recording')
      setElapsedMs(0)
      timerRef.current = setTimeout(stop, maxSec * 1000)
    } catch (e) {
      cleanupRef.current()
      setState('idle'); setLevel(0); setElapsedMs(0)
      // MediaRecorder 생성/시작 실패는 미지원으로 분류(iOS start() NotSupportedError 포함)
      throw e instanceof RecorderError ? e
        : new RecorderError((e as { name?: string })?.name === 'NotSupportedError' ? 'unsupported' : 'failed',
            (e as Error)?.message)
    }
  }, [maxSec, stop])

  useEffect(() => () => { clearTimeout(timerRef.current); cleanupRef.current() }, [])
  return { state, level, elapsedMs, remainingSec: calcRemaining(elapsedMs, maxSec), start, stop }
}
