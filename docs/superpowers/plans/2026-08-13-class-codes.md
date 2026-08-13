# PR B — 학급 코드 발급 + 전화번호 정규화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 학급 정보(학교·학년·반·담임·연락처)로 6자리 코드를 발급하고, 검사 현장은 코드 + 아동 정보(번호·이름·성별·생년월일)만 입력해 확인 모달을 거쳐 검사를 시작한다. 전화번호는 하이픈을 떼고 저장한다.

**Architecture:** 새 `class_codes` 테이블 + 세션 생성 시 **비정규화 복사**(관리자 목록·결과지·PDF·통계 읽기 경로 무변경). 공개 `verify-code` API는 물어본 아동 번호의 상태만 답한다(명단 미반환). 학급 코드는 localStorage 별도 키에 기억해 연속 검사에서 재입력을 던다.

**Tech Stack:** Next.js 16 App Router · React 19 · Supabase · zod · @tanstack/react-query(관리자) · vitest(node)

**Spec:** `docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md`

## Global Constraints

- **선행 조건: PR A 완료** (`docs/superpowers/plans/2026-08-13-remove-discontinue-and-field-scoring.md`). 브랜치는 PR A 브랜치(또는 머지된 main)에서 `feat/class-codes`로 분기.
- **모든 커밋 전에 4종 전부 통과**: `npm run typecheck && npm run lint && npm test && npm run build`.
- `next-env.d.ts` 변경분은 커밋하지 말고 `git checkout next-env.d.ts`.
- 기존 데이터 호환 불필요 — 배포 전 DB 전체 리셋(사용자 확정 2026-08-13). 파괴적 마이그레이션 허용.
- 코드 형식: 6자리, 알파벳 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`(0·O·1·I·L 제외), 만료 없음, 입력은 대문자로 정규화.
- 전화번호: 입력은 하이픈 유무 모두 허용, **저장값은 하이픈 제거**, placeholder `01012345678`.
- 아동 번호: 1~99 정수. 중복 생성은 막지 않고 확인 모달에서 경고만.
- verify-code는 **물어본 번호의 상태만** 반환(`alreadyTested`) — 번호 목록을 절대 반환하지 않는다(아동 앞 화면 노출·명단 열거 방지, 스펙 "중복 검사 경고").
- 학급 코드 localStorage 저장 시점: **세션 생성 성공 직후**만. 아동 정보(이름·번호·성별·생년월일)는 어떤 별도 키에도 남기지 않는다.
- 보호자 동의 고지·체크는 검사 페이지에 유지(`guardianConsent: z.literal(true)`), 검사자 구분(교사/전문가)은 제거.
- 관리자 라우트에 인증 코드 작성 금지(middleware 전담). 에러는 `jsonError`, 내부 원문은 `console.error`만.
- 새 화면 상태는 URL이 아니라 로컬이어도 되는 것(발급 폼)만 로컬로 — 목록 필터를 붙이게 되면 URL로.

---

### Task 1: 마이그레이션 015 — `class_codes` + `sessions` 확장

**Files:**
- Create: `supabase/migrations/015_class_codes.sql`
- Modify: `supabase/README.md`, `README.md`(셋업 절 마이그레이션 목록에 015 추가)

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 015_class_codes.sql — 학급 코드 발급(관리자) + 코드 기반 세션 생성 (스펙 2026-08-13).
-- 세션 생성 시 코드의 학급 정보를 sessions 컬럼에 비정규화 복사한다 — 읽기 경로 무변경,
-- 코드를 나중에 고쳐도 이미 만든 세션은 검사 당시 값 유지(임상 기록 관점).
-- ⚠️ 파괴적: sessions에 not null 컬럼 추가·examiner_type 제거 — 배포 전 DB 전체 리셋 전제
--    (사용자 확정 2026-08-13). 리셋 없이 기존 행이 있는 DB에는 적용할 수 없다.
create table if not exists class_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,            -- 6자리, 혼동 문자(0·O·1·I·L) 제외 대문자+숫자
  school_region text not null,
  school_id text not null,
  school_name text not null,
  grade int not null check (grade between 1 and 6),
  class_no int not null check (class_no between 0 and 99),   -- 0 = 단일학급(반 없음)
  teacher_name text not null,
  teacher_phone text,                   -- 하이픈 없는 숫자만 저장(스키마가 정규화)
  teacher_email text,
  check (teacher_phone is not null or teacher_email is not null),
  created_at timestamptz not null default now()
);
alter table class_codes enable row level security;  -- 정책 없음 = anon 전면 차단(기존 관례)

-- 세션이 있는 코드는 지울 수 없다(restrict) — 관리자 화면도 세션 0건에만 삭제 버튼을 낸다.
alter table sessions add column if not exists class_code_id uuid not null references class_codes(id) on delete restrict;
alter table sessions add column if not exists child_no int not null check (child_no between 1 and 99);
alter table sessions drop column if exists examiner_type;
```

- [ ] **Step 2: `supabase/README.md` 표에 한 줄 추가** — `015 | class_codes 테이블 + sessions.class_code_id/child_no 추가, examiner_type 제거(파괴적 — DB 리셋 전제)`. `README.md` 셋업 절 마이그레이션 나열에도 `015_class_codes.sql` 추가.

- [ ] **Step 3: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add supabase/migrations/015_class_codes.sql supabase/README.md README.md
git commit -m "feat: class_codes 스키마 — 학급 코드 발급 기반 (migration 015)"
```

---

### Task 2: 스키마 — 전화 정규화 · 코드/아동번호 · 발급 폼

**Files:**
- Modify: `lib/schema.ts`, `lib/validate.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `CODE_ALPHABET: string`, `CODE_LEN = 6`, `classCodeSchema`(trim+대문자 정규화 → 6자 검증), `childNoSchema`(int 1~99), `phoneSchema`(파싱 결과가 하이픈 없는 문자열), `classCodeCreateSchema`(region/schoolId/schoolName/grade/classNo/teacherName/teacherPhone/teacherEmail — 전화·이메일 중 하나 필수, 전화는 하이픈 제거되어 나옴), `validClassCode`/`validChildNo` 타입가드.
- 기존 `sessionCreateSchema`는 이 태스크에서 전화 정규화만 반영(교체는 Task 6).

- [ ] **Step 1: 테스트 추가** — `tests/schema.test.ts`에:

```ts
describe('전화번호 정규화 — 하이픈 제거 저장 (사용자 확정 2026-08-13)', () => {
  it('하이픈 있는 입력이 통과하고 파싱 결과에서 하이픈이 빠진다', () => {
    expect(phoneSchema.parse('010-1234-5678')).toBe('01012345678')
    expect(phoneSchema.parse('01012345678')).toBe('01012345678')
  })
  it('형식이 틀리면 거부', () => {
    expect(phoneSchema.safeParse('12-3456-7890').success).toBe(false)
    expect(phoneSchema.safeParse('010-12-5678').success).toBe(false)
  })
})

describe('classCodeSchema — 6자리 학급 코드', () => {
  it('소문자·양끝 공백은 대문자로 정규화된다', () => {
    expect(classCodeSchema.parse(' k7m2p9 ')).toBe('K7M2P9')
  })
  it('혼동 문자(0·O·1·I·L)는 거부', () => {
    for (const c of ['K7M2P0', 'K7M2PO', 'K7M2P1', 'K7M2PI', 'K7M2PL'])
      expect(classCodeSchema.safeParse(c).success).toBe(false)
  })
  it('6자가 아니면 거부', () => {
    expect(classCodeSchema.safeParse('K7M2P').success).toBe(false)
    expect(classCodeSchema.safeParse('K7M2P9A').success).toBe(false)
  })
})

describe('childNoSchema — 아동 번호 1~99', () => {
  it('경계값', () => {
    expect(childNoSchema.safeParse(1).success).toBe(true)
    expect(childNoSchema.safeParse(99).success).toBe(true)
    expect(childNoSchema.safeParse(0).success).toBe(false)
    expect(childNoSchema.safeParse(100).success).toBe(false)
    expect(childNoSchema.safeParse(1.5).success).toBe(false)
  })
})

describe('classCodeCreateSchema — 학급 코드 발급 폼', () => {
  const VALID = {
    region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
    grade: 1, classNo: 2, teacherName: '김담임',
    teacherPhone: '010-1234-5678', teacherEmail: '',
  }
  it('유효 입력 통과 + 전화 하이픈 제거', () => {
    const d = classCodeCreateSchema.parse(VALID)
    expect(d.teacherPhone).toBe('01012345678')
  })
  it('전화·이메일 둘 다 비면 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID, teacherPhone: '', teacherEmail: '' }).success).toBe(false)
  })
  it('이메일만 입력해도 통과', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID, teacherPhone: '', teacherEmail: 't@school.kr' }).success).toBe(true)
  })
  it('전화 형식이 틀리면 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID, teacherPhone: '12345' }).success).toBe(false)
  })
})
```

기존 `describe('담임 연락처 — 전화/이메일 분리, 둘 중 하나 필수')`의 sessionCreateSchema 케이스에 파싱 결과 하이픈 제거 단언을 추가:

```ts
it('sessionCreateSchema도 전화 하이픈을 떼어 파싱한다', () => {
  const d = sessionCreateSchema.parse({ ...VALID_SESSION, teacherPhone: '010-1234-5678' })
  expect(d.teacherPhone).toBe('01012345678')
})
```

(`VALID_SESSION`은 파일에 이미 있는 유효 입력 픽스처 이름을 따를 것.)

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/schema.test.ts` → FAIL (신규 export 없음)

- [ ] **Step 3: `lib/schema.ts` 구현**

```ts
/** 학급 코드 알파벳 — 혼동 문자(0·O·1·I·L) 제외 31자. 발급(lib/class-code)과 입력 검증이 공유. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LEN = 6
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LEN}}$`)

/** 학급 코드 — 입력은 소문자·양끝 공백을 허용하고 대문자로 정규화해 검증한다. */
export const classCodeSchema = z.string().max(20)
  .transform(s => s.trim().toUpperCase())
  .pipe(z.string().regex(CODE_RE))

/** 아동 번호(학급 내 출석 번호). 중복 생성은 막지 않는다 — 스펙 "중복 검사 경고". */
export const childNoSchema = z.number().int().min(1).max(99)

/** 전화번호 — 하이픈 유무 모두 입력받되 저장값은 하이픈을 뗀다(사용자 확정 2026-08-13). */
export const phoneSchema = z.string()
  .transform(s => s.trim())
  .pipe(z.string().regex(PHONE_RE))
  .transform(s => s.replace(/-/g, ''))
