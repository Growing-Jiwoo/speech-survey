// components/admin/SheetsDialog.tsx — 「결과지 받기」 창. 관리자 목록 머리의 버튼으로 연다(담당자 요청 2026-10-24 「관리자도 학교,
// 학급별로 전체 기록지 다운」). 학교마다 반별 준비 현황(받을 수 있는 아이·쓰기 채점 전·아직 못 받는 아이)을 보여 주고 반별 파일과
// 학교 전체 파일을 받는다. 반별 파일은 교사 결과지의 [전체 PDF 다운로드]와 같다(lib/pdf/class-sheets). 학교 전체는 반별 파일을
// 브라우저에서 학년·반 순서로 이어 붙인 것이다(lib/download fetchMergedPdf — 서버가 한 응답으로 만들면 응답 크기 상한에 걸린다).
// 처음에는 학교를 골라야 나타나는 줄이었는데, 고르기 전에는 기능이 있는지 알 수 없고 반마다 몇 명이 채점됐는지도 눌러 봐야
// 알았다(사용자 요청 2026-10-24 「개편」). 이 창 방식은 담당자 확정(2026-10-24 — 두 안의 비교 이미지에서 2안을 골랐다, 사용자 전달).
// 학교는 한 줄로 접어 둔다. 학교가 30~40곳이면 반까지 다 펼친 목록은 한 화면에 네댓 곳만 보여 아홉 화면을 넘겨야 했다
// (사용자 확인 2026-10-24). 학교 줄에 요약과 받기 버튼을 두고, 누르면 반이 펼쳐진다.
'use client'
import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { classSheetSummaries, kstDateKey, type ClassSheetSummary } from '@/lib/adminStats'
import type { SessionListRow } from '@/lib/db'
import { fetchFile, fetchMergedPdf, saveBlobAs } from '@/lib/download'
import { gradeClassLabel } from '@/lib/format'
import { useFocusTrap } from '@/hooks/useFocusTrap'

const FAIL = '결과지를 받지 못했어요. 다시 시도해 주세요.'
/** 찾기로 이만큼 이하가 남으면 접지 않고 펼쳐 보인다 */
const AUTO_OPEN = 3
const url = (c: ClassSheetSummary) => `/api/admin/codes/${c.classCodeId}/sheets.pdf`
const label = (c: ClassSheetSummary) => `${gradeClassLabel(c.grade, c.classNo)} ${c.teacher}`

/** 현황 한 줄 — 항목 사이에서만 줄을 바꾼다(항목마다 nowrap) */
function Status({ ready, children, writingPending, prefix }: { ready: number; children: number; writingPending: number; prefix?: string }) {
  return (
    <span className="text-[12.5px] text-ink-soft">
      {prefix && <><span className="whitespace-nowrap">{prefix}</span>{' '}<span className="whitespace-nowrap">·</span>{' '}</>}
      <span className="whitespace-nowrap">결과지 <b className="tabular-nums text-ink">{ready}</b>/{children}명</span>
      {writingPending > 0 && <>{' '}<span className="whitespace-nowrap text-amber">· 쓰기 채점 전 {writingPending}명</span></>}
      {children - ready > 0 && <>{' '}<span className="whitespace-nowrap text-ink-mute">· 읽기 채점 전 {children - ready}명은 빠져요</span></>}
    </span>
  )
}

