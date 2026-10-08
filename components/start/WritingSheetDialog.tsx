// components/start/WritingSheetDialog.tsx — 시작 화면 학급 배너의 [쓰기 기록지 인쇄 →]가 여는 창과 인쇄.
//
// 흐름(사용자 확정 2026-09-30, 담당자에게 시안 공유):
// · 처음에는 요약과 [인쇄하기]만 보인다 — 가장 흔한 경우(검사 전 반 전체)는 한 번이면 끝난다.
// · 「학생 골라서 뽑기」를 펼치면 명단에서 고른다(쓰기 상태 배지로 이미 쓴 아이를 뺄 수 있다).
// · 명단에 없는 학생(전학생 등)은 **번호만 찍힌 기록지** — 번호가 찍혀 있어야 스캔본이 자동으로 이어진다.
//   명단 없이 직접 입력으로 검사하는 학급은 이 방식으로 1번~N번을 뽑는다.
// · [인쇄하기]는 **브라우저 인쇄 창을 바로** 연다 — 파일로 저장하지 않는다. 이 화면은 아이 앞 공용 PC라
//   PDF를 내려받게 하면 다운로드 폴더에 반 전체 이름이 남는다.
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Badge } from '@/components/Badge'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { classLabel } from '@/lib/format'
import { numberRange, sheetEntries, type SheetLayout } from '@/lib/writing-sheet'
import type { ScanTargetState } from '@/lib/scan-mapping'
import { WritingSheet, type SheetClass } from './WritingSheets'

export interface SheetRosterChild { childNo: number; name: string; writing: ScanTargetState | null }

/** 쓰기 상태 배지 — 이미 쓴 아이(화면 입력·스캔 올림)와 쓰고 스캔을 기다리는 아이를 가린다. */
const WRITING_BADGE: Partial<Record<ScanTargetState, { tone: 'mute' | 'mint' | 'amber'; label: string }>> = {
  screen: { tone: 'mute', label: '화면 입력함' },
  uploaded: { tone: 'mint', label: '스캔 올림' },
  scored: { tone: 'mint', label: '스캔 올림' },
  wait: { tone: 'amber', label: '스캔 대기' },
}

/** 여는 쪽이 **열 때만 그린다**(`{open && <WritingSheetDialog …/>}`) — 고른 학생·번호가 창을 열 때마다 처음
 *  상태(반 전체)에서 시작한다. 지난번 고른 것이 남아 있으면 「반 전체」라고 믿고 누른 교사가 일부만 뽑는다.
 *  열린 채 상태를 되돌리는 효과로 두면 부모가 다시 그려질 때마다(결과지 받기 카운트다운이 1초마다) 고른 것이 풀린다. */
