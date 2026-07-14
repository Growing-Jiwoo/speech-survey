import { describe, it, expect } from 'vitest'
import type { SessionListRow } from '@/lib/db'
import {
  sessionProgress, computeKpis, computeSchoolStats, schoolOptions, gradeOptions, filterSessions, sortSessions,
  parseFilters, filtersToQuery, DEFAULT_FILTERS, DEFAULT_SORT,
} from '@/lib/adminStats'

/** 테스트 픽스처 */
export function mkSession(over: Partial<SessionListRow> = {}): SessionListRow {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    school_region: '서울', school_id: 'sch-1', school_name: '가나초등학교',
    birth_ymd: '2019-03-01', grade: 1, class_no: 2, gender: '남',
    child_name: '김테스트', teacher_name: '이담임', teacher_contact: '010-0000-0000',
    checklist: [],
    started_at: '2026-07-14T01:00:00.000Z', submitted_at: null,
    recordings: [], writing_answers: [],
    ...over,
  }
}

const TOTALS = { rec: 18, write: 10 }

describe('sessionProgress', () => {
  it('중복 item_code 녹음(재녹음)은 1개로 집계한다', () => {
    const s = mkSession({
      recordings: [{ item_code: 'rw01' }, { item_code: 'rw01' }, { item_code: 'rw02' }],
      writing_answers: [{ item_code: 'ww01' }],
    })
    expect(sessionProgress(s, TOTALS)).toEqual({ recorded: 2, written: 1, incomplete: true })
  })
  it('녹음·쓰기 모두 만점이면 incomplete=false', () => {
    const s = mkSession({
      recordings: Array.from({ length: 18 }, (_, i) => ({ item_code: `r${i}` })),
      writing_answers: Array.from({ length: 10 }, (_, i) => ({ item_code: `w${i}` })),
    })
    expect(sessionProgress(s, TOTALS).incomplete).toBe(false)
  })
})

describe('computeKpis', () => {
  it('전체/제출/진행중/오늘을 집계한다', () => {
    const now = new Date('2026-07-14T05:00:00.000Z')
    const sessions = [
      mkSession({ started_at: '2026-07-14T01:00:00.000Z', submitted_at: '2026-07-14T02:00:00.000Z' }),
      mkSession({ started_at: '2026-07-14T03:00:00.000Z' }),
      mkSession({ started_at: '2026-07-10T01:00:00.000Z', submitted_at: '2026-07-10T02:00:00.000Z' }),
    ]
    expect(computeKpis(sessions, now)).toEqual({ total: 3, submitted: 2, inProgress: 1, today: 2 })
  })
  it('오늘 판정은 로컬 타임존 toDateString 기준', () => {
    const now = new Date('2026-07-14T05:00:00.000Z')
    const other = mkSession({ started_at: '2026-07-13T01:00:00.000Z' })
    expect(computeKpis([other], now).today).toBe(0)
  })
})

describe('computeSchoolStats', () => {
  it('학교별 참여·제출·제출률, 참여 수 내림차순(동률은 이름 오름차순)', () => {
    const sessions = [
      mkSession({ school_name: '가나초', submitted_at: '2026-07-14T02:00:00.000Z' }),
      mkSession({ school_name: '가나초' }),
      mkSession({ school_name: '다라초', submitted_at: '2026-07-14T02:00:00.000Z' }),
      mkSession({ school_name: '마바초' }),
    ]
    expect(computeSchoolStats(sessions)).toEqual([
      { school: '가나초', total: 2, submitted: 1, rate: 0.5 },
      { school: '다라초', total: 1, submitted: 1, rate: 1 },
      { school: '마바초', total: 1, submitted: 0, rate: 0 },
    ])
  })
})

describe('filter options', () => {
  it('schoolOptions는 중복 제거 + 가나다순, gradeOptions는 오름차순', () => {
    const sessions = [
      mkSession({ school_name: '나나초', grade: 2 }),
      mkSession({ school_name: '가가초', grade: 1 }),
      mkSession({ school_name: '나나초', grade: 1 }),
    ]
    expect(schoolOptions(sessions)).toEqual(['가가초', '나나초'])
    expect(gradeOptions(sessions)).toEqual([1, 2])
  })
})

