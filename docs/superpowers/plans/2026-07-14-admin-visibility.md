# /admin 데이터 가시성 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin` 목록 페이지에 KPI 카드·학교별 현황·필터/정렬/진행률 시각화를 추가하고 상태를 URL에 동기화한다.

**Architecture:** 서버 컴포넌트(`app/admin/page.tsx`)는 기존 `listSessions()` 호출만 유지하고, 집계·필터·정렬·URL 직렬화는 전부 순수 함수 모듈 `lib/adminStats.ts`(React 무의존, vitest 대상)에 둔다. 클라이언트는 `AdminDashboard`(URL이 유일한 상태 소스, `router.replace`로 갱신)가 `StatsCards`/`SchoolBreakdown`/`SessionTable`(presentational)을 조립한다.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4(@theme 토큰: blue/mint/amber/rec/ink-*/well/line), vitest.

**스펙:** `docs/superpowers/specs/2026-07-14-admin-visibility-design.md`

**참고 — 기존 코드 사실관계:**
- `lib/db.ts`의 `SessionListRow = SessionRow & { recordings: {item_code}[]; writing_answers: {item_code}[] }`. 세션 컬럼: `id, school_name, birth_ymd, grade, class_no, gender, child_name, started_at(ISO string), submitted_at(string|null), checklist(string[])` 등.
- `lib/items.ts`: `RECORDING_ITEMS`(18개), `WRITING_ITEMS`(10개).
- 테스트는 `tests/*.test.ts`, `@/` alias 사용, 한국어 it 설명 관례.
- `.kpi` CSS 클래스가 `app/globals.css`에 있음(작은 배지) — KPI 카드는 별도 Tailwind로 만들고 `.kpi`는 결과지에서 계속 쓰므로 삭제하지 않는다.
- 명령: `npm test`(vitest run), `npm run typecheck`.

---

### Task 1: `lib/adminStats.ts` — 타입 · 진행률 · KPI 집계

**Files:**
- Create: `lib/adminStats.ts`
- Test: `tests/adminStats.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/adminStats.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest'
import type { SessionListRow } from '@/lib/db'
import { sessionProgress, computeKpis } from '@/lib/adminStats'

/** 테스트 픽스처 — 이후 태스크의 테스트도 이 헬퍼를 공유한다 */
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: FAIL — `Cannot find module '@/lib/adminStats'` (또는 export 없음)

- [ ] **Step 3: 최소 구현**

`lib/adminStats.ts` 생성:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/adminStats.ts tests/adminStats.test.ts
git commit -m "feat(admin): adminStats — 진행률·KPI 순수 함수"
```

---

### Task 2: 학교별 집계 + 필터 옵션 목록

**Files:**
- Modify: `lib/adminStats.ts` (함수 추가)
- Modify: `tests/adminStats.test.ts` (describe 추가)

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/adminStats.test.ts` 상단 import에 `computeSchoolStats, schoolOptions, gradeOptions` 추가 후 파일 끝에:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: FAIL — `computeSchoolStats` export 없음

- [ ] **Step 3: 구현**

`lib/adminStats.ts` 끝에 추가:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/adminStats.ts tests/adminStats.test.ts
git commit -m "feat(admin): 학교별 집계·필터 옵션 함수"
```

---

### Task 3: 필터링 + 정렬

