# Phase 3 — 백엔드·보안·데이터 정합성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KODYS-G1의 공개(무인증) 수집 엔드포인트·관리자 인증·업로드/저장 경로의 보안·정합성 결함(스펙 항목 19~22)을 외과적으로 고친다. 세션 스코프 토큰으로 임의 세션 쓰기를 차단하고, 업로드 MIME allowlist·매직바이트로 저장형 XSS를 막고, 관리자 비밀번호를 argon2id로 교체하며, FK cascade·행수 확인·에러 은닉으로 데이터 정합성을 높인다. PIPA(보호자 동의·보존·접근 로그, 스펙 C-1)는 **범위 제외**.

**Architecture:** 순수 로직(zod 스키마, HMAC 토큰, MIME/매직바이트 판별)을 `lib`로 추출해 vitest(env=node, Web Crypto·argon2 네이티브 모두 node에서 동작)로 TDD한 뒤, 그 위에서 라우트(`/api/sessions`·`/api/recordings`·`/api/sessions/submit`·`/api/admin/login`)를 배선한다. 클라이언트(`app/page.tsx`·`RecordingItem`·`review`)는 세션 토큰을 상태에 저장·동봉하도록 배선하고 `typecheck` + 수동 검증으로 확인한다. DB 스키마 변경(FK cascade·인덱스·원자적 실패카운트 RPC)은 비파괴·재실행 안전한 마이그레이션 005로 추가한다.

**Tech Stack:** Next.js 16.2, React 19.2, TypeScript 5.9, Tailwind 4, Vitest 4 (환경: `node`), Supabase(`@supabase/supabase-js` 2.110). 신규 의존성: `zod`, `@node-rs/argon2`.

## Global Constraints

- **신규 의존성 버전 고정**: `zod@4.4.3`, `@node-rs/argon2@2.0.2`을 **정확히 그 버전으로** 설치한다(`package.json` `dependencies`에 캐럿 없이 고정: `"zod": "4.4.3"`, `"@node-rs/argon2": "2.0.2"`). zod는 `import { z } from 'zod'`(v4). 설치 후 `npm ls zod @node-rs/argon2`로 확인.
- **`@node-rs/argon2`는 네이티브 바인딩** → Node.js 런타임 전용. argon2를 import하는 로그인 라우트는 반드시 `export const runtime = 'nodejs'`를 선언한다(Edge 런타임 금지). Vercel/CI는 플랫폼별 프리빌트 바이너리(optionalDependency, 예: `@node-rs/argon2-linux-x64-gnu`)를 설치하므로 lockfile에 그 항목이 포함되도록 커밋한다. `middleware.ts`는 Edge에서 실행되므로 argon2를 import하지 않는다(HMAC 검증만; Web Crypto는 Edge·Node 양쪽 동작).
- 테스트 환경은 `vitest.config.ts`의 `environment: 'node'` — 브라우저 전역은 테스트에서 직접 스텁하고, 라우트 테스트는 `@/lib/db`·`@/lib/env`를 `vi.mock`으로 대체한다(기존 라우트 테스트 방식 준수).
- 경로 별칭: `@/*` → 저장소 루트 (`tsconfig.json`, `vitest.config.ts`).
- **DB 마이그레이션은 자동 러너 없음** — Supabase SQL Editor에서 수동 실행. 마이그레이션 005는 **비파괴적 + 재실행 안전(idempotent)**: FK는 `drop constraint if exists` 후 재정의, 인덱스는 `create index if not exists`, RPC는 `create or replace function`. 003의 `drop table` 파괴 패턴을 답습하지 않는다.
- 타입 검증: 각 태스크 종료 시 `npm run typecheck`(= `tsc --noEmit`) 통과 필수. Next 빌드 타입체크는 꺼져 있으므로 이것으로만 판단.
- 클라이언트에는 항상 일반 문구, 상세 오류는 `console.error`로 서버 로그에만 남긴다(원시 에러 메시지 은닉).
- 커밋 메시지 말미에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 포함.
- 작업 브랜치: 신규 기능 브랜치 사용 (**main 직접 커밋 금지**).
- **선행 전제**: Phase 1이 병합되어 `lib/survey-state.ts`는 `sessionId, childName, micDone, idx, phase, recorded, writing, checklist` 필드와 세션별 `localStorage` 키(`kodys-survey:{id}` + `kodys-survey:last`)를 갖는다. 본 플랜의 Task 6은 그 형태 위에 `sessionToken`을 더한다.

---

### Task 1: zod 도입 + `lib/schema.ts` + `validate.ts` 래퍼화 (항목 공통)

검증 규칙의 단일 진실원을 `lib/schema.ts`(zod)로 만들고, 기존 `validate.ts` 함수는 스키마 위 얇은 래퍼로 재구현해 호출부·`tests/validate.test.ts` 무변경으로 통과시킨다.

**Files:**
- Create: `lib/schema.ts`
- Modify: `lib/validate.ts` (전체 재작성 — 래퍼)
- Create: `tests/schema.test.ts`
- (dep) `package.json`에 `"zod": "4.4.3"` 추가

**Interfaces:**
- Produces:
  - `nameSchema, birthYmdSchema, gradeSchema, classNoSchema, genderSchema, contactSchema` (필드 스키마)
  - `sessionCreateSchema` — `/api/sessions` 바디 스키마(문자열 필드 trim+연속공백 정규화 포함)
  - `NAME_RE` (기존 export 호환 유지)
  - `validName/validBirthYmd/validGrade/validClassNo/validGender/validContact` (기존 시그니처 유지, 스키마 래퍼)

- [ ] **Step 1: zod 설치**

```bash
npm install zod@4.4.3
npm ls zod   # zod@4.4.3 확인
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/schema.test.ts
import { describe, it, expect } from 'vitest'
import { sessionCreateSchema } from '@/lib/schema'

const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
  name: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
}

describe('sessionCreateSchema', () => {
  it('유효 입력 파싱 성공', () => {
    expect(sessionCreateSchema.safeParse(VALID).success).toBe(true)
  })
  it('이름 앞뒤·연속 공백 정규화', () => {
    const r = sessionCreateSchema.safeParse({ ...VALID, name: '  Mary   Jane ' })
    expect(r.success && r.data.name).toBe('Mary Jane')
  })
  it('학교명 앞뒤 공백 정규화', () => {
    const r = sessionCreateSchema.safeParse({ ...VALID, schoolName: '  서울신구초등학교 ' })
    expect(r.success && r.data.schoolName).toBe('서울신구초등학교')
  })
  it('미등록 지역 거부', () =>
    expect(sessionCreateSchema.safeParse({ ...VALID, region: '화성교육청' }).success).toBe(false))
  it('학년 범위 밖 거부', () =>
    expect(sessionCreateSchema.safeParse({ ...VALID, grade: 7 }).success).toBe(false))
  it('연락처 형식 오류 거부', () =>
    expect(sessionCreateSchema.safeParse({ ...VALID, teacherContact: '1234' }).success).toBe(false))
  it('본문이 객체가 아니면 거부', () =>
    expect(sessionCreateSchema.safeParse(null).success).toBe(false))
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/schema'`.

- [ ] **Step 4: Write implementation**

```ts
// lib/schema.ts — 검증 규칙 단일 진실원(zod v4). 클라이언트(validate.ts 래퍼)·서버(/api/sessions) 공유.
import { z } from 'zod'
import { REGION_NAMES } from './schools'

/** 이름: 완성형 한글·영문만, 단어 사이 단일 공백, 1~30자. (호출 전 trim·연속공백 정규화 전제) */
export const NAME_RE = /^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$/
const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MONTH_MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // YY만으로 윤년 판단 불가 → 2월 29 허용

export const nameSchema = z.string().min(1).max(30).regex(NAME_RE)

export const birthYmdSchema = z.string().regex(/^\d{6}$/).refine(v => {
  const mm = Number(v.slice(2, 4)), dd = Number(v.slice(4, 6))
  if (mm < 1 || mm > 12) return false
  return dd >= 1 && dd <= MONTH_MAX_DAY[mm - 1]
})

export const gradeSchema = z.number().int().min(1).max(6)
export const classNoSchema = z.number().int().min(1).max(99)
export const genderSchema = z.enum(['남', '여'])
export const contactSchema = z.string().min(1).max(60).refine(v => PHONE_RE.test(v) || EMAIL_RE.test(v))

/** 문자열 정규화: trim + 연속 공백 1칸 (기존 라우트 cleanStr와 동일 규칙). */
const cleaned = z.string().transform(s => s.trim().replace(/\s+/g, ' '))

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
  teacherContact: contactSchema,
})

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>
```

