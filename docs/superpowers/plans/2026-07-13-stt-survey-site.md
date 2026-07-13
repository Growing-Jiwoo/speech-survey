# 아동 STT 발화 설문 사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아동이 화면의 영어 문장을 읽으면 녹음→Azure STT 변환→결과 표시하고, 모든 시도를 Supabase에 저장하며 관리자가 조회/청취/CSV 다운로드하는 설문 사이트 (로컬 실행).

**Architecture:** Next.js 16 App Router 단일 프로젝트. 클라이언트는 MediaRecorder로 녹음 후 `/api/transcribe`에 업로드, 서버가 Storage 저장→포맷 변환(ffmpeg-static)→Azure Short Audio REST 호출→attempt 기록. 모든 키는 서버 전용. 관리자 화면은 서버 컴포넌트가 DB를 직접 조회(HMAC 쿠키 보호).

**Tech Stack:** Next.js 16.2.10 / React 19.2.7 / TypeScript 7.0.2(네이티브 tsgo 유지) / Tailwind CSS 4.3.2 / @supabase/supabase-js 2.110.2 / ffmpeg-static 5.3.0 / Vitest 4.1.10 / Node 22

**TypeScript 7 결정 (Task 3-6 중 확정):** TS7(tsgo)을 유지한다. Next 16의 빌드 내장 타입체크는 클래식 TS 컴파일러 API에 의존해 TS7과 비호환(build 크래시) → `next.config.ts`에 `typescript.ignoreBuildErrors=true` 설정해 Next 타입체크를 끄고, 타입 안전성은 `npm run typecheck`(=`tsc --noEmit`, tsgo)로 분리 보장한다. **검증 시 항상 `npm run typecheck`를 함께 실행할 것.** (package.json에 `type: module`도 추가됨 — tsx 스크립트 top-level await용.)

**Spec:** `docs/superpowers/specs/2026-07-13-stt-survey-site-design.md`

**스펙 보정 2건 (구현 중 스펙 문서도 함께 수정):**
1. `responses.status`에 `'in_progress'` 추가 — 첫 시도가 실패(빈 STT)인 상태를 표현하려면 필요 (Task 2에서 스펙 §5 SQL 동기화).
2. 관리자 목록/상세는 별도 GET API 대신 서버 컴포넌트가 db 함수를 직접 호출 (DRY). API는 login/export만 유지 (Task 13에서 스펙 §6 동기화).

**사전 준비물 (Task 3 전에 사용자에게 요청):** Azure Speech 키+리전, Supabase URL+service role 키, 관리자 비밀번호.

---

## File Structure

```
kids-speech-survey/
├─ package.json / tsconfig.json / next.config.ts / postcss.config.mjs / vitest.config.ts
├─ .env.local.example            # 환경변수 템플릿 (실제 값은 .env.local, git 제외)
├─ middleware.ts                 # /admin, /api/admin 보호
├─ app/
│  ├─ layout.tsx  globals.css    # Jua 폰트, 파스텔 테마
│  ├─ page.tsx                   # ① 시작(이름/나이)
│  ├─ survey/page.tsx            # ② 마이크 테스트 + ③ 문항 30개 (클라이언트 상태 머신)
│  ├─ done/page.tsx              # ④ 완료
│  ├─ admin/login/page.tsx  admin/page.tsx  admin/[id]/page.tsx
│  └─ api/
│     ├─ sessions/route.ts  sessions/complete/route.ts
│     ├─ transcribe/route.ts  responses/skip/route.ts
│     └─ admin/login/route.ts  admin/export/route.ts
├─ components/ ProgressBar.tsx  LevelMeter.tsx  RecordButton.tsx
├─ hooks/ useRecorder.ts
├─ lib/
│  ├─ env.ts          # 환경변수 접근(누락 시 명확한 에러)
│  ├─ supabase.ts     # service role 클라이언트 (서버 전용)
│  ├─ db.ts           # 모든 DB/Storage 접근 함수 (라우트·서버컴포넌트 공용)
│  ├─ azure-stt.ts    # Short Audio 호출 + 응답 파싱
│  ├─ audio-convert.ts# webm→ogg / mp4→wav (ffmpeg-static)
│  ├─ auth.ts         # HMAC 토큰 (Web Crypto — middleware/node 겸용)
│  └─ csv.ts          # CSV 생성 (BOM, 이스케이프)
├─ supabase/ migrations/001_init.sql  seed/questions.ts
├─ scripts/ seed.ts  smoke-azure.ts  hash-password.ts
└─ tests/ (lib 단위 + transcribe 라우트 통합)
```

---

### Task 1: 프로젝트 스캐폴딩

**Files:** Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.local.example`, `app/layout.tsx`, `app/globals.css`, `lib/env.ts`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "kids-speech-survey",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "seed": "tsx scripts/seed.ts",
    "smoke:azure": "tsx scripts/smoke-azure.ts",
    "hash-password": "tsx scripts/hash-password.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "2.110.2",
    "ffmpeg-static": "5.3.0",
    "next": "16.2.10",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.2",
    "@types/node": "^22",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "tailwindcss": "4.3.2",
    "tsx": "^4",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 2: 설정 파일 작성**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = {}
export default nextConfig
```

`postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
})
```

`.env.local.example`:
```bash
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=koreacentral
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_PASSWORD_HASH=   # npm run hash-password -- '비밀번호' 출력값
SESSION_SECRET=        # openssl rand -hex 32
```

- [ ] **Step 3: 레이아웃 + 전역 스타일 (아기자기 테마)**

`app/globals.css`:
```css
@import "tailwindcss";

@theme {
  --color-cream: #fff8f0;
  --color-peach: #ffd9c0;
  --color-peach-deep: #ff9e7d;
  --color-mint: #bde8ca;
  --color-sky: #bfdcf7;
  --color-berry: #f49cbb;
  --color-ink: #4a4458;
  --font-cute: var(--font-jua), sans-serif;
}

body { background: var(--color-cream); color: var(--color-ink); font-family: var(--font-cute); }
```

`app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Jua } from 'next/font/google'
import './globals.css'

const jua = Jua({ weight: '400', subsets: ['latin'], variable: '--font-jua' })

export const metadata: Metadata = { title: '말하기 설문', description: '문장을 읽어보아요' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${jua.variable} min-h-dvh`}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: lib/env.ts**

```ts
export function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`환경변수 ${name}가 설정되지 않았습니다 (.env.local 확인)`)
  return v
}
```

- [ ] **Step 5: 설치 및 기동 확인**

