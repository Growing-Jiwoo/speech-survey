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

export type SortKey = 'name' | 'school' | 'started' | 'progress'
export interface Sort { key: SortKey; dir: 'asc' | 'desc' }

export interface Totals { rec: number; write: number }

export const DEFAULT_FILTERS: Filters = { q: '', status: 'all', school: null, grade: null, today: false }
export const DEFAULT_SORT: Sort = { key: 'started', dir: 'desc' }

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
  const todayKey = now.toDateString()
  let submitted = 0, today = 0
  for (const s of sessions) {
    if (s.submitted_at) submitted++
    if (new Date(s.started_at).toDateString() === todayKey) today++
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
  const todayKey = now.toDateString()
  return sessions.filter(s => {
    if (f.status === 'submitted' && !s.submitted_at) return false
    if (f.status === 'inProgress' && s.submitted_at) return false
    if (f.school !== null && s.school_name !== f.school) return false
    if (f.grade !== null && s.grade !== f.grade) return false
    if (f.today && new Date(s.started_at).toDateString() !== todayKey) return false
    if (keyword && !s.child_name.includes(keyword) && !s.school_name.includes(keyword)) return false
    return true
  })
}

export function sortSessions(rows: SessionListRow[], sort: Sort, totals: Totals): SessionListRow[] {
  const denom = totals.rec + totals.write
  const value = (s: SessionListRow): string | number => {
    switch (sort.key) {
      case 'name': return s.child_name
      case 'school': return s.school_name
      case 'started': return new Date(s.started_at).getTime()
      case 'progress': {
        const p = sessionProgress(s, totals)
        return denom === 0 ? 0 : (p.recorded + p.written) / denom
      }
    }
  }
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = value(a), vb = value(b)
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string, 'ko') : va - (vb as number)
    return cmp * sign
  })
}

// ---------- URL ↔ 상태 (searchParams 동기화) ----------

const STATUS_SET = new Set<StatusFilter>(['all', 'submitted', 'inProgress'])
const SORT_KEY_SET = new Set<SortKey>(['name', 'school', 'started', 'progress'])

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