```ts
// lib/validate.ts — lib/schema.ts 위 얇은 래퍼(기존 시그니처·호출부·테스트 호환 유지).
import { nameSchema, birthYmdSchema, gradeSchema, classNoSchema, genderSchema, contactSchema, NAME_RE } from './schema'

export { NAME_RE }

export function validName(name: unknown): name is string { return nameSchema.safeParse(name).success }
export function validBirthYmd(v: unknown): v is string { return birthYmdSchema.safeParse(v).success }
export function validGrade(v: unknown): v is number { return gradeSchema.safeParse(v).success }
export function validClassNo(v: unknown): v is number { return classNoSchema.safeParse(v).success }
export function validGender(v: unknown): v is '남' | '여' { return genderSchema.safeParse(v).success }
export function validContact(v: unknown): v is string { return contactSchema.safeParse(v).success }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/schema.test.ts tests/validate.test.ts`
Expected: PASS — 신규 스키마 테스트 + **기존 `validate.test.ts` 전부 통과**(래퍼 동등성 확인).

- [ ] **Step 6: 타입체크**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/schema.ts lib/validate.ts tests/schema.test.ts
git commit -m "feat(schema): zod 검증 스키마 단일화 + validate.ts 래퍼화

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 세션 스코프 토큰 + 상수시간 비교 + 관리자 토큰 jti (`lib/auth.ts`)

세션당 HMAC 토큰(임의 세션 UUID 쓰기 차단)과 상수시간 비교를 추가하고, 관리자 토큰에 랜덤 `jti`를 실어 유일성을 확보한다(폐기는 `SESSION_SECRET` 회전으로 — Self-Review 참조). 모두 Web Crypto 기반이라 Edge(미들웨어)에서도 동작.

**Files:**
- Modify: `lib/auth.ts`
- Modify: `tests/auth.test.ts` (기존 유지 + describe 추가)

**Interfaces:**
- Produces:
  - `createToken(secret, ttlMs?)` → `${exp}.${jti}.${HMAC(exp.jti)}` (기존 시그니처 유지, 3-파트)
  - `verifyToken(token, secret): Promise<boolean>` — 만료·서명 검증 + **상수시간 비교**
  - `createSessionToken(sessionId, secret): Promise<string>` → `${sessionId}.${HMAC(sessionId)}`
  - `verifySessionToken(sessionId, token, secret): Promise<boolean>`
  - `sha256Hex`, `ADMIN_COOKIE` (기존 유지)

- [ ] **Step 1: Write the failing test** (기존 `tests/auth.test.ts` 하단에 describe 추가; 기존 describe는 그대로 둔다)

```ts
// tests/auth.test.ts 상단 import에 세션 토큰 함수 추가
import { createToken, verifyToken, sha256Hex, createSessionToken, verifySessionToken } from '@/lib/auth'

// (기존 describe('auth token', ...) 블록은 그대로 유지 — 새 3-파트 형식에서도 통과)

describe('세션 스코프 토큰', () => {
  const SID = '11111111-1111-4111-8111-111111111111'
  it('정상 검증 통과', async () => {
    const t = await createSessionToken(SID, SECRET)
    expect(await verifySessionToken(SID, t, SECRET)).toBe(true)
  })
  it('다른 sessionId면 실패', async () => {
    const t = await createSessionToken(SID, SECRET)
    expect(await verifySessionToken('22222222-2222-4222-8222-222222222222', t, SECRET)).toBe(false)
  })
  it('위조 서명·빈 토큰 실패', async () => {
    expect(await verifySessionToken(SID, `${SID}.deadbeef`, SECRET)).toBe(false)
    expect(await verifySessionToken(SID, '', SECRET)).toBe(false)
  })
  it('다른 시크릿이면 실패', async () => {
    const t = await createSessionToken(SID, SECRET)
    expect(await verifySessionToken(SID, t, 'other')).toBe(false)
  })
})

describe('관리자 토큰 jti', () => {
  it('매 발급마다 토큰이 달라 유일', async () => {
    expect(await createToken(SECRET, 60_000)).not.toBe(await createToken(SECRET, 60_000))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — `createSessionToken`/`verifySessionToken` 미정의.

- [ ] **Step 3: Write implementation** (`lib/auth.ts` 전체 재작성)

```ts
// lib/auth.ts — HMAC 토큰(관리자 쿠키·세션 스코프) + 상수시간 비교. Web Crypto만 사용(Edge·Node 공용).
const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)))
}

/** 동일 길이 문자열의 상수시간 비교(HMAC-SHA256 hex는 항상 64자 → 길이 노출 없음). Edge 안전(순수 JS). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 랜덤 nonce(16 hex). 관리자 토큰 유일성 확보용. */
function randomId(): string {
  const b = new Uint8Array(8)
  crypto.getRandomValues(b)
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('')
}

/** 관리자 토큰 형식: `${만료ms}.${jti}.${HMAC(만료ms.jti)}`. 폐기는 SESSION_SECRET 회전으로. */
export async function createToken(secret: string, ttlMs = 8 * 3600_000): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  const jti = randomId()
  return `${exp}.${jti}.${await hmacHex(`${exp}.${jti}`, secret)}`
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [exp, jti, sig] = parts
  if (!exp || !jti || !sig) return false
  if (Number(exp) < Date.now()) return false
  return timingSafeEqualHex(await hmacHex(`${exp}.${jti}`, secret), sig)
}

/** 세션 스코프 토큰 형식: `${sessionId}.${HMAC(sessionId)}`. 후속 업로드/제출에 동봉해 임의 세션 쓰기 차단. */
export async function createSessionToken(sessionId: string, secret: string): Promise<string> {
  return `${sessionId}.${await hmacHex(sessionId, secret)}`
}

export async function verifySessionToken(sessionId: string, token: string, secret: string): Promise<boolean> {
  if (!sessionId || !token) return false
  const idx = token.lastIndexOf('.')
  if (idx < 0) return false
  const sig = token.slice(idx + 1)
  return timingSafeEqualHex(await hmacHex(sessionId, secret), sig)
}

export const ADMIN_COOKIE = 'admin_token'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS (기존 5개 + 신규 세션/jti 케이스). 참고: 기존 `verifyToken('9999999999999.' + t.split('.')[1], ...)`는 2-파트라 새 형식에서도 `false`, `t + 'x'`는 서명 길이 불일치로 `false`.

- [ ] **Step 5: 타입체크 + 회귀** — `npm run typecheck && npx vitest run` → PASS. (middleware는 `verifyToken(token, secret)` 시그니처 무변경이라 수정 불필요; Edge에서 그대로 동작.)

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts tests/auth.test.ts
git commit -m "feat(auth): 세션 스코프 토큰 + 상수시간 비교 + 관리자 토큰 jti

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `lib/db.ts` — 행수 반환·녹음 카운트·원자적 실패기록·삭제/정리

정합성·경쟁조건·삭제 경로를 lib에 마련한다. 이 저장소에는 supabase를 스텁하는 db 단위 테스트 하베스가 없으므로(라우트 테스트에서 `@/lib/db`를 mock) 검증은 `typecheck` + 전체 스위트로 한다. `record_login_failure` RPC와 FK cascade는 Task 10의 마이그레이션 005에 정의되며, 그 적용 전에는 이 함수들이 동작하지 않는다(cross-reference).

**Files:**
- Modify: `lib/db.ts`

**Interfaces:**
- Produces:
  - `submitSession(...)` → `Promise<number>` (업데이트된 세션 행수; 0이면 미존재)
  - `countSessionRecordings(sessionId): Promise<number>`
  - `recordLoginFailure(ip, lockMs)` → 원자적 RPC 호출(시그니처 유지)
  - `deleteSession(id): Promise<void>` (스토리지 `{id}/` 제거 후 행 삭제)
  - `removeStorageObject(path): Promise<void>` (업로드 보상 정리용)

- [ ] **Step 1: `submitSession` 행수 반환** — 세션을 먼저 업데이트해 존재 여부를 확정하고, 존재할 때만 낱말쓰기를 upsert한다(미존재 시 FK 예외 대신 명확한 0 반환).