Run: `npm install` → 성공 (peer 충돌 시 TypeScript를 `npm i -D typescript@5.9`로 폴백하고 스펙 §4에 기록)
Run: `npm run dev` 후 `curl -s localhost:3000 | head -5` → HTML 응답 (app/page.tsx는 Task 9에서 작성하므로 기본 404여도 서버 기동만 확인)
임시로 `app/page.tsx`에 `export default function Home(){return <main>ok</main>}` 를 두어 기동 확인해도 된다(Task 9에서 교체).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: Next.js 16 스캐폴딩 (Tailwind 4, Vitest, 파스텔 테마)"
```

---

### Task 2: DB 마이그레이션 + 문항 시드

**Files:** Create: `supabase/migrations/001_init.sql`, `supabase/seed/questions.ts`, `scripts/seed.ts`, `tests/questions.test.ts`. Modify: 스펙 §5(status에 in_progress 추가)

- [ ] **Step 1: 마이그레이션 SQL**

`supabase/migrations/001_init.sql`:
```sql
create table questions (
  id          serial primary key,
  order_no    int  not null unique,
  text        text not null,
  difficulty  text not null check (difficulty in ('easy','medium','hard'))
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  child_name   text not null,
  child_age    int  not null check (child_age between 3 and 19),
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table responses (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(id),
  question_id      int  not null references questions(id),
  status           text not null check (status in ('in_progress','completed','skipped')),
  retry_count      int  not null default 0,
  final_attempt_id uuid,
  unique (session_id, question_id)
);

create table attempts (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references responses(id),
  attempt_no   int  not null,
  stt_text     text not null default '',
  audio_path   text not null,
  duration_sec numeric(5,2),
  created_at   timestamptz not null default now(),
  unique (response_id, attempt_no)
);

alter table questions enable row level security;
alter table sessions  enable row level security;
alter table responses enable row level security;
alter table attempts  enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근.

insert into storage.buckets (id, name, public) values ('recordings','recordings', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: 문항 시드 파일 (스펙 §11 그대로)**

`supabase/seed/questions.ts`:
```ts
export type Difficulty = 'easy' | 'medium' | 'hard'
export interface SeedQuestion { orderNo: number; text: string; difficulty: Difficulty }

const easy = [
  'I like apples.', 'The dog is big.', 'She has a cat.', 'We can run fast.',
  'It is sunny today.', 'I see a bird.', 'He is my friend.', 'The ball is red.',
  'I love my mom.', 'Look at the moon.',
]
const medium = [
  'The cat is sleeping on the sofa.', 'I want to play with my friends.',
  'My brother is reading a funny book.', 'We are going to the zoo today.',
  'She likes to draw pictures at school.', 'The bird is singing in the tree.',
  'Can I have some milk, please?', 'My father drives a blue car.',
  'We eat breakfast together every morning.', 'The children are playing in the park.',
]
const hard = [
  'Yesterday I went to the park with my best friend.',
  'My sister baked delicious cookies for the whole family.',
  'The students are learning how to swim at school.',
  'When it rains, we stay inside and play games.',
  'My grandmother told me an interesting story last night.',
  'The brave firefighter rescued a small kitten from the tree.',
  'We visited the museum and saw many old paintings.',
  'After dinner, I always brush my teeth before bed.',
  'The beautiful butterfly landed softly on the yellow flower.',
  'Tomorrow we will travel to the beach with our family.',
]

export const QUESTIONS: SeedQuestion[] = [
  ...easy.map((text, i) => ({ orderNo: i + 1, text, difficulty: 'easy' as const })),
  ...medium.map((text, i) => ({ orderNo: i + 11, text, difficulty: 'medium' as const })),
  ...hard.map((text, i) => ({ orderNo: i + 21, text, difficulty: 'hard' as const })),
]
```

- [ ] **Step 3: 시드 무결성 실패 테스트 작성**

`tests/questions.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { QUESTIONS } from '@/supabase/seed/questions'

describe('questions seed', () => {
  it('30문항, order_no 1..30 유일', () => {
    expect(QUESTIONS).toHaveLength(30)
    expect(new Set(QUESTIONS.map(q => q.orderNo)).size).toBe(30)
    expect(Math.min(...QUESTIONS.map(q => q.orderNo))).toBe(1)
    expect(Math.max(...QUESTIONS.map(q => q.orderNo))).toBe(30)
  })
  it('난이도 10/10/10, 배치 easy→medium→hard', () => {
    const d = (lo: number, hi: number) => QUESTIONS.filter(q => q.orderNo >= lo && q.orderNo <= hi)
    expect(d(1, 10).every(q => q.difficulty === 'easy')).toBe(true)
    expect(d(11, 20).every(q => q.difficulty === 'medium')).toBe(true)
    expect(d(21, 30).every(q => q.difficulty === 'hard')).toBe(true)
  })
  it('빈 문장 없음', () => {
    expect(QUESTIONS.every(q => q.text.trim().length >= 3)).toBe(true)
  })
})
```

Run: `npx vitest run tests/questions.test.ts` → PASS (시드 파일을 Step 2에서 이미 작성했으므로 통과 — 순서 주의: 테스트를 먼저 쓰고 시드를 쓰는 대신 여기선 데이터 검증이 목적)

- [ ] **Step 4: 시드 주입 스크립트**

`scripts/seed.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import { QUESTIONS } from '../supabase/seed/questions'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요'); process.exit(1) }

const sb = createClient(url, key)
const rows = QUESTIONS.map(q => ({ order_no: q.orderNo, text: q.text, difficulty: q.difficulty }))
const { error } = await sb.from('questions').upsert(rows, { onConflict: 'order_no' })
if (error) { console.error(error.message); process.exit(1) }
console.log(`questions ${rows.length}건 시드 완료`)
```

`.env.local` 로드를 위해 실행은 `npx tsx --env-file=.env.local scripts/seed.ts` 형태를 쓴다. package.json의 seed 스크립트를 다음으로 교체:
```json
"seed": "tsx --env-file=.env.local scripts/seed.ts"
```
(같은 방식을 `smoke:azure`에도 적용: `"smoke:azure": "tsx --env-file=.env.local scripts/smoke-azure.ts"`)

- [ ] **Step 5: 스펙 §5 동기화**

스펙 파일 §5의 responses 정의에서 `check (status in ('completed','skipped'))` 를
`check (status in ('in_progress','completed','skipped'))` 로 수정하고 아래 주석을 추가:
`-- in_progress: 시도는 있으나 성공(비어있지 않은 STT)이 아직 없는 상태`

- [ ] **Step 6: 사용자에게 Supabase 셋업 안내 (블로킹 아님, Task 8 수동 검증 전까지만 완료되면 됨)**

사용자에게 요청: Supabase 프로젝트 생성 → SQL Editor에서 `001_init.sql` 실행 → URL/service role 키를 `.env.local`에 기입 → `npm run seed` 실행.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: DB 마이그레이션 + 30문항 시드 + 무결성 테스트"
```

---

### Task 3: lib/auth.ts — 관리자 토큰 (TDD)

**Files:** Create: `lib/auth.ts`, `tests/auth.test.ts`, `scripts/hash-password.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createToken, verifyToken, sha256Hex } from '@/lib/auth'

const SECRET = 'test-secret'

describe('auth token', () => {
  it('발급한 토큰은 검증 통과', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t, SECRET)).toBe(true)
  })
  it('만료된 토큰은 실패', async () => {
    const t = await createToken(SECRET, -1)
    expect(await verifyToken(t, SECRET)).toBe(false)
  })
  it('변조된 토큰은 실패', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t + 'x', SECRET)).toBe(false)
    expect(await verifyToken('9999999999999.' + t.split('.')[1], SECRET)).toBe(false)
  })
  it('다른 시크릿이면 실패', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t, 'other')).toBe(false)
  })
  it('sha256Hex는 알려진 값과 일치', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/auth.test.ts` → FAIL (`Cannot find module '@/lib/auth'`)

- [ ] **Step 3: 구현 (Web Crypto — middleware 엣지/노드 겸용)**

`lib/auth.ts`:
```ts
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

/** 토큰 형식: `${만료ms}.${HMAC(만료ms)}` */
export async function createToken(secret: string, ttlMs = 12 * 3600_000): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  return `${exp}.${await hmacHex(exp, secret)}`
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const [exp, sig] = token.split('.')
  if (!exp || !sig) return false
  if (Number(exp) < Date.now()) return false
  return (await hmacHex(exp, secret)) === sig
}

export const ADMIN_COOKIE = 'admin_token'
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/auth.test.ts` → PASS (5 tests)

- [ ] **Step 5: 비밀번호 해시 생성 스크립트**

`scripts/hash-password.ts`:
```ts
import { sha256Hex } from '../lib/auth'
const pw = process.argv[2]
if (!pw) { console.error('사용법: npm run hash-password -- <비밀번호>'); process.exit(1) }
console.log(await sha256Hex(pw))
```

Run: `npx tsx scripts/hash-password.ts test123` → 64자리 hex 출력 확인

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: HMAC 관리자 토큰 + 비밀번호 해시 (TDD)"
```

---

### Task 4: lib/csv.ts (TDD)

**Files:** Create: `lib/csv.ts`, `tests/csv.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildCsv } from '@/lib/csv'

describe('buildCsv', () => {
  it('BOM으로 시작하고 헤더+행을 CRLF로 연결', () => {
    const out = buildCsv(['a', 'b'], [['1', '2'], ['3', '4']])
    expect(out.startsWith('﻿')).toBe(true)
    expect(out).toBe('﻿a,b\r\n1,2\r\n3,4')
  })
  it('쉼표·따옴표·개행 이스케이프', () => {
    const out = buildCsv(['x'], [['hi, "kid"\nline']])
    expect(out).toBe('﻿x\r\n"hi, ""kid""\nline"')
  })
  it('null/undefined는 빈 칸', () => {
    expect(buildCsv(['x', 'y'], [[null, undefined]])).toBe('﻿x,y\r\n,')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/csv.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`lib/csv.ts`:
```ts
type Cell = string | number | boolean | null | undefined

