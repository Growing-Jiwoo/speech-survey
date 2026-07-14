'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Spinner } from '@/components/Spinner'

/** 프로젝트 공통 로딩 UI — 화면 전체를 dimmed 처리하고 정중앙에 스피너만 띄운다. */
export function LoadingOverlay({ show }: { show: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || !show) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40">
      <Spinner className="h-9 w-9 text-white" />
    </div>,
    document.body,
  )
}
