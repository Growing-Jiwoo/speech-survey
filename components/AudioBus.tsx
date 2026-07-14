'use client'
import { createContext, useCallback, useContext, useMemo, useRef } from 'react'

type StopFn = () => void

interface AudioBusValue {
  /** 새 플레이어가 재생을 시작할 때 호출 — 직전에 재생 중이던 플레이어를 정지시킨다. */
  play(stop: StopFn): void
  /** 플레이어가 스스로 정지/종료/언마운트될 때 등록 해제 */
  clear(stop: StopFn): void
}

const NOOP: AudioBusValue = { play: () => {}, clear: () => {} }
const AudioBusContext = createContext<AudioBusValue | null>(null)

export function AudioBusProvider({ children }: { children: React.ReactNode }) {
  const currentRef = useRef<StopFn | null>(null)
  const play = useCallback((stop: StopFn) => {
    if (currentRef.current && currentRef.current !== stop) currentRef.current()
    currentRef.current = stop
  }, [])
  const clear = useCallback((stop: StopFn) => {
    if (currentRef.current === stop) currentRef.current = null
  }, [])
  const value = useMemo<AudioBusValue>(() => ({ play, clear }), [play, clear])
  return <AudioBusContext.Provider value={value}>{children}</AudioBusContext.Provider>
}

/** Provider 밖(플레이어 단독 사용)에서는 no-op으로 안전하게 동작한다. */
export function useAudioBus(): AudioBusValue {
  return useContext(AudioBusContext) ?? NOOP
}