function escape(c: Cell): string {
  if (c === null || c === undefined) return ''
  const s = String(c)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildCsv(header: string[], rows: Cell[][]): string {
  const lines = [header, ...rows].map(r => r.map(escape).join(','))
  return '﻿' + lines.join('\r\n')
}
```

- [ ] **Step 4: 통과 확인 + Commit**

Run: `npx vitest run tests/csv.test.ts` → PASS
```bash
git add -A && git commit -m "feat: CSV 빌더 (BOM, 이스케이프) TDD"
```

---

### Task 5: lib/azure-stt.ts (TDD)

**Files:** Create: `lib/azure-stt.ts`, `tests/azure-stt.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/azure-stt.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseAzureResponse, transcribeShortAudio } from '@/lib/azure-stt'

afterEach(() => vi.unstubAllGlobals())

describe('parseAzureResponse', () => {
  it('Success면 DisplayText 반환', () => {
    expect(parseAzureResponse({ RecognitionStatus: 'Success', DisplayText: 'I like apples.' })).toBe('I like apples.')
  })
  it('NoMatch/InitialSilenceTimeout이면 빈 문자열', () => {
    expect(parseAzureResponse({ RecognitionStatus: 'NoMatch' })).toBe('')
    expect(parseAzureResponse({ RecognitionStatus: 'InitialSilenceTimeout' })).toBe('')
  })
  it('형식이 이상하면 빈 문자열', () => {
    expect(parseAzureResponse(null)).toBe('')
    expect(parseAzureResponse({})).toBe('')
  })
})

describe('transcribeShortAudio', () => {
  it('엔드포인트·헤더 올바르게 호출하고 텍스트 반환', async () => {
    process.env.AZURE_SPEECH_KEY = 'k'
    process.env.AZURE_SPEECH_REGION = 'koreacentral'
    const mock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ RecognitionStatus: 'Success', DisplayText: 'hello' }), { status: 200 }))
    vi.stubGlobal('fetch', mock)
    const text = await transcribeShortAudio(Buffer.from('xx'), 'audio/wav')
    expect(text).toBe('hello')
    const [url, init] = mock.mock.calls[0]
    expect(String(url)).toBe('https://koreacentral.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple')
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('k')
    expect(init.headers['Content-Type']).toBe('audio/wav')
  })
  it('HTTP 에러면 예외', async () => {
    process.env.AZURE_SPEECH_KEY = 'k'
    process.env.AZURE_SPEECH_REGION = 'koreacentral'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 401 })))
    await expect(transcribeShortAudio(Buffer.from('xx'), 'audio/wav')).rejects.toThrow('Azure STT 401')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/azure-stt.test.ts` → FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`lib/azure-stt.ts`:
```ts
import { env } from './env'

export function parseAzureResponse(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const o = json as Record<string, unknown>
  if (o.RecognitionStatus !== 'Success') return ''
  return typeof o.DisplayText === 'string' ? o.DisplayText : ''
}

export type AzureContentType = 'audio/wav' | 'audio/ogg; codecs=opus'

export async function transcribeShortAudio(audio: Buffer, contentType: AzureContentType): Promise<string> {
  const region = env('AZURE_SPEECH_REGION')
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': env('AZURE_SPEECH_KEY'), 'Content-Type': contentType, Accept: 'application/json' },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Azure STT ${res.status}: ${await res.text()}`)
  return parseAzureResponse(await res.json())
}
```

- [ ] **Step 4: 통과 확인 + Commit**

Run: `npx vitest run tests/azure-stt.test.ts` → PASS
```bash
git add -A && git commit -m "feat: Azure Short Audio STT 클라이언트 (TDD)"
```

---

### Task 6: lib/audio-convert.ts (TDD — 라우팅 로직만 단위, 변환은 스모크)

**Files:** Create: `lib/audio-convert.ts`, `tests/audio-convert.test.ts`

- [ ] **Step 1: 실패 테스트 작성 (순수 함수 pickConversion)**

`tests/audio-convert.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pickConversion } from '@/lib/audio-convert'

describe('pickConversion', () => {
  it('webm/ogg(opus)는 ogg 컨테이너 재포장(코덱 복사)', () => {
    expect(pickConversion('audio/webm;codecs=opus')).toEqual({ args: ['-c:a', 'copy', '-f', 'ogg'], contentType: 'audio/ogg; codecs=opus', ext: 'webm' })
    expect(pickConversion('audio/webm')).toEqual({ args: ['-c:a', 'copy', '-f', 'ogg'], contentType: 'audio/ogg; codecs=opus', ext: 'webm' })
  })
  it('mp4(aac)는 16kHz mono wav로 트랜스코딩', () => {
    expect(pickConversion('audio/mp4')).toEqual({ args: ['-ac', '1', '-ar', '16000', '-f', 'wav'], contentType: 'audio/wav', ext: 'mp4' })
  })
  it('알 수 없는 타입도 wav 폴백', () => {
    expect(pickConversion('application/octet-stream').contentType).toBe('audio/wav')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/audio-convert.test.ts` → FAIL

- [ ] **Step 3: 구현**

`lib/audio-convert.ts`:
```ts
import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import type { AzureContentType } from './azure-stt'

export interface Conversion { args: string[]; contentType: AzureContentType; ext: string }

export function pickConversion(mime: string): Conversion {
  if (mime.startsWith('audio/webm') || mime.startsWith('audio/ogg'))
    return { args: ['-c:a', 'copy', '-f', 'ogg'], contentType: 'audio/ogg; codecs=opus', ext: 'webm' }
  if (mime.startsWith('audio/mp4') || mime.startsWith('audio/aac') || mime.startsWith('audio/m4a'))
    return { args: ['-ac', '1', '-ar', '16000', '-f', 'wav'], contentType: 'audio/wav', ext: 'mp4' }
  return { args: ['-ac', '1', '-ar', '16000', '-f', 'wav'], contentType: 'audio/wav', ext: 'bin' }
}

/** 입력 버퍼를 Azure가 받는 포맷으로 변환. stdin→stdout 파이프, 파일 미사용. */
export async function toAzureFormat(input: Buffer, mime: string): Promise<{ data: Buffer; contentType: AzureContentType }> {
  const conv = pickConversion(mime)
  const bin = ffmpegPath as unknown as string
  if (!bin) throw new Error('ffmpeg-static 바이너리를 찾을 수 없습니다')
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...conv.args, 'pipe:1'])
    const out: Buffer[] = []; const err: Buffer[] = []
    p.stdout.on('data', d => out.push(d))
    p.stderr.on('data', d => err.push(d))
    p.on('error', reject)
    p.on('close', code => code === 0
      ? resolve({ data: Buffer.concat(out), contentType: conv.contentType })
      : reject(new Error(`ffmpeg 실패(${code}): ${Buffer.concat(err).toString().slice(0, 300)}`)))
    p.stdin.on('error', () => {}) // EPIPE 무시(ffmpeg 조기 종료 시)
    p.stdin.end(input)
  })
}
```

- [ ] **Step 4: 통과 확인 + 실변환 스모크 (로컬 1회)**

Run: `npx vitest run tests/audio-convert.test.ts` → PASS
Run (실변환 확인):
```bash
npx tsx -e "
import { toAzureFormat } from './lib/audio-convert';
import { execSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
execSync(\`\${ffmpegPath} -y -f lavfi -i sine=frequency=440:duration=1 -c:a libopus /tmp/t.webm\`);
import { readFileSync } from 'node:fs';
const r = await toAzureFormat(readFileSync('/tmp/t.webm'), 'audio/webm;codecs=opus');
console.log('ok', r.contentType, r.data.length);
"
```
Expected: `ok audio/ogg; codecs=opus <양수>`

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ffmpeg 오디오 변환 (webm→ogg 재포장, mp4→wav)"
```

---

### Task 7: lib/supabase.ts + lib/db.ts

**Files:** Create: `lib/supabase.ts`, `lib/db.ts`

DB 접근은 모두 이 파일로 모은다(라우트·서버 컴포넌트 공용). 100명 규모라 조인·집계는 JS에서 처리해도 충분하다. 단위 테스트는 없고(얇은 I/O 계층) Task 8/13의 라우트 테스트에서 목으로 검증한다.

- [ ] **Step 1: 클라이언트**

`lib/supabase.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env'

let client: SupabaseClient | null = null
/** 서버 전용. 클라이언트 컴포넌트에서 import 금지. */
export function sb(): SupabaseClient {
  client ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
  return client
}
```

- [ ] **Step 2: db 함수들**

`lib/db.ts`:
```ts
import { sb } from './supabase'

export interface Question { id: number; order_no: number; text: string; difficulty: string }

const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message) }

