# 검사 진행 편의 기능 (2단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 담당자가 확정한 진행 편의 4건을 반영한다 — 반 드롭다운(단일학급 지원), 담임 연락처 전화/이메일 분리, 건너뛰기 라벨을 "모르겠어요"로, 사용자가 직접 누르는 일시정지·저장하고 나가기 버튼과 자동 저장 표시.

**Architecture:** 1단계(PR #21, `feat/page-based-survey-flow`) 위에 쌓는다. DB 변경 2건은 마이그레이션 하나(`010`)로 묶고, 표기 규칙(반 0 = 단일학급, 연락처 합치기)은 `lib/format.ts`의 순수 함수로 빼서 관리자 화면 세 곳이 같은 문구를 쓰게 한다. 일시정지는 화면을 덮는 오버레이 하나로 끝내고, "저장하고 나가기"는 이미 매 상태 변화마다 localStorage에 저장되고 있으므로 홈으로 이동만 한다(홈의 "이어서 하기" 카드가 그대로 동작).

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase · Zod · Vitest

**담당자 확정 사항 (2026-08-07 회신):**
- 반: 0 대신 **"단일학급(반 없음)"** 항목 + 1~20반 (15보다 넉넉하게, 언제든 수정 가능)
- 연락처: 전화·이메일 칸을 각각 두고 **둘 중 하나 필수**
- "몰라요" 버튼: 새 버튼을 만들지 않고 **기존 건너뛰기 버튼의 라벨을 "모르겠어요"로 교체**
- 임시저장: 자동 저장은 유지하되, **사용자가 직접 누르는 임시저장·일시정지 버튼을 별도로** 추가

---

## 이 계획에 포함되지 않는 것

- **3단계(관리자 채점·결과지):** 채점 입력 UI, Pass/Fail 임시 판정, 검사지 양식 결과지 인쇄, 검사자(교사/전문가) 구분 — 별도 계획
- **연습 낱말 확정:** 담당자에게 "가짜 단어"가 (a) 검사 문항이 아닌 쉬운 낱말인지 (b) 무의미 낱말인지 확인 중. 현재 `PRACTICE_PLACEHOLDER = true` 유지

---

## File Structure

**신규**
| 경로 | 책임 |
|---|---|
| `supabase/migrations/010_class_and_contact.sql` | 반 0 허용 + 연락처 분리 컬럼 |

**수정**
| 경로 | 변경 |
|---|---|
| `lib/format.ts` | `gradeClassLabel`, `contactLabel` 표기 헬퍼 추가 |
| `lib/schema.ts` | `classNoSchema` 하한 0, 연락처 전화/이메일 분리 + "둘 중 하나" 검증 |
| `lib/db.ts` | `NewSessionInput`·`SessionRow`에 전화/이메일 필드 |
| `app/api/sessions/route.ts` | 분리된 연락처 전달 |
| `app/page.tsx` | 반 드롭다운, 연락처 2칸 |
| `app/survey/page.tsx` | "모르겠어요" 라벨, 일시정지·저장하고 나가기, 자동 저장 표시 |
| `components/admin/AdminDetailView.tsx` | 학년·반/연락처 표기 헬퍼 사용 |
| `components/admin/SessionTable.tsx` | 학년·반 표기 헬퍼 사용 |
| `tests/format.test.ts`, `tests/schema.test.ts`, `tests/sessions-route.test.ts` | 신규/변경 규칙 검증 |

---

## Task 1: 표기 헬퍼 (`gradeClassLabel`, `contactLabel`)

반 0과 분리된 연락처를 관리자 화면 세 곳이 같은 문구로 보여주도록, 표기 규칙을 순수 함수 한 곳에 둔다.

**Files:**
- Modify: `lib/format.ts`
- Test: `tests/format.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/format.test.ts`의 2행 import를 아래로 교체하고, 파일 맨 아래에 describe 블록을 추가한다.

```ts
import { contactLabel, fmtDuration, gradeClassLabel, pad2 } from '@/lib/format'
```

```ts
describe('gradeClassLabel (학년·반 표기)', () => {
  it('일반 학급은 "학년-반"', () => {
    expect(gradeClassLabel(1, 3)).toBe('1-3')
    expect(gradeClassLabel(6, 12)).toBe('6-12')
  })
  it('반 0은 단일학급(반 없음)을 뜻한다', () => {
    expect(gradeClassLabel(1, 0)).toBe('1학년 단일학급')
  })
})

describe('contactLabel (담임 연락처 표기)', () => {
  it('전화·이메일이 모두 있으면 함께 보여준다', () => {
    expect(contactLabel('010-1234-5678', 'a@b.com')).toBe('010-1234-5678 · a@b.com')
  })
  it('하나만 있으면 그것만 보여준다', () => {
    expect(contactLabel('010-1234-5678', null)).toBe('010-1234-5678')
    expect(contactLabel(null, 'a@b.com')).toBe('a@b.com')
  })
  it('분리 도입 전 수집분은 legacy 값으로 폴백한다', () => {
    expect(contactLabel(null, null, '010-0000-0000')).toBe('010-0000-0000')
  })
  it('아무것도 없으면 안내 문구', () => {
    expect(contactLabel(null, null)).toBe('연락처 없음')
    expect(contactLabel('', '', '')).toBe('연락처 없음')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — `gradeClassLabel`/`contactLabel`이 export되지 않아 import 에러

- [ ] **Step 3: 구현**

`lib/format.ts` 맨 아래에 추가한다.

```ts
/** 학년·반 표기. 반 0은 "단일학급(반 없음)" — 학년당 한 학급인 학교를 위해 010에서 허용했다. */
export function gradeClassLabel(grade: number, classNo: number): string {
  return classNo === 0 ? `${grade}학년 단일학급` : `${grade}-${classNo}`
}

/** 담임 연락처 표기. 전화·이메일을 분리 저장하기 전(010 이전) 수집분은 legacy 한 칸에만 값이 있다. */
export function contactLabel(
  phone: string | null | undefined,
  email: string | null | undefined,
  legacy?: string | null,
): string {
  const parts = [phone, email].filter((v): v is string => !!v)
  if (parts.length > 0) return parts.join(' · ')
  return legacy || '연락처 없음'
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/format.ts tests/format.test.ts
git commit -m "feat(format): 학년·반(단일학급)·담임 연락처 표기 헬퍼"
```

---

## Task 2: 스키마 — 반 0 허용 + 연락처 분리

**Files:**
- Modify: `lib/schema.ts`
- Test: `tests/schema.test.ts`

> **설계 메모:** DB 체크는 `0~99`로 넓게 두고, 드롭다운만 20까지 제공한다. 나중에 담당자가 "25반까지"라고 하면 화면 상수 하나만 고치면 되고 마이그레이션이 필요 없다. 또한 기존 행(1~99)이 새 제약을 위반하지 않아 `not valid` 같은 우회가 필요 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/schema.test.ts`의 `VALID` 상수에서 `teacherContact`를 빼고 분리된 두 필드를 넣는다. 파일을 읽고 실제 `VALID` 정의를 아래처럼 바꾼다(다른 필드는 그대로).

```ts
  name: '김도연', teacherName: '박선생', teacherPhone: '010-1234-5678', teacherEmail: '',
```

기존 `it('연락처 형식 오류 400', ...)` 류의 `teacherContact` 단언(34행 부근)을 삭제하고, 아래 블록을 파일 맨 아래에 추가한다.

```ts
describe('반(classNo) — 단일학급 0 허용', () => {
  it('0은 단일학급(반 없음)으로 허용된다', () =>
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 0 }).success).toBe(true))
  it('1~99는 허용된다', () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 1 }).success).toBe(true)
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 99 }).success).toBe(true)
  })
  it('음수·100 이상·소수는 거부된다', () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: -1 }).success).toBe(false)
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 100 }).success).toBe(false)
    expect(sessionCreateSchema.safeParse({ ...VALID, classNo: 1.5 }).success).toBe(false)
  })
})

describe('담임 연락처 — 전화/이메일 분리, 둘 중 하나 필수', () => {
  it('전화만 입력해도 통과', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '010-1234-5678', teacherEmail: '' }).success).toBe(true))
  it('이메일만 입력해도 통과', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '', teacherEmail: 'teacher@school.kr' }).success).toBe(true))
  it('둘 다 입력해도 통과', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '010-1234-5678', teacherEmail: 'teacher@school.kr' }).success).toBe(true))
  it('둘 다 비면 거부 — 하나는 반드시 필요하다', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '', teacherEmail: '' }).success).toBe(false))
  it('전화 형식이 틀리면 거부', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '1234', teacherEmail: '' }).success).toBe(false))
  it('이메일 형식이 틀리면 거부', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '', teacherEmail: 'not-an-email' }).success).toBe(false))
  it('공백만 입력한 칸은 미입력으로 본다', () =>
    expect(sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '   ', teacherEmail: '' }).success).toBe(false))
  it('앞뒤 공백은 정리되어 파싱된다', () => {
    const r = sessionCreateSchema.safeParse({
      ...VALID, teacherPhone: '  010-1234-5678  ', teacherEmail: '' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.teacherPhone).toBe('010-1234-5678')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL — `classNo: 0`이 거부되고, `teacherPhone`/`teacherEmail`을 스키마가 모른다

- [ ] **Step 3: 구현**

`lib/schema.ts`에서 `classNoSchema`(20행)를 교체한다.

```ts
/** 반 번호. 0은 "단일학급(반 없음)" — 학년당 한 학급인 학교를 위해 010에서 허용.
 *  화면 드롭다운은 20까지만 제공하지만(app/page.tsx의 MAX_CLASS_NO), DB·스키마는 넓게 두어
 *  나중에 범위를 늘릴 때 마이그레이션이 필요 없게 한다. */
export const classNoSchema = z.number().int().min(0).max(99)
```

`contactSchema`(22행)를 아래로 교체한다. `PHONE_RE`/`EMAIL_RE`(6~7행)는 그대로 둔다.

```ts
/** 담임 연락처 — 전화·이메일을 각각 받고 둘 중 하나만 있으면 된다(담당자 확정).
 *  빈 문자열 = 미입력. 공백만 입력한 칸도 trim 후 미입력으로 본다. */
const optionalContact = z.string().max(60).default('').transform(s => s.trim())
```

`sessionCreateSchema`(28~42행)를 아래로 교체한다.

```ts
/** POST /api/sessions 바디. 문자열 필드는 정규화 후 규칙 검증(파싱 결과가 서버 저장값). */
export const sessionCreateSchema = z.object({
  region: z.string().refine(r => REGION_NAMES.includes(r)),
  schoolId: cleaned.pipe(z.string().min(1)),
  schoolName: cleaned.pipe(z.string().min(1).max(100)),
  birthYmd: birthYmdSchema,
  grade: gradeSchema,
  classNo: classNoSchema,
  gender: genderSchema,
  name: cleaned.pipe(nameSchema),
  teacherName: cleaned.pipe(nameSchema),
  teacherPhone: optionalContact,
  teacherEmail: optionalContact,
  // 만 14세 미만 아동 — 법정대리인 서면 동의를 확인했다는 검사자 체크(개인정보보호법 제22조의2).
  // true 리터럴만 허용: 미체크(false/누락) 상태로는 세션 생성 자체가 불가능하다.
  guardianConsent: z.literal(true),
})
  .refine(d => d.teacherPhone !== '' || d.teacherEmail !== '',
    { path: ['teacherPhone'], message: '전화번호나 이메일 중 하나는 입력해 주세요.' })
  .refine(d => d.teacherPhone === '' || PHONE_RE.test(d.teacherPhone),
    { path: ['teacherPhone'], message: '전화번호 형식이 올바르지 않습니다.' })
  .refine(d => d.teacherEmail === '' || EMAIL_RE.test(d.teacherEmail),
    { path: ['teacherEmail'], message: '이메일 형식이 올바르지 않습니다.' })
```

`lib/validate.ts`도 함께 고친다 — `contactSchema` import가 사라졌으므로. 파일 전체를 아래로 교체한다.

```ts
// lib/validate.ts — 클라이언트 폼용 boolean 타입가드 파사드.
// 검증 규칙의 단일 소스는 lib/schema.ts(zod)이며, 여기서는 폼 코드가 safeParse 보일러플레이트
// 없이 `if (!validName(v))` 형태로 쓰도록 감싸기만 한다(클라이언트·서버 동일 규칙 보장).
import { nameSchema, birthYmdSchema, gradeSchema, classNoSchema, genderSchema, phoneSchema, emailSchema } from './schema'

export function validName(name: unknown): name is string { return nameSchema.safeParse(name).success }
export function validBirthYmd(v: unknown): v is string { return birthYmdSchema.safeParse(v).success }
export function validGrade(v: unknown): v is number { return gradeSchema.safeParse(v).success }
export function validClassNo(v: unknown): v is number { return classNoSchema.safeParse(v).success }
export function validGender(v: unknown): v is '남' | '여' { return genderSchema.safeParse(v).success }
export function validPhone(v: unknown): v is string { return phoneSchema.safeParse(v).success }
export function validEmail(v: unknown): v is string { return emailSchema.safeParse(v).success }
```

이를 위해 `lib/schema.ts`에 폼용 단일 필드 스키마도 export한다(`optionalContact` 정의 바로 아래).

```ts
/** 폼에서 칸별로 검사할 때 쓰는 단일 필드 스키마(빈 값 허용 안 함) */
export const phoneSchema = z.string().regex(PHONE_RE)
export const emailSchema = z.string().regex(EMAIL_RE)
```

`tests/validate.test.ts`도 함께 고친다. 2행의 import를 교체한다.

```ts
import { validName, validBirthYmd, validGrade, validClassNo, validGender, validPhone, validEmail } from '@/lib/validate'
```

78~96행의 `describe('validContact (전화 또는 이메일)', ...)` 블록 **전체**를 아래로 교체한다.

```ts
describe('validPhone / validEmail (칸별 검사)', () => {
  it('전화번호 형식', () => {
    expect(validPhone('010-1234-5678')).toBe(true)
    expect(validPhone('01012345678')).toBe(true)
    expect(validPhone('02-123-4567')).toBe(true)
    expect(validPhone('031-1234-5678')).toBe(true)
  })
  it('이메일 형식', () => {
    expect(validEmail('teacher@school.kr')).toBe(true)
    expect(validEmail('a.b+c@ed.go.kr')).toBe(true)
  })
  it('형식이 아니면 거부 — 빈 값도 이 함수 기준으로는 거부(빈 칸 허용 판단은 폼이 한다)', () => {
    expect(validPhone('1234')).toBe(false)
    expect(validPhone('연락처없음')).toBe(false)
    expect(validPhone('')).toBe(false)
    expect(validEmail('teacher@')).toBe(false)
    expect(validEmail('@school.kr')).toBe(false)
    expect(validEmail('')).toBe(false)
  })
  it('전화 자리에 이메일을 넣으면 거부(칸이 나뉘었으므로 서로 섞이지 않는다)', () => {
    expect(validPhone('teacher@school.kr')).toBe(false)
    expect(validEmail('010-1234-5678')).toBe(false)
  })
})
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/schema.test.ts tests/validate.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/schema.ts lib/validate.ts tests/schema.test.ts tests/validate.test.ts
git commit -m "feat(schema): 반 0(단일학급) 허용 + 담임 연락처 전화/이메일 분리"
```

---

## Task 3: 마이그레이션 + `lib/db.ts` + 세션 생성 라우트

**Files:**
- Create: `supabase/migrations/010_class_and_contact.sql`
- Modify: `lib/db.ts`, `app/api/sessions/route.ts`
- Test: `tests/sessions-route.test.ts`

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/010_class_and_contact.sql`:

```sql
-- 010_class_and_contact.sql — 단일학급(반 없음) 지원 + 담임 연락처 전화/이메일 분리.
-- ① 학년당 한 학급인 학교가 많아 "반 없음"을 표현할 값이 필요하다 → class_no 0 허용.
--    범위는 넓게(0~99) 두고 화면 드롭다운만 20까지 제공한다 — 범위 조정 시 마이그레이션 불필요.
-- ② 담임 연락처를 전화·이메일 두 칸으로 나누고 둘 중 하나만 있으면 되게 한다(담당자 확정).
--    기존 teacher_contact는 도입 전 수집분 보존을 위해 남기고 not null만 푼다(관리자 화면이 폴백 표시).
-- 비파괴적·재실행 안전(idempotent). Supabase SQL Editor에서 직접 실행할 것.

-- ① 반 0 허용 (기존 1~99 행은 그대로 유효 — 범위를 넓히기만 하므로 위반 행이 생기지 않는다)
alter table sessions drop constraint if exists sessions_class_no_check;
alter table sessions add constraint sessions_class_no_check check (class_no between 0 and 99);

-- ② 연락처 분리
alter table sessions alter column teacher_contact drop not null;
alter table sessions add column if not exists teacher_phone text;
alter table sessions add column if not exists teacher_email text;

-- 새로 만들어지는 세션은 셋 중 하나는 반드시 있어야 한다.
-- not valid: 도입 전 기존 행은 teacher_contact가 채워져 있어 문제없지만, 검증 비용 없이 넘어간다.
alter table sessions drop constraint if exists sessions_teacher_contact_present;
alter table sessions add constraint sessions_teacher_contact_present
  check (teacher_phone is not null or teacher_email is not null or teacher_contact is not null) not valid;
```

**주의:** 이 파일은 만들고 커밋만 하고, 실제 DB에는 **직접 실행하지 말 것**(권한 없음). 컨트롤러가 별도로 Supabase SQL Editor에서 실행한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/sessions-route.test.ts`의 `VALID` 상수에서 `teacherContact`를 빼고 분리 필드를 넣는다.

```ts
  name: '김도연', teacherName: '박선생', teacherPhone: '010-1234-5678', teacherEmail: '',
```

`it('...classNo: 0...400')` 단언(64행 부근, 0을 거부하던 것)을 삭제하고, `createSession` 호출 인자를 검증하는 테스트(40행 부근)의 기대값을 아래로 바꾼다.

```ts
      childName: '김도연', teacherName: '박선생',
      teacherPhone: '010-1234-5678', teacherEmail: null,
```

그리고 아래 테스트를 `describe` 안에 추가한다.

```ts
  it('반 0(단일학급)으로 세션을 만들 수 있다', async () => {
    expect((await POST(makeReq({ ...VALID, classNo: 0 }))).status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({ classNo: 0 }))
  })
  it('이메일만 입력해도 세션을 만들 수 있다', async () => {
    expect((await POST(makeReq({ ...VALID, teacherPhone: '', teacherEmail: 'a@b.com' }))).status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ teacherPhone: null, teacherEmail: 'a@b.com' }))
  })
  it('연락처를 둘 다 비우면 400', async () => {
    expect((await POST(makeReq({ ...VALID, teacherPhone: '', teacherEmail: '' }))).status).toBe(400)
    expect(db.createSession).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/sessions-route.test.ts`
Expected: FAIL — 라우트가 아직 `teacherContact`를 넘기고 있다

- [ ] **Step 4: `lib/db.ts` 구현**

`NewSessionInput`(5~9행)의 연락처 필드를 교체한다.

```ts
export interface NewSessionInput {
  schoolRegion: string; schoolId: string; schoolName: string
  birthYmd: string; grade: number; classNo: number; gender: '남' | '여'
  childName: string; teacherName: string
  /** 전화·이메일 중 하나는 반드시 non-null (스키마가 보장). 미입력 칸은 null로 저장한다. */
  teacherPhone: string | null; teacherEmail: string | null
}
```

`createSession`의 insert 객체(12~19행)에서 `teacher_contact` 줄을 교체한다.

```ts
    child_name: s.childName, teacher_name: s.teacherName,
    teacher_phone: s.teacherPhone, teacher_email: s.teacherEmail,
```

`SessionRow`(170~177행 부근)의 연락처 필드를 교체한다.

```ts
  child_name: string; teacher_name: string
  /** 010 이전 수집분은 teacher_contact에만 값이 있다(관리자 화면이 contactLabel로 폴백 표시) */
  teacher_phone: string | null; teacher_email: string | null; teacher_contact: string | null
```

`SESSION_COLS`(186행)에 새 컬럼을 더한다.

```ts
const SESSION_COLS = 'id, school_region, school_id, school_name, birth_ymd, grade, class_no, gender, child_name, teacher_name, teacher_phone, teacher_email, teacher_contact, checklist, started_at, submitted_at, guardian_consented_at'
```

- [ ] **Step 5: 세션 생성 라우트 구현**

`app/api/sessions/route.ts`의 `createSession` 호출(50~51행 부근)에서 연락처 전달을 교체한다. 빈 문자열은 null로 저장한다.

```ts
      childName: d.name, teacherName: d.teacherName,
      teacherPhone: d.teacherPhone || null, teacherEmail: d.teacherEmail || null,
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run tests/sessions-route.test.ts && npx tsc --noEmit`
Expected: PASS. `tsc`는 `components/admin/AdminDetailView.tsx`가 아직 `teacher_contact`를 직접 쓰고 있어 오류를 낼 수 있다 — **그건 Task 5에서 고치므로 여기서는 건드리지 말고 어떤 오류가 났는지 보고만 한다.**

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/010_class_and_contact.sql lib/db.ts app/api/sessions/route.ts tests/sessions-route.test.ts
git commit -m "feat(db): 단일학급(반 0)·담임 연락처 분리 마이그레이션과 저장 경로"
```

---

## Task 4: 시작 화면 폼 — 반 드롭다운 + 연락처 2칸

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 구현**

`app/page.tsx`를 아래 순서로 고친다. (파일을 먼저 전부 읽고, 각 블록을 내용으로 찾아 교체할 것 — 행 번호는 참고용)

**(1) import** — `validContact`를 `validPhone`, `validEmail`로 교체한다(15행 부근).

```ts
import { validBirthYmd, validClassNo, validEmail, validGender, validName, validPhone } from '@/lib/validate'
```

**(2) 상수** — `MONTHS` 정의 아래(22행 부근)에 추가한다.

```ts
/** 반 드롭다운 상한. 담당자 요청(15학급을 잘 넘지 않음)보다 넉넉히 잡았다 — 늘리려면 이 숫자만 바꾸면 된다. */
const MAX_CLASS_NO = 20
/** 반 선택지: 단일학급(반 없음) = 0, 그 외 1~MAX_CLASS_NO */
const CLASS_OPTIONS = [
  { value: '0', label: '단일학급 (반 없음)' },
  ...Array.from({ length: MAX_CLASS_NO }, (_, i) => ({ value: String(i + 1), label: `${i + 1}반` })),
]
```

**(3) 필드 키** — `FieldKey`/`FIELD_ORDER`(24·28행)에서 `contact`를 `phone`·`email`로 나눈다.

```ts
type FieldKey = 'school' | 'birth' | 'classNo' | 'gender' | 'name' | 'teacher' | 'phone' | 'email'
type FieldErrors = Partial<Record<FieldKey, string>>

/** 화면상 필드 순서 — 검증 실패 시 이 순서의 첫 에러 필드로 포커스를 옮긴다. */
const FIELD_ORDER: FieldKey[] = ['school', 'birth', 'classNo', 'gender', 'name', 'teacher', 'phone', 'email']
```

**(4) 상태** — `const [contact, setContact] = useState('')`(55행 부근)을 교체한다.

```ts
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
```

**(5) `begin()` 검증** — `cleanContact` 및 연락처 검증(78·89행 부근)을 교체한다.

`const cleanContact = contact.trim()` → 

```ts
    const cleanPhone = phone.trim()
    const cleanEmail = email.trim()
```

`if (!validContact(cleanContact)) next.contact = ...` →

```ts
    // 전화·이메일 중 하나는 필수. 입력된 칸만 형식을 본다(담당자 확정).
    if (!cleanPhone && !cleanEmail) next.phone = '전화번호나 이메일 중 하나는 입력해 주세요.'
    else {
      if (cleanPhone && !validPhone(cleanPhone)) next.phone = '전화번호 형식으로 입력해 주세요. (예: 010-1234-5678)'
      if (cleanEmail && !validEmail(cleanEmail)) next.email = '이메일 형식으로 입력해 주세요.'
    }
```

**⚠️ 같은 블록에서 반 검증도 반드시 함께 고친다.** 기존 코드는

```ts
    if (!validClassNo(Number(classNo))) next.classNo = '반은 1~99 사이 숫자로 입력해 주세요.'
```

인데, 이대로 두면 **미선택 상태가 통과해 버린다** — `classNo`가 `''`일 때 `Number('')`는 `0`이고, 0은 이제 "단일학급"으로 유효한 값이기 때문이다(전에는 0이 무효라 이 식이 미선택도 함께 걸러 주고 있었다). 아래로 교체한다.

```ts
    // classNo === '' 검사를 빼면 안 된다: Number('')는 0이고 0은 이제 유효한 값(단일학급)이라
    // 미선택이 조용히 통과한다.
    if (classNo === '' || !validClassNo(Number(classNo))) next.classNo = '반을 선택해 주세요.'
```

**(6) 전송 바디**(94~99행 부근) — `teacherContact` 줄을 교체한다.

```ts
      name: cleanName, teacherName: cleanTeacher,
      teacherPhone: cleanPhone, teacherEmail: cleanEmail,
```

**(7) `filled`**(107행) — 연락처 조건을 교체한다.

```ts
  const filled = school && year && month && day && classNo !== '' && gender && name.trim() && teacherName.trim()
    && (phone.trim() || email.trim()) && consent
```

**(8) 반 입력 → 드롭다운** — `<label ... htmlFor="classNo">반</label>`과 그 아래 `<input id="classNo" ... />`(183~187행)를 교체한다.

```tsx
              <label className={labelCls} htmlFor="classNo">반</label>
              <div className="mt-1.5" data-field="classNo">
                <Select id="classNo" ariaLabel="반" placeholder="반 선택" value={classNo}
                  onChange={setClassNo} options={CLASS_OPTIONS} />
              </div>
```

**(9) 연락처 1칸 → 2칸** — `<label ... htmlFor="contact">담임 연락처</label>`부터 그 `<FieldError id="err-contact" .../>`까지의 블록(223~229행)을 교체한다.

```tsx
        <div>
          <label className={labelCls} htmlFor="phone">담임 전화번호</label>
          <input id="phone" data-field="phone" name="phone" value={phone} maxLength={60} inputMode="tel"
            placeholder="010-1234-5678"
            aria-describedby={errors.phone ? 'err-phone' : undefined} aria-invalid={!!errors.phone}
            onChange={e => setPhone(e.target.value)} className={inputCls} />
          <FieldError id="err-phone" msg={errors.phone} />
        </div>

        <div>
          <label className={labelCls} htmlFor="email">담임 이메일</label>
          <input id="email" data-field="email" name="email" value={email} maxLength={60} inputMode="email"
            placeholder="teacher@school.kr"
            aria-describedby={errors.email ? 'err-email' : undefined} aria-invalid={!!errors.email}
            onChange={e => setEmail(e.target.value)} className={inputCls} />
          <FieldError id="err-email" msg={errors.email} />
          <p className="mt-1.5 text-[11px] text-ink-mute">전화번호와 이메일 중 하나만 입력해도 괜찮아요.</p>
        </div>
```

- [ ] **Step 2: 타입·린트 검사**

Run: `npx tsc --noEmit && npm run lint`
Expected: `app/page.tsx` 관련 오류 없음. `components/admin/*`의 `teacher_contact` 오류는 Task 5에서 고친다 — 남아 있어도 진행한다.

- [ ] **Step 3: 커밋**

```bash
git add app/page.tsx
git commit -m "feat(form): 반 드롭다운(단일학급 포함)과 담임 전화·이메일 분리 입력"
```

---

## Task 5: 관리자 화면 표기

**Files:**
- Modify: `components/admin/AdminDetailView.tsx`, `components/admin/SessionTable.tsx`

- [ ] **Step 1: 구현**

**(1) `AdminDetailView.tsx`** — `@/lib/format` import에 헬퍼를 더한다(기존 import 줄을 찾아 이름만 추가; `fmtDuration` 등 이미 쓰는 것이 있으면 유지).

```ts
import { contactLabel, gradeClassLabel } from '@/lib/format'
```

결과지 제목(110행 부근)을 교체한다.

```tsx
                  결과지 — {s.child_name} ({s.school_name} {gradeClassLabel(s.grade, s.class_no)}, {s.gender})
```

담임 연락처 표시(113행 부근)를 교체한다.

```tsx
                  생년월일 {s.birth_ymd} · 담임 {s.teacher_name} ({contactLabel(s.teacher_phone, s.teacher_email, s.teacher_contact)}) ·{' '}
```

삭제 확인 모달의 문구(207행 부근)를 교체한다.

```tsx
            <b>{s.child_name}</b> ({s.school_name} {gradeClassLabel(s.grade, s.class_no)})의 정보와
```

**(2) `SessionTable.tsx`** — `@/lib/format`에서 `gradeClassLabel`을 import하고(기존 import 줄이 있으면 이름만 추가), 학년·반 셀(74행 부근)을 교체한다.

```tsx
        cell: ({ row }) => gradeClassLabel(row.original.grade, row.original.class_no),
```

- [ ] **Step 2: 타입·린트·전체 테스트**

`tests/adminStats.test.ts`의 `mkSession` 픽스처(14행)는 `teacher_contact`만 갖고 있어 새 `SessionRow` 타입을 만족하지 못한다. 해당 줄을 아래로 교체한다(legacy 폴백 표시를 검증할 수 있도록 `teacher_contact` 값은 그대로 둔다).

```ts
    child_name: '김테스트', teacher_name: '이담임',
    teacher_phone: null, teacher_email: null, teacher_contact: '010-0000-0000',
```

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: **전 저장소 클린** — 이 태스크가 1단계에서 이어진 `teacher_contact` 타입 오류를 마지막으로 닫는다.

- [ ] **Step 3: 커밋**

```bash
git add components/admin tests/adminStats.test.ts
git commit -m "feat(admin): 단일학급·분리된 담임 연락처 표기 반영"
```

---

## Task 6: 검사 화면 — "모르겠어요" 라벨 · 일시정지 · 저장하고 나가기

**Files:**
- Modify: `app/survey/page.tsx`

> **설계 메모:** 진행 상태는 이미 `patch()`가 호출될 때마다 localStorage에 저장된다(1단계 `saveState`). 따라서 "저장하고 나가기"는 추가 저장 없이 홈으로 이동만 하면 되고, 홈의 "이어서 하기" 카드가 그대로 동작한다. 진짜 문제였던 "저장되는 걸 사용자가 모른다"는 헤더의 상시 안내 문구로 해결한다.

- [ ] **Step 1: 구현**

**(1) import** — `useRouter`는 이미 있다. `Blip`을 추가한다(다른 import 줄 근처).

```ts
import { Blip } from '@/components/Blip'
```

**(2) 상태** — `const [busy, setBusy] = useState(false)` 아래에 추가한다.

```ts
  // 검사자가 직접 누르는 일시정지(화면을 덮어 아동의 오터치도 막는다). 녹음/카운트다운 중에는 잠근다.
  const [paused, setPaused] = useState(false)
```

**(3) 건너뛰기 → 모르겠어요** — `skipping` 주석과 nav 버튼의 라벨을 교체한다.

`skipping` 정의 위 주석을 아래로 바꾼다.

```ts
  // 녹음 페이지를 한 번도 녹음하지 않고 넘어가는 경우: 주 버튼을 "모르겠어요"로 바꿔(+약한 스타일)
  // 오터치 한 번으로 페이지가 조용히 통과되지 않도록 의도를 드러낸다(진행 자체는 허용 —
  // 응답 거부·모름도 유효한 관찰이다). 담당자 확정: 별도 버튼을 만들지 않고 이 라벨을 쓴다.
```

nav의 주 버튼 라벨(마지막 삼항)을 교체한다.

```tsx
            {fromReview ? '검토로 돌아가기' : isLast ? '검토' : skipping ? '모르겠어요' : '다음'}
```

**(4) 헤더에 일시정지·나가기 버튼과 자동 저장 안내** — `<header className="flex-none">` 안의 `{st.childName && (...)}` 블록을 아래로 교체한다.

```tsx
        <div className="mb-2 flex items-center justify-between gap-2">
          {st.childName ? (
            <p className="min-w-0 truncate text-xs font-bold text-ink-soft">
              <b className="text-blue">{st.childName}</b> 학생
            </p>
          ) : <span />}
          {/* 검사자용 조작 — 아동의 큰 [이전/다음] 버튼과 떨어뜨려 헤더에 작게 둔다.
              녹음·카운트다운 중에는 눌리지 않게 잠근다(그 시도의 소리가 유실되므로). */}
          <div className="flex flex-none gap-1.5">
            <button type="button" onClick={() => setPaused(true)} disabled={busy}
              className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-blue disabled:opacity-40">
              일시정지
            </button>
            <button type="button" onClick={() => router.push('/')} disabled={busy}
              className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1.5 text-[11px] font-bold text-ink-soft transition hover:border-blue disabled:opacity-40">
              저장하고 나가기
            </button>
          </div>
        </div>
```

`<ProgressBar ... />` 바로 아래에 자동 저장 안내를 추가한다.

```tsx
        {/* "저장되고 있는지 모르겠다"는 불안을 없애기 위한 상시 안내 — 실제로 답을 누를 때마다 저장된다. */}
        <p className="mt-1 text-[11px] text-ink-mute">진행 상황은 자동으로 저장돼요. 창을 닫아도 이어서 할 수 있어요.</p>
```

**(5) 일시정지 오버레이** — `</nav>` 바로 뒤, `</main>` 앞에 추가한다.

```tsx
      {paused && (
        // 화면 전체를 덮어 아동이 문항을 보거나 잘못 누르지 못하게 한다(잠깐 자리를 비우는 상황용).
        <div role="dialog" aria-modal="true" aria-label="검사 일시정지"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-white/95 px-6 text-center backdrop-blur">
          <Blip variant="idle" className="h-24 w-[100px]" />
          <h2 className="text-2xl font-bold">잠시 쉬는 중이에요</h2>
          <p className="text-sm leading-relaxed text-ink-soft">
            지금까지 한 내용은 저장돼 있어요.<br />준비되면 아래 버튼을 눌러 주세요.
          </p>
          <button type="button" onClick={() => setPaused(false)} className="cta max-w-60">이어서 하기</button>
        </div>
      )}
```

- [ ] **Step 2: 타입·린트·전체 테스트**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 모두 통과, 전 저장소 클린

- [ ] **Step 3: 커밋**

```bash
git add app/survey/page.tsx
git commit -m "feat(survey): 모르겠어요 라벨 · 일시정지 · 저장하고 나가기 · 자동 저장 안내"
```

---

## Task 7: 브라우저 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 마이그레이션 적용 확인**

컨트롤러가 `supabase/migrations/010_class_and_contact.sql`을 Supabase SQL Editor에서 실행했는지 확인한다. **적용 전에는 세션 생성이 실패하므로 이 태스크를 시작할 수 없다.**

확인: `select class_no, teacher_phone, teacher_email from sessions limit 1;` — 에러 없이 실행되면 적용된 것

- [ ] **Step 2: 전체 자동 검사**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 전부 통과

- [ ] **Step 3: 개발 서버 기동**

`.claude/launch.json`의 `dev` 설정으로 미리보기를 연다(Bash로 서버를 직접 띄우지 말 것).

- [ ] **Step 4: 시작 화면 확인**

`/`에서 확인한다.

1. **반**이 드롭다운이고, 첫 항목이 **"단일학급 (반 없음)"**, 그 뒤로 1반~20반이 있는지
2. **담임 전화번호**와 **담임 이메일** 칸이 각각 있고, "전화번호와 이메일 중 하나만 입력해도 괜찮아요" 안내가 보이는지
3. 둘 다 비우고 제출하면 전화번호 칸에 "전화번호나 이메일 중 하나는 입력해 주세요." 오류가 뜨는지
4. 이메일만 입력하고 나머지를 채우면 **정상적으로 세션이 생성**되는지(`POST /api/sessions` → 200)
5. 반을 "단일학급 (반 없음)"으로 골라도 세션이 생성되는지

`read_console_messages`로 콘솔 에러가 없는지 확인한다.

- [ ] **Step 5: 검사 화면 확인**

마이크 확인을 통과한 뒤 낱말 페이지에서 확인한다.

1. 헤더 우측에 **[일시정지] [저장하고 나가기]** 버튼이 있는지
2. 진행바 아래에 **"진행 상황은 자동으로 저장돼요…"** 안내가 보이는지
3. 녹음하지 않은 녹음 페이지에서 주 버튼 라벨이 **"모르겠어요"** 인지 (기존 "건너뛰기"가 아님)
4. **[일시정지]** → 화면 전체가 덮이고 "잠시 쉬는 중이에요"가 보이는지, **[이어서 하기]**로 원래 문항에 그대로 돌아오는지
5. **[저장하고 나가기]** → 홈으로 이동하고, 홈에 **"◯◯ 학생의 검사가 진행 중이에요 / 이어서 하기"** 카드가 보이는지. [이어서 하기]를 누르면 **나갔던 그 페이지**로 복귀하는지

- [ ] **Step 6: 관리자 화면 확인**

`/admin`으로 로그인해 방금 만든 세션을 연다.

1. 목록의 학년·반 열이 단일학급 세션에서 **"1학년 단일학급"** 으로 보이는지(일반 학급은 "1-3")
2. 결과지 제목·삭제 확인 모달도 같은 표기를 쓰는지
3. 담임 연락처가 입력한 값(전화만/이메일만/둘 다)에 맞게 보이는지
4. 010 이전에 만든 세션(있다면)이 여전히 legacy `teacher_contact` 값으로 표시되는지

- [ ] **Step 7: 반응형 확인**

`resize_window`로 mobile(375) / desktop(1280)에서 시작 화면의 반 드롭다운·연락처 2칸과 검사 화면의 헤더 버튼이 깨지지 않는지 확인하고, 스크린샷을 남긴다.

- [ ] **Step 8: 커밋**

검증 중 수정이 있었다면 커밋한다. 없었다면 이 단계는 건너뛴다.

---

## 완료 후 담당자에게 회신할 내용

1. **"가짜 단어" 확인** — 연습 낱말이 (a) 검사 문항이 아닌 쉬운 낱말인지 (b) 무의미 낱말인지. (b)면 연습용 낱말 3개 요청.
2. **반 상한 20** — 늘리거나 줄이려면 숫자 하나만 바꾸면 된다고 안내.
3. **Pass/Fail 임시 기준** — 3단계에서 만점 대비 65%로 넣고 "임시 기준 · 확정 전" 문구를 붙일 예정임을 재확인.

## 후속 계획

- `docs/superpowers/plans/YYYY-MM-DD-admin-scoring-report.md` — 3단계: 채점 입력, Pass/Fail 판정(임시 기준), 검사지 양식 결과지 인쇄, 검사자(교사/전문가) 구분