```

`optionalContact`를 전화/이메일 전용 둘로 교체:

```ts
/** 발급 폼의 선택 연락처 칸. 빈 문자열 = 미입력. 전화는 검증 후 하이픈을 뗀다. */
const optionalPhone = z.string().max(60).default('')
  .transform(s => s.trim())
  .refine(s => s === '' || PHONE_RE.test(s), '전화번호 형식이 올바르지 않습니다.')
  .transform(s => s.replace(/-/g, ''))
const optionalEmail = z.string().max(60).default('')
  .transform(s => s.trim())
  .refine(s => s === '' || EMAIL_RE.test(s), '이메일 형식이 올바르지 않습니다.')
```

`classCodeCreateSchema` 추가:

```ts
/** POST /api/admin/codes 바디 — 학급 코드 발급 폼. */
export const classCodeCreateSchema = z.object({
  region: z.string().refine(r => REGION_NAMES.includes(r)),
  schoolId: cleaned.pipe(z.string().min(1)),
  schoolName: cleaned.pipe(z.string().min(1).max(100)),
  grade: gradeSchema,
  classNo: classNoSchema,
  teacherName: cleaned.pipe(nameSchema),
  teacherPhone: optionalPhone,
  teacherEmail: optionalEmail,
}).refine(d => d.teacherPhone !== '' || d.teacherEmail !== '',
  { path: ['teacherPhone'], message: '전화번호나 이메일 중 하나는 입력해 주세요.' })
export type ClassCodeCreateInput = z.infer<typeof classCodeCreateSchema>
```

기존 `sessionCreateSchema`의 `teacherPhone: optionalContact, teacherEmail: optionalContact`를 `teacherPhone: optionalPhone, teacherEmail: optionalEmail`로 바꾸고, 형식 검증 refine 2개(전화·이메일)는 필드로 옮겨졌으므로 삭제("둘 중 하나" refine만 남긴다). `optionalContact` 정의 삭제.

- [ ] **Step 4: `lib/validate.ts`에 타입가드 추가**

```ts
export function validClassCode(v: unknown): v is string { return classCodeSchema.safeParse(v).success }
export function validChildNo(v: unknown): v is number { return childNoSchema.safeParse(v).success }
```

(import 줄에 `classCodeSchema, childNoSchema` 추가.)

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/schema.test.ts tests/validate.test.ts tests/sessions-route.test.ts` → PASS. `tests/sessions-route.test.ts`에서 `createSession` 호출 단언의 `teacherPhone: '010-1234-5678'`이 `'01012345678'`로 바뀌어야 통과한다 — 기대값을 갱신할 것.

- [ ] **Step 6: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add lib/schema.ts lib/validate.ts tests/schema.test.ts tests/sessions-route.test.ts
git commit -m "feat: 학급 코드·아동 번호 스키마 + 전화번호 하이픈 제거 저장"
```

---

### Task 3: 코드 생성기 + db 계층

**Files:**
- Create: `lib/class-code.ts`
- Create: `tests/class-code.test.ts`
- Modify: `lib/db.ts`, `lib/README.md`(class-code.ts 행 추가)
- Test: `tests/db.test.ts`

**Interfaces:**
- Produces:
  - `generateClassCode(): string` (`lib/class-code.ts`, 서버 전용)
  - `ClassCodeRow { id, code, school_region, school_id, school_name, grade, class_no, teacher_name, teacher_phone, teacher_email, created_at }`
  - `insertClassCode(c: NewClassCodeInput): Promise<ClassCodeRow | 'duplicate'>`
  - `listClassCodes(): Promise<ClassCodeListRow[]>` (`ClassCodeListRow = ClassCodeRow & { sessions: { count: number }[] }`)
  - `deleteClassCode(id: string): Promise<'ok' | 'in_use'>`
  - `findClassCode(code: string): Promise<ClassCodeRow | null>`
  - `childTestState(classCodeId: string, childNo: number): Promise<'submitted' | 'inProgress' | null>`

- [ ] **Step 1: `tests/class-code.test.ts` 작성**

```ts
import { describe, expect, it } from 'vitest'
import { generateClassCode } from '@/lib/class-code'
import { CODE_ALPHABET, CODE_LEN } from '@/lib/schema'