export async function listQuestions(): Promise<Question[]> {
  const { data, error } = await sb().from('questions').select('*').order('order_no')
  fail(error)
  return data!
}

export async function createSession(name: string, age: number): Promise<string> {
  const { data, error } = await sb().from('sessions')
    .insert({ child_name: name, child_age: age }).select('id').single()
  fail(error)
  return data!.id
}

export async function completeSession(sessionId: string): Promise<void> {
  const { error } = await sb().from('sessions')
    .update({ completed_at: new Date().toISOString() }).eq('id', sessionId)
  fail(error)
}

/** 응답 행이 없으면 in_progress로 생성하고 id 반환 */
export async function getOrCreateResponse(sessionId: string, questionId: number): Promise<string> {
  const { data } = await sb().from('responses').select('id')
    .eq('session_id', sessionId).eq('question_id', questionId).maybeSingle()
  if (data) return data.id
  const { data: ins, error } = await sb().from('responses')
    .insert({ session_id: sessionId, question_id: questionId, status: 'in_progress' })
    .select('id').single()
  fail(error)
  return ins!.id
}

export async function insertAttempt(a: {
  responseId: string; attemptNo: number; sttText: string; audioPath: string; durationSec: number
}): Promise<string> {
  const { data, error } = await sb().from('attempts').insert({
    response_id: a.responseId, attempt_no: a.attemptNo, stt_text: a.sttText,
    audio_path: a.audioPath, duration_sec: a.durationSec,
  }).select('id').single()
  fail(error)
  const patch: Record<string, unknown> = { retry_count: a.attemptNo }
  if (a.sttText.trim()) { patch.status = 'completed'; patch.final_attempt_id = data!.id }
  const { error: e2 } = await sb().from('responses').update(patch).eq('id', a.responseId)
  fail(e2)
  return data!.id
}

export async function markSkipped(sessionId: string, questionId: number): Promise<void> {
  const id = await getOrCreateResponse(sessionId, questionId)
  const { error } = await sb().from('responses')
    .update({ status: 'skipped', final_attempt_id: null }).eq('id', id)
  fail(error)
}

export async function uploadRecording(path: string, bytes: Buffer, mime: string): Promise<void> {
  const doUpload = () => sb().storage.from('recordings')
    .upload(path, bytes, { contentType: mime, upsert: true })
  let { error } = await doUpload()
  if (error) ({ error } = await doUpload()) // 1회 자동 재시도
  if (error) throw new Error(`녹음 업로드 실패: ${error.message}`)
}

export async function signedAudioUrl(path: string): Promise<string> {
  const { data, error } = await sb().storage.from('recordings').createSignedUrl(path, 3600)
  fail(error)
  return data!.signedUrl
}

// ---------- 관리자 조회 ----------

export interface SessionRow {
  id: string; child_name: string; child_age: number
  started_at: string; completed_at: string | null
  responses: { status: string }[]
}

export async function listSessions(): Promise<SessionRow[]> {
  const { data, error } = await sb().from('sessions')
    .select('id, child_name, child_age, started_at, completed_at, responses(status)')
    .order('started_at', { ascending: false })
  fail(error)
  return data as unknown as SessionRow[]
}

export interface AttemptRow { id: string; attempt_no: number; stt_text: string; audio_path: string; duration_sec: number | null; created_at: string }
export interface DetailRow {
  question: Question
  status: 'none' | 'in_progress' | 'completed' | 'skipped'
  retryCount: number
  finalAttemptId: string | null
  attempts: AttemptRow[]
}

export async function sessionDetail(sessionId: string): Promise<{ session: SessionRow; rows: DetailRow[] }> {
  const [{ data: s, error: e1 }, questions, { data: resps, error: e2 }] = await Promise.all([
    sb().from('sessions').select('*').eq('id', sessionId).single(),
    listQuestions(),
    sb().from('responses')
      .select('id, question_id, status, retry_count, final_attempt_id, attempts(id, attempt_no, stt_text, audio_path, duration_sec, created_at)')
      .eq('session_id', sessionId),
  ])
  fail(e1); fail(e2)
  const byQ = new Map((resps ?? []).map(r => [r.question_id, r]))
  const rows: DetailRow[] = questions.map(question => {
    const r = byQ.get(question.id)
    return {
      question,
      status: (r?.status ?? 'none') as DetailRow['status'],
      retryCount: r?.retry_count ?? 0,
      finalAttemptId: r?.final_attempt_id ?? null,
      attempts: ((r?.attempts ?? []) as AttemptRow[]).sort((a, b) => a.attempt_no - b.attempt_no),
    }
  })
  return { session: s as unknown as SessionRow, rows }
}

/** CSV용: 전체 시도 플랫 조회 (1행=1시도) */
export async function exportRows() {
  const { data, error } = await sb().from('attempts')
    .select(`attempt_no, stt_text, audio_path, duration_sec, created_at,
      responses!inner(status, retry_count,
        sessions!inner(child_name, child_age, started_at),
        questions!inner(order_no, difficulty, text))`)
    .order('created_at')
  fail(error)
  return data!
}
```

- [ ] **Step 3: 타입체크 + Commit**

Run: `npm run typecheck` (= `tsc --noEmit`, tsgo 7.0.2) → 에러 없음
```bash
git add -A && git commit -m "feat: Supabase 클라이언트 + db 접근 계층"
```

---

### Task 8: 아동용 API 4종 (transcribe는 목 통합 테스트)

**Files:** Create: `app/api/sessions/route.ts`, `app/api/sessions/complete/route.ts`, `app/api/responses/skip/route.ts`, `app/api/transcribe/route.ts`, `tests/transcribe-route.test.ts`

- [ ] **Step 1: 단순 3종 라우트 구현**

`app/api/sessions/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createSession, listQuestions } from '@/lib/db'

export async function POST(req: Request) {
  const { name, age } = await req.json().catch(() => ({}))
  const ageNum = Number(age)
  if (!name?.trim() || !Number.isInteger(ageNum) || ageNum < 3 || ageNum > 19)
    return NextResponse.json({ error: '이름과 나이(3~19)를 확인해 주세요' }, { status: 400 })
  const [sessionId, questions] = await Promise.all([createSession(name.trim(), ageNum), listQuestions()])
  return NextResponse.json({ sessionId, questions })
}
```

`app/api/sessions/complete/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { completeSession } from '@/lib/db'

export async function POST(req: Request) {
  const { sessionId } = await req.json().catch(() => ({}))
  if (!sessionId) return NextResponse.json({ error: 'sessionId 필요' }, { status: 400 })
  await completeSession(sessionId)
  return NextResponse.json({ ok: true })
}
```

`app/api/responses/skip/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { markSkipped } from '@/lib/db'