```ts
// lib/db.ts — submitSession 교체
export async function submitSession(
  sessionId: string, writing: WritingAnswer[], checklist: string[],
): Promise<number> {
  const { data, error } = await sb().from('sessions')
    .update({ checklist, submitted_at: new Date().toISOString() })
    .eq('id', sessionId).select('id')
  fail(error)
  const affected = (data ?? []).length
  if (affected === 0) return 0 // 존재하지 않는 세션 → 라우트에서 404
  if (writing.length > 0) {
    const rows = writing.map(w => ({ session_id: sessionId, item_code: w.itemCode, can_write: w.canWrite }))
    const { error: e2 } = await sb().from('writing_answers').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(e2)
  }
  return affected
}
```

- [ ] **Step 2: 녹음 카운트 + 스토리지 정리 + 세션 삭제 추가** (`insertRecording` 아래에 추가)

```ts
/** 세션당 녹음 행 수(업로드 총량 상한 검사용). */
export async function countSessionRecordings(sessionId: string): Promise<number> {
  const { count, error } = await sb().from('recordings')
    .select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
  fail(error)
  return count ?? 0
}

/** 스토리지 객체 1건 제거(업로드 후 DB insert 실패 시 보상 정리). */
export async function removeStorageObject(path: string): Promise<void> {
  const { error } = await sb().storage.from('recordings').remove([path])
  fail(error)
}

/** 관리자 세션 삭제: 스토리지 {id}/ 프리픽스 객체 전체 제거 후 행 삭제(FK CASCADE로 recordings·writing_answers 정리). */
export async function deleteSession(id: string): Promise<void> {
  const { data: objs, error: listErr } = await sb().storage.from('recordings').list(id)
  fail(listErr)
  if (objs && objs.length) {
    const { error: rmErr } = await sb().storage.from('recordings').remove(objs.map(o => `${id}/${o.name}`))
    fail(rmErr)
  }
  const { error } = await sb().from('sessions').delete().eq('id', id)
  fail(error)
}
```

- [ ] **Step 3: `recordLoginFailure` 원자화** — read-then-write 경쟁조건 제거. Supabase JS 유창 API로는 `fail_count = fail_count + 1` 원자 증가를 표현할 수 없으므로 Postgres 함수(RPC)로 위임(함수 정의는 마이그레이션 005). 시그니처 `(ip, lockMs)`는 유지.

```ts
// lib/db.ts — recordLoginFailure 교체
export async function recordLoginFailure(ip: string, lockMs: number): Promise<void> {
  // 단일 원자적 upsert(RPC): insert ... on conflict do update set fail_count = fail_count + 1
  const { error } = await sb().rpc('record_login_failure', { p_ip: ip, p_lock_ms: lockMs })
  fail(error)
}
```

- [ ] **Step 4: 타입체크 + 회귀**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. `submitSession`이 `Promise<number>`가 되어도 현재 submit 라우트는 반환값을 무시(await만)하므로 타입 통과; 신규 함수는 미사용 export라 무해. `recordLoginFailure`는 시그니처 동일이라 login 라우트/테스트 무영향.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts
git commit -m "feat(db): 제출 행수 반환·녹음 카운트·원자적 실패기록·세션 삭제/정리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 오디오 MIME allowlist + 매직바이트 (`lib/audio-validate.ts`)

업로드가 실제 오디오인지 서버에서 판별하고, 저장 Content-Type를 서버가 고정하는 순수 헬퍼. 저장형 XSS(`text/html` 등) 차단.

**Files:**
- Create: `lib/audio-validate.ts`
- Create: `tests/audio-validate.test.ts`

**Interfaces:**
- Produces:
  - `isAllowedAudioMime(mime: string): boolean`
  - `sniffAudio(bytes: Uint8Array): 'webm' | 'mp4' | 'ogg' | null`
  - `safeContentType(sniffed): string` — 서버 고정 Content-Type

- [ ] **Step 1: Write the failing test**

```ts
// tests/audio-validate.test.ts
import { describe, it, expect } from 'vitest'
import { isAllowedAudioMime, sniffAudio, safeContentType } from '@/lib/audio-validate'

const bytes = (...b: number[]) => new Uint8Array(b)

describe('isAllowedAudioMime', () => {
  it('허용 MIME', () => {
    for (const m of ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/m4a'])
      expect(isAllowedAudioMime(m)).toBe(true)
  })
  it('코덱 파라미터 허용', () => expect(isAllowedAudioMime('audio/webm;codecs=opus')).toBe(true))
  it('비허용 거부', () => {
    expect(isAllowedAudioMime('text/html')).toBe(false)
    expect(isAllowedAudioMime('application/octet-stream')).toBe(false)
    expect(isAllowedAudioMime('')).toBe(false)
  })
})

describe('sniffAudio', () => {
  it('WebM/Matroska 0x1A45DFA3', () => expect(sniffAudio(bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4))).toBe('webm'))
  it("OGG 'OggS'", () => expect(sniffAudio(bytes(0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0))).toBe('ogg'))
  it("MP4 'ftyp' @offset4", () => expect(sniffAudio(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70))).toBe('mp4'))
  it('오디오 아님 → null', () => {
    expect(sniffAudio(bytes(0x3c, 0x68, 0x74, 0x6d, 0x6c))).toBeNull() // "<html"
    expect(sniffAudio(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull()       // "%PDF"
    expect(sniffAudio(bytes(1, 2))).toBeNull()                          // 너무 짧음
  })
})

describe('safeContentType', () => {
  it('컨테이너→고정 MIME', () => {
    expect(safeContentType('webm')).toBe('audio/webm')
    expect(safeContentType('ogg')).toBe('audio/ogg')
    expect(safeContentType('mp4')).toBe('audio/mp4')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio-validate.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audio-validate'`.

- [ ] **Step 3: Write implementation**

```ts
// lib/audio-validate.ts — 업로드 오디오 MIME allowlist + 매직바이트 검증(저장형 XSS 차단).
const ALLOWED_MIME = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/m4a']

/** 클라이언트가 준 MIME 접두가 허용 오디오인지(;codecs=opus 등 파라미터는 무시). */
export function isAllowedAudioMime(mime: string): boolean {
  const base = mime.split(';')[0].trim().toLowerCase()
  return ALLOWED_MIME.includes(base)
}

export type SniffedAudio = 'webm' | 'mp4' | 'ogg'

/** 앞부분 바이트로 실제 컨테이너 판별. 미일치 시 null(오디오 아님 → 거부). */
export function sniffAudio(bytes: Uint8Array): SniffedAudio | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return 'webm' // EBML(Matroska/WebM)
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53)
    return 'ogg'  // 'OggS'
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70)
    return 'mp4'  // 'ftyp' at offset 4 (MP4/M4A)
  return null
}

/** 판별된 컨테이너에 대응하는 서버 고정 Content-Type(클라이언트 MIME 불신). */
export function safeContentType(sniffed: SniffedAudio): string {
  return sniffed === 'webm' ? 'audio/webm' : sniffed === 'ogg' ? 'audio/ogg' : 'audio/mp4'
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/audio-validate.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/audio-validate.ts tests/audio-validate.test.ts
git commit -m "feat(audio-validate): MIME allowlist + 매직바이트 판별 + 서버 고정 Content-Type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `POST /api/sessions` — zod 검증·토큰 반환·레이트리밋·에러 은닉

시작 폼 제출을 zod로 검증하고, 세션 생성 후 세션 토큰을 함께 반환하며, IP 기반 간단 레이트리밋과 try/catch를 추가한다.

**Files:**
- Modify: `app/api/sessions/route.ts` (전체 재작성)
- Modify: `tests/sessions-route.test.ts`

**Interfaces:**
- Consumes: `sessionCreateSchema`(Task 1), `createSessionToken`(Task 2), `createSession`(db), `env`.
- Produces: 성공 시 `{ sessionId, sessionToken }`.

- [ ] **Step 1: 테스트 갱신** (토큰 반환 + env mock + 레이트리밋)

```ts
// tests/sessions-route.test.ts — 전체 교체
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ createSession: vi.fn().mockResolvedValue('sess-1') }))
vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))

import { POST } from '@/app/api/sessions/route'
import * as db from '@/lib/db'

const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
  name: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
}