describe('generateClassCode', () => {
  it('길이 6, 허용 알파벳만 쓴다 (혼동 문자 0·O·1·I·L 없음)', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateClassCode()
      expect(c).toHaveLength(CODE_LEN)
      for (const ch of c) expect(CODE_ALPHABET.includes(ch)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/class-code.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: `lib/class-code.ts` 구현**

```ts
// lib/class-code.ts — 학급 코드 생성(서버 전용 — node:crypto).
// 형식(알파벳·길이)의 단일 소스는 lib/schema.ts — 발급과 입력 검증이 어긋나지 않게 한다.
import { randomInt } from 'node:crypto'
import { CODE_ALPHABET, CODE_LEN } from './schema'

export function generateClassCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}
```

- [ ] **Step 4: `lib/db.ts`에 class_codes 함수 추가** (관리자 조회 절 위쪽, `saveScores` 아래에 배치)

```ts
// ---------- 학급 코드 (스펙 2026-08-13 — 관리자 발급, 세션 생성이 비정규화 복사) ----------

export interface ClassCodeRow {
  id: string
  code: string
  school_region: string; school_id: string; school_name: string
  grade: number; class_no: number
  teacher_name: string; teacher_phone: string | null; teacher_email: string | null
  created_at: string
}

const CLASS_CODE_COLS = 'id, code, school_region, school_id, school_name, grade, class_no, teacher_name, teacher_phone, teacher_email, created_at'

export interface NewClassCodeInput {
  code: string
  schoolRegion: string; schoolId: string; schoolName: string
  grade: number; classNo: number
  teacherName: string
  /** 전화·이메일 중 하나는 non-null(스키마가 보장). 전화는 하이픈 없는 숫자만 */
  teacherPhone: string | null; teacherEmail: string | null
}

/** unique 충돌이면 'duplicate' — 라우트가 새 코드로 재시도한다(23505 = unique_violation). */
export async function insertClassCode(c: NewClassCodeInput): Promise<ClassCodeRow | 'duplicate'> {
  const { data, error } = await sb().from('class_codes').insert({
    code: c.code,
    school_region: c.schoolRegion, school_id: c.schoolId, school_name: c.schoolName,
    grade: c.grade, class_no: c.classNo,
    teacher_name: c.teacherName, teacher_phone: c.teacherPhone, teacher_email: c.teacherEmail,
  }).select(CLASS_CODE_COLS).single()
  if (error?.code === '23505') return 'duplicate'
  fail(error)
  return data as unknown as ClassCodeRow
}

export type ClassCodeListRow = ClassCodeRow & { sessions: { count: number }[] }

export async function listClassCodes(): Promise<ClassCodeListRow[]> {
  const { data, error } = await sb().from('class_codes')
    .select(`${CLASS_CODE_COLS}, sessions(count)`)
    .order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as unknown as ClassCodeListRow[]
}

/** 세션이 참조 중이면 'in_use'(23503 = foreign_key_violation — FK restrict가 최종 방어). */
export async function deleteClassCode(id: string): Promise<'ok' | 'in_use'> {
  const { error } = await sb().from('class_codes').delete().eq('id', id)
  if (error?.code === '23503') return 'in_use'
  fail(error)
  return 'ok'
}

export async function findClassCode(code: string): Promise<ClassCodeRow | null> {
  const { data, error } = await sb().from('class_codes')
    .select(CLASS_CODE_COLS).eq('code', code).maybeSingle()
  fail(error)
  return (data as unknown as ClassCodeRow) ?? null
}

/** 같은 학급·같은 아동 번호의 기존 검사 상태 — 중복 검사 경고용.
 *  제출본이 하나라도 있으면 'submitted', 미제출만 있으면 'inProgress', 없으면 null.
 *  ⚠️ 번호 목록을 만들지 않는다 — 물어본 번호 하나에 대해서만 답한다(스펙 "중복 검사 경고"). */
export async function childTestState(
  classCodeId: string, childNo: number,
): Promise<'submitted' | 'inProgress' | null> {
  const { data, error } = await sb().from('sessions').select('submitted_at')
    .eq('class_code_id', classCodeId).eq('child_no', childNo)
  fail(error)
  if (!data || data.length === 0) return null
  return data.some(r => r.submitted_at) ? 'submitted' : 'inProgress'
}
```

주의: `fail`의 파라미터 타입이 `{ message: string } | null`인데 `error?.code`를 읽으므로, `insertClassCode`/`deleteClassCode`에서는 supabase 에러 객체를 그대로 쓴다(PostgrestError에 `code`가 있다). 타입 에러가 나면 `(error as { code?: string } | null)?.code`로 좁힌다.

- [ ] **Step 5: `tests/db.test.ts`에 케이스 추가** — 파일 상단의 체이너블 supabase 스텁(응답 큐) 관례를 그대로 사용:

```ts
describe('class_codes', () => {
  it('insertClassCode: unique 충돌(23505)이면 duplicate를 돌려준다 (던지지 않는다)', async () => {
    queue('class_codes', { data: null, error: { message: 'dup', code: '23505' } })
    expect(await insertClassCode(NEW_CODE_INPUT)).toBe('duplicate')
  })
  it('deleteClassCode: FK 위반(23503)이면 in_use', async () => {
    queue('class_codes', { data: null, error: { message: 'fk', code: '23503' } })
    expect(await deleteClassCode('11111111-1111-1111-1111-111111111111')).toBe('in_use')
  })
  it('childTestState: 제출본이 있으면 submitted가 미제출보다 우선', async () => {
    queue('sessions', { data: [{ submitted_at: null }, { submitted_at: '2026-08-13T00:00:00Z' }], error: null })
    expect(await childTestState('cc-1', 3)).toBe('submitted')
  })
  it('childTestState: 행이 없으면 null', async () => {
    queue('sessions', { data: [], error: null })
    expect(await childTestState('cc-1', 3)).toBeNull()
  })
})
```

(`queue`/픽스처 헬퍼 이름은 `tests/db.test.ts` 상단의 실제 스텁 헬퍼를 따를 것 — 테이블별 응답 큐 방식은 동일하다. `NEW_CODE_INPUT`은 `NewClassCodeInput` 형태의 유효 픽스처로 파일에 정의.)

- [ ] **Step 6: 통과 확인** — `npx vitest run tests/class-code.test.ts tests/db.test.ts` → PASS

- [ ] **Step 7: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add lib/class-code.ts lib/db.ts lib/README.md tests/class-code.test.ts tests/db.test.ts
git commit -m "feat: 학급 코드 생성기 + db 계층 (발급·목록·삭제·조회·중복검사 상태)"
```

---

### Task 4: 관리자 코드 API (POST/GET/DELETE)

**Files:**
- Create: `app/api/admin/codes/route.ts`, `app/api/admin/codes/[id]/route.ts`
- Create: `tests/admin-codes-route.test.ts`
- Modify: `app/api/README.md`(라우트 표에 두 줄 추가)

**Interfaces:**
- Consumes: Task 2 `classCodeCreateSchema`, Task 3 db 함수·`generateClassCode`.
- Produces: `POST /api/admin/codes` → `{ code: ClassCodeRow }` / `GET` → `{ codes: (ClassCodeRow & { session_count: number })[] }` / `DELETE /api/admin/codes/[id]` → `{ ok: true }` | 409.

- [ ] **Step 1: 테스트 작성** — `tests/admin-codes-route.test.ts` (인증은 middleware 담당이라 라우트 테스트에서 다루지 않는다 — 기존 admin-routes.test.ts와 동일):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  insertClassCode: vi.fn(),
  listClassCodes: vi.fn().mockResolvedValue([]),
  deleteClassCode: vi.fn().mockResolvedValue('ok'),
}))

import { GET, POST } from '@/app/api/admin/codes/route'
import { DELETE } from '@/app/api/admin/codes/[id]/route'
import * as db from '@/lib/db'

const ROW = {
  id: '11111111-1111-1111-1111-111111111111', code: 'K7M2P9',
  school_region: '서울특별시교육청', school_id: 'B000002295', school_name: '서울신구초등학교',
  grade: 1, class_no: 2, teacher_name: '김담임',
  teacher_phone: '01012345678', teacher_email: null,
  created_at: '2026-08-13T00:00:00.000Z',
}
const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  grade: 1, classNo: 2, teacherName: '김담임', teacherPhone: '010-1234-5678', teacherEmail: '',
}
const req = (body: unknown) => new Request('http://x/api/admin/codes', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const delParams = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.insertClassCode).mockResolvedValue(ROW)
  vi.mocked(db.listClassCodes).mockResolvedValue([])
  vi.mocked(db.deleteClassCode).mockResolvedValue('ok')
})

describe('POST /api/admin/codes', () => {
  it('유효 입력이면 코드를 발급한다 — 전화는 하이픈 없이 저장된다', async () => {
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    const call = vi.mocked(db.insertClassCode).mock.calls[0][0]
    expect(call.teacherPhone).toBe('01012345678')
    expect(call.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
  })
  it('unique 충돌이면 새 코드로 재시도한다', async () => {
    vi.mocked(db.insertClassCode).mockResolvedValueOnce('duplicate').mockResolvedValueOnce(ROW)
    const res = await POST(req(VALID))
    expect(res.status).toBe(200)
    expect(db.insertClassCode).toHaveBeenCalledTimes(2)
    const [first, second] = vi.mocked(db.insertClassCode).mock.calls.map(c => c[0].code)
    expect(first).not.toBe(second)
  })
  it('재시도 상한(5회) 소진 시 502', async () => {
    vi.mocked(db.insertClassCode).mockResolvedValue('duplicate')
    const res = await POST(req(VALID))
    expect(res.status).toBe(502)
    expect(db.insertClassCode).toHaveBeenCalledTimes(5)
  })
  it('검증 실패 400 + 내부 문구 비노출', async () => {
    const res = await POST(req({ ...VALID, teacherPhone: '', teacherEmail: '' }))
    expect(res.status).toBe(400)
    expect(db.insertClassCode).not.toHaveBeenCalled()
  })
  it('DB 오류 502 + 원본 오류 텍스트 비노출', async () => {
    vi.mocked(db.insertClassCode).mockRejectedValue(new Error('pg: secret detail'))
    const res = await POST(req(VALID))
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/secret/)
  })
})

describe('GET /api/admin/codes', () => {
  it('sessions(count)를 session_count로 펴서 내려준다', async () => {
    vi.mocked(db.listClassCodes).mockResolvedValue([{ ...ROW, sessions: [{ count: 7 }] }])
    const res = await GET()
    const json = await res.json()
    expect(json.codes[0].session_count).toBe(7)
    expect(json.codes[0]).not.toHaveProperty('sessions')
  })
})

describe('DELETE /api/admin/codes/[id]', () => {
  it('미사용 코드는 삭제된다', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), delParams(ROW.id))
    expect(res.status).toBe(200)
  })
  it('사용 중 코드는 409', async () => {
    vi.mocked(db.deleteClassCode).mockResolvedValue('in_use')
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), delParams(ROW.id))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/사용/)
  })
  it('잘못된 id 400 — db 미호출 (가드 순서)', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), delParams('nope'))
    expect(res.status).toBe(400)
    expect(db.deleteClassCode).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/admin-codes-route.test.ts` → FAIL (라우트 없음)

- [ ] **Step 3: `app/api/admin/codes/route.ts` 구현**

```ts
// /api/admin/codes — 학급 코드 발급(POST)·목록(GET). 인증은 middleware가 담당.
import { NextResponse } from 'next/server'
import { insertClassCode, listClassCodes } from '@/lib/db'
import { generateClassCode } from '@/lib/class-code'
import { classCodeCreateSchema } from '@/lib/schema'
import { jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

/** unique 충돌 재시도 상한 — 31^6 공간에서 연속 충돌은 사실상 장애라 그때는 502로 알린다. */
const MAX_RETRY = 5

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = classCodeCreateSchema.safeParse(body)
  if (!parsed.success) return jsonError('입력값을 다시 확인해 주세요.', 400)
  const d = parsed.data
  try {
    for (let i = 0; i < MAX_RETRY; i++) {
      const row = await insertClassCode({
        code: generateClassCode(),
        schoolRegion: d.region, schoolId: d.schoolId, schoolName: d.schoolName,
        grade: d.grade, classNo: d.classNo,
        teacherName: d.teacherName,
        teacherPhone: d.teacherPhone || null, teacherEmail: d.teacherEmail || null,
      })
      if (row !== 'duplicate') return NextResponse.json({ code: row })
    }
    console.error('[admin/codes] 코드 unique 충돌 재시도 상한 도달')
    return jsonError('코드 발급에 실패했습니다. 다시 시도해 주세요.', 502)
  } catch (e) {
    console.error('[admin/codes] 발급 실패', e)
    return jsonError('코드 발급에 실패했습니다.', 502)
  }
}

export async function GET() {
  try {
    const rows = await listClassCodes()
    return NextResponse.json({
      codes: rows.map(({ sessions, ...c }) => ({ ...c, session_count: sessions[0]?.count ?? 0 })),
    })
  } catch (e) {
    console.error('[admin/codes] 목록 조회 실패', e)
    return jsonError('목록을 불러오지 못했습니다.', 500)
  }
}
```

- [ ] **Step 4: `app/api/admin/codes/[id]/route.ts` 구현**

```ts
// /api/admin/codes/[id] — 학급 코드 삭제. 세션이 참조 중이면 거부(FK restrict가 최종 방어).
import { NextResponse } from 'next/server'
import { deleteClassCode } from '@/lib/db'
import { UUID_RE, jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 코드 id입니다.', 400)
  try {
    const result = await deleteClassCode(id)
    if (result === 'in_use') return jsonError('이미 검사에 사용된 코드는 삭제할 수 없습니다.', 409)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/codes/:id] 삭제 실패', e)
    return jsonError('코드 삭제에 실패했습니다.', 500)
  }
}
```

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/admin-codes-route.test.ts` → PASS

- [ ] **Step 6: 4종 검증 후 커밋** (app/api/README.md 표 갱신 포함)

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add app/api/admin/codes tests/admin-codes-route.test.ts app/api/README.md
git commit -m "feat: 관리자 학급 코드 API — 발급·목록·삭제"
```

---

### Task 5: verify-code 공개 API + 레이트리미터 공용화

**Files:**
- Modify: `lib/request.ts`
- Create: `app/api/sessions/verify-code/route.ts`
- Create: `tests/verify-code-route.test.ts`
- Modify: `app/api/README.md`

**Interfaces:**
- Produces: `createRateLimiter(limit, windowMs): (ip: string) => boolean` (lib/request.ts). `POST /api/sessions/verify-code` `{ code, childNo }` → `{ schoolName, grade, classNo, teacherName, teacherPhone, teacherEmail, alreadyTested }` | 404 | 429.

- [ ] **Step 1: `lib/request.ts`에 레이트리미터 추출** — `app/api/sessions/route.ts`의 인메모리 카운터(12~35행)를 일반화해 옮긴다(원본 주석 유지):

```ts
/** best-effort 인메모리 IP 레이트리미터. 서버리스에서는 인스턴스별 독립이라 완벽한
 *  전역 방어는 아니며, 스팸성 요청에 마찰을 주는 목적이다. sweepEvery번째 요청마다
 *  만료 키를 걷어내 장수 인스턴스의 메모리 단조 증가를 막는다. */
export function createRateLimiter(limit: number, windowMs: number, sweepEvery = 100) {
  const hits = new Map<string, number[]>()
  let counter = 0
  return function rateLimited(ip: string): boolean {
    const now = Date.now()
    if (++counter % sweepEvery === 0) {
      for (const [key, times] of hits) {
        const alive = times.filter(t => now - t < windowMs)
        if (alive.length === 0) hits.delete(key)
        else hits.set(key, alive)
      }
    }
    const recent = (hits.get(ip) ?? []).filter(t => now - t < windowMs)
    recent.push(now)
    hits.set(ip, recent)
    return recent.length > limit
  }
}
```

`app/api/sessions/route.ts`의 자체 구현을 `const rateLimited = createRateLimiter(RATE_LIMIT, RATE_WINDOW_MS)`로 교체(상수 2개는 남긴다).

- [ ] **Step 2: 테스트 작성** — `tests/verify-code-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  findClassCode: vi.fn(),
  childTestState: vi.fn(),
}))

import { POST } from '@/app/api/sessions/verify-code/route'
import * as db from '@/lib/db'

const ROW = {
  id: '11111111-1111-1111-1111-111111111111', code: 'K7M2P9',
  school_region: '서울특별시교육청', school_id: 'B000002295', school_name: '서울신구초등학교',
  grade: 1, class_no: 2, teacher_name: '김담임',
  teacher_phone: '01012345678', teacher_email: null,
  created_at: '2026-08-13T00:00:00.000Z',
}
let ipSeq = 0
const req = (body: unknown, ip = `10.0.0.${++ipSeq}`) => new Request('http://x/api/sessions/verify-code', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.findClassCode).mockResolvedValue(ROW)
  vi.mocked(db.childTestState).mockResolvedValue(null)
})

describe('POST /api/sessions/verify-code', () => {
  it('정상 조회 — 학급 정보와 alreadyTested를 돌려준다', async () => {
    const res = await POST(req({ code: 'K7M2P9', childNo: 3 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      schoolName: '서울신구초등학교', grade: 1, classNo: 2,
      teacherName: '김담임', teacherPhone: '01012345678', teacherEmail: null,
      alreadyTested: null,
    })
    expect(db.childTestState).toHaveBeenCalledWith(ROW.id, 3)
  })
  it('소문자 코드도 대문자로 정규화해 조회한다', async () => {
    await POST(req({ code: 'k7m2p9', childNo: 3 }))
    expect(db.findClassCode).toHaveBeenCalledWith('K7M2P9')
  })
  it('미존재 코드 404', async () => {
    vi.mocked(db.findClassCode).mockResolvedValue(null)
    const res = await POST(req({ code: 'AAAAAA', childNo: 3 }))
    expect(res.status).toBe(404)
    expect(db.childTestState).not.toHaveBeenCalled()
  })
  it('제출 이력이 있으면 alreadyTested=submitted', async () => {
    vi.mocked(db.childTestState).mockResolvedValue('submitted')
    const json = await (await POST(req({ code: 'K7M2P9', childNo: 3 }))).json()
    expect(json.alreadyTested).toBe('submitted')
  })
  it('[REGRESSION] 응답에 다른 아동 번호 목록이 실리지 않는다 — 물어본 번호의 상태만 답한다', async () => {
    const json = await (await POST(req({ code: 'K7M2P9', childNo: 3 }))).json()
    expect(Object.keys(json).sort()).toEqual(
      ['alreadyTested', 'classNo', 'grade', 'schoolName', 'teacherEmail', 'teacherName', 'teacherPhone'])
  })
  it('childNo 누락·범위 밖 400', async () => {
    expect((await POST(req({ code: 'K7M2P9' }))).status).toBe(400)
    expect((await POST(req({ code: 'K7M2P9', childNo: 0 }))).status).toBe(400)
  })
  it('같은 IP 21번째 요청은 429 (코드 열거 방지)', async () => {
    let last = 0
    for (let i = 0; i < 21; i++) last = (await POST(req({ code: 'K7M2P9', childNo: 3 }, '9.9.9.9'))).status
    expect(last).toBe(429)
  })
})
```

- [ ] **Step 3: 실패 확인** — `npx vitest run tests/verify-code-route.test.ts` → FAIL

- [ ] **Step 4: `app/api/sessions/verify-code/route.ts` 구현**

```ts
// POST /api/sessions/verify-code — 학급 코드 조회(검사 시작 전 확인 모달 데이터).
// 공개 라우트 — 코드가 곧 접근 수단이므로 세션 생성과 같은 레이트리밋으로 코드 열거를 막는다.
// ⚠️ 검사한 번호 목록은 반환하지 않는다 — 시작 화면은 아동 앞의 PC이고 학급 안에서 번호는
// 사실상 이름이다. 물어본 그 번호의 상태(alreadyTested)만 답한다(스펙 "중복 검사 경고").
import { NextResponse } from 'next/server'
import { childTestState, findClassCode } from '@/lib/db'
import { verifyCodeSchema } from '@/lib/schema'
import { clientIp, createRateLimiter, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const rateLimited = createRateLimiter(20, 10 * 60_000)

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)
  const body = await req.json().catch(() => null)
  const parsed = verifyCodeSchema.safeParse(body)
  if (!parsed.success) return jsonError('코드를 확인해 주세요.', 400)
  try {
    const row = await findClassCode(parsed.data.code)
    if (!row) return jsonError('코드를 확인해 주세요.', 404)
    const alreadyTested = await childTestState(row.id, parsed.data.childNo)
    return NextResponse.json({
      schoolName: row.school_name, grade: row.grade, classNo: row.class_no,
      teacherName: row.teacher_name, teacherPhone: row.teacher_phone, teacherEmail: row.teacher_email,
      alreadyTested,
    })
  } catch (e) {
    console.error('[verify-code] 조회 실패', e)
    return jsonError('확인에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502)
  }
}
```

`lib/schema.ts`에 추가:

```ts
/** POST /api/sessions/verify-code 바디 */
export const verifyCodeSchema = z.object({ code: classCodeSchema, childNo: childNoSchema })
```

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/verify-code-route.test.ts tests/sessions-route.test.ts` → PASS

- [ ] **Step 6: 4종 검증 후 커밋** (app/api/README.md 갱신 포함)

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add lib/request.ts lib/schema.ts app/api/sessions/verify-code app/api/sessions/route.ts tests/verify-code-route.test.ts app/api/README.md
git commit -m "feat: 학급 코드 확인 API — 물어본 번호의 검사 상태만 답한다"
```

---

### Task 6: 세션 생성을 코드 기반으로 교체

**Files:**
- Modify: `lib/schema.ts`(sessionCreateSchema 교체), `app/api/sessions/route.ts`, `lib/db.ts`(createSession·SessionRow·SESSION_COLS)
- Test: `tests/sessions-route.test.ts`(재작성), `tests/schema.test.ts`, `tests/db.test.ts`, `tests/adminStats.test.ts`·`tests/admin-routes.test.ts`(픽스처에 `class_code_id`·`child_no` 추가)

**Interfaces:**
- Produces: `sessionCreateSchema = { code, childNo, name, gender, birthYmd, guardianConsent }`. `POST /api/sessions` → `{ sessionId, sessionToken, grade }`. `createSession({ classCode: ClassCodeRow, childNo, birthYmd, gender, childName })`. `SessionRow`에 `class_code_id: string`·`child_no: number` 추가.

- [ ] **Step 1: `tests/sessions-route.test.ts` 재작성**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  createSession: vi.fn().mockResolvedValue('sess-1'),
  findClassCode: vi.fn(),
}))
vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))

