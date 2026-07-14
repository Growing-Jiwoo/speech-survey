import type { SessionListRow } from '@/lib/db'

// ---------- 타입 ----------

export type StatusFilter = 'all' | 'submitted' | 'inProgress'

export interface Filters {
  q: string
  status: StatusFilter
  school: string | null
  grade: number | null
  today: boolean
}

export type SortKey = 'name' | 'school' | 'grade' | 'started' | 'submitted' | 'progress'
export interface Sort { key: SortKey; dir: 'asc' | 'desc' }

export interface Totals { rec: number; write: number }

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

/** 세션 1건의 진행률 — 재녹음(같은 item_code 복수 attempt)은 1문항으로 센다 */
export function sessionProgress(s: SessionListRow, totals: Totals): {
  recorded: number; written: number; incomplete: boolean
} {
  const recorded = new Set(s.recordings.map(r => r.item_code)).size
  const written = s.writing_answers.length
  return { recorded, written, incomplete: recorded < totals.rec || written < totals.write }
}

export interface Kpis { total: number; submitted: number; inProgress: number; today: number }

export function computeKpis(sessions: SessionListRow[], now: Date): Kpis {
  const todayKey = kstDateKey(now)
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

export function filterSessions(sessions: SessionListRow[], f: Filters, now: Date): SessionListRow[] {
  const keyword = f.q.trim()
  const todayKey = kstDateKey(now)
  return sessions.filter(s => {
    if (f.status === 'submitted' && !s.submitted_at) return false
    if (f.status === 'inProgress' && s.submitted_at) return false
    if (f.school !== null && s.school_name !== f.school) return false
    if (f.grade !== null && s.grade !== f.grade) return false
    if (f.today && kstDateKey(new Date(s.started_at)) !== todayKey) return false
    if (keyword
      && !s.child_name.includes(keyword)
      && !s.school_name.includes(keyword)
      && !s.teacher_name.includes(keyword)
      && !String(s.class_no).includes(keyword)) return false
    return true
  })
}

export function sortSessions(rows: SessionListRow[], sort: Sort, totals: Totals): SessionListRow[] {
  const denom = totals.rec + totals.write
  // 미제출(제출일 없음)은 방향과 무관하게 항상 목록 끝으로 보내기 위한 sentinel.
  const NO_SUBMIT = { asc: Number.POSITIVE_INFINITY, desc: Number.NEGATIVE_INFINITY }
  const value = (s: SessionListRow): string | number => {
    switch (sort.key) {
      case 'name': return s.child_name
      case 'school': return s.school_name
      case 'grade': return s.grade * 100 + s.class_no
      case 'started': return new Date(s.started_at).getTime()
      case 'submitted': return s.submitted_at ? new Date(s.submitted_at).getTime() : NO_SUBMIT[sort.dir]
      case 'progress': {
        const p = sessionProgress(s, totals)
        return denom === 0 ? 0 : (p.recorded + p.written) / denom
      }
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

// ---------- URL ↔ 상태 (searchParams 동기화) ----------

const STATUS_SET = new Set<StatusFilter>(['all', 'submitted', 'inProgress'])
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