export async function POST(req: Request) {
  const { sessionId, questionId } = await req.json().catch(() => ({}))
  if (!sessionId || !questionId) return NextResponse.json({ error: 'sessionId, questionId 필요' }, { status: 400 })
  await markSkipped(sessionId, Number(questionId))
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: transcribe 실패 테스트 작성 (db/azure/convert 전부 목)**

`tests/transcribe-route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  getOrCreateResponse: vi.fn().mockResolvedValue('resp-1'),
  insertAttempt: vi.fn().mockResolvedValue('att-1'),
  uploadRecording: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/audio-convert', () => ({
  pickConversion: vi.fn().mockReturnValue({ args: [], contentType: 'audio/wav', ext: 'webm' }),
  toAzureFormat: vi.fn().mockResolvedValue({ data: Buffer.from('wav'), contentType: 'audio/wav' }),
}))
vi.mock('@/lib/azure-stt', () => ({ transcribeShortAudio: vi.fn().mockResolvedValue('i like apples') }))

import { POST } from '@/app/api/transcribe/route'
import * as db from '@/lib/db'
import * as azure from '@/lib/azure-stt'

function makeReq(overrides: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('audio', new File([new Uint8Array([1, 2, 3])], 'a.webm', { type: 'audio/webm;codecs=opus' }))
  fd.set('sessionId', 's-1'); fd.set('questionId', '5'); fd.set('orderNo', '5')
  fd.set('attemptNo', '1'); fd.set('durationSec', '3.2')
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
  return new Request('http://x/api/transcribe', { method: 'POST', body: fd })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/transcribe', () => {
  it('성공: 업로드→변환→STT→attempt 저장→텍스트 반환', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sttText: 'i like apples', attemptId: 'att-1' })
    expect(db.uploadRecording).toHaveBeenCalledWith('s-1/5_1.webm', expect.any(Buffer), 'audio/webm;codecs=opus')
    expect(db.insertAttempt).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'resp-1', attemptNo: 1, sttText: 'i like apples' }))
  })
  it('빈 STT 결과도 200으로 저장·반환 (재시도 유도는 클라이언트 몫)', async () => {
    vi.mocked(azure.transcribeShortAudio).mockResolvedValueOnce('')
    const res = await POST(makeReq())
    expect((await res.json()).sttText).toBe('')
    expect(db.insertAttempt).toHaveBeenCalled()
  })
  it('업로드 실패면 502, STT 진행 안 함(녹음 없는 텍스트 방지)', async () => {
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    expect(azure.transcribeShortAudio).not.toHaveBeenCalled()
  })
  it('Azure 실패면 502 + 저장된 오디오 경로 안내', async () => {
    vi.mocked(azure.transcribeShortAudio).mockRejectedValueOnce(new Error('timeout'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('변환')
  })
  it('필수 필드 누락이면 400', async () => {
    const fd = new FormData(); fd.set('sessionId', 's-1')
    const res = await POST(new Request('http://x', { method: 'POST', body: fd }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run tests/transcribe-route.test.ts` → FAIL (라우트 파일 없음)

- [ ] **Step 4: transcribe 구현**

`app/api/transcribe/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getOrCreateResponse, insertAttempt, uploadRecording } from '@/lib/db'
import { pickConversion, toAzureFormat } from '@/lib/audio-convert'
import { transcribeShortAudio } from '@/lib/azure-stt'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null)
  const audio = fd?.get('audio')
  const sessionId = String(fd?.get('sessionId') ?? '')
  const questionId = Number(fd?.get('questionId'))
  const orderNo = Number(fd?.get('orderNo'))
  const attemptNo = Number(fd?.get('attemptNo'))
  const durationSec = Number(fd?.get('durationSec') ?? 0)
  if (!(audio instanceof File) || !sessionId || !questionId || !orderNo || !attemptNo)
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })

  const bytes = Buffer.from(await audio.arrayBuffer())
  const mime = audio.type || 'application/octet-stream'
  const { ext } = pickConversion(mime)
  const audioPath = `${sessionId}/${orderNo}_${attemptNo}.${ext}`

  try {
    await uploadRecording(audioPath, bytes, mime) // 실패 시 STT 진행 금지
  } catch (e) {
    return NextResponse.json({ error: `녹음 저장 실패: ${(e as Error).message}` }, { status: 502 })
  }

  try {
    const converted = await toAzureFormat(bytes, mime)
    const sttText = await transcribeShortAudio(converted.data, converted.contentType)
    const responseId = await getOrCreateResponse(sessionId, questionId)
    const attemptId = await insertAttempt({ responseId, attemptNo, sttText, audioPath, durationSec })
    return NextResponse.json({ sttText, attemptId })
  } catch (e) {
    return NextResponse.json(
      { error: `음성 변환에 실패했어요. 다시 시도해 주세요. (${(e as Error).message})`, audioPath },
      { status: 502 })
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/transcribe-route.test.ts` → PASS (5 tests)
Run: `npx vitest run` → 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: 아동용 API (sessions/transcribe/skip/complete) + transcribe 목 통합테스트"
```

---

### Task 9: 시작 화면 (`/`)

**Files:** Create(교체): `app/page.tsx`

- [ ] **Step 1: 구현**

`app/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StartPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function begin() {
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, age: Number(age) }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? '오류가 났어요'); return }
      sessionStorage.setItem('survey', JSON.stringify({ sessionId: json.sessionId, questions: json.questions, name }))
      router.push('/survey')
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-6xl">🐰🎤</div>
      <h1 className="text-3xl">말하기 놀이 설문</h1>
      <p className="text-center text-ink/70">화면에 나오는 영어 문장을<br />또박또박 읽어 보아요!</p>
      <div className="flex w-full flex-col gap-3 rounded-3xl bg-white p-6 shadow-lg shadow-peach/40">
        <label className="text-sm">이름</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="이름을 적어 주세요"
          className="rounded-2xl border-2 border-peach bg-cream px-4 py-3 text-lg outline-none focus:border-peach-deep" />
        <label className="text-sm">나이</label>
        <input value={age} onChange={e => setAge(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="나이 (숫자)"
          className="rounded-2xl border-2 border-peach bg-cream px-4 py-3 text-lg outline-none focus:border-peach-deep" />
        {err && <p className="text-sm text-berry">{err}</p>}
        <button onClick={begin} disabled={busy || !name.trim() || !age}
          className="mt-2 rounded-full bg-peach-deep px-6 py-4 text-xl text-white shadow-md transition active:scale-95 disabled:opacity-40">
          {busy ? '준비 중…' : '시작하기 🚀'}
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 수동 확인 + Commit**

Run: `npm run dev` → `http://localhost:3000` 에서 이름/나이 입력 → (Supabase 셋업 완료 시) `/survey`로 이동, 미설정 시 에러 문구 표시 확인.
```bash
git add -A && git commit -m "feat: 시작 화면 (이름/나이, 아기자기 톤)"
```

---

### Task 10: useRecorder 훅 + 공용 컴포넌트

**Files:** Create: `hooks/useRecorder.ts`, `components/LevelMeter.tsx`, `components/ProgressBar.tsx`, `components/RecordButton.tsx`

- [ ] **Step 1: useRecorder 훅**

`hooks/useRecorder.ts`:
```ts
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface Recording { blob: Blob; durationSec: number; mime: string; peak: number }
export type RecState = 'idle' | 'recording'

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4'
  return ''
}

/** maxSec 도달 시 자동 종료. 완료 시 onComplete 호출(수동/자동 공통 경로). */
export function useRecorder(maxSec: number, onComplete: (r: Recording) => void) {
  const [state, setState] = useState<RecState>('idle')
  const [level, setLevel] = useState(0)
  const recRef = useRef<MediaRecorder | null>(null)
  const peakRef = useRef(0)
  const startedRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cleanupRef = useRef<() => void>(() => {})
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const stop = useCallback(() => {
    clearTimeout(timerRef.current)
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }, [])

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }) // 거부 시 throw → 호출부 처리
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.frequencyBinCount)
    let raf = 0
    const tick = () => {
      analyser.getByteTimeDomainData(buf)
      let p = 0
      for (const v of buf) p = Math.max(p, Math.abs(v - 128) / 128)
      peakRef.current = Math.max(peakRef.current, p)
      setLevel(p)
      raf = requestAnimationFrame(tick)
    }
    tick()

    const mime = pickMimeType()
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = e => chunks.push(e.data)
    cleanupRef.current = () => {
      cancelAnimationFrame(raf)
      ctx.close()
      stream.getTracks().forEach(t => t.stop())
    }
    rec.onstop = () => {
      cleanupRef.current()
      setState('idle'); setLevel(0)
      onCompleteRef.current({
        blob: new Blob(chunks, { type: rec.mimeType }),
        durationSec: (Date.now() - startedRef.current) / 1000,
        mime: rec.mimeType, peak: peakRef.current,
      })
    }
    recRef.current = rec
    peakRef.current = 0
    startedRef.current = Date.now()
    rec.start()
    setState('recording')
    timerRef.current = setTimeout(stop, maxSec * 1000)
  }, [maxSec, stop])

  useEffect(() => () => { clearTimeout(timerRef.current); cleanupRef.current() }, [])
  return { state, level, start, stop }
}
```

- [ ] **Step 2: 컴포넌트 3종**

`components/LevelMeter.tsx`:
```tsx
'use client'
/** 녹음 중 목소리 크기를 토끼 귀 바 5개로 표시 */
export function LevelMeter({ level }: { level: number }) {
  const bars = [0.05, 0.15, 0.3, 0.5, 0.7]
  return (
    <div className="flex h-10 items-end justify-center gap-1.5" aria-label="목소리 크기">
      {bars.map((t, i) => (
        <div key={i}
          className={`w-3 rounded-full transition-all duration-75 ${level > t ? 'bg-mint' : 'bg-ink/10'}`}
          style={{ height: `${(i + 1) * 8}px` }} />
      ))}
    </div>
  )
}
```

`components/ProgressBar.tsx`:
```tsx
export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full">
      <p className="mb-1 text-center text-sm text-ink/70">{current} / {total}</p>
      <div className="h-3 w-full overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-sky" style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  )
}
```

`components/RecordButton.tsx`:
```tsx
'use client'
import type { RecState } from '@/hooks/useRecorder'

export function RecordButton({ state, onStart, onStop, disabled }: {
  state: RecState; onStart: () => void; onStop: () => void; disabled?: boolean
}) {
  const recording = state === 'recording'
  return (
    <button
      onClick={recording ? onStop : onStart} disabled={disabled}
      className={`h-24 w-24 rounded-full text-4xl shadow-lg transition active:scale-95 disabled:opacity-40
        ${recording ? 'animate-pulse bg-berry text-white' : 'bg-peach-deep text-white'}`}
      aria-label={recording ? '녹음 끝내기' : '녹음 시작'}>
      {recording ? '⏹' : '🎤'}
    </button>
  )
}
```

- [ ] **Step 3: 타입체크 + Commit**

Run: `npx tsc --noEmit` → 에러 없음
```bash
git add -A && git commit -m "feat: useRecorder 훅 + LevelMeter/ProgressBar/RecordButton"
```

---

### Task 11: 설문 진행 화면 (`/survey`) — 마이크 테스트 + 문항 상태 머신

**Files:** Create: `app/survey/page.tsx`, `app/done/page.tsx`

- [ ] **Step 1: 설문 페이지 구현**

`app/survey/page.tsx`:
```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { LevelMeter } from '@/components/LevelMeter'
import { ProgressBar } from '@/components/ProgressBar'
import { RecordButton } from '@/components/RecordButton'

interface Question { id: number; order_no: number; text: string }
interface Survey { sessionId: string; questions: Question[]; name: string }
type Phase = 'mic' | 'question'

export default function SurveyPage() {
  const router = useRouter()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [phase, setPhase] = useState<Phase>('mic')
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [qIdx, setQIdx] = useState(0)
  const [attemptNo, setAttemptNo] = useState(1)
  const [sttText, setSttText] = useState<string | null>(null) // null=시도 전
  const [audioUrl, setAudioUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [micDenied, setMicDenied] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [lastRec, setLastRec] = useState<Recording | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('survey')
    if (!raw) { router.replace('/'); return }
    setSurvey(JSON.parse(raw))
  }, [router])

  const q = survey?.questions[qIdx]

  async function handleComplete(rec: Recording) {
    setLastRec(rec)
    if (phase === 'mic') {
      setMicOk(rec.peak > 0.1 ? 'ok' : 'quiet')
      return
    }
    if (!survey || !q) return
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.set('audio', rec.blob, 'audio')
      fd.set('sessionId', survey.sessionId)
      fd.set('questionId', String(q.id))
      fd.set('orderNo', String(q.order_no))
      fd.set('attemptNo', String(attemptNo))
      fd.set('durationSec', rec.durationSec.toFixed(2))
      const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? '변환에 실패했어요. 다시 시도해 주세요.'); return }
      setSttText(json.sttText)
      setAudioUrl(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(rec.blob) })
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  const recorder = useRecorder(20, handleComplete)

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicDenied(false) }
    catch { setMicDenied(true) }
  }

  function resetForQuestion() {
    setSttText(null); setErr(''); setConfirmSkip(false); setLastRec(null)
    setAudioUrl(old => { if (old) URL.revokeObjectURL(old); return '' })
  }

  function retry() { setAttemptNo(n => n + 1); setSttText(null); setErr('') }

  async function next() {
    if (!survey) return
    if (qIdx + 1 >= survey.questions.length) {
      await fetch('/api/sessions/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: survey.sessionId }),
      })
      sessionStorage.removeItem('survey')
      router.push('/done')
      return
    }
    setQIdx(i => i + 1); setAttemptNo(1); resetForQuestion()
  }

  async function skip() {
    if (!survey || !q) return
    await fetch('/api/responses/skip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: survey.sessionId, questionId: q.id }),
    })
    await next()
  }

  if (!survey) return null

  // ---------- 마이크 권한 거부 안내 ----------
  if (micDenied) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">🙉</div>
      <h2 className="text-2xl">마이크를 쓸 수 없어요</h2>
      <p className="text-ink/70">브라우저 주소창의 자물쇠(🔒)를 눌러<br />마이크를 <b>허용</b>으로 바꾼 뒤 다시 눌러 주세요.</p>
      <button onClick={startRecording} className="rounded-full bg-peach-deep px-8 py-3 text-lg text-white">다시 시도</button>
    </main>
  )

  // ---------- 마이크 테스트 ----------
  if (phase === 'mic') return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="text-5xl">🎤✨</div>
      <h2 className="text-2xl">마이크 테스트</h2>
      <p className="text-ink/70">버튼을 누르고 <b>&ldquo;Hello!&rdquo;</b> 라고 말한 뒤<br />버튼을 다시 눌러 주세요.</p>
      <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop} />
      <LevelMeter level={recorder.level} />
      {micOk === 'ok' && (
        <>
          <p className="text-mint-700 text-lg">잘 들려요! 🎉</p>
          <button onClick={() => { setPhase('question'); resetForQuestion() }}
            className="rounded-full bg-mint px-10 py-4 text-xl shadow-md active:scale-95">설문 시작 →</button>
        </>
      )}
      {micOk === 'quiet' && <p className="text-berry">소리가 잘 안 들려요. 마이크 가까이에서 다시 한번!</p>}
    </main>
  )

  // ---------- 문항 ----------
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center gap-5 p-6 pt-10">
      <ProgressBar current={qIdx + 1} total={survey.questions.length} />
      <div className="w-full rounded-3xl bg-white p-8 text-center shadow-lg shadow-sky/40">
        <p className="mb-2 text-sm text-ink/50">아래 문장을 읽어 주세요 🗣️</p>
        <p className="font-sans text-2xl leading-relaxed">{q!.text}</p>
      </div>

      <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop} disabled={busy} />
      {recorder.state === 'recording' && <LevelMeter level={recorder.level} />}
      {busy && <p className="animate-pulse text-ink/60">듣고 있어요… ⏳</p>}
      {err && <p className="text-center text-berry">{err}</p>}

      {sttText !== null && !busy && (
        <div className="w-full rounded-3xl bg-sky/30 p-5 text-center">
          <p className="mb-1 text-sm text-ink/50">들린 말</p>
          {sttText
            ? <p className="font-sans text-xl">{sttText}</p>
            : <p className="text-berry">잘 안 들렸어요. 다시 한번 말해 볼까요?</p>}
          {audioUrl && <audio controls src={audioUrl} className="mx-auto mt-3 w-full" />}
        </div>
      )}

      <div className="flex items-center gap-3">
        {sttText !== null && !busy && (
          <button onClick={retry} className="rounded-full border-2 border-peach-deep px-6 py-3 text-peach-deep active:scale-95">
            🔁 다시 말하기
          </button>
        )}
        {!!sttText && !busy && (
          <button onClick={next} className="rounded-full bg-peach-deep px-8 py-3 text-white shadow-md active:scale-95">
            다음 →
          </button>
        )}
      </div>

      {!confirmSkip
        ? <button onClick={() => setConfirmSkip(true)} className="mt-2 text-sm text-ink/40 underline">건너뛰기</button>
        : (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span>정말 건너뛸까요?</span>
            <button onClick={skip} className="rounded-full bg-ink/10 px-4 py-1">네</button>
            <button onClick={() => setConfirmSkip(false)} className="rounded-full bg-ink/10 px-4 py-1">아니요</button>
          </div>
        )}
    </main>
  )
}
```

주의: `retry()`는 `attemptNo`만 올리고 결과를 지운다 — 이전 시도는 이미 서버에 저장돼 있다. `lastRec`은 향후 확장(재업로드)용이 아니라 단순 상태 보존이므로 미사용 경고가 나면 제거한다.

- [ ] **Step 2: 완료 페이지**

`app/done/page.tsx`:
```tsx
import Link from 'next/link'

export default function DonePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="text-6xl">🎉🐻</div>
      <h1 className="text-3xl">설문이 끝났어요!</h1>
      <p className="text-ink/70">끝까지 열심히 읽어 줘서 고마워요.<br />수고했어요!</p>
      <Link href="/" className="rounded-full bg-mint px-8 py-3 text-lg shadow-md">처음으로</Link>
    </main>
  )
}
```

- [ ] **Step 3: 수동 E2E (Supabase+Azure 키 세팅 후)**

Run: `npm run dev` → Chrome에서 전체 흐름: 시작→마이크 테스트→문항1 녹음→"들린 말" 표시→재생→다시 말하기→다음→건너뛰기 확인→(빠른 확인 위해 questions를 3개로 임시 슬라이스해도 됨, 원복 필수)→완료 화면.
Supabase 대시보드에서 sessions/responses/attempts 행과 recordings 파일 생성 확인.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: 설문 진행 화면 (마이크 테스트, 문항 상태 머신, 재시도/건너뛰기)"
```

---

### Task 12: 관리자 인증 (login API + middleware + 로그인 페이지)

**Files:** Create: `app/api/admin/login/route.ts`, `middleware.ts`, `app/admin/login/page.tsx`

- [ ] **Step 1: 로그인 API (5회 실패 시 10분 잠금)**

`app/api/admin/login/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createToken, sha256Hex, ADMIN_COOKIE } from '@/lib/auth'
import { env } from '@/lib/env'

const fails = new Map<string, { count: number; until: number }>()

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  const f = fails.get(ip)
  if (f && f.count >= 5 && Date.now() < f.until)
    return NextResponse.json({ error: '시도가 너무 많습니다. 10분 후 다시 시도하세요.' }, { status: 429 })

  const { password } = await req.json().catch(() => ({}))
  if (!password || (await sha256Hex(password)) !== env('ADMIN_PASSWORD_HASH')) {
    const cur = fails.get(ip) ?? { count: 0, until: 0 }
    fails.set(ip, { count: cur.count + 1, until: Date.now() + 10 * 60_000 })
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 })
  }
  fails.delete(ip)
  const token = await createToken(env('SESSION_SECRET'))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600 })
  return res
}
```

- [ ] **Step 2: middleware**

`middleware.ts` (프로젝트 루트):
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { verifyToken, ADMIN_COOKIE } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/admin/login' || pathname === '/api/admin/login') return NextResponse.next()
  const token = req.cookies.get(ADMIN_COOKIE)?.value ?? ''
  const ok = token && await verifyToken(token, process.env.SESSION_SECRET ?? '')
  if (ok) return NextResponse.next()
  if (pathname.startsWith('/api/'))
    return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  return NextResponse.redirect(new URL('/admin/login', req.url))
}

export const config = { matcher: ['/admin/:path*', '/admin', '/api/admin/:path*'] }
```

