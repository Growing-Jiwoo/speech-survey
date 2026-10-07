// components/results/ScanUpload.tsx — 교사 결과지의 「쓰기 스캔본 올리기」 입구와 확인 창.
//
// 흐름(사용자 확정 2026-09-30, 담당자에게 시안 공유):
// 1) 반 전체를 한 파일로(PDF·사진 여러 장도 된다) 고른다.
// 2) 쪽마다 QR을 읽어 **누구 기록지인지 자동으로** 붙인다 — 순서가 섞여도 된다(lib/scan-mapping).
//    못 읽은 쪽은 쪽 그림에 찍힌 이름을 보고 선생님이 **직접 고른다.** 화질 경고는 띄우지 않는다.
// 3) **모든 쪽이 정해져야**(아이 또는 「올리지 않음」) [올리기]가 켜진다 — 누구 것인지 모르는 쪽은 올라가지 않는다.
//    재검사한 아이는 자동으로 붙이지 않고 선생님이 확인해 고른다(몇 차 기록지인지 종이만 보고는 모른다).
//    빈 쪽(양면 스캔의 뒷면)은 「올리지 않음」으로 둔다. 짝짓기 전에 결과 목록을 다시 받는다 — 열어 둔 지 오래된
//    탭은 그사이 제출·재검사된 아이를 모른다(서버도 대상 검사가 맞는지 다시 확인한다).
// 4) 한 쪽씩 올린다. 올리면 그 아이는 「채점 중」이 되고 담당자가 스캔본을 보며 쓰기를 채점한다.
// 판독이 어려운 스캔본은 담당자가 담임에게 직접 연락한다 — 앱 안의 「다시 올려 달라」 요청은 두지 않는다.
'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/Badge'
import { Select } from '@/components/Select'
import { Spinner } from '@/components/Spinner'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import {
  candidatesFor, isEligible, mappingStatus, proposeMapping,
  type PageChoice, type PagePlan, type PageProblem, type ScanTarget,
} from '@/lib/scan-mapping'
import { readScanFiles, releasePages, ScanReadError, scanReadErrorText, type ScanPageImage } from '@/lib/scan-pages'

/** 동시에 올리는 쪽 수 — 한 반 25장을 차례로 올리면 오래 걸리고, 한꺼번에 보내면 학교 회선이 막힌다. */
const UPLOAD_CONCURRENCY = 3
/** 한 장 올리기 시간 제한 — 학교망에서 요청 하나가 멈추면 「올리는 중」에서 영영 못 벗어난다. 실패로 넘겨 다시 올리게 한다. */
const UPLOAD_TIMEOUT_MS = 90_000

type Phase = 'reading' | 'review' | 'uploading' | 'done'
/** retry: 다시 보내면 될 수도 있는 실패(연결·시간 초과·5xx·429). 나머지 4xx는 다시 보내도 같은 답이다 —
 *  채점이 시작됐거나 대상이 바뀐 쪽에 「다시 올리기」를 권하면 눌러도 계속 실패한다. */
type PageResult = { ok: true } | { ok: false; error: string; retry: boolean }

// 조사는 이름 뒤에 붙이지 않는다(「박지호은(는)」) — 「학생」 뒤에 붙여 받침과 무관하게 맞게 읽힌다.
const SKIP_REASON: Record<Exclude<PageProblem, 'unreadable' | 'duplicate' | 'retest'>, (who: string) => string> = {
  otherClass: () => '다른 반 기록지예요',
  blank: () => '빈 쪽이에요',
  noChild: who => `이 반에 ${who} 검사 기록이 없어요`,
  screen: who => `${who} 학생은 화면에서 쓰기를 표시했어요`,
  scored: who => `${who} 학생은 담당자 채점이 시작돼 바꿀 수 없어요`,
  unsubmitted: who => `${who} 학생의 검사가 아직 제출되지 않았어요`,
}

const monthDay = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })

export function ScanUpload({ token, sheetTag, targets, onUploaded, refreshTargets }: {
  token: string
  /** 이 반의 기록지 QR 반 표시 */
  sheetTag: string
  /** 아이마다 스캔본이 붙을 검사(lib/results-view scanTargets) */
  targets: ScanTarget[]
  /** 올리기를 마치고 창을 닫았다 — 결과 표를 다시 받는다 */
  onUploaded: () => void
  /** 결과 목록을 다시 받아 대상을 돌려준다(실패하면 null — 가진 목록으로 짝짓고, 서버가 대상을 다시 확인한다) */
  refreshTargets?: () => Promise<ScanTarget[] | null>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase | null>(null)
  const [readErr, setReadErr] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [fileLabel, setFileLabel] = useState('')
  /** 여러 파일을 골랐으면 쪽마다 어느 파일의 몇 쪽인지 함께 보인다 */
  const [multiFile, setMultiFile] = useState(false)
  const [sent, setSent] = useState({ done: 0, total: 0 })
  const [pages, setPages] = useState<ScanPageImage[]>([])
  const [plans, setPlans] = useState<PagePlan[]>([])
  const [choices, setChoices] = useState<PageChoice[]>([])
  /** 드롭다운을 펼친 쪽 — 처음에는 정하지 못한 쪽만 펼친다 */
  const [editing, setEditing] = useState<Set<number>>(new Set())
  const [results, setResults] = useState<Map<number, PageResult>>(new Map())
  const [zoom, setZoom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  /** 짝지을 때 쓴 대상 — 확인 창은 이것으로 이름·후보·상태를 보인다(짝짓기와 같은 목록이어야 한다) */
  const [snap, setSnap] = useState<ScanTarget[] | null>(null)
  const live = snap ?? targets
  const titleRef = useRef<HTMLHeadingElement>(null)
  const zoomCloseRef = useRef<HTMLButtonElement>(null)
  /** 크게 보기를 연 버튼 — 닫으면 그리로 포커스를 돌려준다 */
  const zoomOpenerRef = useRef<HTMLElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const pagesRef = useRef<ScanPageImage[]>([])
  useEffect(() => { pagesRef.current = pages }, [pages])
  // 화면을 떠나면 그림 URL을 풀고 읽기를 멈춘다
  useEffect(() => () => { abortRef.current?.abort(); releasePages(pagesRef.current) }, [])
  // 입구 카드 밖에 파일을 떨어뜨리면 브라우저가 그 파일을 열어 결과지 화면을 떠난다 — 이 화면에서는 막는다
  useEffect(() => {
    const block = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    window.addEventListener('dragover', block); window.addEventListener('drop', block)
    return () => { window.removeEventListener('dragover', block); window.removeEventListener('drop', block) }
  }, [])
  // 크게 보기: 열면 [닫기]로, 닫으면 연 버튼으로
  useEffect(() => {
    if (zoom !== null) zoomCloseRef.current?.focus()
    else { zoomOpenerRef.current?.focus(); zoomOpenerRef.current = null }
  }, [zoom])
  const openZoom = (i: number, opener: HTMLElement) => { zoomOpenerRef.current = opener; setZoom(i) }

  const byNo = useMemo(() => new Map(live.map(t => [t.childNo, t])), [live])
  const who = (no: number) => { const t = byNo.get(no); return t ? `${no}번 ${t.name}` : `${no}번` }
  const busy = phase === 'reading' || phase === 'uploading'

  const reset = useCallback(() => {
    abortRef.current?.abort()
    releasePages(pagesRef.current)
    setPages([]); setPlans([]); setChoices([]); setEditing(new Set()); setResults(new Map()); setZoom(null); setSnap(null)
    setPhase(null)
  }, [])

  async function start(list: File[]) {
    if (list.length === 0) return
    setReadErr('')
    setFileLabel(list.length === 1 ? list[0].name : `파일 ${list.length}개`)
    setMultiFile(list.length > 1)
    setProgress({ done: 0, total: 0 })
    setPhase('reading')
    const ac = new AbortController()
    abortRef.current = ac
    try {
      // 목록 다시 받기는 쪽 읽기와 함께 돈다 — 기다리는 시간이 늘지 않게
      const fresh = (refreshTargets?.() ?? Promise.resolve(null)).catch(() => null)
      const read = await readScanFiles(list, (done, total) => setProgress({ done, total }), ac.signal)
      const now = (await fresh) ?? targets
      if (ac.signal.aborted) { releasePages(read); return }
      const proposed = proposeMapping(read.map(p => ({ index: p.index, qr: p.qr, blank: p.blank })), sheetTag, now)
      setSnap(now)
      setPages(read); setPlans(proposed); setChoices(proposed.map(p => p.choice))
      setEditing(new Set(proposed.filter(p => p.choice === null).map(p => p.index)))
      setResults(new Map())
      setPhase('review')
    } catch (e) {
      if (ac.signal.aborted) return
      setPhase(null)
      setReadErr(e instanceof ScanReadError ? scanReadErrorText(e) : '파일을 읽지 못했어요. 다시 시도해 주세요.')
    }
  }

  const status = useMemo(() => mappingStatus(choices, live), [choices, live])
  const waitCount = live.filter(t => t.state === 'wait').length
  const linkedWait = choices.filter(c => typeof c === 'number' && byNo.get(c)?.state === 'wait').length
  const replacing = choices.filter(c => typeof c === 'number' && byNo.get(c)?.state === 'uploaded').length
  const autoCount = plans.filter((p, i) => p.problem === null && choices[i] === p.choice).length
  const skipCount = choices.filter(c => c === 'skip').length

  const listRef = useRef<HTMLUListElement>(null)
  /** 다음 남은 쪽으로 — 지금 보이는 곳보다 아래의 첫 남은 쪽, 없으면 처음부터 */
  const gotoUndecided = () => {
    const list = listRef.current
    if (!list) return
    const cards = [...list.querySelectorAll<HTMLElement>('[data-undecided="1"]')]
    const top = list.scrollTop + 8
    const next = cards.find(c => c.offsetTop - list.offsetTop > top) ?? cards[0]
    next?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const choose = (i: number, v: string) => {
    setChoices(prev => prev.map((c, k) => (k === i ? (v === 'skip' ? 'skip' : Number(v)) : c)))
    setEditing(prev => { const n = new Set(prev); n.delete(i); return n })
  }

  async function upload(onlyFailed = false) {
    const jobs = pages.filter((p, i) => {
      if (typeof choices[i] !== 'number') return false
      const r = results.get(i)
      return !onlyFailed || (r !== undefined && !r.ok && r.retry)
    })
    if (jobs.length === 0) return
    setPhase('uploading')
    setSent({ done: 0, total: jobs.length })
    const next = new Map(results)
    let cursor = 0
    const worker = async () => {
      while (cursor < jobs.length) {
        const p = jobs[cursor++]
        const target = byNo.get(choices[p.index] as number)!
        const fd = new FormData()
        fd.append('sessionId', target.sessionId)
        fd.append('file', p.blob, `scan-${p.index + 1}.jpg`)
        try {
          const res = await fetch(`/api/results/${token}/scans`, { method: 'POST', body: fd, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) })
          if (res.ok) next.set(p.index, { ok: true })
          else {
            const j = await res.json().catch(() => ({})) as { error?: string }
            next.set(p.index, { ok: false, error: j.error ?? '올리지 못했어요.', retry: res.status === 429 || res.status >= 500 })
          }
        } catch (e) {
          next.set(p.index, { ok: false, retry: true, error: (e as { name?: string })?.name === 'TimeoutError'
            ? '시간이 너무 오래 걸려 멈췄어요.' : '연결에 문제가 생겼어요.' })
        }
        setResults(new Map(next))
        setSent(s => ({ ...s, done: s.done + 1 }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, jobs.length) }, worker))
    setPhase('done')
  }

  // 올리는 중에 탭을 닫으면 일부만 올라간다 — 브라우저 기본 경고에 맡긴다(검사 화면과 같은 방식)
  useEffect(() => {
    if (phase !== 'uploading') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  const uploadedOk = [...results.values()].filter(r => r.ok).length
  const failed = [...results.entries()].filter(([, r]) => !r.ok) as [number, { ok: false; error: string; retry: boolean }][]
  const retryable = failed.filter(([, r]) => r.retry)
  const blocked = failed.filter(([, r]) => !r.retry)
  const pageList = (xs: typeof failed) => xs.map(([i]) => `${i + 1}쪽`).join(', ')
  const finish = () => { const any = uploadedOk > 0; reset(); if (any) onUploaded() }

  const open = phase !== null
  // Esc는 크게 보기만 닫는다. 확인 창은 [취소]로만 닫는다 — 쪽마다 고른 것이 Esc 한 번에 사라지지 않게
  // (바깥 누르기도 같은 이유로 막았다). 다 올린 뒤에는 Esc로 닫아도 잃을 것이 없다.
  const onEscape = () => {
    if (zoom !== null) { setZoom(null); return }
    // 다 올린 뒤에는 잃을 것이 없을 때만 — 다시 올릴 쪽이 남았으면 Esc 한 번에 80쪽을 다시 읽게 된다
    if (phase === 'done' && retryable.length === 0) finish()
  }
  /** 남은 쪽을 한꺼번에 「올리지 않음」 — 양면 스캔으로 빈 뒷면이 섞였을 때 쪽마다 드롭다운을 열지 않게 */
  const skipRest = () => {
    setChoices(prev => prev.map(c => (c === null ? 'skip' : c)))
    setEditing(new Set())
  }
  const trapRef = useFocusTrap(open, onEscape)
  // 단계가 바뀌면(읽는 중 → 확인 → 완료) 누르던 버튼이 사라져 포커스가 창 밖으로 떨어진다 — 제목으로 옮긴다.
  // ⚠️ 트랩(바로 위) **뒤에** 둔다 — 앞에 두면 트랩이 창 안의 이 제목을 「닫을 때 돌아갈 곳」으로 잡아,
  // 닫으면 사라진 제목으로 가려다 포커스가 body로 떨어진다(트랩은 열릴 때의 포커스를 기억한다).
  useEffect(() => { if (phase) titleRef.current?.focus() }, [phase])
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <>
      {/* 입구 — 반 전체 검사가 끝난 뒤 선생님이 한 번 올린다(시안 5). 올릴 수 있는 아이가 없으면 숨긴다
          (확인 창은 그대로 — 확인하는 사이 목록이 바뀌어도 고른 것이 사라지지 않게) */}
      {targets.some(isEligible) && <section
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (!busy) void start([...e.dataTransfer.files]) }}
        className={`card mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 p-4 transition ${dragOver ? 'ring-2 ring-blue' : ''}`}>
        <span aria-hidden className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-blue/10 text-xl text-blue">⇪</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold">쓰기 스캔본 올리기</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-soft">반 전체를 한 파일로 올리면 아이마다 자동으로 나눠 붙어요.</p>
          <p className="text-[12px] leading-relaxed text-ink-mute">종이는 담당자 채점이 끝날 때까지 보관해 주세요.</p>
        </div>
        {/* disabled로 막지 않는다 — 창이 뜨는 렌더에서 누른 버튼이 disabled가 되면 브라우저가 포커스를 body로 옮기고,
            트랩이 그 body를 「닫을 때 돌아갈 곳」으로 기억한다. 창이 떠 있는 동안은 창이 가리고 키보드도 창 안에 갇힌다 */}
        <button type="button" onClick={() => { if (!busy) inputRef.current?.click() }}
          className="btn-outline h-[42px] px-5 text-[14px]">파일 선택</button>
        <input ref={inputRef} type="file" hidden multiple accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          onChange={e => { const l = [...(e.target.files ?? [])]; e.target.value = ''; void start(l) }} />
        {readErr && <p role="alert" className="w-full text-[13px] text-rec-deep">{readErr}</p>}
      </section>}

      {open && (
        // 바깥을 눌러도 닫지 않는다 — 쪽마다 고른 것이 한 번에 사라진다. 닫기는 [취소]로만(다 올린 뒤에는 [닫기]·Esc).
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-3 sm:p-6">
          <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="scan-dialog-title"
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col rounded-[20px] bg-white shadow-xl"
            onClick={e => e.stopPropagation()}>
            {phase === 'reading' ? (
              <div className="flex flex-col items-center gap-3 p-10 text-center">
                <h2 id="scan-dialog-title" ref={titleRef} tabIndex={-1} className="text-lg font-bold outline-none">스캔본을 읽는 중이에요</h2>
                <Spinner className="h-8 w-8 text-blue" />
                <p aria-live="polite" className="text-[13px] text-ink-soft">
                  {progress.total > 0 ? `${progress.done} / ${progress.total}쪽` : '파일을 여는 중…'}
                </p>
                <button type="button" onClick={reset} className="btn-ghost mt-2 h-[44px] w-40">취소</button>
              </div>
            ) : (
              // 크게 보기가 떠 있는 동안 뒤쪽은 막는다(inert) — Tab이 가려진 카드들을 돌지 않게
              <div className="contents" inert={zoom !== null}>
                <div className="border-b border-line px-5 pb-3 pt-5 sm:px-6">
                  <h2 id="scan-dialog-title" ref={titleRef} tabIndex={-1} className="text-lg font-bold outline-none">
                    {phase === 'done'
                      ? (uploadedOk === 0 ? '스캔본을 올리지 못했어요' : failed.length > 0 ? '일부 쪽을 올리지 못했어요' : '스캔본을 올렸어요')
                      : phase === 'uploading' ? '스캔본을 올리는 중이에요' : '스캔본을 확인해 주세요'}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-soft">
                    <b className="max-w-[16rem] truncate text-ink">{fileLabel}</b> · {pages.length}쪽
                    {phase !== 'done' && <>
                      {autoCount > 0 && <Badge tone="mint" size="sm">자동 연결 {autoCount}쪽</Badge>}
                      {status.undecided > 0 && <Badge tone="amber" size="sm">확인 필요 {status.undecided}쪽</Badge>}
                      {skipCount > 0 && <Badge tone="mute" size="sm">올리지 않음 {skipCount}쪽</Badge>}
                    </>}
                  </p>
                </div>

                <ul ref={listRef} className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
                  {pages.map((p, i) => {
                    const plan = plans[i]
                    const c = choices[i]
                    const r = results.get(i)
                    const isEditing = editing.has(i) && !busy && phase !== 'done'
                    const need = c === null
                    const options = [
                      ...candidatesFor(i, choices, live).map(t => ({
                        value: String(t.childNo), label: `${t.childNo}번 ${t.name}`,
                        badge: t.state === 'wait' ? '스캔 대기' : '이미 올림',
                      })),
                      { value: 'skip', label: '올리지 않음' },
                    ]
                    return (
                      <li key={p.index} data-undecided={need ? '1' : undefined} className={`flex scroll-mt-4 flex-col rounded-2xl border-[1.5px] p-3 ${
                        need ? 'border-amber/60 bg-amber/[0.04]' : 'border-line bg-well/50'}`}>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="font-bold text-ink-mute">
                            {i + 1}쪽{multiFile && <span className="font-normal"> · {p.source} {p.pageNo}쪽</span>}
                          </span>
                          <button type="button" onClick={e => openZoom(i, e.currentTarget)} className="font-bold text-blue">크게 보기</button>
                        </div>
                        <button type="button" onClick={e => openZoom(i, e.currentTarget)} aria-label={`${i + 1}쪽 크게 보기`}
                          className="mt-2 overflow-hidden rounded-lg border border-line bg-white">
                          {/* 이 기기에서 만든 blob URL이다 — next/image 최적화 대상이 아니다 */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.thumbUrl} alt={`${i + 1}쪽 미리보기`} className="aspect-[210/297] w-full object-contain" />
                        </button>
                        <div className="mt-2.5 min-h-[4.5rem] text-[13px]">
                          {r ? (
                            r.ok
                              ? <><Badge tone="mint" size="sm">✓ 올렸어요</Badge>
                                  <p className="mt-1 font-bold">{typeof c === 'number' ? who(c) : ''}</p></>
                              : <><Badge tone="rec" size="sm">올리지 못했어요</Badge>
                                  <p className="mt-1 font-bold">{typeof c === 'number' ? who(c) : ''}</p>
                                  <p className="text-[12.5px] text-rec-deep">{r.error}</p></>
                          ) : isEditing || need ? (
                            <>
                              {need && <Badge tone="amber" size="sm">확인 필요</Badge>}
                              <p className="mt-1 text-[12.5px] font-bold text-amber">
                                {plan.problem === 'duplicate' && plan.qrChildNo !== null
                                  ? `${who(plan.qrChildNo)} 학생 기록지가 앞 쪽에 이미 있어요. 누구 기록지인지 골라 주세요`
                                  : plan.problem === 'retest' && plan.qrChildNo !== null
                                    ? `${who(plan.qrChildNo)} 학생은 재검사를 했어요. ${
                                      byNo.get(plan.qrChildNo)?.testedAt ? `${monthDay(byNo.get(plan.qrChildNo)!.testedAt!)} ` : '최근 '
                                    }검사 때 쓴 기록지가 맞으면 골라 주세요`
                                    : '누구 기록지인지 골라 주세요'}
                              </p>
                              <Select size="sm" className="mt-1.5" ariaLabel={`${i + 1}쪽 누구 기록지인지`} placeholder="학생 선택"
                                value={c === null ? '' : String(c)} options={options} onChange={v => choose(i, v)}
                                disabled={busy} />
                            </>
                          ) : typeof c === 'number' ? (
                            <>
                              <Badge tone={plan.problem === null && c === plan.choice ? 'mint' : 'blue'} size="sm">
                                {plan.problem === null && c === plan.choice ? '✓ 자동 연결' : '직접 고름'}
                              </Badge>
                              <p className="mt-1 text-[15px] font-bold">{who(c)}</p>
                              <p className="text-[12px] text-ink-mute">
                                {byNo.get(c)?.state === 'uploaded' ? '이미 올린 스캔본을 이 쪽으로 바꿔요' : '올리면 담당자 채점 차례(채점 중)로 넘어가요'}
                              </p>
                            </>
                          ) : (
                            <>
                              <Badge tone="mute" size="sm">올리지 않음</Badge>
                              <p className="mt-1 text-[12.5px] text-ink-soft">
                                {plan.problem && plan.problem in SKIP_REASON
                                  ? SKIP_REASON[plan.problem as keyof typeof SKIP_REASON](plan.qrChildNo !== null ? who(plan.qrChildNo) : '')
                                  : '올리지 않기로 했어요'}
                              </p>
                            </>
                          )}
                          {!r && !isEditing && !need && !busy && phase !== 'done' && (
                            <button type="button" onClick={() => setEditing(prev => new Set(prev).add(i))}
                              className="mt-1 text-[12px] font-bold text-blue underline underline-offset-2">바꾸기</button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <div className="border-t border-line px-5 pb-5 pt-3 sm:px-6">
                  {phase === 'done' ? (
                    <div aria-live="polite" className="rounded-xl bg-well px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-soft">
                      {uploadedOk > 0 && <><b className="text-ink">{uploadedOk}쪽</b>을 올렸어요. 담당자가 채점하면 결과지에 쓰기 점수가 나와요.</>}
                      {retryable.length > 0 && (
                        <p className={uploadedOk > 0 ? 'mt-1 text-rec-deep' : 'text-rec-deep'}>
                          {retryable.length}쪽은 올리지 못했어요({pageList(retryable)}). 다시 올려 주세요.
                        </p>
                      )}
                      {blocked.length > 0 && (
                        <p className={uploadedOk > 0 || retryable.length > 0 ? 'mt-1 text-rec-deep' : 'text-rec-deep'}>
                          {blocked.length}쪽은 올릴 수 없었어요({pageList(blocked)}) — 쪽마다 까닭을 확인해 주세요.
                        </p>
                      )}
                      {/* 스캔 파일에는 아이 이름과 필적이 있다 — 올린 뒤 교실 PC에 남기지 않게 한 줄 알린다.
                          다시 올릴 쪽이 남았으면 아직 파일이 필요할 수 있어 알리지 않는다 */}
                      {uploadedOk > 0 && retryable.length === 0 && (
                        <p className="mt-1 text-[12px] text-ink-mute">컴퓨터에 남은 스캔 파일은 지워 주세요(종이 기록지는 채점이 끝날 때까지 보관).</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-well px-3.5 py-2.5 text-[13px] text-ink-soft">
                      {status.undecided > 0
                        // 쪽이 많으면 정할 쪽이 화면 밖에 있다 — 누르면 다음 남은 쪽으로 간다
                        ? <button type="button" onClick={gotoUndecided} className="rounded-full focus-visible:outline-2"
                            aria-label={`남은 ${status.undecided}쪽으로 가기`}>
                            <Badge tone="amber" size="sm">{status.undecided}쪽 남음 ↓</Badge>
                          </button>
                        : <Badge tone="mint" size="sm">모두 정했어요</Badge>}
                      <span>
                        스캔 대기 {waitCount}명 중 <b className="text-ink">{linkedWait}명 연결</b>
                        {replacing > 0 && <> · 바꾸는 스캔본 {replacing}장</>}
                        {status.undecided > 0 && (status.missing.length > 0
                          ? ' · 남은 쪽을 골라 주시면 모두 연결돼요.'
                          : ' · 남은 쪽은 다른 학생이나 「올리지 않음」으로 정해 주세요.')}
                      </span>
                      {status.undecided > 1 && (
                        <button type="button" onClick={skipRest}
                          className="ml-auto text-[12px] font-bold text-ink-soft underline underline-offset-2">
                          남은 {status.undecided}쪽 모두 올리지 않음
                        </button>
                      )}
                      {status.missing.length > 0 && (
                        <span className="w-full text-[12px] text-ink-mute">
                          {status.undecided > 0 ? '아직 연결 안 된' : '연결되지 않은'} 스캔 대기:{' '}
                          {status.missing.slice(0, 8).map(t => `${t.childNo}번 ${t.name}`).join(', ')}
                          {status.missing.length > 8 && ` 외 ${status.missing.length - 8}명`}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2.5">
                    {phase === 'done' ? (
                      <>
                        {retryable.length > 0 && (
                          <button type="button" onClick={() => void upload(true)} className="btn-outline h-[50px] flex-1">
                            실패한 {retryable.length}쪽 다시 올리기
                          </button>
                        )}
                        <button type="button" onClick={finish} className="btn-primary h-[50px] flex-[2]">닫기</button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={reset} disabled={busy} className="btn-ghost h-[50px] flex-1">취소</button>
                        <button type="button" onClick={() => void upload()} disabled={!status.canConfirm || busy}
                          className="btn-primary h-[50px] flex-[2]">
                          {phase === 'uploading'
                            ? `올리는 중… ${sent.done} / ${sent.total}`
                            : `올리기 (${status.uploading}쪽)`}
                        </button>
                      </>
                    )}
                  </div>
                  {phase === 'review' && !status.canConfirm && (
                    <p className="mt-1.5 text-right text-[12px] text-ink-mute">
                      {status.undecided > 0 ? '모든 쪽을 정하면 눌러요' : '올릴 쪽이 없어요'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 크게 보기 — 쪽 그림에 찍힌 이름·번호를 확인한다. 좌우로 넘길 수 있다. */}
            {zoom !== null && pages[zoom] && (
              <div role="dialog" aria-modal="true" aria-label={`${zoom + 1}쪽 크게 보기`}
                className="fixed inset-0 z-[60] flex flex-col bg-ink/80 p-3 sm:p-6" onClick={() => setZoom(null)}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-bold text-white" onClick={e => e.stopPropagation()}>
                  <span>{zoom + 1}쪽 / {pages.length}쪽</span>
                  <span className="flex gap-2">
                    <button type="button" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}
                      className="rounded-lg bg-white/15 px-3 py-1.5 disabled:opacity-40">◀ 앞 쪽</button>
                    <button type="button" disabled={zoom === pages.length - 1} onClick={() => setZoom(zoom + 1)}
                      className="rounded-lg bg-white/15 px-3 py-1.5 disabled:opacity-40">뒤 쪽 ▶</button>
                    <button ref={zoomCloseRef} type="button" onClick={() => setZoom(null)} className="rounded-lg bg-white px-3 py-1.5 text-ink">닫기</button>
                  </span>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pages[zoom].fullUrl} alt={`${zoom + 1}쪽`} onClick={e => e.stopPropagation()}
                  className="mx-auto mt-3 min-h-0 flex-1 rounded-lg bg-white object-contain" />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