import { POST } from '@/app/api/sessions/route'
import * as db from '@/lib/db'

const CODE_ROW = {
  id: '11111111-1111-1111-1111-111111111111', code: 'K7M2P9',
  school_region: '서울특별시교육청', school_id: 'B000002295', school_name: '서울신구초등학교',
  grade: 2, class_no: 3, teacher_name: '박선생',
  teacher_phone: '01012345678', teacher_email: null,
  created_at: '2026-08-13T00:00:00.000Z',
}
const VALID = { code: 'K7M2P9', childNo: 7, name: '김도연', gender: '남', birthYmd: '190101', guardianConsent: true }

let ipSeq = 0
function makeReq(body: unknown, ip = `10.1.0.${++ipSeq}`) {
  return new Request('http://x/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.createSession).mockResolvedValue('sess-1')
  vi.mocked(db.findClassCode).mockResolvedValue(CODE_ROW)
})

describe('POST /api/sessions — 코드 기반 생성', () => {
  it('유효한 코드로 세션 생성 + 토큰 + 학년(코드가 정한 값) 반환', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessionId).toBe('sess-1')
    expect(typeof json.sessionToken).toBe('string')
    expect(json.grade).toBe(2)
    expect(db.createSession).toHaveBeenCalledWith({
      classCode: CODE_ROW, childNo: 7,
      birthYmd: '190101', gender: '남', childName: '김도연',
    })
  })
  it('[REGRESSION] 클라이언트가 보낸 학급 정보는 무시된다 — 서버가 코드에서 복사한다', async () => {
    const res = await POST(makeReq({ ...VALID, schoolName: '위조초등학교', grade: 6, teacherName: '위조' }))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith({
      classCode: CODE_ROW, childNo: 7,
      birthYmd: '190101', gender: '남', childName: '김도연',
    })
  })
  it('미존재 코드 404 — 세션이 만들어지지 않는다', async () => {
    vi.mocked(db.findClassCode).mockResolvedValue(null)
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(404)
    expect(db.createSession).not.toHaveBeenCalled()
  })
  it('아동 번호 범위 밖(0·100) 400', async () => {
    expect((await POST(makeReq({ ...VALID, childNo: 0 }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, childNo: 100 }))).status).toBe(400)
  })
  it('guardianConsent가 true 리터럴이 아니면 400 (미체크로는 생성 불가)', async () => {
    expect((await POST(makeReq({ ...VALID, guardianConsent: false }))).status).toBe(400)
    const { guardianConsent: _omit, ...rest } = VALID
    expect((await POST(makeReq(rest))).status).toBe(400)
  })
  it('이름 형식 위반 400', async () => {
    expect((await POST(makeReq({ ...VALID, name: '123' }))).status).toBe(400)
  })
  it('DB 오류 502 + 내부 문구 비노출', async () => {
    vi.mocked(db.createSession).mockRejectedValue(new Error('pg secret'))
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/pg secret/)
  })
  it('같은 IP 21번째 요청 429 (레이트리밋 유지)', async () => {
    let last = 0
    for (let i = 0; i < 21; i++) last = (await POST(makeReq(VALID, '8.8.8.8'))).status
    expect(last).toBe(429)
  })
})
```

(기존 파일의 옛 케이스 — 학교·담임 입력 검증 등 — 는 전부 삭제된다. 레이트리밋 외 기존 보안 케이스 중 코드 기반에도 성립하는 것이 있으면 위 형태로 옮겨 유지.)

- [ ] **Step 2: `tests/schema.test.ts`에서 옛 sessionCreateSchema 케이스 교체** — 학교/담임/examinerType 케이스 삭제, 새 스키마 케이스 추가:

```ts
describe('sessionCreateSchema — 코드 기반 (스펙 2026-08-13)', () => {
  const VALID = { code: 'K7M2P9', childNo: 3, name: '김도연', gender: '남', birthYmd: '190101', guardianConsent: true }
  it('유효 입력 통과 + 코드 대문자 정규화', () => {
    const d = sessionCreateSchema.parse({ ...VALID, code: 'k7m2p9' })
    expect(d.code).toBe('K7M2P9')
  })
  it('학급 정보 필드는 스키마에 없다 — 보내도 벗겨진다', () => {
    const d = sessionCreateSchema.parse({ ...VALID, schoolName: '위조초', grade: 6 })
    expect(d).not.toHaveProperty('schoolName')
    expect(d).not.toHaveProperty('grade')
  })
})
```

Task 2에서 추가했던 `it('sessionCreateSchema도 전화 하이픈을 …')` 케이스는 삭제(스키마에서 전화가 사라짐).

- [ ] **Step 3: 실패 확인** — `npx vitest run tests/sessions-route.test.ts tests/schema.test.ts` → FAIL

- [ ] **Step 4: `lib/schema.ts` — sessionCreateSchema 교체**

기존 `sessionCreateSchema`(refine 포함)와 `SessionCreateInput`을 삭제하고:

```ts
/** POST /api/sessions 바디 — 학급 정보는 받지 않는다(서버가 코드에서 복사 — 스펙). */
export const sessionCreateSchema = z.object({
  code: classCodeSchema,
  childNo: childNoSchema,
  name: cleaned.pipe(nameSchema),
  gender: genderSchema,
  birthYmd: birthYmdSchema,
  // 만 14세 미만 아동 — 법정대리인 서면 동의를 확인했다는 검사자 체크(개인정보보호법 제22조의2).
  guardianConsent: z.literal(true),
})
export type SessionCreateInput = z.infer<typeof sessionCreateSchema>
```

- [ ] **Step 5: `lib/db.ts` — createSession 교체 + SessionRow 확장**

```ts
export interface NewSessionInput {
  /** 학급 정보의 원본 — 세션 행에 비정규화 복사한다(스펙 "DB" 절). 코드를 나중에 고쳐도
   *  이미 만든 세션은 검사 당시 값을 유지한다(임상 기록 관점). */
  classCode: ClassCodeRow
  childNo: number
  birthYmd: string; gender: '남' | '여'; childName: string
}

