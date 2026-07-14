'use client'
import { useEffect, useRef, useState } from 'react'

export interface SelectOption { value: string; label: string }

/** 네이티브 select 대신 쓰는 커스텀 드롭다운 — 트리거 바로 아래에 앱 디자인과 통일된 목록을 띄운다. */
export function Select({ id, value, options, placeholder, onChange, ariaLabel, disabled, className = '' }: {
  id?: string
  value: string
  options: SelectOption[]
  placeholder: string
  onChange: (value: string) => void
  ariaLabel?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
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

  const selected = options.find(o => o.value === value)

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button type="button" id={id} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        disabled={disabled} onClick={() => setOpen(o => !o)}
        className={`flex h-[50px] w-full items-center justify-between rounded-xl border-[1.5px] bg-well px-4 text-base transition disabled:opacity-50 ${
          open ? 'border-blue' : 'border-line'}`}>
        <span className={`truncate ${selected ? '' : 'text-ink-mute'}`}>{selected ? selected.label : placeholder}</span>
        <svg className={`ml-2 h-4 w-4 flex-none text-ink-mute transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul role="listbox" aria-label={ariaLabel}
          className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
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
        </ul>
      )}
    </div>
  )
}