function makeReq(body: unknown, ip?: string) {
  return new Request('http://x/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/sessions', () => {
  it('유효한 참여자 정보로 세션 생성 + 토큰 반환', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.sessionId).toBe('sess-1')
    expect(typeof json.sessionToken).toBe('string')
    expect(json.sessionToken.length).toBeGreaterThan(0)
    expect(db.createSession).toHaveBeenCalledWith({
      schoolRegion: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
      birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
      childName: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
    })
  })
  it('이름 연속 공백은 서버가 정규화', async () => {
    await POST(makeReq({ ...VALID, name: '  Mary   Jane ' }))
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({ childName: 'Mary Jane' }))
  })
  it('미등록 지역 400', async () =>
    expect((await POST(makeReq({ ...VALID, region: '화성교육청' }))).status).toBe(400))
  it('학교 누락 400', async () => {
    expect((await POST(makeReq({ ...VALID, schoolId: '' }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, schoolName: '' }))).status).toBe(400)
  })
  it('생년월일 형식 오류 400', async () =>
    expect((await POST(makeReq({ ...VALID, birthYmd: '191301' }))).status).toBe(400))
  it('학년·반 범위 밖 400', async () => {
    expect((await POST(makeReq({ ...VALID, grade: 7 }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, classNo: 0 }))).status).toBe(400)
  })
  it('성별·연락처 형식 오류 400', async () => {
    expect((await POST(makeReq({ ...VALID, gender: 'M' }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, teacherContact: '1234' }))).status).toBe(400)
  })
  it('담임교사명 특수문자 400', async () =>
    expect((await POST(makeReq({ ...VALID, teacherName: '박선생1' }))).status).toBe(400))
  it('본문 없음 400', async () =>
    expect((await POST(new Request('http://x', { method: 'POST', body: 'not json' }))).status).toBe(400))
  it('동일 IP 과다 요청 시 429', async () => {
    let last = 200
    for (let i = 0; i < 21; i++) last = (await POST(makeReq(VALID, '203.0.113.7'))).status
    expect(last).toBe(429)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/sessions-route.test.ts` → FAIL (아직 토큰 미반환·레이트리밋 없음).

- [ ] **Step 3: Write implementation**

```ts
// app/api/sessions/route.ts — 전체 교체
import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { createSessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { sessionCreateSchema } from '@/lib/schema'

export const runtime = 'nodejs'

const RATE_LIMIT = 20                 // IP당 시간창 내 허용 세션 생성 수
const RATE_WINDOW_MS = 10 * 60_000
// best-effort 인메모리 카운터. 서버리스에서는 인스턴스별로 독립(완벽한 전역 방어는 아니며 PII 스팸 완화 목적).
const hits = new Map<string, number[]>()

function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const hops = req.headers.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean)
  return hops?.[hops.length - 1] ?? 'local'
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const parsed = sessionCreateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: '입력값을 다시 확인해 주세요.' }, { status: 400 })

  const d = parsed.data
  try {
    const sessionId = await createSession({
      schoolRegion: d.region, schoolId: d.schoolId, schoolName: d.schoolName,
      birthYmd: d.birthYmd, grade: d.grade, classNo: d.classNo, gender: d.gender,
      childName: d.name, teacherName: d.teacherName, teacherContact: d.teacherContact,
    })
    const sessionToken = await createSessionToken(sessionId, env('SESSION_SECRET'))
    return NextResponse.json({ sessionId, sessionToken })
  } catch (e) {
    console.error('[sessions] createSession 실패', e)
    return NextResponse.json({ error: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/sessions-route.test.ts` → PASS. (기본 13개 요청은 헤더 없는 `'local'` 버킷 <20이라 레이트리밋 미발동; 429 테스트만 고유 IP 21회.)

- [ ] **Step 5: 타입체크 + 회귀** — `npm run typecheck && npx vitest run` → PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/sessions/route.ts tests/sessions-route.test.ts
git commit -m "feat(sessions-route): zod 검증·세션 토큰 반환·IP 레이트리밋·에러 은닉

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 클라이언트 배선 — 세션 토큰 저장·동봉

`POST /api/sessions` 응답의 `sessionToken`을 상태에 저장하고, 이후 녹음 업로드·제출 요청에 동봉한다. 클라이언트 파일이라 node 테스트 불가 → `typecheck` + 수동 검증.

**Files:**
- Modify: `lib/survey-state.ts` (Phase 1 형태에 `sessionToken` 추가)
- Modify: `app/page.tsx`
- Modify: `components/survey/RecordingItem.tsx`
- Modify: `app/survey/page.tsx` (RecordingItem에 prop 전달)
- Modify: `app/review/page.tsx`

**Interfaces:**
- Consumes: `POST /api/sessions` 응답의 `sessionToken`.
- Produces: `SurveyState.sessionToken: string`, `newState(sessionId, childName, sessionToken)`.

- [ ] **Step 1: `SurveyState`에 토큰 추가** (Phase 1 재작성본 기준 diff)

`lib/survey-state.ts`의 인터페이스와 `newState`를 아래처럼 수정한다(다른 필드·저장 로직은 Phase 1 그대로 유지):

```ts
export interface SurveyState {
  sessionId: string
  sessionToken: string               // /api/sessions가 발급 — 녹음/제출 요청에 동봉
  childName: string
  micDone: boolean
  idx: number
  phase: 'mic' | 'item'
  recorded: Record<string, number>
  writing: Record<string, boolean>
  checklist: string[]
}

export function newState(sessionId: string, childName: string, sessionToken: string): SurveyState {
  return { sessionId, sessionToken, childName, micDone: false, idx: 0, phase: 'mic', recorded: {}, writing: {}, checklist: [] }
}
```

- [ ] **Step 1b: Phase 1 survey-state 테스트 갱신** (`tests/survey-state.test.ts`)

`newState`가 3인자가 되므로, Phase 1에서 만든 `tests/survey-state.test.ts`의 모든 `newState(...)` 호출에 토큰 인자를 추가한다(tsconfig `include`가 `**/*.ts`라 테스트도 타입체크 대상 → 미갱신 시 `tsc`가 인자 부족으로 실패). 4개 호출을 아래처럼 바꾼다:

```ts
// newState('sid-1', '김도연')        → newState('sid-1', '김도연', 'tok')
// newState('sid-1', 'A')             → newState('sid-1', 'A', 'tok')   (2곳)
// newState('sid-2', 'B')             → newState('sid-2', 'B', 'tok')
```
그리고 save→load 왕복 테스트에 토큰 보존 검증 1줄을 추가한다:
```ts
    expect(loaded?.sessionToken).toBe('tok')
```

- [ ] **Step 2: 시작 폼이 토큰 저장** (`app/page.tsx` `begin()` 내부)

```tsx
// 기존:
//   saveState(newState(json.sessionId, cleanName))
// 교체:
      saveState(newState(json.sessionId, cleanName, json.sessionToken))
```

- [ ] **Step 3: `RecordingItem`이 토큰 동봉** (`components/survey/RecordingItem.tsx`)

prop에 `sessionToken` 추가(구조분해·타입 모두), `upload()`의 FormData에 한 줄 추가:

```tsx
// prop 시그니처(Phase 1 형태에 sessionToken 추가):
export function RecordingItem({ item, sessionId, sessionToken, attemptCount, onSaved, onRecordingChange, onBusyChange }: {
  item: SurveyItem; sessionId: string; sessionToken: string; attemptCount: number; onSaved: () => void
  onRecordingChange?: (recording: boolean) => void
  onBusyChange?: (busy: boolean) => void
}) {
```

```tsx
// upload()의 FormData 구성부, fd.set('sessionId', sessionId) 아래에 추가:
      fd.set('sessionToken', sessionToken)
```

- [ ] **Step 4: `survey/page.tsx`가 토큰 전달** — `RecordingItem` 사용부에 prop 추가:

```tsx
        <RecordingItem key={item.code} item={item} sessionId={st.sessionId} sessionToken={st.sessionToken}
          attemptCount={st.recorded[item.code] ?? 0}
          onRecordingChange={setIsRecording} onBusyChange={setIsUploading}
          onSaved={() => patch(prev => ({ recorded: { ...prev.recorded, [item.code]: (prev.recorded[item.code] ?? 0) + 1 } }))} />
```

- [ ] **Step 5: 제출 요청에 토큰 동봉** (`app/review/page.tsx` `submit()`)

```tsx
// 기존 body:
//   body: JSON.stringify({ sessionId: st.sessionId, writing: st.writing, checklist: st.checklist }),
// 교체:
        body: JSON.stringify({ sessionId: st.sessionId, sessionToken: st.sessionToken, writing: st.writing, checklist: st.checklist }),
```

- [ ] **Step 6: 타입체크 + 회귀** — `npm run typecheck && npx vitest run` → PASS.

- [ ] **Step 7: 수동 검증(브라우저)** — `npm run dev`: 시작 폼 제출 → devtools Network에서 `POST /api/sessions` 응답에 `sessionToken` 존재 확인 → 녹음 업로드 `POST /api/recordings`의 FormData에 `sessionToken` 포함 → 정상 200. (localStorage `kodys-survey:{id}`에 `sessionToken` 저장 확인.)

- [ ] **Step 8: Commit**

```bash
git add lib/survey-state.ts app/page.tsx components/survey/RecordingItem.tsx app/survey/page.tsx app/review/page.tsx
git commit -m "feat(client): 세션 토큰 저장 + 녹음/제출 요청 동봉

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `POST /api/recordings` — 토큰 검증·MIME/매직바이트·총량 상한·고아 파일 방지

토큰 검증(401), MIME allowlist + 매직바이트(400), 세션당 녹음 상한(429)과 durationSec 상한(400)을 넣고, 저장 Content-Type를 서버가 고정하며, insert 실패 시 방금 올린 객체를 보상 정리한다. 원시 에러 노출 제거.

**Files:**
- Modify: `app/api/recordings/route.ts` (전체 재작성)
- Modify: `tests/recordings-route.test.ts`

**Interfaces:**
- Consumes: `verifySessionToken`(Task 2), `isAllowedAudioMime/sniffAudio/safeContentType`(Task 4), `countSessionRecordings/removeStorageObject/uploadRecording/insertRecording`(Task 3), `audioExt`, `env`, `itemByCode`.

- [ ] **Step 1: 테스트 갱신**

```ts
// tests/recordings-route.test.ts — 전체 교체
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))
vi.mock('@/lib/db', () => ({
  uploadRecording: vi.fn().mockResolvedValue(undefined),
  insertRecording: vi.fn().mockResolvedValue(undefined),
  countSessionRecordings: vi.fn().mockResolvedValue(0),
  removeStorageObject: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/recordings/route'
import * as db from '@/lib/db'
import { createSessionToken } from '@/lib/auth'

const SID = '11111111-1111-4111-8111-111111111111'
const WEBM = () => new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], { type: 'audio/webm' })
let TOKEN = ''

function makeReq(over: Record<string, string | Blob> = {}) {
  const fd = new FormData()
  fd.set('audio', WEBM(), 'audio')
  fd.set('sessionId', SID)
  fd.set('sessionToken', TOKEN)
  fd.set('itemCode', 'rw01')
  fd.set('attemptNo', '1')
  fd.set('durationSec', '3.20')
  for (const [k, v] of Object.entries(over)) fd.set(k, v)
  return new Request('http://x/api/recordings', { method: 'POST', body: fd })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(db.countSessionRecordings).mockResolvedValue(0)
  TOKEN = await createSessionToken(SID, 'test-secret')
})

describe('POST /api/recordings', () => {
  it('업로드 + 녹음 기록(서버 고정 Content-Type)', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.uploadRecording).toHaveBeenCalledWith(`${SID}/rw01_1.webm`, expect.any(Buffer), 'audio/webm')
    expect(db.insertRecording).toHaveBeenCalledWith({
      sessionId: SID, itemCode: 'rw01', attemptNo: 1, audioPath: `${SID}/rw01_1.webm`, durationSec: 3.2,
    })
  })
  it('토큰 없음/위조 401', async () => {
    expect((await POST(makeReq({ sessionToken: '' }))).status).toBe(401)
    expect((await POST(makeReq({ sessionToken: `${SID}.deadbeef` }))).status).toBe(401)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('오디오가 아닌 페이로드 400 (매직바이트)', async () => {
    const html = new Blob([new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c])], { type: 'audio/webm' })
    expect((await POST(makeReq({ audio: html }))).status).toBe(400)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('비허용 MIME 400', async () => {
    const badMime = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], { type: 'text/html' })
    expect((await POST(makeReq({ audio: badMime }))).status).toBe(400)
  })
  it('녹음 문항이 아닌 코드 400', async () => {
    expect((await POST(makeReq({ itemCode: 'ww01' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'zz99' }))).status).toBe(400)
  })
  it('sessionId가 UUID가 아니면 400', async () =>
    expect((await POST(makeReq({ sessionId: '../etc/passwd' }))).status).toBe(400))
  it('durationSec 비숫자·상한(120) 초과 400', async () => {
    expect((await POST(makeReq({ durationSec: 'abc' }))).status).toBe(400)
    expect((await POST(makeReq({ durationSec: '121' }))).status).toBe(400)
  })
  it('attemptNo 0 이하·상한(10) 초과 400', async () => {
    expect((await POST(makeReq({ attemptNo: '0' }))).status).toBe(400)
    expect((await POST(makeReq({ attemptNo: '11' }))).status).toBe(400)
  })
  it('5MB 초과 파일 413', async () => {
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'audio/webm' })
    expect((await POST(makeReq({ audio: big }))).status).toBe(413)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('세션당 녹음 상한 초과 429', async () => {
    vi.mocked(db.countSessionRecordings).mockResolvedValue(200)
    expect((await POST(makeReq())).status).toBe(429)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })
  it('업로드 실패 시 502, 기록 저장 안 함', async () => {
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    expect((await POST(makeReq())).status).toBe(502)
    expect(db.insertRecording).not.toHaveBeenCalled()
  })
  it('insert 실패 시 502 + 업로드 객체 보상 정리', async () => {
    vi.mocked(db.insertRecording).mockRejectedValueOnce(new Error('db down'))
    expect((await POST(makeReq())).status).toBe(502)
    expect(db.removeStorageObject).toHaveBeenCalledWith(`${SID}/rw01_1.webm`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/recordings-route.test.ts` → FAIL.

- [ ] **Step 3: Write implementation**

```ts
// app/api/recordings/route.ts — 전체 교체
import { NextResponse } from 'next/server'
import { insertRecording, uploadRecording, countSessionRecordings, removeStorageObject } from '@/lib/db'
import { audioExt } from '@/lib/audio-ext'
import { isAllowedAudioMime, sniffAudio, safeContentType } from '@/lib/audio-validate'
import { verifySessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { itemByCode } from '@/lib/items'

export const runtime = 'nodejs'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 5 * 1024 * 1024   // 스토리지 남용 방지
const MAX_ATTEMPTS = 10             // 문항당 재녹음 상한
const MAX_DURATION_SEC = 120        // numeric(5,2) 오버플로 방지 + 비정상 장시간 차단
const MAX_PER_SESSION = 200         // 세션당 총 녹음 상한(문항 18 × 재시도 10 + 여유)

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null)
  const audio = fd?.get('audio')
  const sessionId = String(fd?.get('sessionId') ?? '')
  const sessionToken = String(fd?.get('sessionToken') ?? '')
  const itemCode = String(fd?.get('itemCode') ?? '')
  const attemptNo = Number(fd?.get('attemptNo'))
  const durationSec = Number(fd?.get('durationSec') ?? 0)
  const item = itemByCode.get(itemCode)
  if (!(audio instanceof File) || !UUID_RE.test(sessionId) || !item || item.maxSec === 0
    || !Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > MAX_ATTEMPTS
    || !Number.isFinite(durationSec) || durationSec < 0 || durationSec > MAX_DURATION_SEC)
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })

  if (!(await verifySessionToken(sessionId, sessionToken, env('SESSION_SECRET'))))
    return NextResponse.json({ error: '유효하지 않은 세션입니다.' }, { status: 401 })

  if (audio.size > MAX_BYTES)
    return NextResponse.json({ error: '녹음 파일이 너무 큽니다.' }, { status: 413 })

  const bytes = new Uint8Array(await audio.arrayBuffer())
  const sniffed = sniffAudio(bytes)
  if (!isAllowedAudioMime(audio.type || '') || !sniffed)
    return NextResponse.json({ error: '오디오 파일만 업로드할 수 있습니다.' }, { status: 400 })

  const mime = safeContentType(sniffed)  // 클라이언트 MIME 불신 → 서버 고정값 저장
  const audioPath = `${sessionId}/${itemCode}_${attemptNo}.${audioExt(mime)}`

  try {
    if ((await countSessionRecordings(sessionId)) >= MAX_PER_SESSION)
      return NextResponse.json({ error: '녹음 개수 상한을 초과했습니다.' }, { status: 429 })
    await uploadRecording(audioPath, Buffer.from(bytes), mime)
    try {
      await insertRecording({ sessionId, itemCode, attemptNo, audioPath, durationSec })
    } catch (insertErr) {
      // 고아 파일 방지: DB insert 실패 시 방금 올린 객체 정리(정리 실패는 로그만).
      await removeStorageObject(audioPath).catch(err => console.error('[recordings] 보상 정리 실패', err))
      throw insertErr
    }
  } catch (e) {
    console.error('[recordings] 저장 실패', e)
    return NextResponse.json({ error: '녹음 저장에 실패했습니다.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/recordings-route.test.ts` → PASS.

- [ ] **Step 5: 타입체크 + 회귀** — `npm run typecheck && npx vitest run` → PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/recordings/route.ts tests/recordings-route.test.ts
git commit -m "fix(recordings-route): 토큰 검증·MIME/매직바이트·총량 상한·고아 파일 보상 정리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `POST /api/sessions/submit` — 토큰 검증·404·try/catch

토큰을 검증하고, `submitSession`이 0행이면 404(허위 성공 제거), DB 호출을 try/catch로 감싼다.

**Files:**
- Modify: `app/api/sessions/submit/route.ts`
- Modify: `tests/submit-route.test.ts`

**Interfaces:**
- Consumes: `submitSession`(Task 3, `Promise<number>`), `verifySessionToken`(Task 2), `env`.

- [ ] **Step 1: 테스트 갱신** (토큰 + env mock + 404 케이스)

```ts
// tests/submit-route.test.ts — 전체 교체
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))
vi.mock('@/lib/db', () => ({ submitSession: vi.fn().mockResolvedValue(1) }))

import { POST } from '@/app/api/sessions/submit/route'
import * as db from '@/lib/db'
import { createSessionToken } from '@/lib/auth'

const SID = 'sess-1'
let TOKEN = ''
const VALID = () => ({ sessionId: SID, sessionToken: TOKEN, writing: { ww01: true, ww02: false }, checklist: ['none'] })

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.mocked(db.submitSession).mockResolvedValue(1)
  TOKEN = await createSessionToken(SID, 'test-secret')
})

describe('POST /api/sessions/submit', () => {
  it('낱말쓰기 답 + 체크리스트 저장', async () => {
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1',
      [{ itemCode: 'ww01', canWrite: true }, { itemCode: 'ww02', canWrite: false }], ['none'])
  })
  it('답이 하나도 없어도 제출 가능', async () => {
    const res = await POST(makeReq({ sessionId: SID, sessionToken: TOKEN, writing: {}, checklist: [] }))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1', [], [])
  })
  it('존재하지 않는 세션 404 (허위 성공 제거)', async () => {
    vi.mocked(db.submitSession).mockResolvedValue(0)
    expect((await POST(makeReq(VALID()))).status).toBe(404)
  })
  it('토큰 없음/위조 401', async () => {
    expect((await POST(makeReq({ ...VALID(), sessionToken: '' }))).status).toBe(401)
    expect((await POST(makeReq({ ...VALID(), sessionToken: `${SID}.deadbeef` }))).status).toBe(401)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('미지 낱말쓰기 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID(), writing: { rw01: true } }))).status).toBe(400))
  it('불리언 아닌 답 400', async () =>
    expect((await POST(makeReq({ ...VALID(), writing: { ww01: '예' } }))).status).toBe(400))
  it('미지 체크리스트 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID(), checklist: ['unknown'] }))).status).toBe(400))
  it('sessionId 누락 400', async () =>
    expect((await POST(makeReq({ ...VALID(), sessionId: '' }))).status).toBe(400))
  it('본문 없음 400', async () =>
    expect((await POST(new Request('http://x', { method: 'POST', body: 'x' }))).status).toBe(400))
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/submit-route.test.ts` → FAIL.

- [ ] **Step 3: Write implementation**

```ts
// app/api/sessions/submit/route.ts — 전체 교체
import { NextResponse } from 'next/server'
import { submitSession, type WritingAnswer } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { AREA_CODES, WRITING_ITEMS } from '@/lib/items'

export const runtime = 'nodejs'

const WRITING_CODES = new Set(WRITING_ITEMS.map(i => i.code))
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  if (typeof b.sessionId !== 'string' || !b.sessionId) return bad('세션 정보가 없습니다.')
  if (typeof b.sessionToken !== 'string' || !b.sessionToken) return bad('세션 정보가 없습니다.')
  if (typeof b.writing !== 'object' || b.writing === null || Array.isArray(b.writing))
    return bad('낱말쓰기 답 형식 오류')
  const writing: WritingAnswer[] = []
  for (const [itemCode, canWrite] of Object.entries(b.writing)) {
    if (!WRITING_CODES.has(itemCode) || typeof canWrite !== 'boolean') return bad('낱말쓰기 답 형식 오류')
    writing.push({ itemCode, canWrite })
  }
  if (!Array.isArray(b.checklist) || b.checklist.some((c: unknown) => typeof c !== 'string' || !AREA_CODES.includes(c)))
    return bad('체크리스트 형식 오류')
  const checklist = [...new Set(b.checklist as string[])]

  if (!(await verifySessionToken(b.sessionId, b.sessionToken, env('SESSION_SECRET'))))
    return NextResponse.json({ error: '유효하지 않은 세션입니다.' }, { status: 401 })

  try {
    const affected = await submitSession(b.sessionId, writing, checklist)
    if (affected === 0)
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 })
  } catch (e) {
    console.error('[submit] 제출 실패', e)
    return NextResponse.json({ error: '제출에 실패했습니다.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/submit-route.test.ts` → PASS.

- [ ] **Step 5: 타입체크 + 회귀** — `npm run typecheck && npx vitest run` → PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/sessions/submit/route.ts tests/submit-route.test.ts
git commit -m "fix(submit-route): 토큰 검증 + 미존재 세션 404 + try/catch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: `POST /api/admin/login` — argon2id·신뢰 IP·전역 스로틀·nodejs 런타임

무염 SHA-256을 argon2id 검증으로 교체하고, 브루트포스 키를 플랫폼 주입 IP로 한정하며, IP 로테이션 완화용 전역 실패 임계를 추가한다. `hash-password` 스크립트도 argon2 해시 출력으로 갱신.

**Files:**
- Modify: `app/api/admin/login/route.ts` (전체 재작성)
- Modify: `scripts/hash-password.ts`
- Modify: `tests/login-route.test.ts`
- Modify: `README.md` (env 안내)
- (dep) `package.json`에 `"@node-rs/argon2": "2.0.2"` 추가

**Interfaces:**
- Consumes: `@node-rs/argon2`의 `verify`, `createToken`(Task 2), `isLoginLocked/recordLoginFailure/clearLoginFailures`(db), `env`.

- [ ] **Step 1: argon2 설치**

```bash
npm install @node-rs/argon2@2.0.2
npm ls @node-rs/argon2   # 2.0.2 + 플랫폼 프리빌트(optional) 확인
```

- [ ] **Step 2: 테스트 갱신** (argon2 해시 + 신뢰 IP 규칙)

```ts
// tests/login-route.test.ts — 전체 교체
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hash } from '@node-rs/argon2'

vi.mock('@/lib/db', () => ({
  isLoginLocked: vi.fn().mockResolvedValue(false),
  recordLoginFailure: vi.fn().mockResolvedValue(undefined),
  clearLoginFailures: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/env', () => ({ env: (k: string) => k === 'ADMIN_PASSWORD_HASH' ? HASH : 'secret' }))

import { POST } from '@/app/api/admin/login/route'
import * as db from '@/lib/db'

const PW = 'correct-horse'
let HASH = ''

function makeReq(password: unknown, headers: Record<string, string> = {}) {
  return new Request('http://x/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ password }),
  })
}

beforeEach(async () => {
  HASH = await hash(PW)                 // argon2id 인코딩 해시
  vi.clearAllMocks()
  vi.mocked(db.isLoginLocked).mockResolvedValue(false)
})

describe('POST /api/admin/login', () => {
  it('올바른 비번 → 200 + 쿠키 + 실패기록 초기화', async () => {
    const res = await POST(makeReq(PW, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('admin_token=')
    expect(db.clearLoginFailures).toHaveBeenCalledWith('1.2.3.4')
    expect(db.recordLoginFailure).not.toHaveBeenCalled()
  })
  it('틀린 비번 → 401 + 실패 기록', async () => {
    const res = await POST(makeReq('wrong', { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(401)
    expect(db.recordLoginFailure).toHaveBeenCalledWith('1.2.3.4', expect.any(Number))
  })
  it('빈 비번 → 401 + 실패 기록', async () => {
    expect((await POST(makeReq('', { 'x-real-ip': '9.9.9.9' }))).status).toBe(401)
    expect(db.recordLoginFailure).toHaveBeenCalledWith('9.9.9.9', expect.any(Number))
  })
  it('잠금 상태면 429 (비번 대조 전 차단)', async () => {
    vi.mocked(db.isLoginLocked).mockResolvedValue(true)
    const res = await POST(makeReq(PW, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(429)
    expect(db.clearLoginFailures).not.toHaveBeenCalled()
  })
  it('플랫폼 주입 x-real-ip 우선 사용', async () => {
    await POST(makeReq('wrong', { 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '5.5.5.5' }))
    expect(db.recordLoginFailure).toHaveBeenCalledWith('8.8.8.8', expect.any(Number))
  })
  it('x-real-ip 없으면 x-forwarded-for 마지막(신뢰) 홉', async () => {
    await POST(makeReq('wrong', { 'x-forwarded-for': '5.5.5.5, 10.0.0.1, 10.0.0.2' }))
    expect(db.recordLoginFailure).toHaveBeenCalledWith('10.0.0.2', expect.any(Number))
  })
})
```

- [ ] **Step 3: Run test to verify it fails** — `npx vitest run tests/login-route.test.ts` → FAIL.

- [ ] **Step 4: 로그인 라우트 재작성**

```ts
// app/api/admin/login/route.ts — 전체 교체
import { NextResponse } from 'next/server'
import { verify } from '@node-rs/argon2'
import { createToken, ADMIN_COOKIE } from '@/lib/auth'
import { clearLoginFailures, isLoginLocked, recordLoginFailure } from '@/lib/db'
import { env } from '@/lib/env'

export const runtime = 'nodejs' // @node-rs/argon2는 네이티브 바인딩 → Node 런타임 필수

const MAX_FAILS = 5
const LOCK_MS = 10 * 60_000
const GLOBAL_KEY = '__global__'   // IP 무관 누적 실패 버킷(IP 로테이션 공격 완화)
const GLOBAL_MAX_FAILS = 50

/** 브루트포스 키: 플랫폼(Vercel)이 주입하는 x-real-ip 우선(클라이언트 위조 불가).
 *  없으면 x-forwarded-for의 마지막(가장 신뢰 가능한) 홉. 둘 다 없으면 'local'.
 *  ※ x-forwarded-for 첫 IP는 클라이언트가 위조 가능하므로 키로 쓰지 않는다. */
function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const hops = req.headers.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean)
  return hops?.[hops.length - 1] ?? 'local'
}

export async function POST(req: Request) {
  const ip = clientIp(req)
  if ((await isLoginLocked(ip, MAX_FAILS)) || (await isLoginLocked(GLOBAL_KEY, GLOBAL_MAX_FAILS)))
    return NextResponse.json({ error: '시도가 너무 많습니다. 잠시 후 다시 시도하세요.' }, { status: 429 })

  const { password } = await req.json().catch(() => ({}))
  let ok = false
  if (typeof password === 'string' && password) {
    try { ok = await verify(env('ADMIN_PASSWORD_HASH'), password) } // 상수시간 비교는 argon2.verify 내장
    catch (e) { console.error('[login] 해시 검증 오류', e); ok = false }
  }
  if (!ok) {
    await recordLoginFailure(ip, LOCK_MS)
    await recordLoginFailure(GLOBAL_KEY, LOCK_MS)
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 })
  }
  await clearLoginFailures(ip)
  await clearLoginFailures(GLOBAL_KEY)
  const token = await createToken(env('SESSION_SECRET'))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600, // 토큰 TTL과 일치(8시간)
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
```

- [ ] **Step 5: `hash-password` 스크립트 갱신**

```ts
// scripts/hash-password.ts — argon2id 인코딩 해시 출력
import { hash } from '@node-rs/argon2'
const pw = process.argv[2]
if (!pw) { console.error('사용법: npm run hash-password -- <비밀번호>'); process.exit(1) }
console.log(await hash(pw)) // $argon2id$v=19$... 를 ADMIN_PASSWORD_HASH에 저장
```

- [ ] **Step 6: Run test to verify it passes** — `npx vitest run tests/login-route.test.ts` → PASS.

- [ ] **Step 7: README env 안내 갱신** — `README.md` 셋업의 `ADMIN_PASSWORD_HASH` 줄과 배포 항목을 argon2 기준으로 바꾼다:

```markdown
   - `ADMIN_PASSWORD_HASH`: `npm run hash-password -- '원하는비밀번호'` 출력값(argon2id 인코딩 해시 `$argon2id$v=19$...`)
