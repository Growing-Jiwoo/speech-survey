'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '@/components/Spinner'

const SHOW_DELAY_MS = 150   // 이 시간 안에 끝나는 요청은 아예 띄우지 않는다(짧은 요청 깜빡임 방지)
const MIN_VISIBLE_MS = 250  // 한번 뜨면 최소 이만큼은 유지한다(뜨자마자 꺼지는 깜빡임 방지)

/**
 * 프로젝트 공통 로딩 UI — 화면 전체를 dimmed 처리하고 정중앙에 스피너만 띄운다.
 * 짧게 끝나는 요청에서 깜빡이지 않도록 지연 노출 + 최소 노출시간을 둔다.
 */
export function LoadingOverlay({ show }: { show: boolean }) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const shownAtRef = useRef<number | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (show) {
      const showTimer = setTimeout(() => {
        shownAtRef.current = Date.now()
        setVisible(true)
      }, SHOW_DELAY_MS)
      return () => clearTimeout(showTimer)
    }
    if (shownAtRef.current === null) return // 지연시간 내에 끝나 띄운 적 없음
    const elapsed = Date.now() - shownAtRef.current
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)
    const hideTimer = setTimeout(() => { setVisible(false); shownAtRef.current = null }, remaining)
    return () => clearTimeout(hideTimer)
  }, [show])

  if (!mounted || !visible) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40">
      <Spinner className="h-9 w-9 text-white" />
    </div>,
    document.body,
  )
}
