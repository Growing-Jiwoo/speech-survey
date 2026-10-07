// components/results/ResultsView.tsx — 교사 결과 페이지(클라이언트).
// GET /api/results/<token>을 읽어 요약·아이별 행·다운로드 버튼을 그린다. 데이터는 토큰이 아니라
// 매 요청 DB에서 오므로 새로고침이 곧 최신 상태다.
// 판정 표기는 관리자 화면과 같은 Pass/Fail(사용자 확정 2026-09-22). 받을 수 있는 검사(status scored)만 체크·다운로드.
// 쓰기 스캔본(사용자 확정 2026-09-30): 올리기 입구(ScanUpload)와 「스캔 대기 → 채점 중 → 채점 완료」 상태,
// 받을 때 「쓰기 채점 전」 경고를 이 화면이 맡는다.
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/Badge'
import { Blip } from '@/components/Blip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { Spinner } from '@/components/Spinner'
// 폴더만 admin일 뿐 범용 컴포넌트다(관리자 전용 데이터를 알지 않는다).
import { BadgeLegend } from '@/components/admin/BadgeLegend'
import { gradeClassLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import {
  awaitsScanWriting, latestScored, latestSession, scanTargetSession, scanTargets, sessionLabel, summarize,
  type ResultsChild, type ResultsSession, type SessionLabel,
} from '@/lib/results-view'
import { FLUENCY_UNIT, fluencyLabel, type CountTaskKey, type TaskKey } from '@/lib/scoring'
import { ScanUpload } from './ScanUpload'

interface Payload {
  cls: { schoolName: string; grade: number; classNo: number; teacherName: string }
  provisional: boolean
  /** 개수형 과제의 만점. 문장 읽기는 비율(어절/초)이라 만점이 없다 */
  taskMax: Record<CountTaskKey, number>
  children: ResultsChild[]
  /** 쓰기 기록지 QR의 반 표시 — 올린 스캔본이 이 반 것인지 가린다(lib/writing-sheet) */
  sheetTag: string
}

const TASKS: { key: TaskKey; label: string }[] = [
  { key: 'wordReading', label: '낱말 해독' },
  // 칸에는 숫자만 찍으므로(「2.12」) 단위는 머리글이 말한다.
  { key: 'sentenceReading', label: `문장 읽기(${FLUENCY_UNIT})` },
  { key: 'writing', label: '쓰기' },
]

const STATUS_BADGE: Record<SessionLabel, { tone: 'blue' | 'amber' | 'rec' | 'mute'; label: string }> = {
  scored: { tone: 'blue', label: '채점 완료' },
  scoring: { tone: 'amber', label: '채점 중' },
  // 선생님이 할 일(스캔본 올리기)이 남은 상태 — 시안의 색(주황 계열)을 채점 중과 같이 쓰고 글자로 가른다
  scanWait: { tone: 'amber', label: '스캔 대기' },
  // 더 최근에 제출된 재검사가 있어 이 검사에는 스캔본을 올릴 수 없다(lib/results-view sessionLabel)
  replaced: { tone: 'mute', label: '재검사로 대체' },
  unsubmitted: { tone: 'rec', label: '미제출' },
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
 * (화면 방식) 쓰기는 검사 중 검사자가 넣는 값이라 관리자가 나중에 채울 수 없어, 쓰기가 비어도 scored로 보고
 * 결과지를 내보낸다(스캔본 방식도 받기 기준은 같다 — 담당자가 채우기 전에 받으면 경고한다). 그 대가로 `scores.writing`에 0이 들어오는데 **그 0은 「0점을 받았다」가 아니라
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

function ScoreCell({ s, task, taskMax }: { s: ResultsSession | null; task: TaskKey; taskMax: Payload['taskMax'] }) {
  if (!s?.scores) return <span className="text-ink-mute">-</span>
  if (s.complete?.[task] === false) return <Badge tone="mute" size="sm">채점 전</Badge>
  // 문장 읽기는 만점이 없는 비율이다 — 「2.12/36」처럼 척도를 섞어 찍지 않는다(lib/scoring CountTaskKey).
  if (task === 'sentenceReading') return <>{fluencyLabel(s.scores[task])}</>
  // 스캔본으로 채점한 쓰기는 담당자가 넣은 점수다 — 선생님이 화면에서 표시한 점수와 구별되게 작은 표시를 붙인다
  if (task === 'writing' && s.writingMode === 'scan')
    return <span className="inline-flex items-center gap-1.5">{s.scores[task]}/{taskMax[task]}<Badge tone="mint" size="sm">스캔</Badge></span>
  return <>{s.scores[task]}/{taskMax[task]}</>
}

/** 상태 코드로 실패를 나눈다 — 401(만료·변조)은 재시도해 봐야 소용없고 404는 학급이 사라진 것. */
class ResultsError extends Error { constructor(readonly status: number) { super('results') } }

export function ResultsView({ token }: { token: string }) {
  // 데이터 로딩은 관리자 화면과 같은 react-query(app/providers.tsx가 전역 클라이언트를 준다) —
  // useEffect + setState로 직접 받으면 효과 안의 동기 setState가 된다.
  const queryClient = useQueryClient()
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
    const rows: { id: string; childNo: number; name: string; attempt: string | null; pendingWriting: boolean }[] = []
    for (const c of data?.children ?? []) {
      for (const s of c.sessions) {
        const inAll = confirmMode === 'all' && latestScored(c)?.id === s.id
        const inPicked = confirmMode === 'picked' && picked.has(s.id)
        if (inAll || inPicked) {
          rows.push({
            id: s.id, childNo: c.childNo, name: c.name, attempt: c.sessions.length > 1 ? `${s.attemptNo}차` : null,
            pendingWriting: awaitsScanWriting(s),
          })
        }
      }
    }
    return rows
  }, [data, confirmMode, picked])
  /** 받을 것 중 **스캔본 쓰기 채점 전**인 검사 — 결과보고서의 쓰기·최종결과 칸이 빈 채로 나간다. 담당자가 채우면
   *  다시 받아야 하므로 받기 전에 알린다(사용자 확정 2026-09-30). 화면 방식의 빈 쓰기(A안)는 나중에 채워지지
   *  않아 여기서 따로 알리지 않는다 — 종전과 같다. */
  const pendingRows = pickList.filter(r => r.pendingWriting)
  const completeIds = pickList.filter(r => !r.pendingWriting).map(r => r.id)

  /** mode: 'all'이면 서버가 아이마다 받을 것을 고른다. ids를 주면 그 검사들만(선택한 것 · 「완성된 N장만」). */
  async function download(mode: 'all' | 'picked', ids?: string[]) {
    setConfirmMode(null)
    setDownloading(mode); setDlErr('')
    const qs = ids ? `?ids=${ids.join(',')}` : mode === 'picked' ? `?ids=${[...picked].join(',')}` : ''
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
      a.href = URL.createObjectURL(blob); a.download = name
      // 문서에 붙였다 떼고, URL은 잠시 뒤에 푼다 — click 직후 바로 풀면 Safari 등에서 다운로드가 시작되기 전에
      // 주소가 사라져 조용히 받지 못하는 사례가 있다(선생님 기기는 Mac·iPad일 수 있다)
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
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

  // 보여 줄 결과가 없을 때만 화면 전체를 오류로 바꾼다. 이미 보이는 결과가 있으면(창으로 돌아올 때의 다시 받기가
  // 실패한 것) 위에 띠로만 알린다 — 화면을 바꾸면 스캔본 확인 창이 통째로 닫혀 쪽마다 고른 것이 사라진다
  // (파일 선택 창이 닫히면 이 창으로 포커스가 돌아와 다시 받기가 돈다).
  if (err && !data) return (
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

  const { cls, children, taskMax, provisional, sheetTag } = data
  const pickedCount = picked.size
  /** 올리기 확인 창이 짝짓기 직전에 부른다. 화면의 조회와 따로 받는다 — 실패해도 화면이 오류로 바뀌지 않게
   *  (null을 돌려주면 창은 가진 목록으로 짝짓고, 서버가 대상 검사를 다시 확인한다). 받으면 화면도 새 목록으로 바꾼다. */
  const refreshTargets = async () => {
    const r = await requestJson<Payload>(`/api/results/${token}`, { method: 'GET' })
    if (!r.ok) return null
    queryClient.setQueryData(['results', token], r.data)
    return scanTargets(r.data.children)
  }
  const targets = scanTargets(children)
  // 이 반에 스캔본 방식 검사가 하나라도 있으면 범례·안내에 스캔 설명을 붙인다
  const hasScan = children.some(c => c.sessions.some(x => x.writingMode === 'scan'))
  const hasReplaced = children.some(c => { const t = scanTargetSession(c); return c.sessions.some(x => sessionLabel(x, t?.id) === 'replaced') })

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col p-6 pt-8">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">KODYS 결과지</span>
      </div>
      {err && (
        <p role="alert" className="mt-4 rounded-xl border border-rec/30 bg-rec/5 px-4 py-3 text-[13px] text-rec-deep">
          {err === 'other'
            ? '최신 결과를 불러오지 못했어요. 잠시 후 이 페이지를 새로고침해 주세요.'
            : '링크가 만료됐어요. 검사 주소에서 학급 코드를 입력한 뒤 [결과지 받기]를 다시 눌러 주세요.'}
        </p>
      )}
      <h1 className="mt-5 text-xl font-bold">{cls.schoolName} {gradeClassLabel(cls.grade, cls.classNo)}</h1>
      <p className="mt-1 text-sm text-ink-soft">담임 {cls.teacherName}</p>

      {/* 상단 요약 — 교사가 진짜 알고 싶은 것("누가 걸렸나")을 표를 훑기 전에 준다(사용자 확정 ④) */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
        <span>검사 <b>{summary.tested}</b>명</span>
        <span>· 채점 완료 <b>{summary.scored}</b>명</span>
        <span>· <b className="text-rec-deep">Fail {summary.fail}</b>명</span>
        {summary.scoring > 0 && <span>· 채점 중 {summary.scoring}명</span>}
        {summary.scanWait > 0 && <span className="font-bold text-amber">· 스캔 대기 {summary.scanWait}명</span>}
        {summary.unsubmitted > 0 && <span>· 미제출 {summary.unsubmitted}명</span>}
        {summary.untested > 0 && <span>· 미실시 {summary.untested}명</span>}
        {provisional && <Badge tone="amber" size="sm">임시 기준 · 확정 전</Badge>}
      </div>

      {summary.tested === 0 ? (
        <p className="card mt-6 p-8 text-center text-sm text-ink-mute">아직 검사한 학생이 없어요.</p>
      ) : (
        <>
          {summary.downloadable === 0 && (
            <p className="mt-4 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] text-amber">
              아직 채점된 학생이 없어요. 채점이 끝나면 이 페이지를 새로고침해 주세요.
            </p>
          )}
          {/* 버튼은 확인 모달만 연다 — 눌렀다고 곧바로 받아지지 않는다(아래 ConfirmDialog). */}
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => setConfirmMode('all')} disabled={summary.downloadable === 0 || downloading !== null}
              className="btn-primary h-[46px] min-w-[12rem] flex-1">
              전체 PDF 다운로드 ({summary.downloadable}명)
            </button>
            <button type="button" onClick={() => setConfirmMode('picked')} disabled={pickedCount === 0 || downloading !== null}
              className="btn-ghost h-[46px] min-w-[12rem] flex-1">
              {pickedCount === 0 ? '선택한 검사 다운로드' : `선택한 ${pickedCount}장 다운로드`}
            </button>
          </div>
          {dlErr && <p role="alert" className="mt-2 text-sm text-rec-deep">{dlErr}</p>}

          {/* 스캔본 방식 검사가 있는 반만. 입구 카드는 올릴 수 있는 아이(스캔 대기·이미 올림)가 있을 때만 보인다 —
              조건을 여기서 걸면 확인 중에 다시 받은 목록에서 대상이 사라질 때 창이 통째로 닫힌다(고른 것이 사라진다). */}
          {hasScan && (
            <ScanUpload token={token} sheetTag={sheetTag} targets={targets} onUploaded={() => void refetch()}
              // 파일을 고르면 목록을 다시 받아 짝짓는다 — 열어 둔 지 오래된 탭은 그사이 제출·재검사된 아이를 모른다
              refreshTargets={refreshTargets} />
          )}

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
                    const target = scanTargetSession(c)
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
                            <ScoreCell s={s} task={t.key} taskMax={taskMax} />
                          </td>
                        ))}
                        <td className="px-2 py-2"><VerdictPill v={s?.status === 'scored' ? s.verdict : null} /></td>
                        <td className="whitespace-nowrap px-2 py-2">
                          {s ? <Badge tone={STATUS_BADGE[sessionLabel(s, target?.id)].tone} size="sm">{STATUS_BADGE[sessionLabel(s, target?.id)].label}</Badge>
                            : <Badge tone="mute" size="sm">미실시</Badge>}
                          {/* 접힌 행은 최신 검사를 보인다 — 그것이 중단된 재검사면 스캔본을 기다리는 앞 차수가 가려져
                              요약의 「스캔 대기 N명」이 누구인지 찾을 수 없다 */}
                          {!label && target && target.id !== latest?.id && target.scanState === 'wait' && (
                            <Badge tone="amber" size="sm" className="ml-1">{target.attemptNo}차 스캔 대기</Badge>
                          )}
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
                ...(hasScan ? [{
                  badge: <Badge tone="amber">스캔 대기</Badge>,
                  desc: <>「스캔본으로 올리기」를 고른 아이입니다. 스캔본을 올리면 담당자가 보고 쓰기를 채점합니다.
                    채점된 쓰기 점수에는 <Badge tone="mint" size="sm">스캔</Badge> 표시가 붙습니다.</>,
                }] : []),
                ...(hasReplaced ? [{
                  badge: <Badge tone="mute">재검사로 대체</Badge>,
                  desc: <>더 최근에 제출한 재검사가 있어 이 검사에는 스캔본을 올리지 않습니다. 기록지는 최근 검사로 올라갑니다.</>,
                }] : []),
                {
                  badge: <Badge tone="mute">채점 전</Badge>,
                  desc: <>아직 채점하지 않은 과제입니다. <b className="text-rec-deep">0점이 아닙니다</b> —
                    결과보고서 PDF에도 판정 칸이 비어 나갑니다.</>,
                },
                {
                  badge: (
                    <span className="flex gap-1">
                      <Badge tone="mint">Pass</Badge><Badge tone="rec">Fail</Badge>
                    </span>
                  ),
                  desc: <>과제별 기준 점수에 따른 판정입니다. <b>세 과제가 모두 채점돼야</b> 나오며,
                    결과보고서 PDF의 결과 요약에 <b>PASS/FAIL</b>로 찍힙니다. 최종결과는 셋 중 둘 이상 Fail이면 Fail입니다.</>,
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
            {hasScan
              // 스캔 대기·채점 중이어도 읽기 채점이 끝났으면 받을 수 있다(A안) — 「채점 완료만」이라고 하면 틀린 말이 된다
              ? '체크 상자가 있는 검사는 내려받을 수 있어요(쓰기가 채점 전이면 그 칸이 비어 나가요).'
              : '채점 완료된 검사만 내려받을 수 있어요.'}
            {' '}재검사가 있으면 ▸를 눌러 차수별로 고를 수 있어요.
            채점이 진행되면 새로고침하면 반영돼요.
          </p>
        </>
      )}

      {/* 받을 사람을 눈으로 확인하고 한 번 더 누르게 한다 — 25장 병합은 서버가 몇 초를 쓰는 일이고,
          잘못 눌린 클릭 하나로 반 전체가 내려받아지면 안 된다(사용자 확정 2026-09-22, 담당자 회신 아님). */}
      <ConfirmDialog
        open={confirmMode !== null}
        title={confirmMode === 'all' ? '전체 결과지를 내려받을까요?' : '선택한 결과지를 내려받을까요?'}
        confirmLabel={pendingRows.length > 0 ? `${pickList.length}장 모두 받기` : `${pickList.length}장 내려받기`}
        onConfirm={() => void download(confirmMode === 'all' ? 'all' : 'picked')}
        // 쓰기 채점 전이 섞였을 때만 둘째 버튼 — 세 과제가 다 채점된 것만 받는다. 0장이면 버튼이 없다.
        secondary={pendingRows.length > 0 && completeIds.length > 0 ? {
          label: `완성된 ${completeIds.length}장만`,
          onClick: () => void download(confirmMode === 'all' ? 'all' : 'picked', completeIds),
        } : undefined}
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
        {pendingRows.length > 0 && (
          <div role="note" className="mt-3 rounded-xl border border-amber/40 bg-amber/10 px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-amber">
              <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-amber text-[11px] text-white">!</span>
              쓰기 채점 전 {pendingRows.length}명
            </p>
            <ul className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {pendingRows.map(r => (
                <li key={r.id} className="rounded-lg border border-amber/30 bg-white px-2 py-0.5 text-[12.5px] font-bold text-ink">
                  {r.childNo}번 {r.name}{r.attempt && ` (${r.attempt})`}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              이 {pendingRows.length}명은 결과보고서의 <b>쓰기·최종결과 칸이 비어</b> 있어요. 채점이 끝나면 다시 받아 주세요.
            </p>
          </div>
        )}
        {confirmMode === 'all' && summary && summary.downloadable < summary.tested && (
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
