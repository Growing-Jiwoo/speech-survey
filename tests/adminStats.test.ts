import { describe, it, expect } from 'vitest'
import type { SessionListRow } from '@/lib/db'
import {
  sessionProgress, computeKpis, computeSchoolStats, schoolOptions, gradeOptions, filterSessions, sortSessions,
  parseFilters, filtersToQuery, kstDateKey, DEFAULT_FILTERS, DEFAULT_SORT, adjacentSessionIds,
  expectedTotals,
} from '@/lib/adminStats'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const RECORDING_CODES = itemsFor(formForGrade(1)).recordingPages.map(p => p.code)
const G1_WRITE = itemsFor(formForGrade(1)).writingItems.map(i => i.code)

/** 테스트 픽스처 */
export function mkSession(over: Partial<SessionListRow> = {}): SessionListRow {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    school_region: '서울', school_id: 'sch-1', school_name: '가나초등학교',
    birth_ymd: '2019-03-01', grade: 1, class_no: 2, gender: '남',
    child_name: '김테스트', teacher_name: '이담임',
    teacher_phone: null, teacher_email: null, teacher_contact: '010-0000-0000',
    checklist: [],
    started_at: '2026-07-14T01:00:00.000Z', submitted_at: null,
    guardian_consented_at: '2026-07-14T00:59:00.000Z',
    examiner_type: null, discontinued_at: null,
    recordings: [], writing_answers: [], sentence_scores: [],
    ...over,
  }
}

describe('sessionProgress', () => {
  it('중복 item_code 녹음(재녹음)은 1개로 집계한다', () => {
    const s = mkSession({
      // 재녹음은 같은 페이지 코드로 여러 번 올라온다
      recordings: [{ item_code: 'p_rw_meaning' }, { item_code: 'p_rw_meaning' }, { item_code: 'p_rw_nonsense' }],
      writing_answers: [{ item_code: 'ww01', can_write: true }],
    })
    const p = sessionProgress(s)
    expect(p.recorded).toBe(2)
    expect(p.written).toBe(1)
    expect(p.incomplete).toBe(true)
  })
  it('녹음·쓰기 모두 만점이면 incomplete=false (G1: 녹음 6 · 쓰기 10)', () => {
    const s = mkSession({
      recordings: RECORDING_CODES.map(item_code => ({ item_code })),
      writing_answers: G1_WRITE.map(item_code => ({ item_code, can_write: true })),
    })
    expect(sessionProgress(s).incomplete).toBe(false)
  })
  it('G2는 문장 쓰기 5문항이 sentence_scores에 들어 있어도 센다', () => {
    const s = mkSession({
      grade: 2,
      recordings: RECORDING_CODES.map(item_code => ({ item_code })),
      writing_answers: [],
      sentence_scores: [
        // 문장 읽기유창성(rs..)은 쓰기 진행률에 포함되지 않는다
        { item_code: 'rs01', words: 0 }, { item_code: 'rs02', words: 0 },
        ...['sw01', 'sw02', 'sw03', 'sw04', 'sw05'].map(item_code => ({ item_code, words: 2 })),
      ],
    })
    const p = sessionProgress(s)
    expect(p.written).toBe(5)
    expect(p.expected).toEqual({ rec: 6, write: 5 })
    expect(p.incomplete).toBe(false)
  })
  it('[REGRESSION] 페이지 모델 이전의 문항 단위 녹음은 세지 않는다 (분자가 분모를 넘던 문제)', () => {
    // 2026-08-07 페이지 모델 도입 전 세션은 rw01…rs04(18건)로 올라가 있다. 걸러내지 않으면
    // 분모 6에 분자 18이 찍혀 "녹음 18/6"이 된다 — 운영 DB에 실제로 그런 세션이 있다.
    const s = mkSession({
      recordings: [
        ...['rw01', 'rw02', 'rw03', 'rs01', 'rs02'].map(item_code => ({ item_code })),
        { item_code: 'p_rw_meaning' }, { item_code: 'p_rs01' },
      ],
    })
    const p = sessionProgress(s)
    expect(p.recorded).toBe(2)
    expect(p.recorded).toBeLessThanOrEqual(p.expected.rec)
  })

  it('G2 세션에서 문장 쓰기가 4개면 미완료다', () => {
    const s = mkSession({
      grade: 2,
      recordings: RECORDING_CODES.map(item_code => ({ item_code })),
      sentence_scores: ['sw01', 'sw02', 'sw03', 'sw04'].map(item_code => ({ item_code, words: 2 })),
    })
    expect(sessionProgress(s).incomplete).toBe(true)
  })
})