```
그리고 "주의" 절 하단에 한 줄 추가:
```markdown
- 관리자 비밀번호는 argon2id(`@node-rs/argon2`)로 검증한다. 로그인 라우트는 네이티브 바인딩 때문에 `runtime='nodejs'`로 고정돼 있으며, Vercel 빌드는 플랫폼 프리빌트 바이너리를 자동 설치한다. 기존 SHA-256 해시는 무효이므로 `hash-password`로 재생성해 교체할 것.
```

- [ ] **Step 8: 타입체크 + 전체 회귀** — `npm run typecheck && npx vitest run` → PASS.

- [ ] **Step 9: Commit**

```bash
git add app/api/admin/login/route.ts scripts/hash-password.ts tests/login-route.test.ts package.json package-lock.json README.md
git commit -m "feat(admin-login): argon2id 해싱·신뢰 IP·전역 스로틀·nodejs 런타임

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: 마이그레이션 005(FK cascade·인덱스·원자적 RPC) + `listSessions` 상한

FK에 `ON DELETE CASCADE`를 추가하고 조회 인덱스와 원자적 실패기록 함수를 만든다(비파괴·재실행 안전). `listSessions`에 안전 상한을 둔다.

**Files:**
- Create: `supabase/migrations/005_cascade_and_indexes.sql`
- Modify: `lib/db.ts` (`listSessions` 상한)
- Modify: `README.md` (마이그레이션 실행 순서)

