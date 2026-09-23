// components/results/ResultsView.tsx — 교사 결과 페이지(클라이언트).
// GET /api/results/<token>을 읽어 요약·아이별 행·다운로드 버튼을 그린다. 데이터는 토큰이 아니라
// 매 요청 DB에서 오므로 새로고침이 곧 최신 상태다.
// 판정 표기는 관리자 화면과 같은 Pass/Fail(사용자 확정 2026-09-22). 채점 완료(scored)만 체크·다운로드.
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { Blip } from '@/components/Blip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { Spinner } from '@/components/Spinner'
// 폴더만 admin일 뿐 범용 컴포넌트다(관리자 전용 데이터를 알지 않는다).
import { BadgeLegend } from '@/components/admin/BadgeLegend'
import { gradeClassLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { latestScored, latestSession, summarize, type ResultsChild, type ResultsSession } from '@/lib/results'
import type { TaskKey } from '@/lib/scoring'

interface Payload {
  cls: { schoolName: string; grade: number; classNo: number; teacherName: string }
  provisional: boolean
  taskMax: Record<TaskKey, number>
  children: ResultsChild[]
}

const TASKS: { key: TaskKey; label: string }[] = [
  { key: 'wordReading', label: '낱말 해독' },
  { key: 'sentenceReading', label: '문장 읽기' },
  { key: 'writing', label: '쓰기' },
]

const STATUS_LABEL: Record<ResultsSession['status'], string> = {
  scored: '채점 완료', scoring: '채점 중', unsubmitted: '미제출',
}

const kstDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })

/** Pass/Fail 배지 — 관리자 결과지와 같은 색(pass=mint, fail=rec). 세 과제가 다 채점돼야 값이 온다. */
function VerdictPill({ v }: { v: 'pass' | 'fail' | null }) {
  if (!v) return <span className="text-ink-mute">-</span>
  return <Badge tone={v === 'pass' ? 'mint' : 'rec'} size="sm">{v === 'pass' ? 'Pass' : 'Fail'}</Badge>
}

/**
 * 점수 한 칸. **채점되지 않은 과제는 숫자를 찍지 않는다.**
 *
 * A안(사용자 확정 2026-09-22 「관리자와 동일」 — 담당자 회신이 아니라 개발 판단이다):
 * 쓰기는 검사 중 검사자가 넣는 값이라 관리자가 나중에 채울 수 없어, 쓰기가 비어도 scored로 보고
 * 결과지를 내보낸다. 그 대가로 `scores.writing`에 0이 들어오는데 **그 0은 「0점을 받았다」가 아니라
 * 「아직 채점 전」이다.** 그대로 `0/10`으로 찍으면 치르지도 않은 과제에서 낙제한 아동으로 읽힌다 —
 * 임상적 오독이므로 관리자 결과지(components/admin/ResultSheet.tsx)와 같이 「채점 전」으로 그린다.
 * 뜻은 표 아래 범례가 설명한다.
 */
/**
 * 체크박스. `indeterminate`는 HTML 속성이 아니라 **DOM 프로퍼티**라 JSX로 못 준다 — ref로 세운다.
 * 아이 행(상위)이 「일부 차수만 골랐다」를 막대 모양으로 보여 주는 데 쓴다.
 */
