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
