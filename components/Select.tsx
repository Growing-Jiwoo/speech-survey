'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption { value: string; label: string }

/**
 * 네이티브 select 대신 쓰는 커스텀 드롭다운.
 * 목록은 document.body에 포탈 렌더한다 — 조상 요소의 overflow-hidden(카드형 컨테이너 등)에
 * 잘리는 문제를 근본적으로 피하기 위함(트리거 위치를 기준으로 fixed 포지션 계산).
 */
export function Select({ id, value, options, placeholder, onChange, ariaLabel, disabled, className = '', size = 'lg' }: {
  id?: string
  value: string
  options: SelectOption[]
  placeholder: string
  onChange: (value: string) => void
  ariaLabel?: string
  disabled?: boolean
  className?: string
  /** 'lg'(기본, 검사 화면용 큰 터치 타깃) | 'sm'(관리자 툴바 등 밀도 높은 화면용) */
  size?: 'lg' | 'sm'
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  // 열려있는 동안 트리거 위치를 추적해 포탈된 목록의 fixed 좌표를 갱신
  useLayoutEffect(() => {
    if (!open) return
    function measure() {
      const r = triggerRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width })
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open])

  const selected = options.find(o => o.value === value)
  const trigger = size === 'sm' ? 'h-9 px-2.5 text-xs' : 'h-[50px] px-4 text-base'

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button ref={triggerRef} type="button" id={id} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`flex w-full items-center justify-between rounded-xl border-[1.5px] bg-well transition disabled:opacity-50 ${trigger} ${
          open ? 'border-blue' : 'border-line'}`}>
        <span className={`truncate ${selected ? '' : 'text-ink-mute'}`}>{selected ? selected.label : placeholder}</span>
        <svg className={`ml-2 h-4 w-4 flex-none text-ink-mute transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && pos && createPortal(
        <ul ref={listRef} role="listbox" aria-label={ariaLabel}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-50 max-h-56 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
          {options.map(o => (
            <li key={o.value}>
              <button type="button" role="option" aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-well ${
                  o.value === value ? 'font-bold text-blue' : 'text-ink'}`}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  )
}
