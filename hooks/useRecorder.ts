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
/** 녹음 버튼 연타 방어(ms) — 시작 직후의 두 번째 누름(멈춤)과 멈춘 직후의 두 번째 누름(새 녹음 시작)을 무시한다.
 *  아이·선생님이 큰 버튼을 두 번 톡톡 누르면 0.2초짜리 시도나 무음 시도가 「마지막 녹음」이 됐다(2026-10-08 야간 점검). */
const TAP_GUARD_MS = 500

export function useRecorder(maxSec: number, onComplete: (r: Recording) => void) {
  const [state, setState] = useState<RecState>('idle')
  // 마이크를 여는 중(getUserMedia 대기) — 이 사이에 다시 누르면 녹음기가 둘 생겨 하나는 끌 수 없었다
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const cancelStartRef = useRef(false)   // 여는 중에 멈춤(일시정지)이 눌렸다 — 열리는 대로 닫고 녹음하지 않는다
  const discardRef = useRef(false)       // 화면을 떠났다 — 그 시도는 저장하지 않는다
  const lastStopRef = useRef(0)
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
    if (startingRef.current) { cancelStartRef.current = true; return }
    clearTimeout(timerRef.current)
    if (recRef.current?.state === 'recording') { lastStopRef.current = Date.now(); recRef.current.stop() }
  }, [])

  /** 녹음 버튼으로 멈춤 — 시작 직후(TAP_GUARD_MS 안)의 누름은 연타로 보고 무시한다. 일시정지는 `stop`을 쓴다(언제든 멈춘다). */
  const stopByTap = useCallback(() => {
    if (Date.now() - startedRef.current < TAP_GUARD_MS) return
    stop()
  }, [stop])

  const start = useCallback(async () => {
    // 이미 여는 중이거나 녹음 중이면 무시, 멈춘 직후의 연타도 무시한다(위 TAP_GUARD_MS)
    if (startingRef.current || recRef.current?.state === 'recording') return
    if (Date.now() - lastStopRef.current < TAP_GUARD_MS) return
    // 미지원 브라우저는 getUserMedia 이전에 구분 (권한 문제로 오표시 방지)
    const mime = pickMimeType()
    if (typeof MediaRecorder === 'undefined' || mime === '')
      throw new RecorderError('unsupported', '이 브라우저는 녹음을 지원하지 않습니다.')

    startingRef.current = true; cancelStartRef.current = false; setStarting(true)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true }) // 거부 시 throw
    } finally {
      startingRef.current = false; setStarting(false)
    }
    // 여는 사이 일시정지를 눌렀거나 화면을 떠났다 — 마이크를 바로 닫고 녹음하지 않는다
    if (cancelStartRef.current || discardRef.current) { stream.getTracks().forEach(t => t.stop()); return }
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
        // 녹음 중에 화면을 떠났다(헤더 링크·브라우저 뒤로가기) — 그 시도는 버린다. 트랙을 끄면 브라우저가 stop을 내보내
        // 잘린 녹음이 「마지막 시도」로 올라갔는데 이 기기의 진행 기록에는 남지 않았다(2026-10-08 야간 점검).
        if (discardRef.current) return
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

  useEffect(() => {
    discardRef.current = false   // 개발 모드의 마운트-언마운트-마운트에서 되살린다
    return () => { discardRef.current = true; clearTimeout(timerRef.current); cleanupRef.current() }
  }, [])
  return { state, starting, level, elapsedMs, remainingSec: calcRemaining(elapsedMs, maxSec), start, stop, stopByTap }
}
