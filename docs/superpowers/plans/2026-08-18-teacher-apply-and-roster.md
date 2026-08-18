# 교사 신청·학급 명단 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 공개 링크로 신청(학급 정보+명단 파일)하면 관리자가 승인 버튼 한 번으로 학급 코드를 메일 발송하고, 검사 현장은 드롭다운에서 아동을 고르기만 하게 한다.

**Architecture:** 신청 = pending 상태의 `class_codes` 행 + `class_roster` 명단(스펙 2026-08-18). 승인이 active로 바꾸며 메일을 보낸다. 검사 시작은 verify-code가 명단을 돌려주고, 세션 생성 시 서버가 명단에서 값을 복사한다. 명단 파싱은 브라우저에서(lib/xlsx + lib/roster) — 파일은 서버로 가지 않는다.

**Tech Stack:** 기존 스택 그대로(Next.js 16·Supabase·zod·vitest). 새 의존성 없음. 기반 모듈은 feat/apply-foundation에 있음: lib/birth(35 tests)·lib/xlsx(8 tests)·lib/mail(11 tests).

**진행 관례:** 각 PR 마지막 태스크의 게이트(typecheck·lint·test·build 전부 통과) 후 커밋→푸시→PR 생성→merge commit 머지까지 진행한다. PR 생성·머지 시에만 `gh auth switch --user Growing-Jiwoo`, 끝나면 즉시 `ipf-jiwookim`으로 복귀. `next-env.d.ts` 변경분은 커밋하지 말고 `git checkout next-env.d.ts`.

**⚠️ 실 DB에는 마이그레이션 003이 이미 적용돼 있다**(2026-08-18, 사용자가 SQL Editor에서 실행 + RLS 활성). Task 1은 파일 기록이 목적이며 재실행하지 않는다.

---

## 파일 구조

```
supabase/migrations/003_apply_and_roster.sql   [신규] status·applied_at·class_roster
lib/schema.ts        [수정] classCodeFields 분리(refine 탓에 extend 불가) + rosterChildSchema + applySchema + 세션 union
lib/roster.ts        [신규] 명단 그리드 파싱·검증 (화면 로직의 lib 추출 — 관례)
lib/db.ts            [수정] status 반영 + insertApplication·approveClassCode·listRoster·rosterWithTested
lib/request.ts       [수정] APPLY_RATE_LIMIT
app/api/apply/route.ts                 [신규] 공개 신청 접수
app/api/admin/codes/[id]/approve/route.ts  [신규] 승인+메일
app/api/sessions/verify-code/route.ts  [수정] pending 거부 + roster 응답
app/api/sessions/route.ts              [수정] 명단 모드 분기 + pending 거부
app/apply/page.tsx                     [신규] 신청 화면
components/apply/RosterEditor.tsx      [신규] 업로드→고정 표→수정
components/admin/CodeIssuer.tsx        [수정] 대기 목록·승인·명단 보기
app/page.tsx                           [수정] 드롭다운 + 「명단에 없는 학생」 예비 경로
tests/roster.test.ts · apply-route.test.ts [신규] / schema·db·admin-codes·verify-code·sessions-route [확장]
```

---

# PR A — 신청 접수 (`feat/apply-form`)

브랜치는 `feat/apply-foundation`에서 딴다(기반 모듈 필요). foundation이 먼저 머지되면 main에서.

### Task 1: 마이그레이션 003 파일 기록

**Files:**
- Create: `supabase/migrations/003_apply_and_roster.sql`
- Modify: `supabase/migrations/README.md` (표에 한 줄 추가)

- [ ] **Step 1: 마이그레이션 파일 작성** (실 DB 기적용 — 파일은 새 환경 셋업용 기록)

```sql
-- 003: 교사 신청(pending 코드) + 학급 명단
-- 스펙: docs/superpowers/specs/2026-08-18-teacher-apply-and-roster-design.md
-- ⚠️ 운영 DB에는 2026-08-18에 이미 적용됨(RLS 포함). 새 환경 셋업 시에만 실행할 것.

-- 신청 경로가 pending으로 생성하고 승인이 active로 바꾼다.
-- default 'active'라 기존 행·관리자 직접 발급은 동작이 변하지 않는다.
alter table class_codes add column status text not null default 'active'
  check (status in ('pending', 'active'));
alter table class_codes add column applied_at timestamptz;  -- 신청 시각(직접 발급은 null)

-- 학급 명단. 제약은 sessions의 같은 컬럼과 동일 규칙 — 명단→세션 복사가 어긋날 수 없다.
-- on delete cascade: 거절(코드 행 삭제) 즉시 아동 실명 명단도 함께 사라진다(PII).
create table class_roster (
  id            uuid primary key default gen_random_uuid(),
  class_code_id uuid not null references class_codes(id) on delete cascade,
  child_no      int  not null check (child_no between 1 and 99),
  child_name    text not null,
  gender        text not null check (gender in ('남','여')),
  birth_ymd     char(6) not null check (birth_ymd ~ '^[0-9]{6}$'),
  unique (class_code_id, child_no)
);
alter table class_roster enable row level security;  -- 정책 없음 = anon 전면 차단(001 관례)
```

- [ ] **Step 2: supabase/migrations/README.md 표에 추가**

기존 표(001·002 행) 아래에:

```markdown
| `003_apply_and_roster.sql` | 교사 신청: `class_codes.status`(pending/active)·`applied_at` + 학급 명단 `class_roster`(RLS). 스펙 2026-08-18 |
```

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/003_apply_and_roster.sql supabase/migrations/README.md
git commit -m "feat(db): 신청 상태·학급 명단 스키마 (migration 003)

실 DB에는 2026-08-18 기적용 — 새 환경 셋업용 기록."
```

### Task 2: 스키마 — classCodeFields 분리 + 신청 스키마

`classCodeCreateSchema`는 `.refine()`이 걸린 ZodEffects라 `.extend()`가 안 된다. 필드 객체를 분리해 신청 스키마가 공유하게 한다. 기존 스키마의 동작은 그대로다(기존 schema.test.ts가 보호).

**Files:**
- Modify: `lib/schema.ts`
- Test: `tests/schema.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/schema.test.ts`에 추가

```ts
import { applySchema, rosterChildSchema } from '@/lib/schema'

