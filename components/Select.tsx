// components/Select.tsx — 네이티브 select 대신 쓰는 커스텀 드롭다운.
'use client'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption { value: string; label: string }

/**
 * 목록은 document.body에 포탈 렌더한다 — 조상 요소의 overflow-hidden(카드형 컨테이너 등)에
 * 잘리는 문제를 근본적으로 피하기 위함(트리거 위치를 기준으로 fixed 포지션 계산).
 *
 * 키보드: 포커스는 항상 트리거에 두고 aria-activedescendant로 활성 옵션만 옮기는
 * ARIA listbox 패턴 — ↑/↓(열기·이동) · Home/End · Enter/Space(선택) · Esc(닫기).
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
  // 키보드 하이라이트 위치(마우스 hover와 공유). 목록을 열 때 현재 선택값으로 초기화된다.
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()

  // disabled 상태에서는 열림을 파생으로 무효화한다(effect로 setOpen(false)를 쏘는 것보다
  // 단순하고, disabled 전환 프레임에 목록이 잠깐 보이는 일도 없다).
  const isOpen = open && !disabled

  const selectedIdx = options.findIndex(o => o.value === value)

  function openList() {
    setActive(selectedIdx >= 0 ? selectedIdx : 0)
    setOpen(true)
  }

  function choose(idx: number) {
    const o = options[idx]
    if (o) onChange(o.value)
    setOpen(false)
    triggerRef.current?.focus() // 선택 후 포커스가 유실되지 않도록 트리거로 복귀
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openList()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(i => Math.min(i + 1, options.length - 1)); break
      case 'ArrowUp': e.preventDefault(); setActive(i => Math.max(i - 1, 0)); break
      case 'Home': e.preventDefault(); setActive(0); break
      case 'End': e.preventDefault(); setActive(options.length - 1); break
      case 'Enter': case ' ': e.preventDefault(); choose(active); break
      case 'Escape': e.preventDefault(); setOpen(false); break
      case 'Tab': setOpen(false); break // 포커스 이탈 시 목록을 정리(선택 없이 닫기)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    function onDocPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [isOpen])

  // 활성 옵션이 목록 스크롤 밖이면 따라가며 보여준다
  useEffect(() => {
    if (!isOpen || active < 0) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, active])

  // 열려있는 동안 트리거 위치를 추적해 포탈된 목록의 fixed 좌표를 갱신
  useLayoutEffect(() => {
    if (!isOpen) return
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
  }, [isOpen])

  const selected = selectedIdx >= 0 ? options[selectedIdx] : undefined
  const trigger = size === 'sm' ? 'h-9 px-2.5 text-xs' : 'h-[50px] px-4 text-base'
  const optionId = (i: number) => `${listboxId}-opt-${i}`

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button ref={triggerRef} type="button" id={id} aria-label={ariaLabel}
        role="combobox" aria-haspopup="listbox" aria-expanded={isOpen} aria-controls={listboxId}
        aria-activedescendant={isOpen && active >= 0 ? optionId(active) : undefined}
        disabled={disabled} onClick={() => (isOpen ? setOpen(false) : openList())} onKeyDown={onTriggerKeyDown}
        className={`flex w-full items-center justify-between rounded-xl border-[1.5px] bg-well transition disabled:opacity-50 ${trigger} ${
          isOpen ? 'border-blue' : 'border-line'}`}>
        <span className={`truncate ${selected ? '' : 'text-ink-mute'}`}>{selected ? selected.label : placeholder}</span>
        <svg className={`ml-2 h-4 w-4 flex-none text-ink-mute transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && pos && createPortal(
        <ul ref={listRef} id={listboxId} role="listbox" aria-label={ariaLabel}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
          className="z-50 max-h-56 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
          {options.map((o, i) => (
            <li key={o.value} id={optionId(i)} role="option" aria-selected={o.value === value}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`cursor-pointer px-4 py-2.5 text-left text-sm ${i === active ? 'bg-well' : ''} ${
                o.value === value ? 'font-bold text-blue' : 'text-ink'}`}>
              {o.label}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  )
}
