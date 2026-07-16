'use client'
import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** 다이얼로그용 포커스 트랩: 초기 포커스·Tab 순환·Esc 닫기·해제 시 포커스 복귀. */
export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  // 최신 콜백 유지(latest-ref). 렌더 중 ref 쓰기는 금지라 커밋 후 effect에서 갱신한다.
  const onEscapeRef = useRef(onEscape)
  useEffect(() => { onEscapeRef.current = onEscape })

  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return
    const prevFocused = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    focusables()[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onEscapeRef.current?.(); return }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      prevFocused?.focus()
    }
  }, [active])
  return ref
}