export async function createSession(s: NewSessionInput): Promise<string> {
  const c = s.classCode
  const { data, error } = await sb().from('sessions').insert({
    class_code_id: c.id, child_no: s.childNo,
    school_region: c.school_region, school_id: c.school_id, school_name: c.school_name,
    grade: c.grade, class_no: c.class_no,
    teacher_name: c.teacher_name, teacher_phone: c.teacher_phone, teacher_email: c.teacher_email,
    birth_ymd: s.birthYmd, gender: s.gender, child_name: s.childName,
    // 법정대리인 동의 확인 시각(감사 증적) — 라우트가 guardianConsent 검증을 통과한 요청만
    // 여기 도달하므로, 세션 생성 = 동의 확인 완료를 의미한다(제22조의2 확인 의무의 기록).
    guardian_consented_at: new Date().toISOString(),
  }).select('id').single()
  fail(error)
  return data!.id
}
```

`SessionRow`에 추가(주석 포함):

```ts
  /** 발급된 학급 코드 참조. 학급 정보는 생성 시점에 아래 컬럼들로 복사돼 있다 */
  class_code_id: string
  /** 학급 내 출석 번호(1~99). 같은 번호의 재검사가 있을 수 있다 */
  child_no: number
```

`SESSION_COLS`에 `, class_code_id, child_no` 추가.

- [ ] **Step 6: `app/api/sessions/route.ts` 재작성**

```ts
// POST /api/sessions — 검사 세션 생성(학급 코드 + 아동 정보) + 세션 스코프 토큰 발급.
// 학급 정보(학교·학년·반·담임·연락처)는 클라이언트가 보낸 값을 받지 않는다 —
// 코드를 다시 조회해 서버가 복사한다(스펙 2026-08-13). 이후 녹음 업로드·제출은 토큰 동봉 필수.
import { NextResponse } from 'next/server'
import { createSession, findClassCode } from '@/lib/db'
import { createSessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { clientIp, createRateLimiter, jsonError } from '@/lib/request'
import { sessionCreateSchema } from '@/lib/schema'

export const runtime = 'nodejs'

const RATE_LIMIT = 20 // IP당 시간창 내 허용 세션 생성 수
const RATE_WINDOW_MS = 10 * 60_000
const rateLimited = createRateLimiter(RATE_LIMIT, RATE_WINDOW_MS)

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)

  const body = await req.json().catch(() => null)
  const parsed = sessionCreateSchema.safeParse(body)
  if (!parsed.success)
    return jsonError('입력값을 다시 확인해 주세요.', 400)

  const d = parsed.data
  try {
    const classCode = await findClassCode(d.code)
    if (!classCode) return jsonError('코드를 확인해 주세요.', 404)
    const sessionId = await createSession({
      classCode, childNo: d.childNo,
      birthYmd: d.birthYmd, gender: d.gender, childName: d.name,
    })
    const sessionToken = await createSessionToken(sessionId, env('SESSION_SECRET'))
    // grade는 어떤 검사지(양식)로 진행할지 정한다 — 코드가 정한 값을 서버가 내려준다.
    return NextResponse.json({ sessionId, sessionToken, grade: classCode.grade })
  } catch (e) {
    console.error('[sessions] createSession 실패', e)
    return jsonError('문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
```

- [ ] **Step 7: 픽스처 보수** — `grep -rn "school_region\|SessionListRow\|SessionRow" tests/`에서 `SessionRow`/`SessionListRow` 리터럴 픽스처(`tests/adminStats.test.ts`의 `mkSession`, `tests/admin-routes.test.ts`)에 `class_code_id: '11111111-1111-1111-1111-111111111111', child_no: 3` 추가. `tests/db.test.ts`의 createSession 케이스를 새 입력 모양으로 갱신.

- [ ] **Step 8: 통과 확인** — `npx vitest run` → PASS (이 시점에 `app/page.tsx`는 아직 옛 폼이라 **런타임으로는** 세션 생성이 실패하지만, 컴포넌트 테스트가 없어 테스트·타입은 통과한다. Task 7이 바로 잇는다.)

- [ ] **Step 9: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add -A
git commit -m "feat: 세션 생성을 학급 코드 기반으로 교체 — 학급 정보는 서버가 복사"
```

---

### Task 7: 검사 시작 페이지 재작성 + 코드 기억 + 종료 문구

**Files:**
- Modify: `app/page.tsx`(전면 재작성), `lib/survey-state.ts`, `app/done/page.tsx`, `app/README.md`
- Test: `tests/survey-state.test.ts`

**Interfaces:**
- Consumes: `POST /api/sessions/verify-code`·`POST /api/sessions`(Task 5·6), `validClassCode`/`validChildNo`(Task 2).
- Produces: `saveClassCode(code: string): void`, `loadClassCode(): string | null` (`lib/survey-state.ts`).

- [ ] **Step 1: `lib/survey-state.ts`에 코드 기억 추가** (파일 끝, `clearState` 아래)

```ts
/** 학급 코드 기억 — 진행 상태와 **별도 키**라 clearState가 지우지 않는다.
 *  한 학급을 연달아 검사할 때 코드 재입력을 덜기 위한 것으로, 세션 생성 성공 직후에만
 *  저장한다(오타·확인 모달 취소가 남지 않게 — 스펙 "연속 검사").
 *  ⚠️ 아동 개인정보(이름·번호·성별·생년월일)는 여기든 어디든 별도 키로 남기지 않는다. */
const CODE_KEY = 'kodys-survey:classCode'

export function saveClassCode(code: string): void {
  try { localStorage.setItem(CODE_KEY, code) } catch { /* noop */ }
}

export function loadClassCode(): string | null {
  try { return localStorage.getItem(CODE_KEY) } catch { return null }
}
```

- [ ] **Step 2: 테스트 추가** — `tests/survey-state.test.ts`:

```ts
describe('학급 코드 기억 (연속 검사 — 스펙 2026-08-13)', () => {
  it('[REGRESSION] clearState는 학급 코드를 지우지 않는다 — 진행 상태(아동 정보 포함)만 지운다', () => {
    saveState(newState('sid', '이하늘', 'tok', 1))
    saveClassCode('K7M2P9')
    clearState()
    expect(loadClassCode()).toBe('K7M2P9')
    expect(loadState()).toBeNull()
    expect(localStorage.getItem('kodys-survey:sid')).toBeNull()
    expect(localStorage.getItem('kodys-survey:last')).toBeNull()
  })
  it('새 코드가 이전 코드를 덮어쓴다 (코드는 하나만 유지)', () => {
    saveClassCode('AAAAAA')
    saveClassCode('BBBBBB')
    expect(loadClassCode()).toBe('BBBBBB')
  })
})
```

Run: `npx vitest run tests/survey-state.test.ts` → FAIL 확인 후 Step 1 반영 → PASS.

- [ ] **Step 3: `app/page.tsx` 전면 재작성**

```tsx
// app/page.tsx — 검사 시작 화면. 학급 코드 + 아동 정보만 입력한다(담당자 협의 2026-08-13).
// 학급 정보(학교·학년·반·담임·연락처)는 관리자가 /admin/codes에서 코드 발급 시 입력했다.
// [확인] → 코드 조회(verify-code) → 학급 정보 확인 모달 → [맞아요] → 세션 생성 → /survey.
// 학급 코드는 세션 생성 성공 직후 별도 키에 저장돼, 같은 학급의 다음 아동은 코드가 채워진
// 채로 시작한다(아동 정보는 절대 남기지 않는다 — lib/survey-state.ts 참고).
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { Select } from '@/components/Select'
import { CONSENT_NOTICE, GUARDIAN_CONSENT_LABEL } from '@/lib/consent'
import { gradeClassLabel, pad2 } from '@/lib/format'
import { postJson } from '@/lib/http'
import { clearState, loadClassCode, loadState, newState, saveClassCode, saveState } from '@/lib/survey-state'
import { validBirthYmd, validChildNo, validClassCode, validGender, validName } from '@/lib/validate'

const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

const NOW_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => NOW_YEAR - 5 - i) // 초등 연령대 여유 범위
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

type FieldKey = 'code' | 'childNo' | 'name' | 'gender' | 'birth'
type FieldErrors = Partial<Record<FieldKey, string>>

/** 화면상 필드 순서 — 검증 실패 시 이 순서의 첫 에러 필드로 포커스를 옮긴다. */
const FIELD_ORDER: FieldKey[] = ['code', 'childNo', 'name', 'gender', 'birth']

function focusFirstError(errors: FieldErrors) {
  const key = FIELD_ORDER.find(k => errors[k])
  if (!key) return
  const root = document.querySelector<HTMLElement>(`[data-field="${key}"]`)
  const target = root?.matches('input,button') ? root : root?.querySelector<HTMLElement>('input,button')
  ;(target ?? root)?.focus()
  root?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null
  return <p id={id} role="alert" className="mt-1.5 text-[13px] text-rec-deep">{msg}</p>
}

/** verify-code 응답 — 확인 모달에 그대로 보여주는 학급 정보 */
interface ClassInfo {
  schoolName: string; grade: number; classNo: number
  teacherName: string; teacherPhone: string | null; teacherEmail: string | null
  alreadyTested: 'submitted' | 'inProgress' | null
}

export default function StartPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [childNo, setChildNo] = useState('')
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'남' | '여' | ''>('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  // 법정대리인 서면 동의를 확인했다는 검사자 체크(필수) — 체크 전에는 [확인] 비활성
  const [consent, setConsent] = useState(false)
  // 코드 조회 결과 — 값이 있으면 확인 모달이 열려 있다
  const [confirm, setConfirm] = useState<ClassInfo | null>(null)
  // 이 기기에 남아 있는 미제출 세션 — 누구의 검사인지(childName) 함께 보여 이어하기를 돕는다
  const [resume, setResume] = useState<{ childName: string } | null>(null)

  useEffect(() => {
    // localStorage는 서버 프리렌더에 없으므로 마운트 후 확인(하이드레이션 불일치 방지).
    const s = loadState()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) setResume({ childName: s.childName })
    // 같은 학급을 연달아 검사할 때 코드 재입력을 던다 — 직전 검사가 성공한 코드만 남아 있다.
    const last = loadClassCode()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last) setCode(last)
  }, [])

  // 선택한 연·월에 맞는 일수 (윤년 반영)
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const cleanCode = code.trim().toUpperCase()
  const cleanName = name.trim().replace(/\s+/g, ' ')
  const childNoNum = Number(childNo)
  const birthYmd = year && month && day
    ? `${String(year).slice(2)}${pad2(Number(month))}${pad2(Number(day))}` : ''

  /** [확인] — 서버 스키마와 같은 규칙으로 선검증 후 코드를 조회해 확인 모달을 연다. */
  async function verify() {
    const next: FieldErrors = {}
    if (!validClassCode(cleanCode)) next.code = '6자리 학급 코드를 입력해 주세요.'
    if (childNo === '' || !validChildNo(childNoNum)) next.childNo = '아동 번호(1~99)를 입력해 주세요.'
    if (!validName(cleanName)) next.name = '이름은 한글이나 영어로만 쓸 수 있어요.'
    if (!validGender(gender)) next.gender = '성별을 선택해 주세요.'
    if (!validBirthYmd(birthYmd)) next.birth = '생년월일을 선택해 주세요.'
    setErrors(next)
    if (Object.keys(next).length > 0) { focusFirstError(next); return }

    setFormErr(''); setBusy(true)
    const r = await postJson<ClassInfo>('/api/sessions/verify-code',
      { code: cleanCode, childNo: childNoNum }, '코드 확인에 실패했어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) {
      if (r.status === 404) { setErrors({ code: '코드를 확인해 주세요.' }); focusFirstError({ code: '!' }) }
      else setFormErr(r.error)
      return
    }
    setConfirm(r.data)
  }

  /** 확인 모달 [맞아요] — 세션 생성. 성공했을 때만 코드를 기억한다(스펙 "연속 검사"). */
  async function begin() {
    setBusy(true)
    const r = await postJson<{ sessionId: string; sessionToken: string; grade: number }>('/api/sessions', {
      code: cleanCode, childNo: childNoNum, name: cleanName, gender, birthYmd,
      guardianConsent: consent, // 서버 스키마가 true 리터럴만 허용 — 미체크 요청은 400
    })
    setBusy(false)
    if (!r.ok) { setConfirm(null); setFormErr(r.error); return }
    saveClassCode(cleanCode)
    clearState() // 공용 기기에 남아 있을 이전 검사 흔적 제거(세션별 키 누적 방지)
    saveState(newState(r.data.sessionId, cleanName, r.data.sessionToken, r.data.grade))
    router.push('/survey')
  }

  const filled = code.trim() && childNo !== '' && name.trim() && gender && year && month && day && consent

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-10 text-2xl font-bold">안녕하세요!</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        선생님께 받은 학급 코드와<br />아동 정보를 입력해 주세요.
      </p>

      {resume && (
        <div className="card mt-6 flex w-full flex-col gap-3 border-blue/40 bg-blue/5 p-4">
          <p className="text-sm font-bold text-ink-soft">
            {resume.childName
              ? <><b className="text-blue">{resume.childName}</b> 학생의 검사가 진행 중이에요.</>
              : '이 기기에 진행 중인 검사가 있어요.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push('/survey')}
              className="flex-1 rounded-lg bg-blue py-2.5 text-sm font-bold text-white">
              이어서 하기
            </button>
            <button type="button" onClick={() => { clearState(); setResume(null) }}
              className="flex-1 rounded-lg border-[1.5px] border-line bg-white py-2.5 text-sm font-bold text-ink-soft">
              새로 시작
            </button>
          </div>
        </div>
      )}

      {/* 자동완성은 의도적으로 끈다(autoComplete="off") — 교사 개인 기기에서 본인 정보가
          아동 정보 칸에 제안되는 것을 막는다. */}
      <form className="card mt-8 w-full p-5" autoComplete="off"
        onSubmit={e => { e.preventDefault(); if (!busy && filled) void verify() }}>
        <div>
          <label className="text-[13px] font-bold text-ink-soft" htmlFor="code">학급 코드</label>
          <input id="code" data-field="code" name="code" value={code} maxLength={10}
            placeholder="ABC234" autoCapitalize="characters" spellCheck={false}
            aria-describedby={errors.code ? 'err-code' : undefined} aria-invalid={!!errors.code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            className={`${inputCls} font-read mt-1.5 text-center text-xl tracking-[0.3em]`} />
          <FieldError id="err-code" msg={errors.code} />
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="childNo">아동 번호</label>
            <input id="childNo" data-field="childNo" name="childNo" value={childNo} maxLength={2}
              inputMode="numeric" placeholder="3"
              aria-describedby={errors.childNo ? 'err-childNo' : undefined} aria-invalid={!!errors.childNo}
              onChange={e => setChildNo(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </div>
          <div className="flex-[2]">
            <label className={labelCls} htmlFor="name">이름</label>
            <input id="name" data-field="name" name="name" value={name} maxLength={30}
              aria-describedby={errors.name ? 'err-name' : undefined} aria-invalid={!!errors.name}
              onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
        </div>
        <FieldError id="err-childNo" msg={errors.childNo} />
        <FieldError id="err-name" msg={errors.name} />

        <span className={labelCls} id="gender-label">성별</span>
        <div className="mt-1.5 flex gap-2.5" data-field="gender" role="group" aria-labelledby="gender-label"
          aria-describedby={errors.gender ? 'err-gender' : undefined}>
          {(['남', '여'] as const).map(g => (
            <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g}
              className={`h-[50px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
                gender === g ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
              {g}
            </button>
          ))}
        </div>
        <FieldError id="err-gender" msg={errors.gender} />

        <span className={labelCls}>생년월일</span>
        <div className="mt-1.5 flex gap-2" data-field="birth" role="group" aria-label="생년월일"
          aria-describedby={errors.birth ? 'err-birth' : undefined}>
          <Select ariaLabel="출생 연도" placeholder="연도" className="flex-[1.3]"
            value={year} onChange={v => { setYear(v); setDay('') }}
            options={YEARS.map(y => ({ value: String(y), label: `${y}년` }))} />
          <Select ariaLabel="출생 월" placeholder="월" className="flex-1"
            value={month} onChange={v => { setMonth(v); setDay('') }}
            options={MONTHS.map(m => ({ value: String(m), label: `${m}월` }))} />
          <Select ariaLabel="출생 일" placeholder="일" className="flex-1" disabled={!year || !month}
            value={day} onChange={setDay}
            options={DAYS.map(d => ({ value: String(d), label: `${d}일` }))} />
        </div>
        <FieldError id="err-birth" msg={errors.birth} />

        {/* 개인정보 수집·이용 고지 + 법정대리인 서면 동의 확인 체크 — 문구의 단일 소스는 lib/consent.ts. */}
        <div className="mt-6 rounded-xl border border-line bg-well p-4">
          <p className="text-[13px] font-bold text-ink-soft">개인정보 수집·이용 안내</p>
          <dl className="mt-2 flex flex-col gap-1.5">
            {CONSENT_NOTICE.map(row => (
              <div key={row.label} className="flex gap-2 text-xs leading-relaxed">
                <dt className="w-20 flex-none font-bold text-ink-mute">{row.label}</dt>
                <dd className="min-w-0 text-ink-soft">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-mute">
            만 14세 미만 아동의 개인정보이므로 법정대리인(보호자)의 동의가 필요합니다.
            학교에서 배부한 서면 동의서를 먼저 회수한 뒤 검사를 시작해 주세요.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border-[1.5px] border-line bg-white px-3 py-2.5">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-blue)]" />
            <span className="text-xs font-bold leading-relaxed text-ink-soft">{GUARDIAN_CONSENT_LABEL}</span>
          </label>
        </div>

        {formErr && <p role="alert" className="mt-3 text-sm text-rec-deep">{formErr}</p>}
        <button type="submit" disabled={busy || !filled} className="cta mt-5">확인</button>
        {!consent && (
          <p className="mt-2 text-center text-[12px] text-ink-mute">보호자 동의 확인에 체크해야 시작할 수 있어요.</p>
        )}
      </form>
      <p className="mt-auto pt-6 text-center text-[12px] text-ink-mute">녹음된 목소리는 검사 확인 용도로만 사용돼요.</p>

      {/* 확인 모달 — 코드가 가리키는 학급과 아동이 맞는지 시작 전에 한 번 묻는다(스펙 "흐름" 3).
          이미 검사한 번호면 경고형으로 바뀐다 — 막지는 않는다(재검사 허용, 스펙 "중복 검사 경고"). */}
      {confirm && (
        <ConfirmDialog open busy={busy}
          title={confirm.alreadyTested
            ? `${childNoNum}번은 이미 검사했어요`
            : '이 정보가 맞나요?'}
          confirmLabel={confirm.alreadyTested ? '네, 다시 검사할게요' : '맞아요, 시작하기'}
          cancelLabel="아니에요"
          onConfirm={begin} onClose={() => setConfirm(null)}>
          <div className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
            <p className="font-bold text-ink">
              {confirm.schoolName} {gradeClassLabel(confirm.grade, confirm.classNo)}
            </p>
            <p className="mt-0.5 text-[13px]">
              담임 {confirm.teacherName}
              {(confirm.teacherPhone || confirm.teacherEmail) && (
                <> · {[confirm.teacherPhone, confirm.teacherEmail].filter(Boolean).join(' · ')}</>
              )}
            </p>
            <p className="mt-2.5">
              <b className="text-blue">{childNoNum}번 {cleanName}</b> 학생의 검사를
              {confirm.alreadyTested ? ' 다시' : ''} 시작할까요?
            </p>
            {confirm.alreadyTested === 'inProgress' && (
              <p className="mt-2 text-[12.5px] text-amber">
                이 번호로 진행 중인(제출 전) 검사가 있어요. 다른 기기에서 검사 중일 수 있어요.
              </p>
            )}
          </div>
        </ConfirmDialog>
      )}
      <LoadingOverlay show={busy && !confirm} />
    </main>
  )
}
```

주의: `ConfirmDialog`의 실제 prop 이름(`open`·`busy`·`error`·`danger`·`confirmLabel`·`cancelLabel`·`onConfirm`·`onClose`)은 `components/ConfirmDialog.tsx`를 열어 확인하고 다르면 그쪽을 따를 것. 초기 포커스가 취소 버튼에 가는 기존 동작이 "아니에요 강조" 요구를 충족한다.

- [ ] **Step 4: `app/done/page.tsx` 버튼 문구 교체**

```tsx
<Link href="/" className="cta mt-6 max-w-60">다음 학생 검사하기</Link>
```

(주석 한 줄 추가: `{/* 코드는 남아 있어(saveClassCode) 다음 학생은 아동 정보만 입력한다 */}`)

- [ ] **Step 5: 수동 확인(런타임)** — `npm run dev` 후 http://localhost:3000 에서: 코드 없이 [확인] → 필드 에러 / (관리자 API로 코드 발급 후) 정상 흐름 → 모달 → 시작 → `/survey` 진입 → 제출까지 가지 않아도 됨. 마이그레이션 015가 로컬 Supabase에 적용돼 있어야 한다.

- [ ] **Step 6: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add app/page.tsx app/done/page.tsx lib/survey-state.ts tests/survey-state.test.ts app/README.md
git commit -m "feat: 시작 화면을 학급 코드 방식으로 교체 — 확인 모달·코드 기억·중복 경고"
```

---

### Task 8: 관리자 코드 발급 화면

**Files:**
- Create: `app/admin/codes/page.tsx`, `components/admin/CodeIssuer.tsx`
- Modify: `hooks/useAdminQueries.ts`, `components/admin/AdminDashboard.tsx`, `components/admin/README.md`

- [ ] **Step 1: `hooks/useAdminQueries.ts`에 쿼리 추가**

```ts
export interface ClassCodeItem {
  id: string; code: string
  school_region: string; school_id: string; school_name: string
  grade: number; class_no: number
  teacher_name: string; teacher_phone: string | null; teacher_email: string | null
  created_at: string
  /** 이 코드로 만들어진 세션 수 — 0일 때만 삭제 버튼을 낸다 */
  session_count: number
}
```

`adminKeys`에 `codes: ['admin', 'codes'] as const` 추가, 훅 추가:

```ts
/** 학급 코드 목록 — 발급 화면이 쓴다. */
export function useClassCodesQuery() {
  return useQuery({
    queryKey: adminKeys.codes,
    queryFn: () => fetchJson<{ codes: ClassCodeItem[] }>('/api/admin/codes').then(d => d.codes),
  })
}
```

- [ ] **Step 2: `app/admin/codes/page.tsx`** (기존 `app/admin/page.tsx` 패턴 복제)

```tsx
import { Suspense } from 'react'
import { CodeIssuer } from '@/components/admin/CodeIssuer'
import { LoadingOverlay } from '@/components/LoadingOverlay'

export default function AdminCodes() {
  // 데이터는 CodeIssuer가 react-query로 클라이언트에서 로드·캐싱한다.
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-10">
      <Suspense fallback={<LoadingOverlay show />}>
        <CodeIssuer />
      </Suspense>
    </main>
  )
}
```

- [ ] **Step 3: `components/admin/CodeIssuer.tsx` 작성**

```tsx
// components/admin/CodeIssuer.tsx — 학급 코드 발급 + 발급 목록.
// 코드 1개 = 학급 1개(학교·학년·반·담임·연락처). 검사 현장은 이 코드만 입력한다(스펙 2026-08-13).
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SchoolPicker, type SelectedSchool } from '@/components/SchoolPicker'
import { Select } from '@/components/Select'
import { gradeClassLabel } from '@/lib/format'
import { postJson, requestJson } from '@/lib/http'
import { validEmail, validName, validPhone } from '@/lib/validate'
import { adminKeys, useClassCodesQuery, type ClassCodeItem } from '@/hooks/useAdminQueries'

const inputCls = 'mt-1.5 h-[46px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-[15px] outline-none transition focus:border-blue focus:bg-white'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

/** 반 선택지: 단일학급(반 없음) = 0, 그 외 1~20 (기존 시작 폼과 같은 상한) */
const CLASS_OPTIONS = [
  { value: '0', label: '단일학급 (반 없음)' },
  ...Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}반` })),
]