**Interfaces:** 없음(스키마·조회 방어).

- [ ] **Step 1: 마이그레이션 005 작성**

```sql
-- 005_cascade_and_indexes.sql — FK ON DELETE CASCADE + 조회 인덱스 + 원자적 로그인 실패기록 RPC.
-- 비파괴적·재실행 안전(idempotent). Supabase SQL Editor에서 직접 실행할 것.

-- 1) recordings.session_id FK 재정의 (세션 삭제 시 녹음 메타 자동 삭제)
alter table recordings drop constraint if exists recordings_session_id_fkey;
alter table recordings add constraint recordings_session_id_fkey
  foreign key (session_id) references sessions(id) on delete cascade;

-- 2) writing_answers.session_id FK 재정의
alter table writing_answers drop constraint if exists writing_answers_session_id_fkey;
alter table writing_answers add constraint writing_answers_session_id_fkey
  foreign key (session_id) references sessions(id) on delete cascade;

-- 3) 조회 인덱스 (세션 상세·목록 정렬)
create index if not exists recordings_session_id_idx      on recordings(session_id);
create index if not exists writing_answers_session_id_idx  on writing_answers(session_id);
create index if not exists sessions_started_at_idx         on sessions(started_at desc);

-- 4) 로그인 실패 원자적 증가(read-then-write 경쟁조건 제거). lib/db.recordLoginFailure가 rpc로 호출.
create or replace function record_login_failure(p_ip text, p_lock_ms bigint)
returns void language sql as $$
  insert into login_attempts (ip, fail_count, locked_until, updated_at)
  values (p_ip, 1, now() + (p_lock_ms::text || ' milliseconds')::interval, now())
  on conflict (ip) do update
    set fail_count   = login_attempts.fail_count + 1,
        locked_until = now() + (p_lock_ms::text || ' milliseconds')::interval,
        updated_at   = now();
$$;
```