describe('rosterChildSchema — 명단 한 줄', () => {
  const ok = { childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' }
  it('정상 행을 통과시킨다', () => {
    expect(rosterChildSchema.safeParse(ok).success).toBe(true)
  })
  it.each([
    ['번호 0', { ...ok, childNo: 0 }],
    ['번호 100', { ...ok, childNo: 100 }],
    ['이름에 숫자', { ...ok, name: '김서아1' }],
    ['성별 남자(정규화 전 값)', { ...ok, gender: '남자' }],
    ['생년월일 8자리', { ...ok, birthYmd: '20190304' }],
  ])('%s 는 거부한다', (_label, bad) => {
    expect(rosterChildSchema.safeParse(bad).success).toBe(false)
  })
})

describe('applySchema — 신청 폼', () => {
  const base = {
    region: '서울특별시교육청', schoolId: 'S001', schoolName: '서울예시초',
    grade: 1, classNo: 2, teacherName: '김담임',
    teacherPhone: '', teacherEmail: 'teacher@school.kr',
    roster: [
      { childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' },
      { childNo: 2, name: '이도윤', gender: '남', birthYmd: '190122' },
    ],
  }
  it('정상 신청을 통과시킨다', () => {
    expect(applySchema.safeParse(base).success).toBe(true)
  })
  it('이메일이 없으면 거부한다 — 승인 메일이 유일한 코드 전달 경로다', () => {
    expect(applySchema.safeParse({ ...base, teacherEmail: '' }).success).toBe(false)
  })
  it('명단이 비면 거부한다', () => {
    expect(applySchema.safeParse({ ...base, roster: [] }).success).toBe(false)
  })
  it('명단 100행은 거부한다 (child_no 범위 99와 일치)', () => {
    const roster = Array.from({ length: 100 }, (_, i) =>
      ({ childNo: i + 1, name: '김서아', gender: '여', birthYmd: '190304' }))
    expect(applySchema.safeParse({ ...base, roster }).success).toBe(false)
  })
  it('[REGRESSION] 같은 번호가 두 번 있으면 거부한다', () => {
    const dup = { ...base, roster: [base.roster[0], { ...base.roster[1], childNo: 1 }] }
    expect(applySchema.safeParse(dup).success).toBe(false)
  })
})
```

- [ ] **Step 2: 실행해 실패 확인**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL — `applySchema`·`rosterChildSchema` export 없음

- [ ] **Step 3: lib/schema.ts 구현**

`classCodeCreateSchema` 정의를 다음으로 교체(필드 분리 + 신청 스키마 추가):

```ts
/** 학급 코드 발급 폼의 공통 필드. refine이 걸리면 extend가 안 되므로 객체를 분리해 둔다 —
 *  관리자 직접 발급(classCodeCreateSchema)과 교사 신청(applySchema)이 공유한다. */
const classCodeFields = z.object({
  region: z.string().refine(r => REGION_NAMES.includes(r)),
  schoolId: cleaned.pipe(z.string().min(1)),
  schoolName: cleaned.pipe(z.string().min(1).max(100)),
  grade: gradeSchema,
  classNo: classNoSchema,
  teacherName: cleaned.pipe(nameSchema),
  teacherPhone: optionalPhone,
  teacherEmail: optionalEmail,
})

/** POST /api/admin/codes 바디 — 학급 코드 발급 폼. */
export const classCodeCreateSchema = classCodeFields
  .refine(d => d.teacherPhone !== '' || d.teacherEmail !== '',
    { path: ['teacherPhone'], message: '전화번호나 이메일 중 하나는 입력해 주세요.' })
export type ClassCodeCreateInput = z.infer<typeof classCodeCreateSchema>

/** 신청 명단 한 줄 — sessions의 같은 컬럼과 동일 규칙(제약이 어긋나면 복사가 실패한다). */
export const rosterChildSchema = z.object({
  childNo: childNoSchema,
  name: cleaned.pipe(nameSchema),
  gender: genderSchema,
  birthYmd: birthYmdSchema,
})
export type RosterChildInput = z.infer<typeof rosterChildSchema>

/** POST /api/apply 바디 — 교사 신청. 직접 발급과 달리 **이메일이 필수**다:
 *  승인 메일이 유일한 코드 전달 경로라서다(신청 완료 화면은 코드를 보여주지 않는다 — 스펙). */
export const applySchema = classCodeFields.extend({
  teacherEmail: emailSchema,
  roster: z.array(rosterChildSchema).min(1, '학생을 한 명 이상 등록해 주세요.').max(99)
    .refine(r => new Set(r.map(c => c.childNo)).size === r.length,
      '같은 번호가 두 번 있습니다.'),
})
export type ApplyInput = z.infer<typeof applySchema>
```

- [ ] **Step 4: 실행해 통과 확인** — `npx vitest run tests/schema.test.ts` Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 5: 커밋** — `git commit -m "feat(schema): 신청 폼 스키마 — 명단 배열·이메일 필수"`

### Task 3: lib/roster.ts — 명단 그리드 파싱·검증

브라우저 데모(2026-08-18)에서 검증한 로직의 이식. 화면(RosterEditor)은 이 모듈을 감싸 표만 그린다 — 화면 로직의 lib 추출 관례.

**Files:**
- Create: `lib/roster.ts`
- Test: `tests/roster.test.ts` (fixtures의 실제 xlsx 재사용)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/roster.test.ts`

```ts
// 명단 파싱 — 업로드된 그리드(readXlsx 결과 또는 CSV)를 명단으로 바꾼다.
// 열 역할을 짐작하지 않는다: 알려진 머리글 이름만 찾고, 못 찾으면 거부한다(스펙).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readXlsx } from '@/lib/xlsx'
import { cutText, parseRosterGrid } from '@/lib/roster'

const grid = async (name: string) => {
  const b = readFileSync(join(__dirname, 'fixtures', name))
  return readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}

describe('parseRosterGrid — 나이스 명렬표', () => {
  it('제목 행을 건너뛰고 머리글로 열을 찾아 5명을 읽는다', async () => {
    const r = parseRosterGrid(await grid('neis-roster.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toHaveLength(5)
    expect(r.children[0]).toEqual({ childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' })
  })
  it('반·비고처럼 모르는 열은 무시한다', async () => {
    const r = parseRosterGrid(await grid('neis-roster.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.problems).toHaveLength(0)
  })
})

describe('parseRosterGrid — 배포 양식', () => {
  it('안내 문구 5줄 아래의 머리글을 찾는다', async () => {
    const r = parseRosterGrid(await grid('template-filled.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toHaveLength(3)
  })
})

describe('parseRosterGrid — 주민번호 2중 차단', () => {
  it('[REGRESSION] 주민등록번호 열은 머리글 이름으로 아예 읽지 않는다', async () => {
    const r = parseRosterGrid(await grid('rrn-and-gaps.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(JSON.stringify(r)).not.toMatch(/\d{6}-\d{7}/)
    expect(r.rrnSeen).toBe(true)      // 파일에 있었다는 사실은 알려 안내를 띄운다
  })
  it('값 칸에 주민번호 형태가 있으면 그 칸만 버린다 — 다른 칸은 살린다', () => {
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['1', '김서아', '여', '190304-4234567'],   // 생년월일 칸에 주민번호
    ])
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toHaveLength(0)
    expect(r.problems[0]).toMatchObject({ childNo: 1, name: '김서아' })
    expect(r.rrnSeen).toBe(true)
  })
})

describe('parseRosterGrid — 문제 행 보고', () => {
  it('이름·생년월일 누락 행은 problems로 분리하고 이유를 적는다', async () => {
    const r = parseRosterGrid(await grid('rrn-and-gaps.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.children.length + r.problems.length).toBe(5)
    expect(r.problems.some(p => p.missing.includes('이름'))).toBe(true)
    expect(r.problems.some(p => p.missing.includes('생년월일'))).toBe(true)
  })
  it('성별·생년월일 열 자체가 없으면 missingCols로 알린다', async () => {
    const r = parseRosterGrid(await grid('missing-columns.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.missingCols).toEqual(['성별', '생년월일'])
    expect(r.problems).toHaveLength(3)     // 3명 전원이 성별·생년월일 없음
  })
  it('번호·이름 머리글을 못 찾으면 error를 돌려준다', () => {
    const r = parseRosterGrid([['아무', '표'], ['1', '2']])
    expect(r).toHaveProperty('error')
  })
})

describe('cutText — CSV·붙여넣기 텍스트를 그리드로', () => {
  it('콤마 구분을 읽는다', () => {
    expect(cutText('번호,성명\n1,김서아')).toEqual([['번호', '성명'], ['1', '김서아']])
  })
  it('탭 구분이 콤마보다 우선한다 (엑셀 복사는 탭)', () => {
    expect(cutText('번호\t성,명\n1\t김서아')).toEqual([['번호', '성,명'], ['1', '김서아']])
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run tests/roster.test.ts` Expected: FAIL (모듈 없음)

- [ ] **Step 3: lib/roster.ts 구현**

```ts
// lib/roster.ts — 업로드된 명단(그리드)을 검증된 아동 목록으로 바꾼다. 순수 함수만 둔다.
// 열 역할을 짐작하지 않는다 — 알려진 머리글 이름만 찾고, 못 찾으면 거부한다.
// (값 모양으로 추론하는 방식은 "반 번호 2"를 성별로 오인했다 — 프로토타입에서 확인.
//  자유도를 열면 실패 케이스마다 배포가 필요해진다. 스펙 "고정 4칸" 절.)
import { normBirth, toYymmdd } from './birth'
import { NAME_RE } from './schema'

export interface RosterChild {
  childNo: number
  name: string
  gender: '남' | '여'
  birthYmd: string          // YYMMDD — sessions.birth_ymd와 같은 형식
}

/** 읽었지만 완성되지 못한 행 — 화면이 붉게 표시하고 교사가 채운다. */
export interface RosterProblem {
  childNo: number | null
  name: string
  missing: string[]         // '번호' | '이름' | '성별' | '생년월일'
}

export interface ParsedRoster {
  children: RosterChild[]
  problems: RosterProblem[]
  /** 파일 어딘가에 주민등록번호가 있었다 — 저장은 안 했지만 안내는 띄운다 */
  rrnSeen: boolean
  /** 파일에 아예 없던 열 — "직접 채워 주세요" 안내용 */
  missingCols: string[]
}

/** 알려진 머리글 이름. 나이스 명렬표(반·번호·성명·성별·생년월일·비고)와 배포 양식이 이 이름을 쓴다. */
const HEADERS: Record<keyof typeof COL_LABEL, string[]> = {
  childNo: ['번호', '출석번호', 'no', 'no.'],
  name: ['성명', '이름', '학생명'],
  gender: ['성별'],
  birthYmd: ['생년월일', '생일'],
}
const COL_LABEL = { childNo: '번호', name: '이름', gender: '성별', birthYmd: '생년월일' } as const
const BANNED = ['주민등록번호', '주민번호', '외국인등록번호']
const RRN = /\d{6}\s*[-–]\s*\d{7}/
const HEAD_SCAN_ROWS = 8    // 제목·안내 문구가 이 안에 있다(나이스 1줄·배포 양식 5줄)

const key = (s: string) => s.trim().toLowerCase().replace(/\s|\(.*?\)|\./g, '')

const toGender = (v: string): '남' | '여' | null => {
  if (/^(남|남자|m|male|1)$/i.test(v.trim())) return '남'
  if (/^(여|여자|f|female|2)$/i.test(v.trim())) return '여'
  return null
}
const toNo = (v: string): number | null => {
  const d = v.replace(/\D/g, '')
  if (!d) return null
  const n = Number(d)
  return n >= 1 && n <= 99 ? n : null
}

export function parseRosterGrid(grid: string[][]): ParsedRoster | { error: string } {
  // 머리글 행 찾기 — 번호·이름 열이 둘 다 있는 첫 줄
  let headRow = -1
  const col: Partial<Record<keyof typeof COL_LABEL, number>> = {}
  for (let i = 0; i < Math.min(grid.length, HEAD_SCAN_ROWS); i++) {
    const cells = grid[i].map(key)
    const found: typeof col = {}
    for (const [field, names] of Object.entries(HEADERS) as [keyof typeof COL_LABEL, string[]][]) {
      const at = cells.findIndex(c => names.includes(c))
      if (at >= 0) found[field] = at
    }
    if (found.childNo !== undefined && found.name !== undefined) {
      headRow = i
      Object.assign(col, found)
      break
    }
  }
  if (headRow < 0)
    return { error: '번호·이름 머리글을 찾지 못했어요. 나이스 명렬표나 배포된 양식 파일인지 확인해 주세요.' }

  // 금지 열(주민번호)은 머리글 이름으로 아예 읽지 않는다 — 1차 차단
  const bannedCols = new Set(
    grid[headRow].map((c, i) => (BANNED.some(b => key(c).includes(key(b))) ? i : -1)).filter(i => i >= 0))

  const missingCols = (['gender', 'birthYmd'] as const)
    .filter(f => col[f] === undefined).map(f => COL_LABEL[f])

  const children: RosterChild[] = []
  const problems: RosterProblem[] = []
  let rrnSeen = bannedCols.size > 0

  for (const line of grid.slice(headRow + 1)) {
    if (line.some(c => RRN.test(c))) rrnSeen = true
    // 값 칸의 주민번호는 그 칸만 버린다 — 2차 차단(다른 칸은 살린다)
    const pick = (f: keyof typeof COL_LABEL): string => {
      const i = col[f]
      if (i === undefined || bannedCols.has(i)) return ''
      const v = (line[i] ?? '').trim()
      return RRN.test(v) ? '' : v
    }
    const rawNo = pick('childNo'), rawName = pick('name')
    if (!rawNo && !rawName) continue                    // 완전히 빈 줄

    const childNo = toNo(rawNo)
    const name = rawName.replace(/\s+/g, ' ')
    const gender = toGender(pick('gender'))
    const birthIso = normBirth(pick('birthYmd'))

    const missing: string[] = []
    if (childNo === null) missing.push('번호')
    if (!NAME_RE.test(name)) missing.push('이름')
    if (gender === null) missing.push('성별')
    if (birthIso === null) missing.push('생년월일')

    if (missing.length > 0) problems.push({ childNo, name, missing })
    else children.push({ childNo: childNo!, name, gender: gender!, birthYmd: toYymmdd(birthIso!) })
  }
  return { children, problems, rrnSeen, missingCols }
}

/** CSV·붙여넣기 텍스트 → 그리드. 엑셀 복사는 탭, CSV는 콤마 — 탭이 있으면 탭이 우선. */
export function cutText(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '')
  if (lines.some(l => l.includes('\t'))) return lines.map(l => l.split('\t').map(c => c.trim()))
  return lines.map(l => l.split(',').map(c => c.trim()))
}
```

- [ ] **Step 4: 실행해 통과 확인** — `npx vitest run tests/roster.test.ts` Expected: PASS

- [ ] **Step 5: 커밋** — `git commit -m "feat: 명단 그리드 파싱 — 머리글 고정·주민번호 2중 차단"`

### Task 4: db — status 반영 + insertApplication

**Files:**
- Modify: `lib/db.ts` (ClassCodeRow·CLASS_CODE_COLS·insertApplication)
- Test: `tests/db.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/db.test.ts`의 관례(체이너블 프록시·from(테이블)별 응답 큐)를 그대로 따라 추가

```ts
describe('insertApplication', () => {
  it('pending 코드와 명단을 함께 넣는다', async () => {
    const codeRow = { id: 'cc-1', code: 'ABCDEF', status: 'pending' }
    queue('class_codes', { data: codeRow, error: null })      // insert().select().single()
    queue('class_roster', { data: null, error: null })         // insert(rows)
    const r = await insertApplication(NEW_CODE_INPUT, [
      { childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' },
    ])
    expect(r).toEqual(codeRow)
    expect(inserted('class_roster')).toEqual([
      { class_code_id: 'cc-1', child_no: 1, child_name: '김서아', gender: '여', birth_ymd: '190304' },
    ])
  })

  it('[REGRESSION] 명단 삽입이 실패하면 코드 행을 지운다 — 명단 없는 pending이 남으면 안 된다', async () => {
    queue('class_codes', { data: { id: 'cc-1', code: 'ABCDEF' }, error: null })
    queue('class_roster', { data: null, error: { message: 'boom' } })
    queue('class_codes', { data: null, error: null })          // 롤백 delete
    await expect(insertApplication(NEW_CODE_INPUT, [CHILD])).rejects.toThrow()
    expect(deleted('class_codes')).toContain('cc-1')
  })

  it('코드 unique 충돌은 duplicate를 돌려준다 (호출부가 재시도)', async () => {
    queue('class_codes', { data: null, error: { code: '23505', message: 'dup' } })
    await expect(insertApplication(NEW_CODE_INPUT, [CHILD])).resolves.toBe('duplicate')
  })
})
```

(`queue`·`inserted`·`deleted`·`NEW_CODE_INPUT`·`CHILD`는 db.test.ts의 기존 헬퍼·상수 스타일에 맞춰 작성 — 파일 상단의 기존 프록시 구현을 먼저 읽고 그 형태를 따를 것.)

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run tests/db.test.ts` Expected: FAIL

- [ ] **Step 3: lib/db.ts 구현**

`ClassCodeRow`에 `status: 'pending' | 'active'`와 `applied_at: string | null` 추가, `CLASS_CODE_COLS`에 `, status, applied_at` 추가. `insertClassCode` 아래에:

```ts
import type { RosterChild } from './roster'

/**
 * 교사 신청 접수: pending 코드 + 명단을 넣는다.
 * supabase 클라이언트에는 트랜잭션이 없어, 명단 삽입이 실패하면 코드 행을 지워 되돌린다 —
 * 명단 없는 pending이 남으면 승인 화면에 빈 학급이 떠서 관리자가 판단할 수 없다.
 * (cascade가 있으므로 코드 행 삭제로 부분 삽입된 명단도 함께 정리된다.)
 */
export async function insertApplication(
  c: NewClassCodeInput, roster: RosterChild[],
): Promise<ClassCodeRow | 'duplicate'> {
  const { data, error } = await sb().from('class_codes').insert({
    code: c.code,
    school_region: c.schoolRegion, school_id: c.schoolId, school_name: c.schoolName,
    grade: c.grade, class_no: c.classNo,
    teacher_name: c.teacherName, teacher_phone: c.teacherPhone, teacher_email: c.teacherEmail,
    status: 'pending', applied_at: new Date().toISOString(),
  }).select(CLASS_CODE_COLS).single()
  if ((error as { code?: string } | null)?.code === '23505') return 'duplicate'
  fail(error)
  const row = data as unknown as ClassCodeRow

  const { error: e2 } = await sb().from('class_roster').insert(roster.map(r => ({
    class_code_id: row.id, child_no: r.childNo, child_name: r.name,
    gender: r.gender, birth_ymd: r.birthYmd,
  })))
  if (e2) {
    await sb().from('class_codes').delete().eq('id', row.id)   // 수동 롤백
    fail(e2)
  }
  return row
}
```

- [ ] **Step 4: 실행해 통과 확인** — `npx vitest run tests/db.test.ts` Expected: PASS (기존 테스트 포함)

- [ ] **Step 5: 커밋** — `git commit -m "feat(db): 신청 접수 — pending 코드+명단, 실패 시 수동 롤백"`

### Task 5: POST /api/apply + 레이트리밋

**Files:**
- Modify: `lib/request.ts` (APPLY_RATE_LIMIT 추가)
- Create: `app/api/apply/route.ts`
- Test: `tests/apply-route.test.ts`

- [ ] **Step 1: lib/request.ts에 상한 추가** — VERIFY_CODE_RATE_LIMIT 정의 옆에

```ts
/** 신청 접수 상한 — 공개 쓰기 라우트지만 verify-code와 반대로 낮게 잡는다:
 *  한 교사가 신청할 일은 학기에 한 번이고, 명단(아동 실명) 행이 대량 생성되는 지점이라
 *  방어 대상이 스팸 행 생성이다. 같은 학교 NAT에서 여러 교사가 같은 날 신청해도
 *  15분에 20건이면 충분하다. */
export const APPLY_RATE_LIMIT = 20
export const APPLY_RATE_WINDOW_MS = 15 * 60_000
```

- [ ] **Step 2: 실패하는 테스트 작성** — `tests/apply-route.test.ts` (라우트 테스트 관례: vi.mock을 import보다 앞에, beforeEach에서 기본 resolved 재주입)

```ts
// POST /api/apply — 공개 신청 접수.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ insertApplication: vi.fn() }))
vi.mock('@/lib/mail', () => ({
  sendMail: vi.fn(), applyNoticeMail: vi.fn(() => ({ to: '', subject: 's', html: 'h' })),
}))
vi.mock('@/lib/class-code', () => ({ generateClassCode: vi.fn(() => 'ABCDEF') }))

import { POST } from '@/app/api/apply/route'
import { insertApplication } from '@/lib/db'
import { sendMail } from '@/lib/mail'

const BODY = {
  region: '서울특별시교육청', schoolId: 'S001', schoolName: '서울예시초',
  grade: 1, classNo: 2, teacherName: '김담임', teacherPhone: '', teacherEmail: 't@school.kr',
  roster: [{ childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' }],
}
const post = (body: unknown, ip = '1.2.3.4') => POST(new Request('http://t/api/apply', {
  method: 'POST', body: JSON.stringify(body), headers: { 'x-real-ip': ip },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(insertApplication).mockResolvedValue({ id: 'cc-1', code: 'ABCDEF', status: 'pending' } as never)
  vi.mocked(sendMail).mockResolvedValue({ ok: true, id: 'm1' })
  vi.stubEnv('ADMIN_NOTIFY_EMAIL', 'admin@t.kr')
})

describe('POST /api/apply', () => {
  it('정상 신청은 201 — 응답에 코드를 넣지 않는다(승인 메일이 유일한 전달 경로)', async () => {
    const res = await post(BODY)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(JSON.stringify(json)).not.toContain('ABCDEF')
  })
  it('스키마 위반은 전체 400 — 부분 저장 없음', async () => {
    const res = await post({ ...BODY, roster: [] })
    expect(res.status).toBe(400)
    expect(insertApplication).not.toHaveBeenCalled()
  })
  it('[REGRESSION] 관리자 알림 메일이 실패해도 신청은 성공한다', async () => {
    vi.mocked(sendMail).mockResolvedValue({ ok: false, error: 'down' })
    expect((await post(BODY)).status).toBe(201)
  })
  it('ADMIN_NOTIFY_EMAIL이 없으면 메일을 보내지 않는다', async () => {
    vi.stubEnv('ADMIN_NOTIFY_EMAIL', '')
    await post(BODY)
    expect(sendMail).not.toHaveBeenCalled()
  })
  it('duplicate면 새 코드로 재시도한다', async () => {
    vi.mocked(insertApplication)
      .mockResolvedValueOnce('duplicate')
      .mockResolvedValueOnce({ id: 'cc-1', code: 'GHJKMN', status: 'pending' } as never)
    expect((await post(BODY)).status).toBe(201)
    expect(insertApplication).toHaveBeenCalledTimes(2)
  })
  it('레이트리밋 초과는 429', async () => {
    for (let i = 0; i < 20; i++) await post(BODY, '9.9.9.9')
    expect((await post(BODY, '9.9.9.9')).status).toBe(429)
  })
})
```

- [ ] **Step 3: 실행해 실패 확인** — `npx vitest run tests/apply-route.test.ts` Expected: FAIL (라우트 없음)

- [ ] **Step 4: app/api/apply/route.ts 구현**

```ts
// POST /api/apply — 교사 신청 접수(공개). pending 코드 + 명단을 만들고 관리자에게 알린다.
// 응답에 코드를 넣지 않는다 — 승인 메일이 유일한 전달 경로여야 승인이 실제 관문이 된다(스펙).
import { NextResponse } from 'next/server'
import { insertApplication } from '@/lib/db'
import { generateClassCode } from '@/lib/class-code'
import { applyNoticeMail, sendMail } from '@/lib/mail'
import { applySchema } from '@/lib/schema'
import { APPLY_RATE_LIMIT, APPLY_RATE_WINDOW_MS, clientIp, createRateLimiter, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const rateLimited = createRateLimiter(APPLY_RATE_LIMIT, APPLY_RATE_WINDOW_MS)
const MAX_RETRY = 5   // admin/codes와 같은 관례 — 31^6 공간에서 연속 충돌은 사실상 장애

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)

  const body = await req.json().catch(() => null)
  const parsed = applySchema.safeParse(body)
  if (!parsed.success) return jsonError('입력값을 다시 확인해 주세요.', 400)
  const d = parsed.data

  try {
    for (let i = 0; i < MAX_RETRY; i++) {
      const row = await insertApplication({
        code: generateClassCode(),
        schoolRegion: d.region, schoolId: d.schoolId, schoolName: d.schoolName,
        grade: d.grade, classNo: d.classNo,
        teacherName: d.teacherName,
        teacherPhone: d.teacherPhone || null, teacherEmail: d.teacherEmail,
      }, d.roster)
      if (row === 'duplicate') continue

      // 관리자 알림 — 실패해도 신청은 성공(관리자 화면의 대기 배지가 예비 채널)
      const adminTo = process.env.ADMIN_NOTIFY_EMAIL?.trim()
      if (adminTo) {
        const origin = new URL(req.url).origin
        const mail = applyNoticeMail({
          schoolName: d.schoolName, grade: d.grade, classNo: d.classNo,
          teacherName: d.teacherName, childCount: d.roster.length,
          adminUrl: `${origin}/admin/codes`,
        })
        const sent = await sendMail({ ...mail, to: adminTo })
        if (!sent.ok) console.error('[apply] 관리자 알림 메일 실패', sent.error)
      }
      return NextResponse.json({ ok: true }, { status: 201 })
    }
    console.error('[apply] 코드 unique 충돌 재시도 상한 도달')
    return jsonError('접수에 실패했습니다. 다시 시도해 주세요.', 502)
  } catch (e) {
    console.error('[apply] 접수 실패', e)
    return jsonError('접수에 실패했습니다. 다시 시도해 주세요.', 502)
  }
}
```

- [ ] **Step 5: 실행해 통과 확인** — `npx vitest run tests/apply-route.test.ts` Expected: PASS

- [ ] **Step 6: 커밋** — `git commit -m "feat(api): 신청 접수 라우트 — pending 생성·관리자 알림"`

### Task 6: 신청 화면 — /apply + RosterEditor

화면 로직은 이미 lib에 있으므로(roster·xlsx·birth) 여기는 조립이다. 렌더 테스트는 만들지 않는다(관례 — 컴포넌트 렌더 테스트는 의도적으로 없음).

**Files:**
- Create: `components/apply/RosterEditor.tsx`
- Create: `app/apply/page.tsx`
- Modify: `components/README.md` (apply/ 한 줄)

- [ ] **Step 1: components/apply/RosterEditor.tsx 구현**

브라우저 데모(고정 4칸 표)의 이식. 핵심 구조:

```tsx
// components/apply/RosterEditor.tsx — 명단 업로드 → 고정 4칸 표 → 수정.
// 파일은 여기(브라우저)서 파싱한다 — 서버로 보내지 않는다(주민번호가 서버에 도달하지 않게).
// 열 역할 지정 UI가 없다: lib/roster가 머리글 이름으로만 찾고, 못 찾으면 양식을 안내한다.
'use client'
import { useRef, useState } from 'react'
import { normBirth, toYymmdd } from '@/lib/birth'
import { cutText, parseRosterGrid, type RosterChild } from '@/lib/roster'
import { readXlsx } from '@/lib/xlsx'
import { validName } from '@/lib/validate'

/** 표의 한 줄 — 문자열로 들고 있다가 제출 직전 RosterChild로 굳힌다(수정 중간값 허용). */
interface Row { childNo: string; name: string; gender: '' | '남' | '여'; birth: string }

export function RosterEditor({ onChange }: {
  /** 오류 없는 확정 명단(제출 가능 상태)일 때만 배열, 아니면 null */
  onChange: (roster: RosterChild[] | null) => void
}) { /* … 데모 roster3.html의 표 렌더·행 검증·파일 처리 로직을 이 구조로 옮긴다 … */ }
```

행 검증은 데모와 동일: 번호 1~99·이름 NAME_RE·성별 드롭다운·생년월일 normBirth. 오류 행이 하나라도 있으면 `onChange(null)`. 파일 처리: `.xlsx`→readXlsx, `.csv`→cutText, 그 외→"엑셀 파일(.xlsx)로 저장해서 올려 주세요"(Numbers 특수 처리 없음 — 교사 현장은 윈도우, 사용자 확정 2026-08-18). `parseRosterGrid`의 `rrnSeen`·`missingCols`·`problems`를 안내 문구로 표시.

- [ ] **Step 2: app/apply/page.tsx 구현**

구조는 app/page.tsx(시작 화면)의 폼 패턴을 따른다:

```tsx
// app/apply/page.tsx — 교사 신청(공개). 학급 정보 + 명단 + 동의 체크 → POST /api/apply.
// 완료 화면은 코드를 보여주지 않는다 — 승인 메일이 유일한 전달 경로(스펙).
'use client'
```

- 학급 정보 구획: `SchoolPicker`·학년/반 `Select`·성함·연락처 — `CodeIssuer.tsx`의 입력 요소와 검증(validName·validPhone·validEmail)을 그대로. **이메일은 필수**(라벨에 "승인 안내를 받을 이메일").
- 명단 구획: `<RosterEditor onChange={setRoster} />`
- 동의 구획: 체크박스 3개 —
  ```ts
  // ⚠️ 담당자 확인 대기 — 확정 아님. 문구는 개발용 초안이며 담당자 예시 → 연구윤리 확정본
  // 순으로 교체된다(스펙 "미확정 대기"). 교체 시 이 상수만 바꾼다.
  const APPLY_CHECKS = [
    '개인정보(성명·연락처) 수집·이용에 동의합니다.',
    '검사 절차 안내를 확인했습니다.',
    '보호자 서면 동의를 받은 학생만 명단에 등록했습니다.',
  ]
  ```
- [신청하기] 활성 조건: 학급 정보 유효 + `roster !== null` + 체크 3개 전부.
- 제출: `postJson('/api/apply', { …학급 정보, roster })` → 성공 시 완료 문구("승인되면 이메일로 학급 코드를 보내드립니다"), 실패 시 폼 유지 + 오류 표시.

- [ ] **Step 3: 수동 확인** — `npm run dev` → http://localhost:3000/apply 에서 `tests/fixtures/template-filled.xlsx` 업로드 → 3명 표 → 체크 3개 → 신청 → 201 확인 (DB에 pending 행·roster 3행)

- [ ] **Step 4: 커밋** — `git commit -m "feat(ui): 교사 신청 화면 — 명단 업로드·고정 표·동의 체크"`

### Task 7: PR A 게이트·문서·머지

**Files:**
- Modify: `README.md` (화면 흐름 표에 /apply·운영 절에 pending 정리 쿼리), `app/README.md`, `app/api/README.md`, `lib/README.md`(roster 한 줄)

- [ ] **Step 1: 문서 갱신** — README 화면 흐름 표에 `/apply` 행, 운영·개인정보 절에:

```markdown
- **방치된 신청 정리**: 승인·거절되지 않은 pending 신청에는 아동 실명 명단이 붙어 있다.
  주기적으로 SQL Editor에서(자동 실행 아님):
  ```sql
  delete from class_codes where status = 'pending' and applied_at < now() - interval '30 days';
  ```
```

- [ ] **Step 2: 게이트** — `npm run typecheck && npm run lint && npm test && npm run build` 전부 통과
- [ ] **Step 3: PR·머지** — `gh auth switch --user Growing-Jiwoo` → push → PR "feat: 교사 신청 접수 — 명단 업로드·pending 코드" → merge commit 머지 → `gh auth switch --user ipf-jiwookim`

---

# PR B — 관리자 승인 (`feat/apply-approve`)

### Task 8: db — approveClassCode·listRoster + 목록에 status·명단 수

**Files:**
- Modify: `lib/db.ts`
- Test: `tests/db.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
describe('approveClassCode', () => {
  it('pending을 active로 바꾸고 행을 돌려준다', async () => {
    queue('class_codes', { data: [{ id: 'cc-1', code: 'ABCDEF', status: 'active' }], error: null })
    await expect(approveClassCode('cc-1')).resolves.toMatchObject({ already: false })
  })
  it('[REGRESSION] 이미 active면 already:true — 재클릭이 메일을 다시 보내지 않게', async () => {
    queue('class_codes', { data: [], error: null })                       // update 0건
    queue('class_codes', { data: { id: 'cc-1', status: 'active' }, error: null })  // 현재 행 조회
    await expect(approveClassCode('cc-1')).resolves.toMatchObject({ already: true })
  })
  it('행이 없으면 null', async () => {
    queue('class_codes', { data: [], error: null })
    queue('class_codes', { data: null, error: null })
    await expect(approveClassCode('cc-1')).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run tests/db.test.ts` Expected: FAIL

- [ ] **Step 3: 구현**

```ts
/** 승인: pending → active. 멱등 — 이미 active면 already:true로 알려 라우트가 메일을
 *  다시 보내지 않게 한다(더블클릭·새로고침 재전송 방지). */
export async function approveClassCode(
  id: string,
): Promise<{ row: ClassCodeRow; already: boolean } | null> {
  const { data, error } = await sb().from('class_codes')
    .update({ status: 'active' }).eq('id', id).eq('status', 'pending')
    .select(CLASS_CODE_COLS)
  fail(error)
  if ((data ?? []).length > 0) return { row: data![0] as unknown as ClassCodeRow, already: false }
  const { data: cur, error: e2 } = await sb().from('class_codes')
    .select(CLASS_CODE_COLS).eq('id', id).maybeSingle()
  fail(e2)
  if (!cur) return null
  return { row: cur as unknown as ClassCodeRow, already: true }
}

export interface RosterRow {
  child_no: number; child_name: string; gender: '남' | '여'; birth_ymd: string
}

export async function listRoster(classCodeId: string): Promise<RosterRow[]> {
  const { data, error } = await sb().from('class_roster')
    .select('child_no, child_name, gender, birth_ymd')
    .eq('class_code_id', classCodeId).order('child_no')
  fail(error)
  return (data ?? []) as unknown as RosterRow[]
}
```

`listClassCodes`의 select에 `class_roster(count)` 추가, `ClassCodeListRow`에 `class_roster: { count: number }[]` 추가, GET /api/admin/codes 응답 매핑에 `roster_count` 추가(세션 count와 같은 패턴).

- [ ] **Step 4: 통과 확인 후 커밋** — `git commit -m "feat(db): 승인(멱등)·명단 조회"`

### Task 9: 승인 라우트 + 삭제 조건 확장

**Files:**
- Create: `app/api/admin/codes/[id]/approve/route.ts`
- Modify: `app/api/admin/codes/[id]/route.ts` (GET에 roster 포함하는 상세 추가는 하지 않고, DELETE는 변경 없음 — FK restrict가 이미 "세션 있으면 삭제 불가"를 강제하고 pending은 세션이 없다. **화면의 삭제 버튼 노출 조건만** Task 10에서 바꾼다)
- Test: `tests/admin-codes-route.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 작성** (기존 admin-codes-route.test.ts 관례를 따라)

```ts
vi.mock('@/lib/mail', () => ({
  sendMail: vi.fn(), approvedMail: vi.fn(() => ({ to: '', subject: 's', html: 'h' })),
}))

describe('POST /api/admin/codes/[id]/approve', () => {
  it('승인하면 교사 이메일로 안내 메일을 보낸다', async () => {
    vi.mocked(approveClassCode).mockResolvedValue({ row: ROW_ACTIVE, already: false })
    vi.mocked(sendMail).mockResolvedValue({ ok: true, id: 'm1' })
    const res = await approve('cc-1')
    expect(res.status).toBe(200)
    expect((await res.json()).mailed).toBe(true)
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ROW_ACTIVE.teacher_email }))
  })
  it('[REGRESSION] 메일이 실패해도 승인은 유지 — mailed:false로 알린다', async () => {
    vi.mocked(sendMail).mockResolvedValue({ ok: false, error: 'down' })
    const res = await approve('cc-1')
    expect(res.status).toBe(200)
    expect((await res.json()).mailed).toBe(false)
  })
  it('[REGRESSION] 이미 active면 메일을 보내지 않는다 (멱등)', async () => {
    vi.mocked(approveClassCode).mockResolvedValue({ row: ROW_ACTIVE, already: true })
    expect((await approve('cc-1')).status).toBe(200)
    expect(sendMail).not.toHaveBeenCalled()
  })
  it('이메일이 없는 학급은 mailed:false — 화면이 복사 예비 경로를 안내', async () => {
    vi.mocked(approveClassCode).mockResolvedValue({
      row: { ...ROW_ACTIVE, teacher_email: null }, already: false })
    expect((await (await approve('cc-1')).json()).mailed).toBe(false)
  })
  it('없는 id는 404', async () => {
    vi.mocked(approveClassCode).mockResolvedValue(null)
    expect((await approve('cc-x')).status).toBe(404)
  })
})
```

- [ ] **Step 2: 실행해 실패 확인** — Expected: FAIL

- [ ] **Step 3: approve/route.ts 구현**

```ts
// POST /api/admin/codes/[id]/approve — 신청 승인 + 교사에게 코드 안내 메일. 인증은 middleware.
// 멱등: 이미 active면 메일 없이 200 — 더블클릭·새로고침이 재전송을 만들지 않는다.
// 메일 실패에도 승인은 유지한다(mailed:false) — 화면이 [안내 문구 복사] 예비 경로를 안내한다.
import { NextResponse } from 'next/server'
import { approveClassCode } from '@/lib/db'
import { approvedMail, sendMail } from '@/lib/mail'
import { jsonError, UUID_RE } from '@/lib/request'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 요청입니다.', 400)
  try {
    const r = await approveClassCode(id)
    if (!r) return jsonError('신청을 찾을 수 없습니다.', 404)
    let mailed = false
    if (!r.already && r.row.teacher_email) {
      const origin = new URL(req.url).origin
      const mail = approvedMail({
        teacherName: r.row.teacher_name, schoolName: r.row.school_name,
        code: r.row.code, surveyUrl: origin,
      })
      const sent = await sendMail({ ...mail, to: r.row.teacher_email })
      mailed = sent.ok
      if (!sent.ok) console.error('[approve] 승인 메일 실패', sent.error)
    }
    return NextResponse.json({ ok: true, mailed, code: r.row.code })
  } catch (e) {
    console.error('[approve] 승인 실패', e)
    return jsonError('승인에 실패했습니다.', 502)
  }
}
```

- [ ] **Step 4: 통과 확인 후 커밋** — `git commit -m "feat(api): 신청 승인 — 멱등·메일 실패에도 승인 유지"`

### Task 10: CodeIssuer 확장 — 대기 목록·승인·명단 보기

**Files:**
- Modify: `components/admin/CodeIssuer.tsx`, `hooks/useAdminQueries.ts`(ClassCodeItem에 status·roster_count), `components/admin/README.md`

- [ ] **Step 1: 구현** (화면 — 렌더 테스트 없음, 관례)

- 목록을 두 구획으로: **「대기 중 N건」**(status=pending, 위) / 발급된 코드(active).
- 대기 행: 학교·학년·반·담임·`roster_count`명 + [명단 보기](펼치면 `GET /api/admin/codes/[id]/roster` — 없으므로 listRoster를 쓰는 얇은 GET 라우트를 approve와 같은 폴더 계층에 추가: `app/api/admin/codes/[id]/roster/route.ts`, UUID 검증 + listRoster 반환) + [승인] + [삭제].
- [승인] 클릭 → `postJson(…/approve)` → `mailed:false`면 행에 경고 배지 "메일 발송 실패 — 아래 문구를 복사해 직접 전달하세요" + [안내 문구 복사] 버튼(approvedMail과 같은 내용의 평문을 클립보드로).
- 삭제 버튼 노출 조건: 기존 `session_count === 0` → `status === 'pending' || session_count === 0`.
- 발급 완료 카드(직접 발급)는 그대로 — status 기본값이 active라 동작 불변.

- [ ] **Step 2: 수동 확인** — dev 서버에서 /apply로 신청 → /admin/codes 대기 목록 → 명단 보기 → 승인 → (MAIL_TO_OVERRIDE로) 본인 메일 수신 확인
- [ ] **Step 3: 커밋** — `git commit -m "feat(admin): 신청 대기 목록·승인·명단 보기"`

### Task 11: PR B 게이트·문서·머지

- [ ] README 화면 흐름 표의 /admin/codes 행에 승인 흐름 반영, app/api/admin/codes/README.md에 approve·roster 라우트 추가
- [ ] 게이트 4종 → PR "feat: 신청 승인 — 대기 목록·승인 메일" → merge commit → 계정 복귀

---

# PR C — 검사 시작 드롭다운 (`feat/roster-dropdown`)

### Task 12: verify-code — pending 거부 + 명단 응답

**Files:**
- Modify: `app/api/sessions/verify-code/route.ts`, `lib/db.ts`(rosterWithTested), `lib/schema.ts`(verifyCodeSchema의 childNo를 optional로)
- Test: `tests/verify-code-route.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
describe('verify-code — 명단 모드', () => {
  it('[REGRESSION] pending 코드는 404와 같은 문구 — 존재를 구분해 알려주지 않는다', async () => {
    vi.mocked(findClassCode).mockResolvedValue({ ...ROW, status: 'pending' } as never)
    const res = await post({ code: 'ABCDEF' })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('코드를 확인해 주세요.')
  })
  it('childNo 없이 부르면 명단을 돌려준다 (tested 포함)', async () => {
    vi.mocked(rosterWithTested).mockResolvedValue([
      { childNo: 1, name: '김서아', gender: '여', birthYmd: '190304', tested: 'submitted' },
      { childNo: 2, name: '이도윤', gender: '남', birthYmd: '190122', tested: null },
    ])
    const json = await (await post({ code: 'ABCDEF' })).json()
    expect(json.roster).toHaveLength(2)
    expect(json.roster[0].tested).toBe('submitted')
  })
  it('childNo를 주면 기존처럼 alreadyTested를 돌려준다 (직접 입력 예비 경로 회귀)', async () => {
    const json = await (await post({ code: 'ABCDEF', childNo: 3 })).json()
    expect(json).toHaveProperty('alreadyTested')
  })
})
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL

- [ ] **Step 3: 구현**

schema: `export const verifyCodeSchema = z.object({ code: classCodeSchema, childNo: childNoSchema.optional() })`

db에 추가:

```ts
/** 명단 + 각 아동의 검사 상태. 드롭다운이 "검사함"을 표시하기 위한 것 —
 *  학급 세션을 한 번에 읽어 childTestState와 같은 판정을 번호별로 만든다.
 *  (verify-code의 옛 방침 "번호 목록을 만들지 않는다"는 명단 도입으로 뒤집혔다:
 *   코드 소지 = 학급 접근이라는 전제에서, 명단을 주면서 검사 여부만 숨기는 것은 무의미하다.) */
export async function rosterWithTested(classCodeId: string): Promise<{
  childNo: number; name: string; gender: string; birthYmd: string
  tested: 'submitted' | 'inProgress' | null
}[]> {
  const roster = await listRoster(classCodeId)
  const { data, error } = await sb().from('sessions').select('child_no, submitted_at')
    .eq('class_code_id', classCodeId)
  fail(error)
  const state = new Map<number, 'submitted' | 'inProgress'>()
  for (const s of data ?? []) {
    const cur = state.get(s.child_no)
    if (s.submitted_at) state.set(s.child_no, 'submitted')
    else if (cur !== 'submitted') state.set(s.child_no, 'inProgress')
  }
  return roster.map(r => ({
    childNo: r.child_no, name: r.child_name, gender: r.gender, birthYmd: r.birth_ymd,
    tested: state.get(r.child_no) ?? null,
  }))
}
```

라우트: `findClassCode` 후 `if (row.status !== 'active') return jsonError('코드를 확인해 주세요.', 404)` (404와 동일 문구 — 열거 방지). `childNo` 없으면 `roster: await rosterWithTested(row.id)`를 포함해 응답, 있으면 기존 `alreadyTested` 경로. 파일 상단의 "검사한 번호 목록은 반환하지 않는다" 주석을 위 db 주석과 같은 근거로 갱신.

- [ ] **Step 4: 통과 확인 후 커밋** — `git commit -m "feat(api): verify-code 명단 응답·pending 거부"`

### Task 13: 세션 생성 — 명단 모드

**Files:**
- Modify: `lib/schema.ts`(sessionCreateSchema를 union으로), `app/api/sessions/route.ts`
- Test: `tests/sessions-route.test.ts` (확장)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
describe('POST /api/sessions — 명단 모드', () => {
  it('fromRoster:true면 서버가 명단에서 이름·성별·생년월일을 복사한다', async () => {
    vi.mocked(listRoster).mockResolvedValue([
      { child_no: 1, child_name: '김서아', gender: '여', birth_ymd: '190304' },
    ])
    const res = await post({ code: 'ABCDEF', childNo: 1, guardianConsent: true, fromRoster: true })
    expect(res.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      childNo: 1, childName: '김서아', gender: '여', birthYmd: '190304',
    }))
  })
  it('명단에 없는 번호는 400 — 직접 입력 경로로 유도', async () => {
    vi.mocked(listRoster).mockResolvedValue([])
    const res = await post({ code: 'ABCDEF', childNo: 9, guardianConsent: true, fromRoster: true })
    expect(res.status).toBe(400)
    expect(createSession).not.toHaveBeenCalled()
  })
  it('[REGRESSION] pending 코드로는 어느 모드로도 세션을 만들 수 없다 (404 동일 문구)', async () => {
    vi.mocked(findClassCode).mockResolvedValue({ ...ROW, status: 'pending' } as never)
    expect((await post({ code: 'ABCDEF', childNo: 1, guardianConsent: true, fromRoster: true })).status).toBe(404)
    expect((await post(DIRECT_BODY)).status).toBe(404)   // 직접 입력 모드도
  })
  it('[REGRESSION] 직접 입력 모드(기존 payload)는 그대로 동작한다', async () => {
    expect((await post(DIRECT_BODY)).status).toBe(200)
  })
})
```

- [ ] **Step 2: 실패 확인** — Expected: FAIL

- [ ] **Step 3: 구현**

schema — 기존 `sessionCreateSchema` 객체의 이름을 `sessionCreateDirectSchema`로 바꾸고:

```ts
/** 명단 모드 — 신청 때 등록한 명단에서 서버가 값을 복사한다. 클라이언트가 보낸
 *  이름·생년월일을 믿지 않는 것이 핵심이라, 이 모드에는 그 필드 자체가 없다. */
export const sessionCreateFromRosterSchema = z.object({
  fromRoster: z.literal(true),
  code: classCodeSchema,
  childNo: childNoSchema,
  guardianConsent: z.literal(true),
})
export const sessionCreateSchema = z.union([sessionCreateFromRosterSchema, sessionCreateDirectSchema])
```

라우트 — `findClassCode` 후 공통으로 `if (classCode.status !== 'active') return jsonError('코드를 확인해 주세요.', 404)`. 분기:

```ts
if ('fromRoster' in d) {
  const roster = await listRoster(classCode.id)
  const child = roster.find(r => r.child_no === d.childNo)
  if (!child) return jsonError('명단에서 학생을 찾을 수 없어요. 직접 입력으로 진행해 주세요.', 400)
  sessionId = await createSession({
    classCode, childNo: child.child_no,
    birthYmd: child.birth_ymd, gender: child.gender as '남' | '여', childName: child.child_name,
  })
} else {
  sessionId = await createSession({
    classCode, childNo: d.childNo, birthYmd: d.birthYmd, gender: d.gender, childName: d.name,
  })
}
```

- [ ] **Step 4: 통과 확인 후 커밋** — `git commit -m "feat(api): 세션 생성 명단 모드 — 서버가 명단에서 복사"`

### Task 14: 시작 화면 — 드롭다운 + 예비 경로

**Files:**
- Modify: `app/page.tsx`, `app/README.md`

- [ ] **Step 1: 구현** (기존 폼은 남긴다 — 예비 경로이자 명단 없는 학급의 기본 경로)

흐름: 코드 입력 → [확인] → `verify-code`(childNo 없이) 응답 분기:

- `roster.length > 0` → **명단 모드 UI**: `Select`로 "1번 김서아 (여)" 목록(tested가 'submitted'면 라벨에 " · 검사함"), 보호자 동의 체크 → [확인] → 확인 모달(명단의 이름·성별·생년월일 표시, tested면 기존 중복 경고 모달 재사용) → `postJson('/api/sessions', { code, childNo, guardianConsent, fromRoster: true })`.
  아래에 작은 링크 **「명단에 없는 학생이에요」** → 기존 입력 폼으로 전환(전학생·늦은 동의서 — 스펙).
- `roster.length === 0` → 기존 입력 폼 그대로(직접 발급 코드 — 동작 불변).

코드 기억(`saveClassCode`)·이어하기 카드·`clearState` 등 기존 동작은 그대로 둔다.

- [ ] **Step 2: 수동 확인** — 명단 학급: 드롭다운→시작→검사 화면 진입 / 「명단에 없는 학생」→직접 입력→시작 / 직접 발급 학급: 기존 폼 그대로
- [ ] **Step 3: 커밋** — `git commit -m "feat(ui): 시작 화면 아동 드롭다운 — 입력 5종을 선택 1번으로"`

### Task 15: PR C 게이트·문서·머지

- [ ] README 화면 흐름 표(`/` 행)·수동 E2E 체크리스트 갱신: 드롭다운 선택·명단에 없는 학생 직접 입력·pending 코드 거부 항목 추가
- [ ] 게이트 4종 → PR "feat: 검사 시작 드롭다운 — 명단 선택·직접 입력 예비 경로" → merge commit → 계정 복귀

---

## 계획 밖 (별도 트랙 — 이 계획이 다루지 않음)

- 가정통신문 연구 동의 개정(lib/consent.ts) — 연구윤리 문구 대기, **첫 검사 전 필수**
- 신청 폼·메일 문구 확정본 교체 — 담당자 예시 대기(상수·함수만 교체)
- 진짜 나이스 파일 검증 — tests/fixtures/README.md
- 도메인 구매·Vercel 환경변수(RESEND_API_KEY·MAIL_FROM·ADMIN_NOTIFY_EMAIL) 등록