/** 열 때만 그린다(부모가 조건부로 둔다) — 그래서 열 때마다 찾기 칸과 안내가 새로 시작한다 */
export function SheetsDialog({ sessions, initialSchool, loginHref, onClose }: {
  sessions: SessionListRow[]
  /** 목록에 학교 필터가 걸려 있으면 그 학교로 찾은 채 연다 */
  initialSchool: string | null
  loginHref: string
  onClose: () => void
}) {
  const titleId = useId()
  /** 만드는 중인 대상(반이면 학급 코드 id, 학교 전체면 'school:학교') */
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const [msg, setMsg] = useState<{ key: string; text: string; tone: 'err' | 'warn'; login?: boolean } | null>(null)
  const [q, setQ] = useState(initialSchool ?? '')
  /** 사용자가 펼친 학교 */
  const [opened, setOpened] = useState<Set<string>>(() => new Set(initialSchool ? [initialSchool] : []))
  const close = () => { if (!busy) onClose() }
  const trapRef = useFocusTrap(true, close)

  // 떠 있는 동안 배경 스크롤을 잠근다(ConfirmDialog와 같다)
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const schools = useMemo(() => classSheetSummaries(sessions), [sessions])
  const shown = schools.filter(s => s.school.includes(q.trim()))
  const classCount = schools.reduce((n, s) => n + s.classes.length, 0)
  // 찾기로 몇 곳만 남으면 펼쳐 둔다. 펼친 목록에 넣으므로 눌러서 다시 접을 수 있다
  const search = (v: string) => {
    setQ(v)
    const hits = schools.filter(s => s.school.includes(v.trim()))
    if (v.trim() !== '' && hits.length <= AUTO_OPEN) setOpened(prev => new Set([...prev, ...hits.map(s => s.school)]))
  }
  const toggle = (school: string) => setOpened(prev => {
    const next = new Set(prev)
    if (next.has(school)) next.delete(school); else next.add(school)
    return next
  })

  async function downloadClass(c: ClassSheetSummary) {
    setBusy(c.classCodeId); setMsg(null)
    const res = await fetchFile(url(c), 'sheets.pdf', FAIL)
    setBusy(null)
    if (!res.ok) { setMsg({ key: c.classCodeId, text: res.error, tone: 'err', login: res.status === 401 }); return }
    saveBlobAs(res.blob, res.name)
  }
  async function downloadSchool(school: string, classes: ClassSheetSummary[]) {
    const key = `school:${school}`
    setBusy(key); setDone(0); setMsg(null)
    const res = await fetchMergedPdf(classes.map(c => ({ url: url(c), label: label(c) })), FAIL, setDone)
    setBusy(null)
    if (!res.ok) { setMsg({ key, text: res.error, tone: 'err', login: res.status === 401 }); return }
    // 반별 파일 이름(학교_1-2_결과지_전체_날짜)과 같은 꼴
    saveBlobAs(res.blob, `${school}_결과지_전체_${kstDateKey(new Date())}.pdf`)
    if (res.skipped.length > 0) setMsg({ key, text: `결과지가 없는 반은 빼고 받았어요: ${res.skipped.join(', ')}`, tone: 'warn' })
  }
  const note = (key: string) => msg?.key === key && (
    <p role={msg.tone === 'err' ? 'alert' : undefined}
      className={`mt-1.5 break-keep text-[12.5px] ${msg.tone === 'err' ? 'text-rec-deep' : 'text-amber'}`}>
      {msg.text}
      {msg.login && <>{' '}<Link href={loginHref} className="font-bold text-blue underline">다시 로그인</Link></>}
    </p>
  )
  const btn = 'shrink-0 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-bold transition disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 sm:p-6" onClick={close}>
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[20px] bg-white shadow-xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold">결과지 받기</h2>
            {schools.length > 0 && <p className="text-[12px] text-ink-mute">학교 {schools.length}곳 · 반 {classCount}개</p>}
          </div>
          <input type="search" aria-label="학교 찾기" value={q} onChange={e => search(e.target.value)} placeholder="학교 찾기"
            className="ml-auto h-9 w-40 rounded-xl border-[1.5px] border-line bg-well px-3 text-sm outline-none transition focus:border-blue sm:w-52" />
          <button type="button" onClick={close} disabled={busy !== null} aria-label="닫기"
            className="-mr-1 rounded-lg px-2 py-1 text-xl leading-none text-ink-mute transition hover:text-ink disabled:opacity-40">×</button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-3 py-2">
          {shown.length === 0 && (
            <p className="py-8 text-center text-sm text-ink-mute">{schools.length === 0 ? '아직 검사한 학급이 없어요.' : '찾는 학교가 없어요.'}</p>
          )}
          {shown.map(({ school, classes }) => {
            const readyClasses = classes.filter(c => c.ready > 0)
            const key = `school:${school}`
            const open = opened.has(school)
            const sum = classes.reduce((a, c) => ({ ready: a.ready + c.ready, children: a.children + c.children, writingPending: a.writingPending + c.writingPending }),
              { ready: 0, children: 0, writingPending: 0 })
            const only = classes.length === 1 ? classes[0] : null
            return (
              <section key={school} className="border-b border-line/70 last:border-b-0">
                <div className="flex items-center gap-2 py-2.5">
                  {/* 반이 하나면 펼칠 것이 없다(그 반이 학교 줄에 다 나온다) — 누를 수 없는 줄로 두고 ▶ 자리만 비워 이름 줄을 맞춘다 */}
                  {only ? (
                    <div className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1">
                      <span aria-hidden className="invisible mt-0.5 inline-block text-[11px]">▶</span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-bold">{school}</span>
                        <Status {...sum} prefix={label(only)} />
                      </span>
                    </div>
                  ) : (
                    <button type="button" onClick={() => toggle(school)} aria-expanded={open}
                      className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-well">
                      {/* inline-block이어야 rotate가 먹는다 */}
                      <span aria-hidden className={`mt-0.5 inline-block text-[11px] text-ink-mute transition ${open ? 'rotate-90' : ''}`}>▶</span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-bold">{school}</span>
                        <Status {...sum} prefix={`${classes.length}개 반`} />
                      </span>
                    </button>
                  )}
                  {/* 반이 하나면 그 반을 바로 받는다(학교 전체가 그 반 파일과 같다). 둘 이상이면 받을 수 있는 반만 이어 붙인다 */}
                  {only ? (
                    <button type="button" onClick={() => void downloadClass(only)} disabled={busy !== null || only.ready === 0}
                      className={`${btn} border-line bg-white text-ink-soft hover:border-blue`}>
                      {busy === only.classCodeId ? '만드는 중…' : '받기'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => void downloadSchool(school, readyClasses)} disabled={busy !== null || readyClasses.length === 0}
                      className={`${btn} border-blue bg-blue/5 text-blue hover:bg-blue/10`}>
                      {busy === key ? `만드는 중… ${done}/${readyClasses.length}` : '학교 전체 받기'}
                    </button>
                  )}
                </div>
                <div className="px-2">{note(key)}{only && note(only.classCodeId)}</div>
                {open && !only && (
                  <ul className="mb-3 ml-6 flex flex-col gap-1.5">
                    {classes.map(c => (
                      <li key={c.classCodeId} className="rounded-xl bg-well px-3 py-2.5">
                        {/* [받기]는 늘 오른쪽에 둔다 */}
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold">{label(c)}</p>
                            <Status {...c} />
                          </div>
                          <button type="button" onClick={() => void downloadClass(c)} disabled={busy !== null || c.ready === 0}
                            className={`${btn} border-line bg-white text-ink-soft hover:border-blue`}>
                            {busy === c.classCodeId ? '만드는 중…' : '받기'}
                          </button>
                        </div>
                        {note(c.classCodeId)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>

        <p className="break-keep border-t border-line bg-well px-5 py-3 text-[12px] leading-relaxed text-ink-soft">
          반별 파일은 선생님이 받는 「전체 PDF」와 같아요. 아이마다 읽기 채점이 끝난 가장 최근 검사 한 장이 번호순으로 들어가요.
          쓰기 채점 전인 아이는 쓰기·최종결과 칸이 비어 나가요.
        </p>
      </div>
    </div>
  )
}