- [ ] **Step 2: `listSessions` 안전 상한** (`lib/db.ts`) — 무한 성장 방어선. 상한 도달 시 경고 로그.

```ts
// lib/db.ts — listSessions 교체
const MAX_LIST_ROWS = 5000

export async function listSessions(): Promise<SessionListRow[]> {
  const { data, error } = await sb().from('sessions')
    .select(`${SESSION_COLS}, recordings(item_code), writing_answers(item_code)`)
    .order('started_at', { ascending: false })
    .limit(MAX_LIST_ROWS)
  fail(error)
  const rows = (data ?? []) as unknown as SessionListRow[]
  if (rows.length >= MAX_LIST_ROWS)
    console.warn(`[listSessions] 상한(${MAX_LIST_ROWS}) 도달 — 서버 페이지네이션 도입 검토 필요`)
  return rows
}
```

- [ ] **Step 3: README 마이그레이션 순서 갱신** — 셋업 2번 SQL 실행 순서에 005 추가:

```markdown
   `001_init.sql` → `003_kodys_redesign.sql` → `004_login_attempts.sql` → `005_cascade_and_indexes.sql`
   - `005`는 FK에 `ON DELETE CASCADE`를 추가하고(세션 삭제 시 녹음·낱말쓰기 자동 정리), 조회 인덱스와
     로그인 실패 원자적 증가 함수(`record_login_failure`)를 만든다. 비파괴적이며 재실행해도 안전하다.
```