- [ ] **Step 3: 로그인 페이지**

`app/admin/login/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  async function login() {
    setErr('')
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    if (res.ok) router.push('/admin')
    else setErr((await res.json()).error ?? '로그인 실패')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-2xl">관리자 로그인</h1>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && login()} placeholder="비밀번호"
        className="rounded-2xl border-2 border-ink/20 px-4 py-3 outline-none focus:border-sky" />
      {err && <p className="text-sm text-berry">{err}</p>}
      <button onClick={login} className="rounded-full bg-ink px-6 py-3 text-white">로그인</button>
    </main>
  )
}
```

- [ ] **Step 4: 수동 확인 + Commit**

수동: `/admin` 접속 → `/admin/login` 리다이렉트 확인 → 틀린 비번 5회 → 429 확인 → 맞는 비번 → `/admin` 진입(페이지는 Task 13에서 — 일단 404여도 리다이렉트 안 되면 성공).
```bash
git add -A && git commit -m "feat: 관리자 인증 (HMAC 쿠키, middleware, 로그인 잠금)"
```

---

### Task 13: 관리자 목록/상세 페이지 (서버 컴포넌트)

**Files:** Create: `app/admin/page.tsx`, `app/admin/[id]/page.tsx`, `components/AttemptList.tsx`. Modify: 스펙 §6 (목록/상세는 서버 컴포넌트 직접 조회로 변경 기록)

