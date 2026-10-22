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
/** 소리 처리기가 켜지기를 기다리는 최대 시간(ms) — 아래 start()의 소리 처리기 주석 */
const RESUME_WAIT_MS = 1500

export function useRecorder(maxSec: number, onComplete: (r: Recording) => void) {
  const [state, setState] = useState<RecState>('idle')
  // 마이크를 여는 중(getUserMedia 대기) — 이 사이에 다시 누르면 녹음기가 둘 생겨 하나는 끌 수 없었다
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const cancelStartRef = useRef(false)   // 여는 중에 멈춤(일시정지)이 눌렸다 — 열리는 대로 닫고 녹음하지 않는다
  const discardRef = useRef(false)       // 화면을 떠났다 — 그 시도는 저장하지 않는다
  const dropOnceRef = useRef(false)      // 시작 직후의 일시정지 — 이번 시도 하나만 버린다(stopForPause)
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

  /** 녹음 버튼으로 멈춤 — 시작 직후(TAP_GUARD_MS 안)의 누름은 연타로 보고 무시한다. 일시정지는 `stopForPause`를 쓴다(언제든 멈춘다). */
  const stopByTap = useCallback(() => {
    if (Date.now() - startedRef.current < TAP_GUARD_MS) return
    stop()
  }, [stop])

  /** 일시정지로 멈춤 — 언제든 멈추되, 시작 직후(TAP_GUARD_MS 안)면 **그 시도를 버린다.** 0.2초짜리 녹음이 마지막 시도가 되어
   *  관리자가 기본으로 듣는 녹음이 됐다(2026-10-12 점검 — 녹음 버튼 연타와 같은 문제). 읽은 것이 없으니 버려도 잃는 것이 없다. */
  const stopForPause = useCallback(() => {
    if (recRef.current?.state === 'recording' && Date.now() - startedRef.current < TAP_GUARD_MS) dropOnceRef.current = true
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

    // 소리 처리기(레벨미터·소리 크기 판정)는 **누른 그 순간** 만들고 켠다 — iOS Safari는 사용자 조작 안에서만 AudioContext를
    // 켜 주는데, 처음 검사하는 기기는 마이크 권한 창을 기다리는 사이 조작 시간이 지나 resume()이 끝나지 않았다. 그러면 [허용]을
    // 눌러도 녹음이 시작되지 않고 버튼이 아무 안내 없이 처음으로 돌아갔고, 열린 마이크는 닫히지 않았다(iPad 시뮬레이터에서 재현,
    // 2026-10-21 태블릿 점검).
    let ctx = new AudioContext()
    const resumed = ctx.resume().catch(() => {})
    // 「여는 중」은 녹음이 실제로 시작될 때까지다(권한 창 + 소리 처리기 대기) — 그동안 일시정지가 누르면 시작을 취소한다(stop).
    // 권한 창이 끝나는 순간 거뒀다면, 소리 처리기를 기다리는 사이 누른 일시정지가 아무것도 멈추지 못해 오버레이 뒤에서 녹음이 시작됐다.
    startingRef.current = true; cancelStartRef.current = false; setStarting(true)
    const opened = () => { startingRef.current = false; setStarting(false) }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true }) // 거부 시 throw
    } catch (e) {
      opened(); void ctx.close()
      throw e
    }
    // 스트림 확보 즉시 정리 콜백 등록 → 이후 어느 줄에서 throw해도 마이크 트랙 정지
    let raf = 0
    cleanupRef.current = () => {
      cancelAnimationFrame(raf)
      if (ctx.state !== 'closed') void ctx.close()
      stream.getTracks().forEach(t => t.stop())
    }
    // 여는 사이 일시정지를 눌렀거나 화면을 떠났다 — 마이크를 바로 닫고 녹음하지 않는다
    const cancelled = () => cancelStartRef.current || discardRef.current
    if (cancelled()) { opened(); cleanupRef.current(); return }
    /** 레벨미터 연결 — 켜지기를 RESUME_WAIT_MS까지만 기다린다. 그래도 안 켜지면 녹음은 그대로 시작한다(MediaRecorder는 소리
     *  처리기와 무관하다). 그 녹음은 레벨이 0이라 「잘 안 담긴 것 같아요」가 뜰 수 있지만, 다시 누르면(새 조작) 켜진다. */
    const meter = async (c: AudioContext, ready: Promise<void>) => {
      await Promise.race([ready, new Promise(r => setTimeout(r, RESUME_WAIT_MS))])
      const a = c.createAnalyser()
      a.fftSize = 256
      c.createMediaStreamSource(stream).connect(a)
      return a
    }

    try {
      let analyser: AnalyserNode
      try { analyser = await meter(ctx, resumed) }
      catch {
        // 마이크를 연 뒤 장치 설정이 바뀌어 미리 만든 처리기에 스트림을 붙이지 못하면(표본률 차이 등) 그때 새로 만든다 — 종전 방식
        void ctx.close()
        ctx = new AudioContext()
        analyser = await meter(ctx, ctx.resume().catch(() => {}))
      }
      if (cancelled()) { opened(); cleanupRef.current(); return }
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
        // 녹음 중에 화면을 떠났다(헤더 링크 등 — 문항 화면의 뒤로 가기는 일시정지로 바뀌어 여기 오지 않는다) — 그 시도는 버린다. 트랙을 끄면 브라우저가 stop을 내보내
        // 잘린 녹음이 「마지막 시도」로 올라갔는데 이 기기의 진행 기록에는 남지 않았다(2026-10-08 야간 점검).
        if (discardRef.current) return
        setState('idle'); setLevel(0); setElapsedMs(0)
        if (dropOnceRef.current) { dropOnceRef.current = false; return }
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
      opened()
      tick()
      setState('recording')
      setElapsedMs(0)
      timerRef.current = setTimeout(stop, maxSec * 1000)
    } catch (e) {
      opened()
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
  return { state, starting, level, elapsedMs, remainingSec: calcRemaining(elapsedMs, maxSec), start, stop, stopByTap, stopForPause }
}