describe('filterSessions', () => {
  const now = new Date('2026-07-14T05:00:00.000Z')
  const base = [
    mkSession({ child_name: '김하나', school_name: '가나초', grade: 1, submitted_at: '2026-07-14T02:00:00.000Z', started_at: '2026-07-14T01:00:00.000Z' }),
    mkSession({ child_name: '박둘', school_name: '다라초', grade: 2, started_at: '2026-07-10T01:00:00.000Z' }),
  ]
  const f = (over: object) => ({ q: '', status: 'all' as const, school: null, grade: null, today: false, ...over })

  it('검색어는 이름·학교 부분일치(공백 트림)', () => {
    expect(filterSessions(base, f({ q: ' 하나 ' }), now)).toHaveLength(1)
    expect(filterSessions(base, f({ q: '다라' }), now)).toHaveLength(1)
    expect(filterSessions(base, f({ q: '없음' }), now)).toHaveLength(0)
  })
  it('상태·학교·학년·오늘 필터가 AND로 결합된다', () => {
    expect(filterSessions(base, f({ status: 'submitted' }), now)).toHaveLength(1)
    expect(filterSessions(base, f({ status: 'inProgress' }), now)).toHaveLength(1)
    expect(filterSessions(base, f({ school: '가나초' }), now)).toHaveLength(1)
    expect(filterSessions(base, f({ grade: 2 }), now)).toHaveLength(1)
    expect(filterSessions(base, f({ today: true }), now)).toHaveLength(1)
    expect(filterSessions(base, f({ today: true, grade: 2 }), now)).toHaveLength(0)
  })
})

describe('sortSessions', () => {
  const TOTALS2 = { rec: 18, write: 10 }
  const a = mkSession({ child_name: '가', school_name: '나나초', started_at: '2026-07-14T01:00:00.000Z',
    recordings: [{ item_code: 'r1' }], writing_answers: [] })
  const b = mkSession({ child_name: '나', school_name: '가가초', started_at: '2026-07-13T01:00:00.000Z',
    recordings: [], writing_answers: [{ item_code: 'w1' }, { item_code: 'w2' }] })

  it('started 내림차순(기본)·오름차순', () => {
    expect(sortSessions([b, a], { key: 'started', dir: 'desc' }, TOTALS2)[0]).toBe(a)
    expect(sortSessions([a, b], { key: 'started', dir: 'asc' }, TOTALS2)[0]).toBe(b)
  })
  it('name·school은 한국어 로케일 비교', () => {
    expect(sortSessions([b, a], { key: 'name', dir: 'asc' }, TOTALS2)[0]).toBe(a)
    expect(sortSessions([a, b], { key: 'school', dir: 'asc' }, TOTALS2)[0]).toBe(b)
  })
  it('progress는 (녹음+쓰기)/(전체 문항) 비율 기준', () => {
    expect(sortSessions([b, a], { key: 'progress', dir: 'asc' }, TOTALS2)[0]).toBe(a)
    expect(sortSessions([a, b], { key: 'progress', dir: 'desc' }, TOTALS2)[0]).toBe(b)
  })
  it('원본 배열을 변형하지 않는다', () => {
    const arr = [a, b]
    sortSessions(arr, { key: 'name', dir: 'desc' }, TOTALS2)
    expect(arr[0]).toBe(a)
  })
})

describe('URL 직렬화', () => {
  it('parseFilters — 빈 쿼리는 기본값', () => {
    expect(parseFilters(new URLSearchParams())).toEqual({ filters: DEFAULT_FILTERS, sort: DEFAULT_SORT })
  })
  it('parseFilters — 값 파싱', () => {
    const sp = new URLSearchParams('q=김&status=submitted&school=가나초&grade=2&today=1&sort=name&dir=asc')
    expect(parseFilters(sp)).toEqual({
      filters: { q: '김', status: 'submitted', school: '가나초', grade: 2, today: true },
      sort: { key: 'name', dir: 'asc' },
    })
  })
  it('parseFilters — 잘못된 값은 기본값으로 폴백', () => {
    const sp = new URLSearchParams('status=bogus&grade=abc&sort=nope&dir=sideways')
    expect(parseFilters(sp)).toEqual({ filters: DEFAULT_FILTERS, sort: DEFAULT_SORT })
  })
  it('filtersToQuery — 기본값과 같은 키는 생략, 왕복 보존', () => {
    expect(filtersToQuery(DEFAULT_FILTERS, DEFAULT_SORT)).toBe('')
    const filters = { q: '김', status: 'inProgress' as const, school: '가나초', grade: 1, today: true }
    const sort = { key: 'progress' as const, dir: 'asc' as const }
    const qs = filtersToQuery(filters, sort)
    expect(parseFilters(new URLSearchParams(qs))).toEqual({ filters, sort })
  })
})
