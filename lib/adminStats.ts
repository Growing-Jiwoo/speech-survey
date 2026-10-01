// 관리자 목록 화면(클라이언트)이 쓰는 필터·정렬·집계. **lib/forms를 값으로 import하지 말 것** —
// 검사지 문항이 공개 JS에 실린다(scripts/check-client-bundle.ts가 막는다). 양식이 필요한 진행률은
// 서버가 계산해 행에 싣는다(lib/session-progress.ts → listSessions).
import type { Totals } from '@/lib/items'
import type { SessionListRow } from '@/lib/db'

export type { Totals }

// ---------- 타입 ----------

/** scanReady — 스캔본이 올라왔는데(또는 종이로 채점을 시작했는데) 쓰기 채점이 남은 검사(2026-10-01).
 *  스캔본은 반 전체 검사 뒤 한꺼번에 올라와, 읽기 채점을 마친 검사에 다시 들어가야 한다 — 목록을 훑어 배지를
 *  찾게 두면 놓치고, 놓친 아이는 선생님 화면에서 계속 「채점 중」이다. */
export type StatusFilter = 'all' | 'submitted' | 'inProgress' | 'scanReady'

export interface Filters {
  q: string
  status: StatusFilter
  school: string | null
  grade: number | null
  today: boolean
}

export type SortKey = 'name' | 'school' | 'grade' | 'started' | 'submitted' | 'progress'
export interface Sort { key: SortKey; dir: 'asc' | 'desc' }

export const DEFAULT_FILTERS: Filters = { q: '', status: 'all', school: null, grade: null, today: false }
export const DEFAULT_SORT: Sort = { key: 'started', dir: 'desc' }

// ---------- 날짜(KST) ----------

/** 해당 시각을 KST(UTC+9) 기준 일자 키 'YYYY-MM-DD'로 변환한다.
 * 자정 무렵 로컬 타임존과 KST가 어긋나 "오늘"이 밀리는 문제(항목 16)를 막는다. */
export function kstDateKey(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60_000)
  return kst.toISOString().slice(0, 10)
}

// ---------- 집계 ----------

/**
 * 재검사 회차 표. `sessionId → { nth, of }`이며, **2회 이상 검사한 아동만** 담는다.
 *
 * 같은 아이를 다시 검사하는 것은 정상 흐름이다 — 시작 화면의 중복 경고가 막지 않고
 * "네, 다시 검사할게요"로 허용한다(스펙 "중복 검사 경고"). 그래서 목록에는 같은
 * 학급·같은 번호의 세션이 여러 건 나란히 뜨는데, 이름·학교·번호가 전부 같아 **어느 것이
 * 나중 검사인지 구별할 단서가 상태 배지뿐이었다.** 둘 다 제출 완료면 그마저도 같다.
 *
 * 아동 식별은 `(class_code_id, child_no)`로 한다. 이름은 동명이인이 있고, 세션에 복사된
 * 학급 정보는 코드가 나중에 수정돼도 검사 당시 값을 유지하므로 묶는 키로 쓰기에 불안정하다.
 *
 * 회차는 시작 시각(`started_at`) 오름차순이다 — 목록의 정렬·필터와 무관하게 고정돼야
 * 한다. 화면 정렬을 바꿨다고 "1회차"가 다른 세션을 가리키면 회차 표기 자체가 무의미해진다.
 * 시작 시각이 같으면 id로 갈라 순서를 결정론적으로 만든다.
 */
export function retestOrdinals(
  sessions: SessionListRow[],
): Map<string, { nth: number; of: number }> {
  const groups = new Map<string, SessionListRow[]>()
  for (const s of sessions) {
    const key = `${s.class_code_id}\u0000${s.child_no}`
    const list = groups.get(key)
    if (list) list.push(s)
    else groups.set(key, [s])
  }
  const out = new Map<string, { nth: number; of: number }>()
  for (const list of groups.values()) {
    if (list.length < 2) continue // 1회뿐이면 회차 표기가 오히려 잡음이다
    const ordered = [...list].sort((a, b) =>
      a.started_at.localeCompare(b.started_at) || a.id.localeCompare(b.id))
    ordered.forEach((s, i) => out.set(s.id, { nth: i + 1, of: ordered.length }))
  }
  return out
}