export function WritingSheetDialog({ onClose, cls, tag, layout, roster }: {
  onClose: () => void
  cls: SheetClass
  tag: string
  layout: SheetLayout
  /** 비어 있으면 명단 없는 학급(직접 입력) — 번호 범위로 뽑는다 */
  roster: SheetRosterChild[]
}) {
  const hasRoster = roster.length > 0
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(() => new Set(roster.map(r => r.childNo)))
  const [extra, setExtra] = useState<number[]>([])
  const [extraInput, setExtraInput] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [printing, setPrinting] = useState(false)
  /** 인쇄 창을 한 번 닫았다 — [취소]를 [닫기]로 바꾸고 안내를 띄운다 */
  const [printed, setPrinted] = useState(false)
  // 명단 번호를 「번호만」에 넣으면 이름이 찍힌 기록지로 돌렸다고 알린다(칩이 안 생겨 무시된 것처럼 보이지 않게)
  const [extraNote, setExtraNote] = useState('')
  const trapRef = useFocusTrap(true, onClose)
  // 인쇄 효과가 onClose의 정체성에 매이지 않게 — 부모가 다시 그려질 때마다 새 함수가 오면 효과가 다시 돌아
  // 인쇄 창이 또 뜬다.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  const entries = useMemo(() => {
    // 명단 없는 학급: 1~N번 범위 + 낱장 번호(범위를 적기 전에는 0장)
    if (!hasRoster) return sheetEntries([], [...numberRange(Number(rangeTo)), ...extra])
    return sheetEntries(roster.filter(r => picked.has(r.childNo)).map(r => ({ childNo: r.childNo, name: r.name })), extra)
  }, [hasRoster, roster, picked, extra, rangeTo])

  // 인쇄 — 기록지를 인쇄 전용 뿌리(화면에는 안 보인다)에 그린 다음 인쇄 창을 띄운다. 그동안 이 창을 포함한
  // 다른 요소는 인쇄에서 숨긴다(globals.css의 body.printing-sheets). 인쇄 창이 닫히면(afterprint) 인쇄 상태만 푼다 —
  // **이 창은 남긴다.** 크롬은 인쇄를 취소해도 afterprint가 와서, 닫아 버리면 프린터를 잘못 골라 취소한 선생님이
  // 고른 학생을 다시 골라야 한다(2026-10-01). 끝났으면 [닫기]를 누른다. afterprint가 오지 않는 브라우저여도 같다.
  useEffect(() => {
    if (!printing) return
    document.body.classList.add('printing-sheets')
    // 인쇄하는 동안만 쪽 여백 0 — 브라우저가 여백에 찍는 머리글·바닥글(페이지 제목·사이트 주소·날짜)이 아이 종이에
    // 나오지 않게(QR에서 주소를 뺀 것과 같은 이유). 전역 @page(결과지 인쇄용 12mm·10mm)보다 뒤에 넣어 이긴다.
    // 이름 붙은 쪽(@page sheet)으로 하지 않는 이유: 그것을 모르는 브라우저(Safari 등)는 기본 여백에 296mm 기록지를
    // 올려 한 장이 두 쪽으로 넘친다. 이 동안 인쇄되는 것은 기록지뿐이다(printing-sheets).
    const pageStyle = document.createElement('style')
    pageStyle.textContent = '@media print { @page { size: A4 portrait; margin: 0; } }'
    document.head.appendChild(pageStyle)
    // 인쇄 설정에 따라 제목이 찍히는 브라우저가 있다 — 아이 종이이니 중립적인 이름으로 잠시 바꾼다
    const title = document.title
    document.title = '쓰기 기록지'
    const done = () => { setPrinting(false); setPrinted(true) }
    window.addEventListener('afterprint', done, { once: true })
    let cancelled = false
    // 한 프레임 뒤 — 기록지가 DOM에 그려진 뒤, 그리고 **이름 글자의 한글 글꼴 조각을 받은 뒤** 인쇄 창을 연다.
    // 기록지는 화면에서 숨겨져 있어 글꼴이 미리 받아지지 않는다 — 안 기다리면 이름이 다른 글꼴로 찍힐 수 있다.
    const raf = requestAnimationFrame(() => {
      const text = document.getElementById('sheet-print-root')?.textContent ?? ''
      const family = getComputedStyle(document.body).fontFamily
      void Promise.all(['400', '700'].map(w => document.fonts.load(`${w} 16px ${family}`, text)))
        .catch(() => undefined)
        .then(() => { if (!cancelled) window.print() })
    })
    return () => {
      cancelled = true; cancelAnimationFrame(raf); window.removeEventListener('afterprint', done)
      document.body.classList.remove('printing-sheets'); pageStyle.remove(); document.title = title
    }
  }, [printing])

  const addExtra = () => {
    const n = Number(extraInput)
    setExtraInput('')
    if (!Number.isInteger(n) || n < 1 || n > 99) { setExtraNote('1~99번 사이로 적어 주세요'); return }
    // 명단에 있는 번호는 번호만 찍지 않고 그 학생을 고른다 — 이름이 찍혀 나오는 편이 낫다
    const r = roster.find(x => x.childNo === n)
    if (r) {
      setPicked(prev => new Set(prev).add(n))
      setExtraNote(`${n}번은 명단에 있어서 ${r.name} 학생 기록지로 넣었어요`)
      return
    }
    setExtraNote('')
    setExtra(prev => (prev.includes(n) ? prev : [...prev, n].sort((a, b) => a - b)))
  }
  const toggle = (no: number, on: boolean) =>
    setPicked(prev => { const n = new Set(prev); if (on) n.add(no); else n.delete(no); return n })
  const allOn = picked.size === roster.length
  const kindLabel = layout.kind === 'word' ? '낱말' : '문장'
  // 번호 하나씩 넣기 — 명단에 없는 학생(명단 있는 반)이나 한 장만 다시 뽑을 때(명단 없는 반)
  const extraRow = (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={extraInput} inputMode="numeric" maxLength={2} aria-label="번호"
          onChange={e => setExtraInput(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra() } }}
          className="h-8 w-14 rounded-lg border-[1.5px] border-line text-center text-sm font-bold" />
        <span className="text-[13px] text-ink-soft">번</span>
        <button type="button" onClick={addExtra} disabled={!extraInput}
          className="h-8 rounded-lg border-[1.5px] border-blue px-3 text-[12.5px] font-bold text-blue disabled:opacity-40">추가</button>
        {extra.map(n => (
          <button key={n} type="button" onClick={() => setExtra(prev => prev.filter(x => x !== n))}
            aria-label={`${n}번 빼기`}
            className="h-7 rounded-full bg-blue/10 px-2.5 text-[12.5px] font-bold text-blue">{n}번 ✕</button>
        ))}
      </div>
      {extraNote && <p aria-live="polite" className="mt-1.5 text-[11.5px] font-bold text-blue">{extraNote}</p>}
    </>
  )
  const summary = !hasRoster
    ? `번호만 찍힌 기록지 → ${entries.length}장`
    : picking || extra.length > 0 || !allOn
      ? `고른 학생 ${picked.size}명${extra.length > 0 ? ` + 번호만 ${extra.length}장` : ''} → ${entries.length}장`
      : `명단 ${roster.length}명 → ${entries.length}장`

  return (
    <>
      {/* 바깥을 눌러도 닫지 않는다 — 골라 둔 학생·번호가 한 번에 사라진다([취소]·Esc로 닫는다) */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 print:hidden">
        <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="sheet-dialog-title"
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col rounded-[20px] bg-white shadow-xl"
          onClick={e => e.stopPropagation()}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 pb-2">
            <h2 id="sheet-dialog-title" className="text-lg font-bold">쓰기 기록지를 인쇄할까요?</h2>
            <p className="mt-1 text-[13px] text-ink-soft">
              {hasRoster ? '아이마다 한 장씩, 번호·이름이 찍혀 나와요.' : '아이마다 한 장씩, 번호가 찍혀 나와요. 이름은 손으로 적어요.'}
            </p>
            <div className="mt-3 rounded-xl border border-line bg-well px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-soft">
              <b className="text-ink">{cls.schoolName} {classLabel(cls.grade, cls.classNo)}</b>
              <br />{cls.grade}학년 <b className="text-ink">{kindLabel} 쓰기</b> 기록지 · {summary}
            </div>

            {hasRoster ? (
              <>
                <button type="button" aria-expanded={picking} onClick={() => setPicking(p => !p)}
                  className={`mt-3 flex w-full items-center justify-between rounded-xl border-[1.5px] px-3.5 py-2.5 text-[13.5px] font-bold transition ${
                    picking ? 'border-blue bg-blue/[0.05] text-blue' : 'border-line text-ink-soft hover:border-blue'}`}>
                  학생 골라서 뽑기 <span aria-hidden>{picking ? '▲' : '▼'}</span>
                </button>
                {picking && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-line">
                    <label className="flex items-center gap-2.5 border-b border-line bg-well px-3 py-2 text-[12.5px] font-bold text-ink-soft">
                      <input type="checkbox" checked={allOn}
                        onChange={e => setPicked(e.target.checked ? new Set(roster.map(r => r.childNo)) : new Set())}
                        className="h-4 w-4 accent-[var(--color-blue)]" />
                      전체 선택
                      <span className="ml-auto text-blue">{picked.size}명 선택</span>
                    </label>
                    <ul className="max-h-60 overflow-y-auto">
                      {roster.map(r => {
                        const b = r.writing ? WRITING_BADGE[r.writing] : undefined
                        return (
                          <li key={r.childNo}>
                            <label className="flex items-center gap-2.5 border-b border-line/70 px-3 py-1.5 text-[13.5px] last:border-b-0">
                              <input type="checkbox" checked={picked.has(r.childNo)} onChange={e => toggle(r.childNo, e.target.checked)}
                                aria-label={`${r.childNo}번 ${r.name}`} className="h-4 w-4 accent-[var(--color-blue)]" />
                              <span className="w-5 text-right text-[12px] tabular-nums text-ink-mute">{r.childNo}</span>
                              <span className="min-w-0 flex-1 truncate">{r.name}</span>
                              {b && <Badge tone={b.tone} size="sm">{b.label}</Badge>}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
                <div className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-2.5">
                  <p className="text-[13px] font-bold">번호만 찍힌 기록지</p>
                  <p className="text-[11.5px] text-ink-mute">명단에 없는 학생(전학생 등)용이에요. 이름은 손으로 적어요</p>
                  {extraRow}
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-line px-3.5 py-2.5">
                <p className="text-[13px] font-bold">번호만 찍힌 기록지</p>
                <p className="text-[11.5px] text-ink-mute">명단이 없는 학급이라 이름은 손으로 적어요</p>
                <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-soft">
                  1번부터
                  <input value={rangeTo} inputMode="numeric" maxLength={2} aria-label="마지막 번호"
                    onChange={e => setRangeTo(e.target.value.replace(/\D/g, ''))}
                    className="h-8 w-14 rounded-lg border-[1.5px] border-line text-center text-sm font-bold" />
                  번까지
                </div>
                <p className="mt-2 text-[11.5px] text-ink-mute">한 장만 다시 뽑을 때는 번호를 하나씩 넣어요</p>
                {extraRow}
              </div>
            )}
            <p className="mt-3 flex items-start gap-1.5 text-[12px] text-ink-mute">
              <span aria-hidden className="mt-px">ⓘ</span>기록지는 담당자 채점이 끝날 때까지 보관해 주세요.
            </p>
            {printed && (
              <p aria-live="polite" className="mt-2 rounded-lg bg-well px-3 py-2 text-[12.5px] text-ink-soft">
                인쇄 창을 닫았어요. 더 뽑을 게 없으면 <b>[닫기]</b>, 빠진 학생이 있으면 골라서 다시 <b>[인쇄하기]</b>.
              </p>
            )}
          </div>
          <div className="flex gap-2.5 p-6 pt-3">
            <button type="button" onClick={() => { setPrinting(false); onClose() }} className="btn-ghost h-[50px] flex-1">{printed ? '닫기' : '취소'}</button>
            <button type="button" onClick={() => setPrinting(true)} disabled={entries.length === 0 || printing}
              className="btn-primary h-[50px] flex-[2]">인쇄하기 ({entries.length}장)</button>
          </div>
        </div>
      </div>
      {printing && createPortal(
        <div id="sheet-print-root" className="hidden print:block">
          {entries.map(e => <WritingSheet key={e.childNo} cls={cls} tag={tag} layout={layout} entry={e} />)}
        </div>,
        document.body,
      )}
    </>
  )
}