export function CodeIssuer() {
  const queryClient = useQueryClient()
  const { data: codes, isLoading, isError, refetch } = useClassCodesQuery()

  const [school, setSchool] = useState<SelectedSchool | null>(null)
  const [grade, setGrade] = useState('1')
  const [classNo, setClassNo] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // 방금 발급된 코드 — 크게 보여주고 복사 버튼을 붙인다
  const [issued, setIssued] = useState<ClassCodeItem | null>(null)
  const [copied, setCopied] = useState(false)
  const [toDelete, setToDelete] = useState<ClassCodeItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [delErr, setDelErr] = useState('')

  const cleanTeacher = teacherName.trim().replace(/\s+/g, ' ')
  const cleanPhone = phone.trim()
  const cleanEmail = email.trim()

  async function issue() {
    // 서버 스키마(classCodeCreateSchema)와 같은 규칙으로 선검증한다.
    if (!school) { setErr('학교를 선택해 주세요.'); return }
    if (classNo === '') { setErr('반을 선택해 주세요.'); return }
    if (!validName(cleanTeacher)) { setErr('담임교사명은 한글이나 영어로만 쓸 수 있어요.'); return }
    if (!cleanPhone && !cleanEmail) { setErr('전화번호나 이메일 중 하나는 입력해 주세요.'); return }
    if (cleanPhone && !validPhone(cleanPhone)) { setErr('전화번호 형식으로 입력해 주세요. (예: 01012345678)'); return }
    if (cleanEmail && !validEmail(cleanEmail)) { setErr('이메일 형식으로 입력해 주세요.'); return }

    setErr(''); setBusy(true)
    const r = await postJson<{ code: Omit<ClassCodeItem, 'session_count'> }>('/api/admin/codes', {
      region: school.region, schoolId: school.schoolId, schoolName: school.schoolName,
      grade: Number(grade), classNo: Number(classNo),
      teacherName: cleanTeacher, teacherPhone: cleanPhone, teacherEmail: cleanEmail,
    }, '코드 발급에 실패했어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    setIssued({ ...r.data.code, session_count: 0 })
    setCopied(false)
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }

  async function remove() {
    if (!toDelete) return
    setDeleting(true); setDelErr('')
    const r = await requestJson(`/api/admin/codes/${toDelete.id}`, { method: 'DELETE' },
      '삭제에 실패했어요. 다시 시도해 주세요.')
    setDeleting(false)
    if (!r.ok) { setDelErr(r.error); return }
    if (issued?.id === toDelete.id) setIssued(null)
    setToDelete(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-[15px] font-bold">학급 코드 발급</p>
          <p className="text-[12px] text-ink-mute">코드 하나가 학급 하나예요 · 검사 현장은 이 코드만 입력합니다</p>
        </div>
        <Link href="/admin"
          className="ml-auto rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
          ← 세션 목록
        </Link>
      </div>

      {/* 발급 폼 */}
      <div className="border-b border-line p-5">
        <label className="text-[13px] font-bold text-ink-soft">학교명</label>
        <SchoolPicker value={school} onSelect={setSchool} />
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-grade">학년</label>
            <div className="mt-1.5">
              <Select id="cc-grade" ariaLabel="학년" placeholder="학년" value={grade} onChange={setGrade}
                options={[1, 2, 3, 4, 5, 6].map(g => ({ value: String(g), label: `${g}학년` }))} />
            </div>
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-class">반</label>
            <div className="mt-1.5">
              <Select id="cc-class" ariaLabel="반" placeholder="반 선택" value={classNo}
                onChange={setClassNo} options={CLASS_OPTIONS} />
            </div>
          </div>
        </div>
        <label className={labelCls} htmlFor="cc-teacher">담임교사명</label>
        <input id="cc-teacher" value={teacherName} maxLength={30}
          onChange={e => setTeacherName(e.target.value)} className={inputCls} />
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-phone">담임 전화번호</label>
            <input id="cc-phone" value={phone} maxLength={60} inputMode="tel" placeholder="01012345678"
              onChange={e => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-email">담임 이메일</label>
            <input id="cc-email" value={email} maxLength={60} inputMode="email" placeholder="teacher@school.kr"
              onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
        </div>
        <p className="mt-1.5 text-[12px] text-ink-mute">전화번호와 이메일 중 하나만 입력해도 괜찮아요. 하이픈(-)은 저장할 때 자동으로 빠져요.</p>
        {err && <p role="alert" className="mt-3 text-sm text-rec-deep">{err}</p>}
        <button type="button" onClick={() => void issue()} disabled={busy}
          className="mt-4 rounded-lg bg-blue px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-40">
          {busy ? '발급 중…' : '코드 발급'}
        </button>

        {issued && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-blue/40 bg-blue/5 px-4 py-3">
            <div>
              <p className="text-[12px] font-bold text-ink-mute">
                {issued.school_name} {gradeClassLabel(issued.grade, issued.class_no)} · 담임 {issued.teacher_name}
              </p>
              <p className="font-read text-[28px] font-bold tracking-[0.25em] text-blue">{issued.code}</p>
            </div>
            <button type="button"
              onClick={() => { void navigator.clipboard.writeText(issued.code).then(() => setCopied(true)) }}
              className="ml-auto rounded-lg border-[1.5px] border-line bg-white px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
              {copied ? '복사됨!' : '코드 복사'}
            </button>
          </div>
        )}
      </div>

      {/* 발급 목록 */}
      {isLoading ? (
        <p className="p-8 text-center text-sm text-ink-mute">불러오는 중…</p>
      ) : isError ? (
        <div className="flex flex-col items-start gap-3 p-8">
          <p className="text-sm text-ink-soft">목록을 불러오지 못했어요.</p>
          <button type="button" onClick={() => void refetch()}
            className="rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
            다시 시도
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-mute">
                {['코드', '학교', '학년/반', '담임', '연락처', '발급일', '세션', ''].map(h => (
                  <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(codes ?? []).map(c => (
                <tr key={c.id} className="border-t border-line/60">
                  <td className="font-read whitespace-nowrap px-4 py-2.5 font-bold tracking-widest text-blue">{c.code}</td>
                  <td className="whitespace-nowrap px-4">{c.school_name}</td>
                  <td className="whitespace-nowrap px-4">{gradeClassLabel(c.grade, c.class_no)}</td>
                  <td className="whitespace-nowrap px-4">{c.teacher_name}</td>
                  <td className="whitespace-nowrap px-4 text-ink-soft">
                    {[c.teacher_phone, c.teacher_email].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 text-ink-soft">
                    {new Date(c.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="whitespace-nowrap px-4 tabular-nums">{c.session_count}</td>
                  <td className="whitespace-nowrap px-4 text-right">
                    {/* 세션이 있는 코드는 지울 수 없다(FK restrict) — 버튼 자체를 내지 않는다 */}
                    {c.session_count === 0 && (
                      <button type="button" onClick={() => { setDelErr(''); setToDelete(c) }}
                        className="rounded-lg border-[1.5px] border-rec/40 bg-rec/5 px-2.5 py-1 text-xs font-bold text-rec-deep transition hover:border-rec">
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(codes ?? []).length === 0 && (
            <p className="p-8 text-center text-sm text-ink-mute">아직 발급한 코드가 없습니다.</p>
          )}
        </div>
      )}

      <ConfirmDialog open={toDelete !== null} busy={deleting} error={delErr} danger
        title="이 코드를 삭제할까요?"
        confirmLabel={deleting ? '삭제 중…' : '삭제'}
        onConfirm={remove} onClose={() => setToDelete(null)}>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
          <b>{toDelete?.code}</b> ({toDelete?.school_name} {toDelete && gradeClassLabel(toDelete.grade, toDelete.class_no)})
          코드를 삭제하면 이 코드로는 더 이상 검사를 시작할 수 없습니다.
        </p>
      </ConfirmDialog>
    </div>
  )
}
```

(`SchoolPicker`·`Select`·`ConfirmDialog`의 prop은 기존 정의를 따른다 — 위 코드가 어긋나면 컴포넌트 쪽 정의가 기준.)

- [ ] **Step 4: `AdminDashboard.tsx`에 진입 링크 추가** — 헤더의 [새로고침] 버튼 앞에:

```tsx
<Link href="/admin/codes"
  className="ml-auto rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
  학급 코드 발급
</Link>
```

(기존 [새로고침]의 `ml-auto`는 이 링크로 옮기고 새로고침에서는 제거. `next/link` import가 없으면 추가.)

- [ ] **Step 5: 수동 확인** — `npm run dev` → `/admin/codes`: 발급 → 코드 표시·복사 → 목록 반영 → 미사용 코드 삭제. `/`에서 발급 코드로 검사 시작까지.

- [ ] **Step 6: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add app/admin/codes components/admin/CodeIssuer.tsx hooks/useAdminQueries.ts components/admin/AdminDashboard.tsx components/admin/README.md
git commit -m "feat: 관리자 학급 코드 발급 화면 (/admin/codes)"
```

---

### Task 9: 관리자 표시 정리 — 아동 번호 표시 + 검사자 구분 제거

**Files:**
- Modify: `components/admin/SessionTable.tsx`, `components/admin/ResultSheet.tsx`, `lib/format.ts`, `lib/pdf/stamp-sheet.ts`, `app/api/admin/sessions/[id]/sheet.pdf/route.ts`(examiner 전달부), `lib/adminStats.ts`(검색에 번호 포함)
- Test: `tests/adminStats.test.ts`, `tests/stamp-sheet.test.ts`, `tests/format.test.ts`

- [ ] **Step 1: `SessionTable.tsx`에 번호 컬럼 추가** — `gradeClass` 컬럼 다음에:

```ts
col.accessor('child_no', {
  id: 'childNo', header: '번호',
  meta: { thClassName: 'whitespace-nowrap px-3', tdClassName: 'whitespace-nowrap px-3 tabular-nums text-ink-soft' },
  cell: ({ row }) => row.original.child_no,
}),
```

- [ ] **Step 2: `ResultSheet.tsx` 헤더 갱신** — dl 항목에서 `['검사자', examinerLabel(session.examiner_type)]` 행을 삭제하고 `['학년', …]` 다음에 `['번호', String(session.child_no)]` 추가. `examinerLabel` import 제거.

- [ ] **Step 3: `lib/format.ts`에서 `examinerLabel` 삭제** — `grep -rn "examinerLabel" app/ components/ lib/ tests/`로 남은 소비처가 없는지 확인 후 함수 삭제. `tests/format.test.ts`의 examinerLabel 케이스 삭제.

- [ ] **Step 4: `stamp-sheet.ts`에서 검사자 동그라미 제거** — `StampInput['session']`에서 `examiner_type` 필드 삭제, `stampHeader`의 examiner 블록(`const pick = …` ~ `drawEllipse` 포함) 삭제. `app/api/admin/sessions/[id]/sheet.pdf/route.ts`에서 stampSheet 입력을 만들 때 `examiner_type`을 넘기는 부분 삭제(`grep -n "examiner" app/api/admin/sessions/\[id\]/sheet.pdf/route.ts`). 레이아웃 파일(`lib/forms/*-layout.ts`)의 examiner 좌표는 데이터일 뿐이므로 남겨 둔다 — 단, `SheetLayout` 타입이 필수 필드로 요구한다면 그대로 두는 쪽이 무변경이다.

- [ ] **Step 5: 검색에 아동 번호 포함** — `lib/adminStats.ts`의 `filterSessions` 키워드 조건에 한 줄 추가:

```ts
      && !String(s.child_no).includes(keyword)
```

`tests/adminStats.test.ts`에 케이스 추가:

```ts
it('검색어가 아동 번호와 일치하면 잡힌다', () => {
  const rows = [mkSession({ child_no: 7 }), mkSession({ child_no: 12 })]
  const out = filterSessions(rows, { ...DEFAULT_FILTERS, q: '7' }, TODAY)
  expect(out.map(s => s.child_no)).toEqual([7])
})
```

(주의: `'7'`은 `'17'`·`'70'`에도 부분일치한다 — 픽스처는 부분일치가 없는 값으로 구성. `mkSession`·`TODAY` 헬퍼는 파일의 기존 것을 사용.)

- [ ] **Step 6: 잔재 정리** — `grep -rn "examiner" app/ components/ lib/ tests/ --include="*.ts*"` 결과가 레이아웃 좌표 데이터(`lib/forms/*-layout.ts`)뿐인지 확인. `tests/stamp-sheet.test.ts`·`tests/admin-routes.test.ts`·`tests/adminStats.test.ts` 픽스처에서 `examiner_type` 키 제거(`SessionRow`에서 이미 빠졌으므로 typecheck가 잡아 준다).

- [ ] **Step 7: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add -A
git commit -m "feat: 관리자 화면에 아동 번호 표시, 검사자 구분(교사/전문가) 제거"
```

---

### Task 10: 문서 갱신 + 최종 검증 + PR

**Files:**
- Modify: `README.md`, `app/README.md`, `app/api/README.md`, `components/admin/README.md`, `lib/README.md`, `hooks/README.md`(변경분 있으면), `tests/README.md`(신규 테스트 파일 관례 언급 불필요 시 생략)

- [ ] **Step 1: `README.md` 개정**

- "화면 흐름" 표: `/` 행을 "학급 코드 + 아동 정보 입력 → 확인 모달 → 세션 생성"으로, `/admin` 행에 코드 발급 추가, `/admin/codes` 행 신설.
- 수집 흐름 설명에 "학급 정보는 관리자가 코드 발급 시 입력, 세션 생성 시 서버가 코드에서 복사(비정규화)" 한 줄.
- E2E 체크리스트: 시작 항목을 "관리자: 코드 발급(학교 검색·학년·반·담임·연락처) → 코드 복사 / 검사: 코드·아동번호·이름·성별·생년월일 입력 → 확인 모달(학급 정보 표시) → 시작"으로 교체. "같은 번호 재입력 시 '이미 검사했어요' 경고", "제출 후 [다음 학생 검사하기] → 코드가 채워진 채 시작", "전화번호 하이픈 입력 시 저장값에 하이픈 없음" 항목 추가.
- 검사자 구분(교사/전문가) 언급 제거.

- [ ] **Step 2: 폴더 README** — `app/README.md`(시작 화면 흐름), `app/api/README.md`(verify-code·admin/codes 라우트), `components/admin/README.md`(CodeIssuer), `lib/README.md`(class-code.ts) 갱신. `lib/consent.ts`의 수집 항목 문구는 그대로 둔다(담임 성명·연락처는 여전히 세션에 저장된다 — 수집 주체만 관리자로 바뀜).

- [ ] **Step 3: 최종 검증 + 잔재 스캔**

```bash
npm run typecheck && npm run lint && npm test && npm run build
grep -rn "examinerType\|examiner_type" app/ components/ lib/ hooks/ tests/ --include="*.ts*" | grep -v "layout"
git status --short   # next-env.d.ts 변경분이 있으면 git checkout next-env.d.ts
```

- [ ] **Step 4: 커밋 + PR**

```bash
git add -A
git commit -m "docs: 학급 코드 흐름 반영 — README·폴더 문서 개정"
git push -u origin feat/class-codes
gh pr create --title "feat: 학급 코드 발급 + 전화번호 정규화" --body "$(cat <<'EOF'
## 요약
- 관리자 /admin/codes에서 학급 코드(6자리, 혼동 문자 제외) 발급 — migration 015
- 검사 시작: 코드 + 아동번호·이름·성별·생년월일 → 확인 모달 → 세션 생성(학급 정보는 서버가 코드에서 복사)
- 중복 검사 경고: verify-code가 물어본 번호의 상태만 답한다(명단 미반환)
- 연속 검사: 학급 코드만 localStorage 별도 키에 기억(아동 정보는 안 남김)
- 전화번호 하이픈 제거 저장 + placeholder 변경, 검사자 구분(교사/전문가) 제거, 관리자 화면에 아동 번호 표시

스펙: docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md
선행: PR A(중단·현장채점 제거)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