- [ ] **Step 4: 타입체크 + 전체 회귀** — `npm run typecheck && npx vitest run` → PASS.

- [ ] **Step 5: 수동 적용 + E2E 확인**
  1. Supabase SQL Editor에서 `005_cascade_and_indexes.sql` 실행(에러 없음, 재실행해도 동일).
  2. `npm run dev` → 정상 아동 흐름(시작 → 마이크 → 녹음 → 제출)이 토큰 경유로 끝까지 200.
  3. 위조/누락 토큰으로 `POST /api/recordings`·`/submit` 호출 시 401 확인(devtools 또는 curl).
  4. 존재하지 않는 `sessionId`로 제출 시 404 확인.
  5. 관리자: `npm run hash-password`로 만든 argon2 해시를 `ADMIN_PASSWORD_HASH`에 넣고 로그인 성공/실패·잠금 확인.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/005_cascade_and_indexes.sql lib/db.ts README.md
git commit -m "feat(db): 마이그레이션 005(FK cascade·인덱스·원자적 RPC) + listSessions 상한

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검 결과)

**Spec coverage (항목 19~22):**
- **19 공개 엔드포인트 인증·검증** → 세션 토큰(Task 2) + `/api/sessions` 토큰 반환·zod·레이트리밋(Task 5) + 클라이언트 동봉(Task 6) + 녹음/제출 토큰 검증(Task 7·8) + 세션당 업로드 상한(Task 7) + 미존재 세션 404(Task 3·8). ✅
- **20 MIME/저장형 XSS** → allowlist + 매직바이트 + 서버 고정 Content-Type(Task 4) + 라우트 적용(Task 7). ✅
- **21 관리자 인증 강화** → argon2id(Task 9) + 상수시간 HMAC 비교(Task 2) + 신뢰 IP·전역 스로틀(Task 9) + 원자적 실패기록(Task 3 + RPC Task 10) + `runtime='nodejs'`(Task 9). ✅
- **22 데이터 정합성** → 고아 파일 보상 정리(Task 7) + FK cascade·`deleteSession`(Task 3·10) + 허위 성공 제거(Task 3·8) + 원시 에러 은닉(Task 5·7·8; 관리자 조회 라우트는 이미 `console` 미사용이나 문구는 일반화됨 — 필요 시 별도 처리) + 누락 try/catch(Task 5·8) + `listSessions` 상한(Task 10) + durationSec 상한(Task 7). ✅

**Placeholder scan:** 모든 코드 스텝에 실행 가능한 완전 코드 포함. "TBD/적절히 처리/유사" 없음. 클라이언트 파일(Task 6)은 node 테스트 불가로 typecheck + 명시적 수동 검증 스텝으로 대체(저장소 기존 방침 일치). db.ts(Task 3)는 supabase 스텁 하베스가 없어 라우트 테스트 경유 검증(기존 관행 준수). ✅

**Type consistency:**
- `sessionCreateSchema` 파싱 결과(name/schoolName 등 정규화된 string) → Task 5 라우트가 `createSession`의 `NewSessionInput`에 매핑, 필드명 일치. ✅
- `createSessionToken(sessionId, secret)`↔`verifySessionToken(sessionId, token, secret)` 토큰 형식 `${sessionId}.${hmac}` 동일, Task 5(발급)·6(저장/동봉)·7·8(검증)에서 동일 시그니처 소비. ✅
- `submitSession` 반환 `Promise<number>`(Task 3) ↔ Task 8이 `affected === 0`으로 소비. 테스트 mock도 `number` 반환. ✅
- `sniffAudio` 반환 `'webm'|'mp4'|'ogg'|null` ↔ `safeContentType(SniffedAudio)`·Task 7 소비 일치. `safeContentType`→`audioExt`로 파일 확장자 도출(webm→.webm, 테스트 기대 `rw01_1.webm`와 일치). ✅
- `recordLoginFailure(ip, lockMs)` 시그니처 Task 3(구현)↔Task 9(호출)↔RPC 파라미터(`p_ip,p_lock_ms`) 일치. ✅
- `SurveyState.sessionToken: string`(Task 6) ↔ `newState` 3번째 인자·`app/page.tsx` 전달·`RecordingItem`/`review` 소비 일치. ✅

**YAGNI 편차 명시 — 토큰 폐기(스펙 21 마지막 항목):** 스펙은 세션 토큰 payload에 `jti`(nonce) + **서버 측 유효 nonce 저장소(테이블 또는 "현재 유효 세대" 값)**를 두어 "모든 세션 로그아웃"을 지원하자고 제안한다. 본 플랜은 **단일 공유 관리자 신원** 전제에서 이를 의도적으로 축소했다:
- DB 기반 nonce/세대 테이블 + 미들웨어 DB 조회는 **과설계**이며 Edge 미들웨어에서 매 요청 DB 왕복 비용을 유발한다(현행은 순수 HMAC 검증만으로 Edge에서 동작).
- 대신 관리자 토큰에 짧은 랜덤 `jti`를 실어 **유일성**만 확보하고(Task 2), 상수시간 HMAC 검증을 유지한다.
- **폐기(revocation) 메커니즘은 `SESSION_SECRET` 회전**이다: 시크릿을 바꾸면 기존 모든 토큰의 HMAC이 무효화되어 전원 재로그인이 강제된다. 여기에 **TTL을 12시간 → 8시간으로 단축**해 노출 창을 줄였다. per-admin 세션 목록·개별 폐기는 스코프 외.
- 이는 스펙의 "최소 구현: 전역 세대 값" 취지와 정렬되되, **런타임 상태 없이(무상태 HMAC + 시크릿 회전)** 동일한 "전원 로그아웃" 효과를 얻는 선택이다.

**남은 주의(구현자 참고):**
- `@node-rs/argon2`는 네이티브 애드온이라 로컬·CI·Vercel의 플랫폼별 프리빌트(optionalDependencies)가 lockfile에 잡혀야 한다(`npm ls @node-rs/argon2`로 확인). Vercel은 linux-x64-gnu 변형을 빌드 시 설치한다.
- `/api/sessions` 레이트리밋은 인메모리라 서버리스에서 인스턴스별 best-effort다(전역 강제 아님). 강한 전역 방어가 필요해지면 로그인의 `login_attempts` 패턴을 재사용해 DB 기반으로 승격한다 — 이번 스코프에서는 PII 스팸 완화용으로 충분하다고 판단.
- 원자적 증가는 raw SQL 대신 **Postgres 함수(RPC)** 로 구현했다(Supabase JS 유창 API로 `col = col + 1`을 표현 불가). RPC는 마이그레이션 005에 정의되므로, Task 3 배포 시점과 005 적용 시점 사이에는 로그인 실패기록이 동작하지 않는다 — 005를 관리자 인증 변경과 함께 적용할 것.