function Check({ checked, indeterminate = false, disabled, label, onChange }: {
  checked: boolean; indeterminate?: boolean; disabled?: boolean; label: string
  onChange: (on: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" aria-label={label} checked={checked} disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      className="h-4 w-4 accent-[var(--color-blue)] disabled:opacity-40" />
  )
}

function ScoreCell({ s, task, max }: { s: ResultsSession | null; task: TaskKey; max: number }) {
  if (!s?.scores) return <span className="text-ink-mute">-</span>
  if (s.complete?.[task] === false) return <Badge tone="mute" size="sm">채점 전</Badge>
  return <>{s.scores[task]}/{max}</>
}

/** 상태 코드로 실패를 나눈다 — 401(만료·변조)은 재시도해 봐야 소용없고 404는 학급이 사라진 것. */
class ResultsError extends Error { constructor(readonly status: number) { super('results') } }

export function ResultsView({ token }: { token: string }) {
  // 데이터 로딩은 관리자 화면과 같은 react-query(app/providers.tsx가 전역 클라이언트를 준다) —
  // useEffect + setState로 직접 받으면 효과 안의 동기 setState가 된다.
  const { data, error, refetch } = useQuery<Payload, ResultsError>({
    queryKey: ['results', token],
    queryFn: async () => {
      const r = await requestJson<Payload>(`/api/results/${token}`, { method: 'GET' })
      if (!r.ok) throw new ResultsError(r.status)
      return r.data
    },
    retry: false,
    staleTime: 0,  // 채점 진행을 보러 새로고침하는 화면이다 — 캐시로 옛 상태를 보여주지 않는다.
  })
  /** 체크한 검사들. **처음에는 비어 있다** — 아무것도 고르지 않았는데 버튼이 「선택한 2장」이라고
   *  말하면 교사는 자기가 고른 적 없는 것을 고른 줄 안다(사용자 지적 2026-09-22).
   *  반 전체를 받는 길은 [전체 PDF 다운로드]가 따로 맡는다. */
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [downloading, setDownloading] = useState<'all' | 'picked' | null>(null)
  /** 확인 모달에 띄울 다운로드 종류. 버튼은 이것만 세우고, 실제 요청은 모달의 [내려받기]가 낸다 —
   *  25장 병합은 서버가 몇 초를 쓰는 일이라, 잘못 눌린 클릭 하나로 시작되면 안 된다(사용자 확정 2026-09-22). */
  const [confirmMode, setConfirmMode] = useState<'all' | 'picked' | null>(null)
  const [dlErr, setDlErr] = useState('')

  const err = error ? (error.status === 401 ? 'expired' : error.status === 404 ? 'gone' : 'other') : null

  const summary = useMemo(() => (data ? summarize(data.children) : null), [data])

  /** 확인 모달이 보여 줄 「이 검사들을 받습니다」 명단. 화면이 고른 것과 서버가 담을 것이
   *  같은 기준이어야 하므로(전체=아이당 받을 수 있는 것 중 최신), 여기서도 `latestScored`를 쓴다. */
  const pickList = useMemo(() => {
    const rows: { childNo: number; name: string; attempt: string | null }[] = []
    for (const c of data?.children ?? []) {
      for (const s of c.sessions) {
        const inAll = confirmMode === 'all' && latestScored(c)?.id === s.id
        const inPicked = confirmMode === 'picked' && picked.has(s.id)
        if (inAll || inPicked) {
          rows.push({ childNo: c.childNo, name: c.name, attempt: c.sessions.length > 1 ? `${s.attemptNo}차` : null })
        }
      }
    }
    return rows
  }, [data, confirmMode, picked])

  async function download(mode: 'all' | 'picked') {
    setConfirmMode(null)
    setDownloading(mode); setDlErr('')
    const qs = mode === 'picked' ? `?ids=${[...picked].join(',')}` : ''
    try {
      const res = await fetch(`/api/results/${token}/sheets.pdf${qs}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setDlErr(j.error ?? '결과지를 만들지 못했어요. 다시 시도해 주세요.'); return
      }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') ?? ''
      const name = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? 'results.pdf')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = name; a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      setDlErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally {
      setDownloading(null)
    }
  }

  function toggle(id: string, on: boolean) {
    setPicked(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })
  }

  /** 아이 행(상위) 체크박스 — 그 아이의 **채점 완료 차수 전부**를 한 번에 켜고 끈다.
   *  종전에는 이 칸이 「최신 차수 하나」의 체크박스였다. 펼치면 같은 검사에 체크박스가 둘이 되고,
   *  2차만 고르면 이름 행은 꺼진 채라 상위처럼 보이는 칸이 거짓말을 했다(사용자 지적 2026-09-22). */
  function toggleChild(c: ResultsChild, on: boolean) {
    const ids = c.sessions.filter(x => x.status === 'scored').map(x => x.id)
    setPicked(prev => { const n = new Set(prev); for (const id of ids) { if (on) n.add(id); else n.delete(id) } return n })
  }

  if (err) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h1 className="text-xl font-bold">{err === 'other' ? '결과를 불러오지 못했어요' : '링크가 만료됐어요'}</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        {err === 'other'
          ? <>잠시 후 다시 시도해 주세요.</>
          : <>검사 주소에서 학급 코드를 입력한 뒤<br />[결과지 받기]를 다시 눌러 주세요.</>}
      </p>
      {err === 'other'
        ? <button type="button" onClick={() => void refetch()} className="cta mt-2 max-w-60">다시 시도</button>
        : <Link href="/" className="cta mt-2 max-w-60">검사 주소로 가기</Link>}
      <p className="text-[12px] text-ink-mute">링크가 계속 열리지 않으면 담당자에게 문의해 주세요.</p>
    </main>
  )

  if (!data || !summary) return (
    <main className="flex min-h-dvh items-center justify-center"><Spinner className="h-8 w-8 text-blue" /></main>
  )

  const { cls, children, taskMax, provisional } = data
  const pickedCount = picked.size

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col p-6 pt-8">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">KODYS 결과지</span>
      </div>
      <h1 className="mt-5 text-xl font-bold">{cls.schoolName} {gradeClassLabel(cls.grade, cls.classNo)}</h1>
      <p className="mt-1 text-sm text-ink-soft">담임 {cls.teacherName}</p>

      {/* 상단 요약 — 교사가 진짜 알고 싶은 것("누가 걸렸나")을 표를 훑기 전에 준다(사용자 확정 ④) */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
        <span>검사 <b>{summary.tested}</b>명</span>
        <span>· 채점 완료 <b>{summary.scored}</b>명</span>
        <span>· <b className="text-rec-deep">Fail {summary.fail}</b>명</span>
        {summary.scoring > 0 && <span>· 채점 중 {summary.scoring}명</span>}
        {summary.unsubmitted > 0 && <span>· 미제출 {summary.unsubmitted}명</span>}
        {summary.untested > 0 && <span>· 미실시 {summary.untested}명</span>}
        {provisional && <Badge tone="amber" size="sm">임시 기준 · 확정 전</Badge>}
      </div>

      {summary.tested === 0 ? (
        <p className="card mt-6 p-8 text-center text-sm text-ink-mute">아직 검사한 학생이 없어요.</p>
      ) : (
        <>
          {summary.scored === 0 && (
            <p className="mt-4 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] text-amber">
              아직 채점된 학생이 없어요. 채점이 끝나면 이 페이지를 새로고침해 주세요.
            </p>
          )}
          {/* 버튼은 확인 모달만 연다 — 눌렀다고 곧바로 받아지지 않는다(아래 ConfirmDialog). */}
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setConfirmMode('all')} disabled={summary.scored === 0 || downloading !== null}
              className="btn-primary h-[46px] min-w-[12rem] flex-1">
              전체 PDF 다운로드 ({summary.scored}명)
            </button>
            <button type="button" onClick={() => setConfirmMode('picked')} disabled={pickedCount === 0 || downloading !== null}
              className="btn-ghost h-[46px] min-w-[12rem] flex-1">
              {pickedCount === 0 ? '선택한 검사 다운로드' : `선택한 ${pickedCount}장 다운로드`}
            </button>
          </div>
          {dlErr && <p role="alert" className="mt-2 text-sm text-rec-deep">{dlErr}</p>}

          <section className="card mt-4 overflow-hidden">
            <div className="overflow-x-auto p-2 lg:p-4">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-mute">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2 font-medium">번호</th>
                    <th className="px-2 py-2 font-medium">이름</th>
                    {TASKS.map(t => <th key={t.key} className="whitespace-nowrap px-2 py-2 font-medium">{t.label}</th>)}
                    <th className="px-2 py-2 font-medium">판정</th>
                    <th className="px-2 py-2 font-medium">상태</th>
                    <th className="px-2 py-2 font-medium">검사일</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {children.map(c => {
                    const latest = latestSession(c)
                    const retests = c.sessions.length > 1
                    const expanded = open.has(c.childNo)
                    // 아이 행 체크박스가 대표하는 것들 — 받을 수 있는(채점 완료) 차수 전부.
                    const scoredIds = c.sessions.filter(x => x.status === 'scored').map(x => x.id)
                    const pickedCountOfChild = scoredIds.filter(id => picked.has(id)).length
                    const row = (s: ResultsSession | null, label: string | null, key: string) => (
                      <tr key={key} className={`border-t border-line/60 ${label ? 'bg-well/60 text-[13px]' : ''}`}>
                        <td className="px-2 py-2">
                          {/* 아이 행은 **그 아이 전체**를, 차수 행은 그 차수 하나를 맡는다.
                              일부 차수만 골랐으면 아이 행은 막대(indeterminate)로 「일부 선택」을 알린다. */}
                          {label === null
                            ? scoredIds.length > 0 && (
                              <Check label={`${c.childNo}번 ${c.name} 전체 선택`}
                                checked={pickedCountOfChild === scoredIds.length}
                                indeterminate={pickedCountOfChild > 0 && pickedCountOfChild < scoredIds.length}
                                onChange={on => toggleChild(c, on)} />
                            )
                            // 차수 행도 아이 행과 같은 규칙 — 받을 수 없는 차수는 잠긴 상자 대신 칸을 비운다.
                            // 「상자가 있으면 받을 수 있다」 하나로 읽히게(사용자 확정 2026-09-23). 왜 못 받는지는
                            // 같은 줄의 상태 배지가 말한다.
                            : s?.status === 'scored' && (
                              <Check label={`${c.childNo}번 ${c.name} ${label} 선택`}
                                checked={picked.has(s.id)}
                                onChange={on => toggle(s.id, on)} />
                            )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                          {/* 차수는 어느 검사인지 가르는 값이라 회색 글자로는 눈에 안 띈다 — 배지로 세운다. */}
                          {label ? <Badge tone="blue" size="sm">{label}</Badge> : c.childNo}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 font-medium">{label ? '' : `${c.name} (${c.gender})`}</td>
                        {TASKS.map(t => (
                          <td key={t.key} className="whitespace-nowrap px-2 py-2 tabular-nums">
                            <ScoreCell s={s} task={t.key} max={taskMax[t.key]} />
                          </td>
                        ))}
                        <td className="px-2 py-2"><VerdictPill v={s?.status === 'scored' ? s.verdict : null} /></td>
                        <td className="whitespace-nowrap px-2 py-2">
                          {s ? <Badge tone={s.status === 'scored' ? 'blue' : s.status === 'scoring' ? 'amber' : 'rec'} size="sm">{STATUS_LABEL[s.status]}</Badge>
                            : <Badge tone="mute" size="sm">미실시</Badge>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-ink-soft">{s ? kstDate(s.startedAt) : ''}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          {!label && retests && (
                            <button type="button" aria-expanded={expanded}
                              onClick={() => setOpen(prev => { const n = new Set(prev); if (n.has(c.childNo)) n.delete(c.childNo); else n.add(c.childNo); return n })}
                              className="text-[12px] font-bold text-blue underline underline-offset-2">
                              {expanded ? '▾' : '▸'} 재검사 {c.sessions.length}회
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                    return [
                      row(latest, null, `c${c.childNo}`),
                      ...(expanded ? c.sessions.map(s => row(s, `${s.attemptNo}차`, s.id)) : []),
                    ]
                  })}
                </tbody>
              </table>
            </div>

            {/* 「채점 전」이 0점으로, Pass/Fail이 확정 판정으로 읽히면 임상적 오독이다 — 관리자 결과지와
                같은 범례를 교사 화면에도 상시 둔다(관리자 전용 조작 설명은 뺀다).
                설명이 한 문장으로 끝나지 않아 1열. */}
            <BadgeLegend
              columns={1}
              items={[
                {
                  badge: <Badge tone="mute">채점 전</Badge>,
                  desc: <>아직 채점하지 않은 과제입니다. <b className="text-rec-deep">0점이 아닙니다</b> —
                    검사지 PDF에도 점수 칸이 비어 나갑니다.</>,
                },
                {
                  badge: (
                    <span className="flex gap-1">
                      <Badge tone="mint">Pass</Badge><Badge tone="rec">Fail</Badge>
                    </span>
                  ),
                  desc: <>과제별 기준 점수에 따른 판정입니다. <b>세 과제가 모두 채점돼야</b> 나오며,
                    <b> 공식 검사지 PDF에는 찍히지 않습니다.</b></>,
                },
                ...(provisional ? [{
                  badge: <Badge tone="amber">임시 기준 · 확정 전</Badge>,
                  desc: <>Pass 기준이 담당자 기준표를 받기 전까지 쓰는 <b>임시 숫자</b>라는 표시입니다.
                    기준표를 받으면 숫자만 교체되며 이미 채점한 검사도 저장된 점수로 다시 계산됩니다.</>,
                }] : []),
              ]}
            />
          </section>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-mute">
            채점 완료된 검사만 내려받을 수 있어요. 재검사가 있으면 ▸를 눌러 차수별로 고를 수 있어요.
            채점이 진행되면 새로고침하면 반영돼요.
          </p>
        </>
      )}

      {/* 받을 사람을 눈으로 확인하고 한 번 더 누르게 한다 — 25장 병합은 서버가 몇 초를 쓰는 일이고,
          잘못 눌린 클릭 하나로 반 전체가 내려받아지면 안 된다(사용자 확정 2026-09-22, 담당자 회신 아님). */}
      <ConfirmDialog
        open={confirmMode !== null}
        title={confirmMode === 'all' ? '전체 결과지를 내려받을까요?' : '선택한 결과지를 내려받을까요?'}
        confirmLabel={`${pickList.length}장 내려받기`}
        onConfirm={() => void download(confirmMode === 'all' ? 'all' : 'picked')}
        onClose={() => setConfirmMode(null)}>
        {/* 두 문장을 한 문단에 붙이면 「만드는 데 몇 / 초 걸려요」처럼 어정쩡하게 감긴다.
            한 줄에 한 가지만 말한다 — 위는 무엇을 받는지, 아래는 얼마나 걸리는지. */}
        <p className="mt-3 text-sm text-ink-soft">
          아래 <b>{pickList.length}명</b>의 결과지가 <b>한 파일</b>로 만들어져요.
        </p>
        <p className="mt-1 text-[12.5px] text-ink-mute">만드는 데 몇 초 걸려요.</p>
        {/* 한 학급이 40명까지 간다 — 한 줄에 하나씩 쌓으면 스크롤만 길어져 누구를 받는지 안 보인다.
            좁은 화면은 2열, 넓으면 3열로 접어 한 화면에 최대한 담는다. 모달 안에서만 스크롤한다. */}
        <ul className="mt-3 grid max-h-64 grid-cols-2 gap-x-3 overflow-y-auto rounded-xl border border-line
          bg-well px-3.5 py-2.5 text-[13px] sm:grid-cols-3">
          {pickList.map((r, i) => (
            <li key={`${r.childNo}-${i}`} className="flex items-baseline gap-1.5 py-1">
              <span className="w-6 shrink-0 text-right tabular-nums text-ink-mute">{r.childNo}</span>
              <span className="truncate font-medium text-ink">{r.name}</span>
              {r.attempt && <Badge tone="blue" size="sm" className="shrink-0">{r.attempt}</Badge>}
            </li>
          ))}
        </ul>
        {confirmMode === 'all' && summary && summary.scored < summary.tested && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-mute">
            채점이 끝나지 않은 검사는 빠져요.
          </p>
        )}
      </ConfirmDialog>

      {/* 다운로드 중에는 화면 전체를 덮는다 — 버튼 글자만 바꾸면 눌린 줄 모르고 다시 누른다
          (다른 화면과 같은 공용 오버레이). */}
      <LoadingOverlay show={downloading !== null} />
    </main>
  )
}