**Files:**
- Modify: `lib/adminStats.ts`
- Modify: `tests/adminStats.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

import에 `filterSessions, sortSessions` 추가 후 파일 끝에:

```ts
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
    // a: 1/28, b: 2/28
    expect(sortSessions([b, a], { key: 'progress', dir: 'asc' }, TOTALS2)[0]).toBe(a)
    expect(sortSessions([a, b], { key: 'progress', dir: 'desc' }, TOTALS2)[0]).toBe(b)
  })
  it('원본 배열을 변형하지 않는다', () => {
    const arr = [a, b]
    sortSessions(arr, { key: 'name', dir: 'desc' }, TOTALS2)
    expect(arr[0]).toBe(a)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: FAIL — `filterSessions` export 없음

- [ ] **Step 3: 구현**

`lib/adminStats.ts` 끝에 추가:

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/adminStats.ts tests/adminStats.test.ts
git commit -m "feat(admin): 세션 필터링·정렬 함수"
```

---

### Task 4: URL ↔ 상태 직렬화

**Files:**
- Modify: `lib/adminStats.ts`
- Modify: `tests/adminStats.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

import에 `parseFilters, filtersToQuery, DEFAULT_FILTERS, DEFAULT_SORT` 추가 후 파일 끝에:

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: FAIL — `parseFilters` export 없음

- [ ] **Step 3: 구현**

`lib/adminStats.ts` 끝에 추가:

```ts
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
```

- [ ] **Step 4: 통과 확인 + 전체 테스트**

Run: `npx vitest run tests/adminStats.test.ts` → PASS (16 tests)
Run: `npm test` → 기존 테스트 포함 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add lib/adminStats.ts tests/adminStats.test.ts
git commit -m "feat(admin): 필터·정렬 URL 직렬화 함수"
```

---

### Task 5: `StatsCards` + `SchoolBreakdown` 컴포넌트

presentational 컴포넌트라 단위 테스트 없음(로직은 Task 1~2에서 검증됨). 타입체크로 검증.

**Files:**
- Create: `components/admin/StatsCards.tsx`
- Create: `components/admin/SchoolBreakdown.tsx`

- [ ] **Step 1: StatsCards 작성**

`components/admin/StatsCards.tsx` 생성:

```tsx
'use client'
import type { Kpis, StatusFilter } from '@/lib/adminStats'

export type KpiKind = 'total' | 'submitted' | 'inProgress' | 'today'

/** KPI 카드 4장 — 클릭 시 해당 필터 토글 (제출/진행중 → status, 오늘 → today, 전체 → 해제) */
export function StatsCards({ kpis, activeStatus, activeToday, onSelect }: {
  kpis: Kpis; activeStatus: StatusFilter; activeToday: boolean; onSelect: (kind: KpiKind) => void
}) {
  const cards: { kind: KpiKind; label: string; value: number; on: boolean }[] = [
    { kind: 'total', label: '전체 세션', value: kpis.total, on: activeStatus === 'all' && !activeToday },
    { kind: 'submitted', label: '제출 완료', value: kpis.submitted, on: activeStatus === 'submitted' },
    { kind: 'inProgress', label: '진행 중', value: kpis.inProgress, on: activeStatus === 'inProgress' },
    { kind: 'today', label: '오늘 참여', value: kpis.today, on: activeToday },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 border-b border-line px-5 py-4 sm:grid-cols-4">
      {cards.map(c => (
        <button key={c.kind} type="button" onClick={() => onSelect(c.kind)} aria-pressed={c.on}
          className={`rounded-2xl border-[1.5px] px-4 py-3 text-left transition ${
            c.on ? 'border-blue bg-blue/5' : 'border-line bg-well hover:border-ink-mute/40'}`}>
          <p className="text-[11px] font-bold text-ink-mute">{c.label}</p>
          <p className={`font-read text-2xl font-bold ${c.on ? 'text-blue' : 'text-ink'}`}>{c.value}</p>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: SchoolBreakdown 작성**

`components/admin/SchoolBreakdown.tsx` 생성:

```tsx
'use client'
import { useState } from 'react'
import type { SchoolStat } from '@/lib/adminStats'

const VISIBLE = 6

/** 학교별 참여·제출 현황 — 막대 폭은 최다 참여 학교 대비 비율, 채움은 제출률 */
export function SchoolBreakdown({ stats, activeSchool, onSelect }: {
  stats: SchoolStat[]; activeSchool: string | null; onSelect: (school: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  if (stats.length === 0) return null
  const max = stats[0].total
  const shown = expanded ? stats : stats.slice(0, VISIBLE)
  return (
    <div className="border-b border-line px-5 py-4">
      <p className="mb-2 text-[13px] font-bold text-ink-soft">학교별 현황</p>
      <ul className="flex flex-col gap-1">
        {shown.map(st => {
          const on = activeSchool === st.school
          return (
            <li key={st.school}>
              <button type="button" onClick={() => onSelect(st.school)} aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition ${
                  on ? 'bg-blue/5 ring-[1.5px] ring-blue' : 'hover:bg-well'}`}>
                <span className="w-40 truncate text-sm font-bold">{st.school}</span>
                <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-ink/5">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-blue/25"
                    style={{ width: `${(st.total / max) * 100}%` }} />
                  <span className="absolute inset-y-0 left-0 rounded-full bg-mint"
                    style={{ width: `${(st.submitted / max) * 100}%` }} />
                </span>
                <span className="w-32 shrink-0 text-right text-xs text-ink-soft">
                  <b className="font-read text-ink">{st.submitted}</b>/{st.total}명 제출
                  <span className="ml-1 text-ink-mute">({Math.round(st.rate * 100)}%)</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {stats.length > VISIBLE && (
        <button type="button" onClick={() => setExpanded(v => !v)}
          className="mt-2 text-xs font-bold text-blue">
          {expanded ? '접기' : `전체 ${stats.length}개 학교 보기`}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add components/admin/StatsCards.tsx components/admin/SchoolBreakdown.tsx
git commit -m "feat(admin): KPI 카드·학교별 현황 컴포넌트"
```

---

### Task 6: `SessionTable` 개편 (필터 바 + 정렬 + 진행률 바 + 배지 3단계)

**Files:**
- Modify: `components/admin/SessionTable.tsx` (전면 재작성)

- [ ] **Step 1: 전면 재작성**

`components/admin/SessionTable.tsx` 전체를 아래로 교체:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SessionListRow } from '@/lib/db'
import { sessionProgress, type Filters, type Sort, type SortKey, type StatusFilter, type Totals } from '@/lib/adminStats'

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'submitted', label: '제출' },
  { key: 'inProgress', label: '진행 중' },
]

/** 관리자 세션 목록 — 필터/정렬 상태는 부모(AdminDashboard)가 보유, 여기는 표시와 콜백만 */
export function SessionTable({ rows, total, totals, filters, sort, schools, grades, onFilters, onSort, onReset }: {
  rows: SessionListRow[]           // 필터·정렬 적용 완료본
  total: number                    // 전체 세션 수 (빈 상태 문구 분기용)
  totals: Totals
  filters: Filters
  sort: Sort
  schools: string[]
  grades: number[]
  onFilters: (patch: Partial<Filters>) => void
  onSort: (key: SortKey) => void
  onReset: () => void
}) {
  // 검색 입력은 로컬 상태 + 250ms 디바운스로 URL에 반영
  const [qLocal, setQLocal] = useState(filters.q)
  useEffect(() => { setQLocal(filters.q) }, [filters.q])
  useEffect(() => {
    const t = setTimeout(() => { if (qLocal !== filters.q) onFilters({ q: qLocal }) }, 250)
    return () => clearTimeout(t)
  }, [qLocal])  // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilter = filters.q !== '' || filters.status !== 'all'
    || filters.school !== null || filters.grade !== null || filters.today

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <input value={qLocal} onChange={e => setQLocal(e.target.value)} placeholder="이름 또는 학교 검색"
          className="h-10 w-52 rounded-xl border-[1.5px] border-line bg-well px-3.5 text-sm outline-none transition focus:border-blue" />
        <div className="flex gap-1.5">
          {STATUS_TABS.map(t => (
            <button key={t.key} type="button" onClick={() => onFilters({ status: t.key })} aria-pressed={filters.status === t.key}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                filters.status === t.key ? 'bg-blue text-white' : 'bg-well text-ink-soft'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={filters.school ?? ''} onChange={e => onFilters({ school: e.target.value || null })}
          aria-label="학교 필터"
          className="h-9 rounded-xl border-[1.5px] border-line bg-well px-2.5 text-xs outline-none focus:border-blue">
          <option value="">학교 전체</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.grade ?? ''} onChange={e => onFilters({ grade: e.target.value ? Number(e.target.value) : null })}
          aria-label="학년 필터"
          className="h-9 rounded-xl border-[1.5px] border-line bg-well px-2.5 text-xs outline-none focus:border-blue">
          <option value="">학년 전체</option>
          {grades.map(g => <option key={g} value={g}>{g}학년</option>)}
        </select>
        {filters.today && <Chip label="오늘 참여" onRemove={() => onFilters({ today: false })} />}
        {filters.school !== null && <Chip label={filters.school} onRemove={() => onFilters({ school: null })} />}
        {filters.grade !== null && <Chip label={`${filters.grade}학년`} onRemove={() => onFilters({ grade: null })} />}
        <div className="ml-auto flex items-center gap-2">
          {hasFilter && (
            <>
              <span className="text-xs text-ink-mute">{rows.length}건 표시</span>
              <button type="button" onClick={onReset} className="text-xs font-bold text-blue underline">초기화</button>
            </>
          )}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-mute">
            <Th label="이름" sortKey="name" sort={sort} onSort={onSort} className="px-5 py-3" />
            <Th label="학교" sortKey="school" sort={sort} onSort={onSort} />
            <th scope="col" className="font-medium">학년/반</th>
            <th scope="col" className="font-medium">생년월일</th>
            <Th label="시작" sortKey="started" sort={sort} onSort={onSort} />
            <Th label="진행률" sortKey="progress" sort={sort} onSort={onSort} />
            <th scope="col" className="font-medium">체크</th>
            <th scope="col" className="pr-5 font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(s => {
            const p = sessionProgress(s, totals)
            return (
              <tr key={s.id} className="border-t border-line/60 hover:bg-well">
                <td className="px-5 py-2">
                  <Link href={`/admin/${s.id}`} className="font-bold text-blue">{s.child_name}</Link>
                </td>
                <td>{s.school_name}</td>
                <td>{s.grade}-{s.class_no}</td>
                <td className="text-ink-soft">{s.birth_ymd}</td>
                <td className="text-ink-soft">{new Date(s.started_at).toLocaleString('ko-KR')}</td>
                <td><ProgressCell recorded={p.recorded} written={p.written} totals={totals} /></td>
                <td>
                  {s.checklist.length > 0
                    ? <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-xs font-bold text-amber">{s.checklist.length}개 영역</span>
                    : <span className="text-xs text-ink-mute">—</span>}
                </td>
                <td className="pr-5"><StatusBadge submitted={!!s.submitted_at} incomplete={p.incomplete} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="p-8 text-center text-sm text-ink-mute">
          {total === 0 ? '아직 참여한 세션이 없습니다.' : '조건에 맞는 세션이 없습니다.'}
        </p>
      )}
    </>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-blue/10 px-2.5 py-1 text-xs font-bold text-blue">
      {label}
      <button type="button" onClick={onRemove} aria-label={`${label} 필터 제거`} className="leading-none">×</button>
    </span>
  )
}

function Th({ label, sortKey, sort, onSort, className = '' }: {
  label: string; sortKey: SortKey; sort: Sort; onSort: (k: SortKey) => void; className?: string
}) {
  const on = sort.key === sortKey
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`font-medium ${className}`}>
      <button type="button" onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-0.5 ${on ? 'font-bold text-ink' : ''}`}>
        {label}{on && <span aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )
}

/** 상태 배지 3단계: 제출 완료(mint) / 제출·미완료 있음(amber) / 진행 중(회색) */
function StatusBadge({ submitted, incomplete }: { submitted: boolean; incomplete: boolean }) {
  if (!submitted)
    return <span className="whitespace-nowrap rounded-full bg-ink/5 px-3 py-1 text-xs font-bold text-ink-mute">진행 중</span>
  if (incomplete)
    return <span className="whitespace-nowrap rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">제출 · 미완료 있음</span>
  return <span className="whitespace-nowrap rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">제출 완료</span>
}

function ProgressCell({ recorded, written, totals }: { recorded: number; written: number; totals: Totals }) {
  return (
    <div className="flex min-w-[140px] flex-col gap-1 py-1.5">
      <Track label="녹음" value={recorded} max={totals.rec} />
      <Track label="쓰기" value={written} max={totals.write} />
    </div>
  )
}

function Track({ label, value, max }: { label: string; value: number; max: number }) {
  const full = value >= max
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-7 text-[10px] text-ink-mute">{label}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/10">
        <span className={`block h-full rounded-full ${full ? 'bg-mint' : 'bg-rec'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-read text-[11px] ${full ? 'text-ink-soft' : 'font-bold text-rec-deep'}`}>{value}/{max}</span>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크 (page.tsx가 아직 구 props를 넘기므로 실패 예상 — 확인만)**

Run: `npm run typecheck`
Expected: `app/admin/page.tsx`에서 SessionTable props 불일치 에러 — Task 7에서 해소. 그 외 에러가 없어야 한다.

- [ ] **Step 3: Commit (Task 7과 함께 커밋해도 무방하나, 여기선 보류)**

커밋하지 않는다 — Task 7에서 page.tsx 연결까지 마친 뒤 함께 커밋해 빌드 가능 상태를 유지한다.

---

### Task 7: `AdminDashboard` + `page.tsx` 연결

**Files:**
- Create: `components/admin/AdminDashboard.tsx`
- Modify: `app/admin/page.tsx` (전면 교체)

- [ ] **Step 1: AdminDashboard 작성**

`components/admin/AdminDashboard.tsx` 생성:

```tsx
'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { SessionListRow } from '@/lib/db'
import {
  DEFAULT_FILTERS, DEFAULT_SORT, computeKpis, computeSchoolStats, filterSessions, filtersToQuery,
  gradeOptions, parseFilters, schoolOptions, sortSessions,
  type Filters, type Sort, type SortKey, type Totals,
} from '@/lib/adminStats'
import { Blip } from '@/components/Blip'
import { StatsCards, type KpiKind } from '@/components/admin/StatsCards'
import { SchoolBreakdown } from '@/components/admin/SchoolBreakdown'
import { SessionTable } from '@/components/admin/SessionTable'

/** /admin 대시보드 — 필터·정렬 상태의 단일 소스는 URL searchParams */
export function AdminDashboard({ sessions, totals }: { sessions: SessionListRow[]; totals: Totals }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const { filters, sort } = parseFilters(new URLSearchParams(sp.toString()))

  const apply = (f: Filters, s: Sort) => {
    const qs = filtersToQuery(f, s)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const patchFilters = (patch: Partial<Filters>) => apply({ ...filters, ...patch }, sort)

  const onKpi = (kind: KpiKind) => {
    if (kind === 'total') apply(DEFAULT_FILTERS, sort)
    else if (kind === 'submitted') patchFilters({ status: filters.status === 'submitted' ? 'all' : 'submitted' })
    else if (kind === 'inProgress') patchFilters({ status: filters.status === 'inProgress' ? 'all' : 'inProgress' })
    else patchFilters({ today: !filters.today })
  }
  const onSort = (key: SortKey) =>
    apply(filters, sort.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'started' ? 'desc' : 'asc' })

  const now = new Date()
  const kpis = computeKpis(sessions, now)
  const rows = sortSessions(filterSessions(sessions, filters, now), sort, totals)

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <Blip variant="logo" className="h-8 w-8" />
        <div>
          <p className="text-[15px] font-bold">KODYS-G1 읽기 검사 · 관리자</p>
          <p className="text-[11px] text-ink-mute">이름을 누르면 결과지가 열립니다 · 카드와 학교를 누르면 목록이 필터링됩니다</p>
        </div>
      </div>
      <StatsCards kpis={kpis} activeStatus={filters.status} activeToday={filters.today} onSelect={onKpi} />
      <SchoolBreakdown stats={computeSchoolStats(sessions)} activeSchool={filters.school}
        onSelect={school => patchFilters({ school: filters.school === school ? null : school })} />
      <SessionTable rows={rows} total={sessions.length} totals={totals} filters={filters} sort={sort}
        schools={schoolOptions(sessions)} grades={gradeOptions(sessions)}
        onFilters={patchFilters} onSort={onSort} onReset={() => apply(DEFAULT_FILTERS, DEFAULT_SORT)} />
    </div>
  )
}
```

- [ ] **Step 2: page.tsx 교체**

`app/admin/page.tsx` 전체를 아래로 교체 (`useSearchParams` 사용 클라이언트 컴포넌트는 Suspense 경계 필요):

```tsx
import { Suspense } from 'react'
import { listSessions } from '@/lib/db'
import { RECORDING_ITEMS, WRITING_ITEMS } from '@/lib/items'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminList() {
  const sessions = await listSessions()
  return (
    <main className="mx-auto max-w-5xl p-6">
      <Suspense>
        <AdminDashboard sessions={sessions}
          totals={{ rec: RECORDING_ITEMS.length, write: WRITING_ITEMS.length }} />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 3: 검증**

Run: `npm run typecheck` → 에러 없음
Run: `npm test` → 전체 PASS
Run: `npm run build` → 빌드 성공 (Suspense/useSearchParams 프리렌더 에러 없는지 확인)

- [ ] **Step 4: Commit**

```bash
git add components/admin/ app/admin/page.tsx
git commit -m "feat(admin): 대시보드 개편 — KPI 카드·학교별 현황·정렬·진행률 바·URL 필터 동기화"
```

---

### Task 8: 수동 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 로컬 실행 후 브라우저 확인**

Run: `npm run dev` → http://localhost:3000/admin (로그인: `.env.local`의 비밀번호)

체크리스트:
- KPI 카드 4장 수치가 테이블과 일치, 클릭 시 필터 토글·활성 강조
- 학교별 현황 막대·제출률, 클릭 시 학교 필터 토글, 7개 학교 이상이면 접기/펼치기
- 검색 입력 250ms 후 URL `?q=` 반영, 새로고침해도 필터 유지
- 학교/학년 드롭다운 + 칩 제거 + 초기화 버튼 동작
- 헤더 클릭 정렬(이름/학교/시작/진행률) 화살표 표시, 재클릭 시 방향 반전
- 상태 배지: 제출 완료=초록, 제출·미완료=주황, 진행 중=회색
- 세션 0건 / 필터 결과 0건 빈 상태 문구
- 결과지(`/admin/[id]`) 이동 후 뒤로가기 시 필터 유지(URL 보존)

- [ ] **Step 2: 발견된 문제 수정 후 커밋**

문제가 있으면 수정하고 `fix(admin): ...`으로 커밋. 없으면 종료.
```

## Self-Review 결과 (작성 후 점검)

- 스펙 커버리지: KPI 카드(T1/T5), 학교별 현황(T2/T5), 필터 확장·칩·초기화(T3/T6), 정렬(T3/T6), 진행률 바(T6), 배지 3단계(T6), URL 동기화(T4/T7), 생년월일 유지(T6) — 전부 태스크 존재.
- 타입 일관성: `Filters/Sort/Totals/Kpis/SchoolStat/KpiKind` 시그니처 태스크 간 일치 확인.
- 플레이스홀더 없음.
