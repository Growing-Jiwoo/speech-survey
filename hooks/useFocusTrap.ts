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
    // inert로 막힌 부분(안쪽 겹창 뒤)은 셀 대상에서 뺀다 — 넣으면 순환의 끝이 포커스할 수 없는 칸이 돼 창 밖으로 샌다
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.closest('[inert]'))
    focusables()[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      // 안쪽 컴포넌트가 이미 Esc를 처리했으면(드롭다운 닫기 — preventDefault) 다이얼로그는 닫지 않는다.
      // 안 가르면 드롭다운을 닫으려던 Esc 한 번에 다이얼로그까지 닫혀 그 안의 작업이 사라진다.
      if (e.key === 'Escape') { if (!e.defaultPrevented) onEscapeRef.current?.(); return }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      // 포커스가 창 밖(body)에 떨어져 있으면 창 안으로 되돌린다 — 누르던 요소가 다시 그려지며 사라지면 그렇게 되고,
      // 그대로 두면 Tab이 창 뒤의 화면으로 샌다(스캔본 확인 창에서 학생을 고른 뒤, 2026-10-12 점검).
      if (!activeEl || !container!.contains(activeEl)) { e.preventDefault(); (e.shiftKey ? last : first).focus() }
      else if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus() }
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