export interface Kpis { total: number; submitted: number; inProgress: number; today: number }

/** @param todayKey "오늘" 판정 기준 KST 일자 키(`kstDateKey(now)`) — Date 대신 문자열을 받아
 *  호출부(useMemo)가 분 단위 시계 갱신에도 날짜가 같으면 재계산을 건너뛸 수 있게 한다. */
export function computeKpis(sessions: SessionListRow[], todayKey: string): Kpis {
  let submitted = 0, today = 0
  for (const s of sessions) {
    if (s.submitted_at) submitted++
    if (kstDateKey(new Date(s.started_at)) === todayKey) today++
  }
  return { total: sessions.length, submitted, inProgress: sessions.length - submitted, today }
}

// ---------- 학교별 현황 ----------

export interface SchoolStat { school: string; total: number; submitted: number; rate: number }

export function computeSchoolStats(sessions: SessionListRow[]): SchoolStat[] {
  const map = new Map<string, { total: number; submitted: number }>()
  for (const s of sessions) {
    const e = map.get(s.school_name) ?? { total: 0, submitted: 0 }
    e.total++
    if (s.submitted_at) e.submitted++
    map.set(s.school_name, e)
  }
  return [...map.entries()]
    .map(([school, e]) => ({ school, ...e, rate: e.total === 0 ? 0 : e.submitted / e.total }))
    .sort((a, b) => b.total - a.total || a.school.localeCompare(b.school, 'ko'))
}

// ---------- 필터 옵션 ----------

export function schoolOptions(sessions: SessionListRow[]): string[] {
  return [...new Set(sessions.map(s => s.school_name))].sort((a, b) => a.localeCompare(b, 'ko'))
}

export function gradeOptions(sessions: SessionListRow[]): number[] {
  return [...new Set(sessions.map(s => s.grade))].sort((a, b) => a - b)
}

// ---------- 필터 · 정렬 ----------

/** 담당자가 스캔본을 보고 쓰기를 채점할 차례 — 목록 진행률 칸의 파란 「스캔본 채점」 배지와 같은 조건(SessionTable) */
export const awaitsScanScoring = (s: Pick<SessionListRow, 'progress'>) =>
  s.progress.scan === 'uploaded' && s.progress.written < s.progress.expected.write

/** @param todayKey "오늘 참여" 필터 기준 KST 일자 키(`kstDateKey(now)`) */
export function filterSessions(sessions: SessionListRow[], f: Filters, todayKey: string): SessionListRow[] {
  const keyword = f.q.trim()
  return sessions.filter(s => {
    if (f.status === 'submitted' && !s.submitted_at) return false
    if (f.status === 'inProgress' && s.submitted_at) return false
    if (f.status === 'scanReady' && !awaitsScanScoring(s)) return false
    if (f.school !== null && s.school_name !== f.school) return false
    if (f.grade !== null && s.grade !== f.grade) return false
    if (f.today && kstDateKey(new Date(s.started_at)) !== todayKey) return false
    if (keyword
      && !s.child_name.includes(keyword)
      && !s.school_name.includes(keyword)
      && !s.teacher_name.includes(keyword)
      && !String(s.class_no).includes(keyword)
      && !String(s.child_no).includes(keyword)) return false
    return true
  })
}