- [ ] **Step 1: 세션 목록**

`app/admin/page.tsx`:
```tsx
import Link from 'next/link'
import { listSessions } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function AdminList() {
  const sessions = await listSessions()
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl">설문 세션 ({sessions.length})</h1>
        <a href="/api/admin/export" className="rounded-full bg-ink px-4 py-2 text-sm text-white">CSV 내보내기</a>
      </div>
      <table className="w-full rounded-2xl bg-white text-sm shadow">
        <thead><tr className="border-b text-left text-ink/50">
          <th className="p-3">이름</th><th>나이</th><th>시작</th><th>상태</th><th>건너뜀</th>
        </tr></thead>
        <tbody>
          {sessions.map(s => {
            const skipped = s.responses.filter(r => r.status === 'skipped').length
            return (
              <tr key={s.id} className="border-b last:border-0 hover:bg-cream">
                <td className="p-3"><Link href={`/admin/${s.id}`} className="text-sky-700 underline">{s.child_name}</Link></td>
                <td>{s.child_age}</td>
                <td>{new Date(s.started_at).toLocaleString('ko-KR')}</td>
                <td>{s.completed_at ? '완료' : <span className="text-berry">미완료</span>}</td>
                <td>{skipped > 0 ? `${skipped}개` : '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sessions.length === 0 && <p className="mt-6 text-center text-ink/50">아직 참여한 세션이 없습니다.</p>}
    </main>
  )
}
```

- [ ] **Step 2: 세션 상세 + 시도 이력 컴포넌트**

`components/AttemptList.tsx`:
```tsx
'use client'
import { useState } from 'react'

export interface AttemptView { id: string; attemptNo: number; sttText: string; url: string; isFinal: boolean }

export function AttemptList({ attempts }: { attempts: AttemptView[] }) {
  const [open, setOpen] = useState(false)
  const final_ = attempts.find(a => a.isFinal) ?? attempts[attempts.length - 1]
  const history = attempts.filter(a => a !== final_)
  if (!final_) return null
  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="font-sans">{final_.sttText || <span className="text-berry">(인식 실패)</span>}</p>
        <audio controls src={final_.url} preload="none" className="h-8" />
      </div>
      {history.length > 0 && (
        <button onClick={() => setOpen(o => !o)} className="mt-1 text-xs text-ink/50 underline">
          이전 시도 {history.length}개 {open ? '접기' : '보기'}
        </button>
      )}
      {open && history.map(a => (
        <div key={a.id} className="mt-1 flex items-center gap-3 pl-3 text-sm text-ink/60">
          <span>#{a.attemptNo}</span>
          <p className="font-sans">{a.sttText || '(인식 실패)'}</p>
          <audio controls src={a.url} preload="none" className="h-8" />
        </div>
      ))}
    </div>
  )
}
```

`app/admin/[id]/page.tsx`:
```tsx
import Link from 'next/link'
import { sessionDetail, signedAudioUrl } from '@/lib/db'
import { AttemptList, type AttemptView } from '@/components/AttemptList'

export const dynamic = 'force-dynamic'

export default async function AdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, rows } = await sessionDetail(id)
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Link href="/admin" className="text-sm text-ink/50 underline">← 목록</Link>
      <h1 className="mb-1 mt-2 text-2xl">{session.child_name} ({session.child_age}세)</h1>
      <p className="mb-6 text-sm text-ink/50">
        {new Date(session.started_at).toLocaleString('ko-KR')} · {session.completed_at ? '완료' : '미완료'}
      </p>
      <div className="flex flex-col gap-4">
        {await Promise.all(rows.map(async r => {
          const attempts: AttemptView[] = await Promise.all(r.attempts.map(async a => ({
            id: a.id, attemptNo: a.attempt_no, sttText: a.stt_text,
            url: await signedAudioUrl(a.audio_path), isFinal: a.id === r.finalAttemptId,
          })))
          return (
            <div key={r.question.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ${r.status === 'skipped' ? 'opacity-50' : ''}`}>
              <div className="mb-2 flex items-center gap-2 text-sm text-ink/50">
                <span>Q{r.question.order_no}</span>
                <span className="rounded-full bg-ink/5 px-2">{r.question.difficulty}</span>
                {r.retryCount > 1 && <span className="rounded-full bg-peach px-2">재시도 {r.retryCount}회</span>}
                {r.status === 'skipped' && <span className="rounded-full bg-ink/10 px-2">건너뜀</span>}
                {r.status === 'none' && <span className="rounded-full bg-ink/10 px-2">미응답</span>}
              </div>
              <p className="mb-2 font-sans font-semibold">{r.question.text}</p>
              {r.attempts.length > 0 && <AttemptList attempts={attempts} />}
            </div>
          )
        }))}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: 스펙 §6 동기화**

