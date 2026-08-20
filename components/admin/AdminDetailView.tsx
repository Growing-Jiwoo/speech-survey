// components/admin/AdminDetailView.tsx — 관리자 결과지(세션 상세) 화면.
// 목록 캐시를 재활용해 이전/다음 아동 내비를 제공하고, 녹음 청취·낱말쓰기·체크리스트를
// 채점자가 한 화면에서 볼 수 있게 구성한다. 세션 삭제(PII 파기)도 여기서 수행한다.
'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { SECTION_LABEL, itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'
import { scoreInputFrom, withUnrecordedDefaults } from '@/lib/scoring'
import { adjacentSessionIds, filterSessions, kstDateKey, parseFilters, sortSessions } from '@/lib/adminStats'
import { gradeClassLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { adminKeys, useSessionDetailQuery, useSessionsQuery } from '@/hooks/useAdminQueries'
import { AudioBusProvider } from '@/components/AudioBus'
import { Badge } from '@/components/Badge'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { ResultSheet } from '@/components/admin/ResultSheet'
import { SessionEditDialog } from '@/components/admin/SessionEditDialog'
import type { Attempt } from '@/components/admin/sheet/PageAudio'

export function AdminDetailView() {
  const id = String(useParams().id)
  const router = useRouter()
  const back = useSearchParams().get('back')
  const listHref = back ? `/admin?${back}` : '/admin'
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error, refetch } = useSessionDetailQuery(id)

  // 세션 삭제(PII 파기): 확인 모달 → DELETE → 목록 캐시 무효화 후 목록으로 복귀
  // 저장하지 않은 채점이 있는데 아동을 옮기면 그 채점은 사라진다(다른 아동 화면은 다시 마운트된다).
  // 녹음을 처음부터 다시 들어야 하므로, 이동 전에 한 번 묻는다.
  const [dirty, setDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState<string | null>(null)
  const go = (href: string) => (dirty ? setPendingNav(href) : router.push(href))

  const [editOpen, setEditOpen] = useState(false)
  const [delModal, setDelModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [delErr, setDelErr] = useState('')

  // 이전/다음 아동: 캐시된 목록에 back의 필터·정렬을 재적용해 현재 id의 앞/뒤를 구한다.
  const { data: sessions } = useSessionsQuery()
  const nav = useMemo(() => {
    if (!sessions) return { prev: null, next: null }
    const { filters, sort } = parseFilters(new URLSearchParams(back ?? ''))
    const rows = sortSessions(filterSessions(sessions, filters, kstDateKey(new Date())), sort)
    return adjacentSessionIds(rows, id)
  }, [sessions, back, id])

  const goHref = (target: string) => back ? `/admin/${target}?back=${encodeURIComponent(back)}` : `/admin/${target}`

  async function removeSession() {
    setDeleting(true); setDelErr('')
    const r = await requestJson(`/api/admin/sessions/${id}`, { method: 'DELETE' }, '삭제에 실패했어요. 다시 시도해 주세요.')
    setDeleting(false)
    if (!r.ok) { setDelErr(r.error); return }
    queryClient.removeQueries({ queryKey: adminKeys.session(id) })
    await queryClient.invalidateQueries({ queryKey: adminKeys.sessions })
    router.replace(listHref)
  }

  // item_code → 시도 목록(정렬은 API가 보장). 결과지와 진행 집계가 공유한다.
  const byItem = useMemo(() => {
    const m = new Map<string, Attempt[]>()
    for (const r of data?.recordings ?? []) {
      const list = m.get(r.item_code) ?? []
      list.push({ attempt_no: r.attempt_no, url: r.url, duration_sec: r.duration_sec })
      m.set(r.item_code, list)
    }
    return m
  }, [data])
  // 페이지 코드 → 녹음 시도들(ResultSheet가 낱말 해독·문장 각 줄에서 조회)
  const attemptsOf = (pageCode: string) => byItem.get(pageCode) ?? []

  if (isLoading) return <LoadingOverlay show />
  // 삭제된 세션(404)과 장애(그 외)를 구분한다 — 없는 세션에 "다시 시도"를 권하면 운영자가
  // 장애로 오인해 계속 누른다. 서버도 같은 판정으로 404를 낸다(app/api/admin/sessions/[id]).
  const notFound = isError && /\(404\)/.test((error as Error | null)?.message ?? '')
  if (isError || !data) return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10">
      <Link href={listHref} className="text-sm text-ink-mute underline">← 목록</Link>
      <div className="mt-6 flex flex-col items-start gap-3">
        <p className="text-sm text-ink-soft">
          {notFound ? '이 검사 기록을 찾을 수 없어요. 이미 삭제되었을 수 있어요.' : '결과지를 불러오지 못했어요.'}
        </p>
        {/* 없는 세션은 재시도해도 달라지지 않는다 — 목록으로 돌아가는 길만 남긴다. */}
        {!notFound && (
          <button type="button" onClick={() => void refetch()}
            className="rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
            다시 시도
          </button>
        )}
      </div>
    </main>
  )

  const { session: s } = data
  // 학년이 검사지를 정한다 — 문항 수도 쓰기 과제의 종류도 여기서 갈린다.
  const f = itemsFor(formForGrade(s.grade))
  // 저장된 행 → 채점 입력. 쓰기 답이 두 테이블에 나뉘어 있는 사실은 scoreInputFrom만 안다.
  // 녹음이 없는 페이지는 오반응(X·0점)으로 채워 넣는다 — 검사지 PDF 라우트도 같은 함수를
  // 거치므로, 채점자가 [채점 저장]을 누르기 전에도 화면과 인쇄물의 값이 같다.
  // **제출된 세션에만** 적용한다: 진행 중인 검사의 빈 녹음은 "안 읽었다"가 아니라
  // "아직 안 했다"이므로, 그것까지 0점으로 채우면 검사 중인 아동이 0점으로 보인다.
  const rawInput = scoreInputFrom(f, data)
  const input = s.submitted_at
    ? withUnrecordedDefaults(f, rawInput, code => byItem.has(code))
    : rawInput
  const writtenCount = f.writingItems.filter(i => input.writing[i.code] !== undefined).length
  const recordedCount = f.recordingPages.filter(p => byItem.has(p.code)).length
  const expected = f.totals
  const missingCount = Math.max(0, expected.rec - recordedCount) + Math.max(0, expected.write - writtenCount)

  return (
    <AudioBusProvider>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10">
        <NavBar listHref={listHref} nav={nav} go={go} goHref={goHref} />
        {/* 수집 상태(녹음·쓰기 진행률, 미완료 건수)는 채점 결과가 아니므로 결과지 밖에 둔다.
            [정보 수정]도 여기 둔다 — 결과지 본문은 검사지를 재현하는 영역이라 편집 컨트롤을
            섞지 않고, [검사 기록 삭제] 옆은 오클릭이, [다음 아동] 옆은 고빈도 내비와 섞이는 게 걱정된다. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
          <span className="kpi">녹음 <b>{recordedCount} / {expected.rec}</b></span>
          <span className="kpi">{SECTION_LABEL[f.writingSection]} <b>{writtenCount} / {expected.write}</b></span>
          {missingCount > 0 && <Badge tone="rec" size="lg">미완료 {missingCount}건</Badge>}
          {/* 수정된 세션은 원래 값을 함께 보여준다 — 잘못 고쳤을 때 되돌릴 근거가 된다.
              ⚠️ 검사지 PDF에는 이 표시가 없다(양식은 절대 기준) — 인쇄물만 보면 알 수 없다. */}
          {s.original_identity && (
            <Badge tone="mute" size="lg">
              정보 수정됨 · 원래 {s.original_identity.child_no}번 {s.original_identity.child_name}
            </Badge>
          )}
          <button type="button" onClick={() => setEditOpen(true)}
            className="ml-auto rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
            정보 수정
          </button>
        </div>

        {/* overflow-hidden이면 조상이 스크롤 컨테이너가 되어 내부 sticky(그룹 플레이어 바)가
            무력화된다 — clip은 같은 모서리 클리핑을 주되 스크롤 컨테이너를 만들지 않는다. */}
        <div className="mt-3 overflow-clip rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
          <ResultSheet key={id} sessionId={id} session={s} writing={input.writing}
            onDirtyChange={setDirty}
            initialMarks={input.marks}
            initialSentences={input.sentences}
            attemptsOf={attemptsOf}
            onAudioError={() => queryClient.invalidateQueries({ queryKey: adminKeys.session(id) })} />
        </div>

        {/* 하단에도 같은 내비를 둔다. 결과지는 한 화면에 안 들어가고(1,600px 넘음) 채점은
            위에서 아래로 흐르는데, 다 찍고 나면 커서는 맨 아래에 있다. 상단 내비만 있으면
            아동 한 명 넘길 때마다 맨 위로 되돌아가야 했다.
            상단 바를 sticky로 만드는 방법은 쓰지 않았다 — 결과지 안의 그룹 플레이어 바가
            같은 `sticky top-0`이라 서로 겹쳐, "들으면서 찍기" 동선이 깨진다. */}
        <div className="mt-4 print:hidden">
          <NavBar listHref={listHref} nav={nav} go={go} goHref={goHref} />
        </div>

        {/* 파괴적 동작은 내비와 **다른 줄**에 두고 경계선으로 끊는다 — 하단 내비가 생기면서
            [다음 아동]과 [검사 기록 삭제]가 가까워졌기 때문에, 종전보다 간격을 더 벌린다. */}
        <div className="mt-6 flex justify-end border-t border-line pt-4 print:hidden">
          <button type="button" onClick={() => setDelModal(true)}
            className="rounded-lg border-[1.5px] border-rec/40 bg-rec/5 px-3 py-1.5 text-xs font-bold text-rec-deep transition hover:border-rec">
            검사 기록 삭제
          </button>
        </div>

        {/* 저장 안 한 채점은 살아남는다 — ResultSheet의 채점 상태는 마운트 시 한 번만
            초기화되고 key(id)가 그대로라, 데이터가 갱신돼도 다시 만들어지지 않는다.
            ⚠️ 그래서 여기서 removeQueries를 쓰면 안 된다 — 캐시가 비면 로딩 상태로 떨어져
            결과지가 언마운트되고, 채점자가 찍어 둔 O/X가 통째로 사라진다.
            invalidate는 이전 데이터를 보여준 채 뒤에서 다시 받아온다. */}
        {/* key(id): 아동 간 이동에서 페이지가 리마운트된다는 전제가 어떤 이유로든 깨져도
            폼 상태(useState 1회 초기화)가 세션별로 격리되게 한다 — 깨지면 이전 아동의
            신원이 다음 아동의 수정 폼에 프리필되는 경로다(임상 기록 오염).
            ResultSheet의 key(id)와 같은 방어선이다. */}
        <SessionEditDialog key={s.id} open={editOpen} session={s}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            void queryClient.invalidateQueries({ queryKey: adminKeys.session(id) })
            void queryClient.invalidateQueries({ queryKey: adminKeys.sessions })
          }} />

        <ConfirmDialog open={pendingNav !== null}
          title="저장하지 않은 채점이 있어요"
          confirmLabel="저장하지 않고 이동"
          onConfirm={() => { const to = pendingNav!; setPendingNav(null); setDirty(false); router.push(to) }}
          onClose={() => setPendingNav(null)}>
          <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
            이동하면 지금 화면의 채점이 <b className="text-rec-deep">사라집니다</b>.
            녹음을 다시 들어야 하니, 먼저 <b>[채점 저장]</b>을 눌러 주세요.
          </p>
        </ConfirmDialog>

        <ConfirmDialog open={delModal} busy={deleting} error={delErr} danger
          title="이 검사 기록을 삭제할까요?"
          confirmLabel={deleting ? '삭제 중…' : '삭제'}
          onConfirm={removeSession} onClose={() => setDelModal(false)}>
          <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
            <b>{s.child_name}</b> ({s.school_name} {gradeClassLabel(s.grade, s.class_no)})의 정보와
            녹음 파일이 <b className="text-rec-deep">모두 영구 삭제</b>되며 되돌릴 수 없습니다.
          </p>
        </ConfirmDialog>
        <LoadingOverlay show={deleting} />
      </main>
    </AudioBusProvider>
  )
}

/** 목록 복귀 + 이전/다음 아동. 결과지 위아래 두 곳에 같은 것을 쓰므로 한 곳에서 만든다
 *  — 한쪽만 고쳐 두 내비가 어긋나는 일을 막는다.
 *  이전/다음은 캐시된 목록의 앞뒤를 가리키며, 경계이거나 목록 캐시가 없으면 비활성이다. */
function NavBar({ listHref, nav, go, goHref }: {
  listHref: string
  nav: { prev: string | null; next: string | null }
  go: (href: string) => void
  goHref: (target: string) => string
}) {
  const btn = 'rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition disabled:opacity-40'
  return (
    <div className="flex items-center justify-between gap-2 print:hidden">
      <a href={listHref} onClick={e => { e.preventDefault(); go(listHref) }}
        className="text-sm text-ink-mute underline">← 목록</a>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={!nav.prev} className={btn}
          onClick={() => nav.prev && go(goHref(nav.prev))}>◀ 이전 아동</button>
        <button type="button" disabled={!nav.next} className={btn}
          onClick={() => nav.next && go(goHref(nav.next))}>다음 아동 ▶</button>
      </div>
    </div>
  )
}
