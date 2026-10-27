// components/Tip.tsx — 배지에 붙는 설명 말풍선. 마우스를 올리거나 키보드로 오면 뜨고, 손가락으로 누르면 열고 닫는다.
//
// 배지 설명이 범례(BadgeLegend)에만 있으면 목록 맨 아래라 행이 많을 때 끝까지 내려가야 보인다 — 배지 자리에서 읽히게 한다.
// title 속성을 쓰지 않는 이유: 1초쯤 늦게 뜨고 글자 모양을 못 고르며, 태블릿(터치)·키보드에서는 아예 뜨지 않는다.
// 말풍선은 document.body에 포탈한다(Select와 같은 이유 — 목록의 가로 스크롤 상자에 잘리지 않게).
// 화면 읽기 프로그램에는 늘 DOM에 있는 sr-only 사본이 읽힌다(aria-describedby) — 말풍선은 눈으로 보는 사본이다.
'use client'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** 배지와 말풍선 사이 · 화면 가장자리 여백(px) */
const GAP = 6
const EDGE = 8
/** 마우스가 배지에서 말풍선으로 옮겨 가는 동안 닫지 않고 기다리는 시간(ms) */
const CLOSE_DELAY = 120

export function Tip({ tip, children, tabbable = true }: {
  /** 말풍선 내용 */
  tip: ReactNode
  /** 배지 — 단추 안에 그대로 그린다 */
  children: ReactNode
  /**
   * 키보드 Tab으로 멈추는가. 목록 행 안에서는 끈다 — 행마다 배지가 서넛이라 수백 행을 Tab으로 지나가야 한다.
   * 꺼도 마우스·손가락으로는 열리고, 화면 읽기 프로그램은 sr-only 사본을 읽는다.
   */
  tabbable?: boolean
}) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  // 손가락으로 눌러 연 상태 — 터치에는 hover가 없다
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  // 마지막으로 누른 입력 — 마우스 클릭은 행으로 흘려보내 결과지를 연다(아래 onClick)
  const pointerType = useRef('')
  const descId = useId()
  const open = hover || focus || pinned

  // 열릴 때 말풍선 크기를 재서 배지 위(공간이 없으면 아래)에 놓는다. 손가락에 가리지 않게 위가 먼저다.
  // 첫 렌더는 보이지 않게 그려 두고 여기서 재므로 칠하기 전에 자리가 잡힌다.
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const b = btnRef.current?.getBoundingClientRect()
      const t = tipRef.current
      if (!b || !t) return
      const w = t.offsetWidth, h = t.offsetHeight
      const top = b.top - GAP - h >= EDGE ? b.top - GAP - h : b.bottom + GAP
      const left = Math.min(Math.max(EDGE, b.left + b.width / 2 - w / 2), window.innerWidth - EDGE - w)
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  // 열려 있는 동안: Esc로 닫는다(마우스를 치우지 않고도 닫혀야 한다 — WCAG 1.4.13). 스크롤하면 닫는다 — 배지가
  // 고정 머리글 밑으로 들어가도 말풍선만 떠 있게 두지 않는다. 손가락으로 연 것은 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!open) return
    const close = () => { setHover(false); setFocus(false); setPinned(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: PointerEvent) => { if (!btnRef.current?.contains(e.target as Node)) setPinned(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // 마우스만 hover로 연다(터치의 pointerenter는 누름과 같이 와서 열자마자 onClick이 닫는다)
  const enter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    window.clearTimeout(closeTimer.current)
    setHover(true)
  }
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    closeTimer.current = window.setTimeout(() => setHover(false), CLOSE_DELAY)
  }

  return (
    <>
      <button ref={btnRef} type="button" tabIndex={tabbable ? undefined : -1} aria-describedby={descId}
        onPointerDown={e => { pointerType.current = e.pointerType }}
        onPointerEnter={enter} onPointerLeave={leave}
        // 키보드로 왔을 때만 연다 — 마우스로 누를 때의 포커스까지 열면 hover와 겹쳐 닫히지 않는다
        onFocus={e => setFocus(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => { setFocus(false); setPinned(false) }}
        onClick={e => {
          // 마우스 클릭은 막지 않는다 — 목록 행 어디를 눌러도 결과지가 열리던 동작을 배지 위에서도 지킨다(설명은 hover가 보여 준다).
          // 손가락·키보드(Enter)는 여기서 열고 닫고 행으로 보내지 않는다.
          if (pointerType.current === 'mouse') { pointerType.current = ''; return }
          pointerType.current = ''
          e.stopPropagation()
          setPinned(p => !p)
        }}
        className="inline-flex cursor-help rounded-full align-middle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue">
        {children}
      </button>
      <span id={descId} className="sr-only">{tip}</span>
      {open && createPortal(
        <div ref={tipRef} aria-hidden
          // 말풍선 위의 누름이 React 트리를 타고 목록 행의 onClick(결과지 열기)으로 가지 않게 끊는다
          onClick={e => e.stopPropagation()}
          onPointerEnter={enter} onPointerLeave={leave}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          // break-keep: 한글 낱말 중간에서 줄을 바꾸지 않는다(삭제 확인 창과 같다)
          className="z-50 max-w-[300px] break-keep rounded-xl border border-line bg-white px-3.5 py-2.5 text-left text-[12.5px] font-normal leading-relaxed whitespace-normal text-ink-soft shadow-[0_12px_32px_-12px_rgba(14,21,38,.3)]">
          {tip}
        </div>,
        document.body,
      )}
    </>
  )
}