describe('kstDateKey', () => {
  it('UTC 시각을 KST(+9) 일자 키로 변환', () => {
    // 2026-07-13T15:00:00Z == 2026-07-14 00:00 KST
    expect(kstDateKey(new Date('2026-07-13T15:00:00.000Z'))).toBe('2026-07-14')
    // 2026-07-13T14:59:00Z == 2026-07-13 23:59 KST
    expect(kstDateKey(new Date('2026-07-13T14:59:00.000Z'))).toBe('2026-07-13')
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
    expect(computeKpis(sessions, kstDateKey(now))).toEqual({ total: 3, submitted: 2, inProgress: 1, today: 2 })
  })
  it('KST 전날(UTC 오후)은 오늘로 세지 않는다', () => {
    const now = new Date('2026-07-14T05:00:00.000Z') // 2026-07-14 14:00 KST
    const other = mkSession({ started_at: '2026-07-13T01:00:00.000Z' }) // 2026-07-13 10:00 KST
    expect(computeKpis([other], kstDateKey(now)).today).toBe(0)
  })
})

describe('computeKpis (KST 오늘)', () => {
  it('오늘 판정은 KST 일자 경계 기준', () => {
    // now = 2026-07-14 00:30 KST
    const now = new Date('2026-07-13T15:30:00.000Z')
    const sameKstDay = mkSession({ started_at: '2026-07-13T15:10:00.000Z' }) // 2026-07-14 00:10 KST → 오늘
    const prevKstDay = mkSession({ started_at: '2026-07-13T14:50:00.000Z' }) // 2026-07-13 23:50 KST → 어제
    expect(computeKpis([sameKstDay, prevKstDay], kstDateKey(now)).today).toBe(1)
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
    expect(filterSessions(base, f({ q: ' 하나 ' }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(base, f({ q: '다라' }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(base, f({ q: '없음' }), kstDateKey(now))).toHaveLength(0)
  })
  it('검색어는 담임교사명·반도 부분일치', () => {
    const rows = [
      mkSession({ child_name: '김하나', teacher_name: '이담임', class_no: 2 }),
      mkSession({ child_name: '박둘', teacher_name: '최선생', class_no: 5 }),
    ]
    expect(filterSessions(rows, f({ q: '이담임' }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(rows, f({ q: '최선생' }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(rows, f({ q: '5' }), kstDateKey(now))).toHaveLength(1) // 반 번호
  })
  it('상태·학교·학년·오늘 필터가 AND로 결합된다', () => {
    expect(filterSessions(base, f({ status: 'submitted' }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(base, f({ status: 'inProgress' }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(base, f({ school: '가나초' }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(base, f({ grade: 2 }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(base, f({ today: true }), kstDateKey(now))).toHaveLength(1)
    expect(filterSessions(base, f({ today: true, grade: 2 }), kstDateKey(now))).toHaveLength(0)
  })
})

describe('sortSessions', () => {
  const a = mkSession({ child_name: '가', school_name: '나나초', started_at: '2026-07-14T01:00:00.000Z',
    recordings: [{ item_code: 'p_rw_meaning' }], writing_answers: [] })
  const b = mkSession({ child_name: '나', school_name: '가가초', started_at: '2026-07-13T01:00:00.000Z',
    recordings: [], writing_answers: [{ item_code: 'ww01', can_write: true }, { item_code: 'ww02', can_write: true }] })

  it('started 내림차순(기본)·오름차순', () => {
    expect(sortSessions([b, a], { key: 'started', dir: 'desc' })[0]).toBe(a)
    expect(sortSessions([a, b], { key: 'started', dir: 'asc' })[0]).toBe(b)
  })
  it('name·school은 한국어 로케일 비교', () => {
    expect(sortSessions([b, a], { key: 'name', dir: 'asc' })[0]).toBe(a)
    expect(sortSessions([a, b], { key: 'school', dir: 'asc' })[0]).toBe(b)
  })
  it('progress는 (녹음+쓰기)/(전체 문항) 비율 기준', () => {
    expect(sortSessions([b, a], { key: 'progress', dir: 'asc' })[0]).toBe(a)
    expect(sortSessions([a, b], { key: 'progress', dir: 'desc' })[0]).toBe(b)
  })
  it('grade는 학년→반 순, 동일 학년·반은 이름 2차 정렬', () => {
    const g1c2n = mkSession({ child_name: '나', grade: 1, class_no: 2 })
    const g1c2a = mkSession({ child_name: '가', grade: 1, class_no: 2 })
    const g2c1 = mkSession({ child_name: '다', grade: 2, class_no: 1 })
    const sorted = sortSessions([g2c1, g1c2n, g1c2a], { key: 'grade', dir: 'asc' })
    expect(sorted.map(s => s.child_name)).toEqual(['가', '나', '다'])
  })
  it('submitted는 제출일 기준, 미제출은 최하위(asc/desc 공통으로 뒤로)', () => {
    const late = mkSession({ child_name: '나', submitted_at: '2026-07-14T05:00:00.000Z' })
    const early = mkSession({ child_name: '가', submitted_at: '2026-07-14T01:00:00.000Z' })
    const none = mkSession({ child_name: '다', submitted_at: null })
    const asc = sortSessions([none, late, early], { key: 'submitted', dir: 'asc' })
    expect(asc.map(s => s.child_name)).toEqual(['가', '나', '다'])
    const desc = sortSessions([none, early, late], { key: 'submitted', dir: 'desc' })
    expect(desc.map(s => s.child_name)).toEqual(['나', '가', '다'])
  })
  it('[REGRESSION] submitted 정렬에서 미제출 세션 여러 개가 있을 때 2차 정렬(이름)이 적용된다 (asc)', () => {
    // 미제출 세션 3개를 섞인 순서로 제공: 다→나→가
    const s다 = mkSession({ child_name: '다', submitted_at: null })
    const s나 = mkSession({ child_name: '나', submitted_at: null })
    const s가 = mkSession({ child_name: '가', submitted_at: null })
    const sorted = sortSessions([s다, s나, s가], { key: 'submitted', dir: 'asc' })
    expect(sorted.map(s => s.child_name)).toEqual(['가', '나', '다'])
  })
  it('[REGRESSION] submitted 정렬에서 미제출 세션 여러 개가 있을 때 2차 정렬(이름)이 적용된다 (desc)', () => {
    // 미제출 세션 3개를 섞인 순서로 제공: 다→나→가
    // desc에서도 미제출 끼리는 이름 정렬(항상 오름차순)
    const s다 = mkSession({ child_name: '다', submitted_at: null })
    const s나 = mkSession({ child_name: '나', submitted_at: null })
    const s가 = mkSession({ child_name: '가', submitted_at: null })
    const sorted = sortSessions([s다, s나, s가], { key: 'submitted', dir: 'desc' })
    expect(sorted.map(s => s.child_name)).toEqual(['가', '나', '다'])
  })
  it('원본 배열을 변형하지 않는다', () => {
    const arr = [a, b]
    sortSessions(arr, { key: 'name', dir: 'desc' })
    expect(arr[0]).toBe(a)
  })
})

describe('adjacentSessionIds', () => {
  const rows = [
    mkSession({ id: 'a' }), mkSession({ id: 'b' }), mkSession({ id: 'c' }),
  ]
  it('가운데 항목은 앞/뒤 모두 반환', () => {
    expect(adjacentSessionIds(rows, 'b')).toEqual({ prev: 'a', next: 'c' })
  })
  it('처음/끝 경계는 해당 방향 null', () => {
    expect(adjacentSessionIds(rows, 'a')).toEqual({ prev: null, next: 'b' })
    expect(adjacentSessionIds(rows, 'c')).toEqual({ prev: 'b', next: null })
  })
  it('목록에 없으면 둘 다 null', () => {
    expect(adjacentSessionIds(rows, 'zzz')).toEqual({ prev: null, next: null })
  })
  it('빈 목록도 안전', () => {
    expect(adjacentSessionIds([], 'a')).toEqual({ prev: null, next: null })
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
  it('parseFilters — 신규 sort 키(grade/submitted) 허용', () => {
    expect(parseFilters(new URLSearchParams('sort=grade&dir=asc')).sort).toEqual({ key: 'grade', dir: 'asc' })
    expect(parseFilters(new URLSearchParams('sort=submitted&dir=desc')).sort).toEqual({ key: 'submitted', dir: 'desc' })
  })
  it('filtersToQuery — 기본값과 같은 키는 생략, 왕복 보존', () => {
    expect(filtersToQuery(DEFAULT_FILTERS, DEFAULT_SORT)).toBe('')
    const filters = { q: '김', status: 'inProgress' as const, school: '가나초', grade: 1, today: true }
    const sort = { key: 'progress' as const, dir: 'asc' as const }
    const qs = filtersToQuery(filters, sort)
    expect(parseFilters(new URLSearchParams(qs))).toEqual({ filters, sort })
  })
})

describe('중단 규칙이 적용된 세션의 진행률 (규칙대로 끝난 검사를 미완료로 세지 않기 위함)', () => {
  // 규칙 ① 세션: 무의미 낱말도 실시하지 않으므로 녹음 분모가 1(의미 낱말)이다.
  // 쓰기는 실시한다 — 쓰기가 비면 미완료가 맞다.
  it('① 세션은 의미 낱말 녹음 1건 + 쓰기 전체로 완료다', () => {
    const s = mkSession({
      discontinued_at: '2026-08-10T01:00:00.000Z',
      recordings: [{ item_code: 'p_rw_meaning' }],
      writing_answers: G1_WRITE.map(item_code => ({ item_code, can_write: true })),
    })
    expect(sessionProgress(s).incomplete).toBe(false)
  })

  it('① 세션이라도 쓰기가 비면 미완료다 (쓰기는 실시하는 과제다)', () => {
    const s = mkSession({
      discontinued_at: '2026-08-10T01:00:00.000Z',
      recordings: [{ item_code: 'p_rw_meaning' }],
      writing_answers: [],
    })
    expect(sessionProgress(s).incomplete).toBe(true)
  })

  it('① 세션에서 쓰기 1번이 0점이면(규칙 ②) 쓰기 분모도 1이다', () => {
    const s = mkSession({
      discontinued_at: '2026-08-10T01:00:00.000Z',
      recordings: [{ item_code: 'p_rw_meaning' }],
      writing_answers: [{ item_code: 'ww01', can_write: false }],
    })
    expect(sessionProgress(s).incomplete).toBe(false)
  })

  it('중단되지 않은 같은 데이터는 미완료다', () => {
    const s = mkSession({
      discontinued_at: null,
      recordings: [{ item_code: 'p_rw_meaning' }],
      writing_answers: [{ item_code: 'ww01', can_write: true }],
    })
    expect(sessionProgress(s).incomplete).toBe(true)
  })

  it('expectedTotals: 중단 여부·학년·쓰기 답으로 분모가 갈린다', () => {
    expect(expectedTotals(mkSession({ grade: 1 }))).toEqual({ rec: 6, write: 10 })
    expect(expectedTotals(mkSession({ grade: 2 }))).toEqual({ rec: 6, write: 5 })
    const disc = '2026-08-10T01:00:00.000Z'
    expect(expectedTotals(mkSession({ discontinued_at: disc, grade: 1 })))
      .toEqual({ rec: 1, write: 10 })
    expect(expectedTotals(mkSession({ discontinued_at: disc, grade: 2 })))
      .toEqual({ rec: 1, write: 5 })
    // 규칙 ② — 1번 문항 0점이 저장돼 있으면 쓰기 분모가 1로 준다
    expect(expectedTotals(mkSession({
      grade: 2, sentence_scores: [{ item_code: 'sw01', words: 0 }],
    }))).toEqual({ rec: 6, write: 1 })
    expect(expectedTotals(mkSession({
      grade: 1, writing_answers: [{ item_code: 'ww01', can_write: false }],
    }))).toEqual({ rec: 6, write: 1 })
    // 1점은 오반응이 아니다 — 분모 전체 유지
    expect(expectedTotals(mkSession({
      grade: 2, sentence_scores: [{ item_code: 'sw01', words: 1 }],
    }))).toEqual({ rec: 6, write: 5 })
  })
})