export function sortSessions(rows: SessionListRow[], sort: Sort): SessionListRow[] {
  // 미제출(제출일 없음)은 방향과 무관하게 항상 목록 끝으로 보내기 위한 sentinel.
  const NO_SUBMIT = { asc: Number.POSITIVE_INFINITY, desc: Number.NEGATIVE_INFINITY }
  // progress 정렬 값은 사전 계산 — 비교자 안에서 행마다 비율을 다시 구하지 않게.
  // 분모는 행마다 다르다(학년별 문항 수) — 비율로 재야 학년이 섞인 목록에서 공정하다.
  const progressOf = sort.key === 'progress'
    ? new Map(rows.map(s => {
        const p = s.progress
        const denom = p.expected.rec + p.expected.write
        // 분자가 분모를 넘는 일은 없어야 하지만, 넘더라도 다 끝난 세션보다 위로 오지
        // 않도록 1에서 clamp한다(옛 데이터에 대한 방어).
        return [s.id, denom === 0 ? 0 : Math.min(1, (p.recorded + p.written) / denom)] as const
      }))
    : null
  const value = (s: SessionListRow): string | number => {
    switch (sort.key) {
      case 'name': return s.child_name
      case 'school': return s.school_name
      case 'grade': return s.grade * 100 + s.class_no
      case 'started': return new Date(s.started_at).getTime()
      case 'submitted': return s.submitted_at ? new Date(s.submitted_at).getTime() : NO_SUBMIT[sort.dir]
      case 'progress': return progressOf!.get(s.id) ?? 0
    }
  }
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = value(a), vb = value(b)
    const primary = typeof va === 'string' ? va.localeCompare(vb as string, 'ko') : va - (vb as number)
    if (primary !== 0 && !Number.isNaN(primary)) return primary * sign
    // 동일 정렬 키 값 → 이름 오름차순 2차 정렬(방향 무관하게 일관된 순서로 흔들림 방지)
    return a.child_name.localeCompare(b.child_name, 'ko')
  })
}

// ---------- 결과지 내 이동 (이전/다음 아동) ----------

/** 이미 필터·정렬된 rows에서 currentId의 앞/뒤 세션 id를 구한다.
 * 결과지의 「◀ 이전 아동 / 다음 아동 ▶」이 목록과 같은 순서로 이동하도록 한다(항목 17). */
export function adjacentSessionIds(
  rows: SessionListRow[], currentId: string,
): { prev: string | null; next: string | null } {
  const idx = rows.findIndex(r => r.id === currentId)
  if (idx === -1) return { prev: null, next: null }
  return {
    prev: idx > 0 ? rows[idx - 1].id : null,
    next: idx < rows.length - 1 ? rows[idx + 1].id : null,
  }
}

// ---------- URL ↔ 상태 (searchParams 동기화) ----------

const STATUS_SET = new Set<StatusFilter>(['all', 'submitted', 'inProgress', 'scanReady'])
const SORT_KEY_SET = new Set<SortKey>(['name', 'school', 'grade', 'started', 'submitted', 'progress'])

/** 잘못된/누락된 파라미터는 기본값으로 폴백한다 */
export function parseFilters(sp: URLSearchParams): { filters: Filters; sort: Sort } {
  const status = sp.get('status') as StatusFilter | null
  const gradeRaw = Number(sp.get('grade'))
  const key = sp.get('sort') as SortKey | null
  const dir = sp.get('dir')
  return {
    filters: {
      q: sp.get('q') ?? '',
      status: status !== null && STATUS_SET.has(status) ? status : 'all',
      school: sp.get('school'),
      grade: Number.isInteger(gradeRaw) && gradeRaw > 0 ? gradeRaw : null,
      today: sp.get('today') === '1',
    },
    sort: {
      key: key !== null && SORT_KEY_SET.has(key) ? key : DEFAULT_SORT.key,
      dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_SORT.dir,
    },
  }
}

/** 기본값과 다른 키만 담은 쿼리 문자열(선행 '?' 없음) */
export function filtersToQuery(f: Filters, sort: Sort): string {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  if (f.status !== 'all') sp.set('status', f.status)
  if (f.school !== null) sp.set('school', f.school)
  if (f.grade !== null) sp.set('grade', String(f.grade))
  if (f.today) sp.set('today', '1')
  if (sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir) {
    sp.set('sort', sort.key)
    sp.set('dir', sort.dir)
  }
  return sp.toString()
}