스펙 §6의 `GET /api/admin/sessions`, `GET /api/admin/sessions/[id]` 두 행을 삭제하고 다음 문구로 대체:
"목록/상세 화면은 서버 컴포넌트가 `lib/db.ts`를 직접 호출한다(별도 GET API 없음 — DRY). API는 login/export만 유지."

- [ ] **Step 4: 수동 확인 + Commit**

수동: 설문 1건 진행한 뒤 `/admin` → 세션 표시 → 상세 → 문항별 STT/재생/재시도 뱃지/건너뜀 회색 확인. 오디오 재생 동작 확인(서명 URL).
```bash
git add -A && git commit -m "feat: 관리자 목록/상세 (서버 컴포넌트, 서명 URL 오디오)"
```

---

### Task 14: CSV 내보내기 API

**Files:** Create: `app/api/admin/export/route.ts`, `tests/export-route.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

`tests/export-route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  exportRows: vi.fn().mockResolvedValue([{
    attempt_no: 2, stt_text: 'i like apples', audio_path: 's1/1_2.webm',
    duration_sec: 3.2, created_at: '2026-07-13T05:00:00Z',
    responses: {
      status: 'completed', retry_count: 2,
      sessions: { child_name: '민준', child_age: 8, started_at: '2026-07-13T04:55:00Z' },
      questions: { order_no: 1, difficulty: 'easy', text: 'I like apples.' },
    },
  }]),
}))

import { GET } from '@/app/api/admin/export/route'

describe('GET /api/admin/export', () => {
  it('CSV 헤더·행·Content-Disposition', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    const body = await res.text()
    expect(body.startsWith('﻿')).toBe(true)
    const [header, row] = body.slice(1).split('\r\n')
    expect(header).toBe('이름,나이,세션시작,문항번호,난이도,목표문장,시도순번,STT텍스트,재시도총횟수,건너뜀,발화길이초,녹음경로')
    expect(row).toBe('민준,8,2026-07-13T04:55:00Z,1,easy,I like apples.,2,i like apples,2,N,3.2,s1/1_2.webm')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/export-route.test.ts` → FAIL

- [ ] **Step 3: 구현**

`app/api/admin/export/route.ts`:
```ts
import { buildCsv } from '@/lib/csv'
import { exportRows } from '@/lib/db'

export const dynamic = 'force-dynamic'

const HEADER = ['이름', '나이', '세션시작', '문항번호', '난이도', '목표문장', '시도순번', 'STT텍스트', '재시도총횟수', '건너뜀', '발화길이초', '녹음경로']

export async function GET() {
  const rows = await exportRows()
  const cells = rows.map((r: any) => [
    r.responses.sessions.child_name, r.responses.sessions.child_age, r.responses.sessions.started_at,
    r.responses.questions.order_no, r.responses.questions.difficulty, r.responses.questions.text,
    r.attempt_no, r.stt_text, r.responses.retry_count,
    r.responses.status === 'skipped' ? 'Y' : 'N', r.duration_sec, r.audio_path,
  ])
  return new Response(buildCsv(HEADER, cells), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="survey-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
```

- [ ] **Step 4: 통과 확인 + Commit**

Run: `npx vitest run tests/export-route.test.ts` → PASS. `npx vitest run` → 전체 PASS.
```bash
git add -A && git commit -m "feat: CSV 내보내기 (BOM, 1행=1시도)"
```

---

### Task 15: 스모크 스크립트 + README + 최종 검증

**Files:** Create: `scripts/smoke-azure.ts`, `README.md`

- [ ] **Step 1: Azure 스모크 스크립트**

`scripts/smoke-azure.ts`:
```ts
/** 실제 Azure 키로 1초 사인파 wav를 변환해 연결 확인. 실행: npm run smoke:azure */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import ffmpegPath from 'ffmpeg-static'
import { transcribeShortAudio } from '../lib/azure-stt'

execSync(`${ffmpegPath} -y -f lavfi -i sine=frequency=440:duration=1 -ac 1 -ar 16000 /tmp/smoke.wav`, { stdio: 'ignore' })
try {
  const text = await transcribeShortAudio(readFileSync('/tmp/smoke.wav'), 'audio/wav')
  console.log(`Azure 연결 OK (사인파라 인식 텍스트는 빈 값이 정상): "${text}"`)
} catch (e) {
  console.error('Azure 연결 실패:', (e as Error).message)
  process.exit(1)
}
```

- [ ] **Step 2: README (셋업 순서 + 수동 E2E 체크리스트)**

`README.md`:
````markdown
# 아동 STT 발화 설문 사이트

화면의 영어 문장을 아이가 소리 내어 읽으면 Azure STT로 변환해 보여주고,
모든 녹음/텍스트를 Supabase에 저장한다. 관리자는 `/admin`에서 조회·청취·CSV 다운로드.

## 셋업

1. `npm install`
2. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/migrations/001_init.sql` 실행
3. `cp .env.local.example .env.local` 후 값 채우기
   - `ADMIN_PASSWORD_HASH`: `npm run hash-password -- '원하는비밀번호'` 출력값
   - `SESSION_SECRET`: `openssl rand -hex 32`
4. `npm run seed` (30문항 주입)
5. `npm run smoke:azure` (Azure 연결 확인)
6. `npm run dev` → http://localhost:3000 (아동) / http://localhost:3000/admin (관리자)

## 테스트

- `npm test` — 단위 + 라우트 테스트
- `npm run typecheck` — 타입체크 (tsgo 7.0.2. Next 빌드 타입체크는 꺼져 있으니 반드시 별도 실행)
- 수동 E2E 체크리스트 (릴리스 전 실기기):
  - [ ] Chrome(PC): 시작→마이크테스트→녹음→변환표시→재생→재시도→건너뛰기→완료
  - [ ] Safari(iPhone): 동일 흐름 (mp4 녹음 경로 — wav 트랜스코딩 확인)
  - [ ] Chrome(Android): 동일 흐름
  - [ ] 마이크 권한 거부 → 안내 화면 → 허용 후 복구
  - [ ] 관리자: 로그인(틀린 비번 5회 잠금)→목록→상세(오디오 재생)→CSV 열기(엑셀 한글 정상)
  - [ ] 무음 녹음 → "잘 안 들렸어요" + [다음] 비활성 유지

## 주의

- 마이크는 HTTPS 또는 localhost에서만 동작한다. 같은 네트워크의 폰으로 테스트하려면
  `npx next dev --experimental-https` 또는 터널(예: `cloudflared tunnel --url localhost:3000`) 사용.
- Supabase Storage 무료 1GB — 수개월 운영 시 오래된 녹음 정리 필요.
````

- [ ] **Step 3: 전체 검증**

Run: `npm test` → 전체 PASS
Run: `npm run typecheck` → 에러 없음
Run: `npm run build` → 빌드 성공 (Next 타입체크는 꺼져 있고 tsgo가 별도로 담당)
수동: README의 E2E 체크리스트 중 Chrome(PC) 전 과정 1회 수행.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: 스모크 스크립트 + README + 최종 검증"
```

---

## Self-Review 결과

- **Spec coverage:** R1(관리자 페이지 Task 12–13, 저장 Task 2/7–8) R2(문항 Task 2, 표시 Task 11) R3(Task 10–11) R4(표시/재생 Task 11, 저장 Task 8) R5(재시도 Task 11) R6(스택 Task 1) R7(마이크테스트·레벨미터·진행률·건너뛰기·CSV Task 10/11/14) §8(변환 Task 6/8) §9(에러 처리 Task 8/11/12) §10(테스트 각 Task + README 체크리스트) §13(비용 — 코드 무관) ✅
- **Placeholder scan:** TBD/TODO/"적절히" 없음. 모든 코드 스텝에 실제 코드 포함 ✅
- **Type consistency:** `AzureContentType`(Task 5↔6), `Recording`/`RecState`(Task 10↔11), db 함수 시그니처(Task 7↔8/13/14), `ADMIN_COOKIE`(Task 3↔12) 일치 확인 ✅
- 스펙 보정 2건은 Task 2 Step 5, Task 13 Step 3에서 스펙 문서에 반영하도록 명시 ✅
