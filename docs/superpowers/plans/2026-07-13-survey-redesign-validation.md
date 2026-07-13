# 설문 리디자인 + 입력 검증 변경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이 화면에서 평가 신호(STT 결과·정오·칭찬)를 완전히 제거한 차분한 설문 톤으로 전면 리디자인하고, 이름(한글·영어만)/나이(숫자만, 범위 제한 삭제) 검증을 교체하며, 평가 기능(자동 비교·청취)을 선생님 결과지로 이동한다.

**Architecture:** 순수 로직(`lib/validate.ts`, `lib/compare.ts`)을 먼저 TDD로 깔고, API 계약 변경(`/api/transcribe`가 sttText를 반환하지 않음, 진행 게이트 = 업로드 성공)을 라우트 테스트로 고정한 뒤, UI를 파운데이션(토큰·폰트·Blip 캐릭터) → 공용 컴포넌트 → 페이지 순서로 갈아끼운다. DB 스키마 변경 없음.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (`@theme` 토큰), TypeScript 7.0.2 (tsgo — 다운그레이드 금지), Vitest 4, Supabase, Azure STT.

**스펙:** `docs/superpowers/specs/2026-07-13-survey-redesign-and-validation-design.md`
**시각 레퍼런스(확정 목업):** `docs/superpowers/specs/2026-07-13-redesign-mockup-v3.html` — 브라우저로 열어 대조할 것.

**중요 규칙:**
- 타입 검증은 반드시 `npm run typecheck` (Next 빌드 타입체크는 꺼져 있음).
- 아이 화면(랜딩·설문·완료)에 이모지·별·칭찬·STT 텍스트·정오 표시 절대 금지.
- mint/amber 색은 관리자 화면 전용 (아이 화면 등장 금지).

---

## File Structure

| 파일 | 역할 |
|---|---|
| Create `lib/validate.ts` | 이름/나이 검증 (클라·서버 공용 순수 함수) |
| Create `lib/compare.ts` | STT 자동 비교 (정규화 후 일치 판정, 결과지·CSV 공용) |
| Create `components/Blip.tsx` | 블립 캐릭터 SVG (logo/idle/recording) |
| Create `components/AudioPlayer.tsx` | 관리자용 커스텀 오디오 플레이어 |
| Create `tests/validate.test.ts`, `tests/compare.test.ts`, `tests/sessions-route.test.ts` | 신규 테스트 |
| Modify `app/api/sessions/route.ts` | 검증 교체 |
| Modify `app/api/transcribe/route.ts` | sttText 비노출, STT 실패 무차단 |
| Modify `lib/db.ts:46-48` | insertAttempt: 시도 저장 = completed (STT 여부 무관) |
| Modify `app/api/admin/export/route.ts` | 자동비교 컬럼 추가 |
| Modify `tests/transcribe-route.test.ts`, `tests/export-route.test.ts` | 계약 변경 반영 |
| Rewrite `app/globals.css`, `app/layout.tsx` | 토큰·키프레임·공용 클래스 / Noto Sans KR + Lexend |
| Rewrite `components/ProgressBar.tsx`, `components/LevelMeter.tsx`, `components/RecordButton.tsx` | v3 스타일 |
| Rewrite `app/page.tsx`, `app/survey/page.tsx`, `app/done/page.tsx` | 아이 플로우 |
| Rewrite `app/admin/page.tsx`, `app/admin/[id]/page.tsx`, `app/admin/login/page.tsx` | 관리자 |
| Delete `components/AttemptList.tsx` | 결과지 테이블로 대체 |
| Modify `README.md` | 흐름 설명·E2E 체크리스트 갱신 |

---

### Task 1: 검증 모듈 `lib/validate.ts`

**Files:**
- Create: `lib/validate.ts`
- Test: `tests/validate.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validName, validAge } from '@/lib/validate'

describe('validName', () => {
  it('한글 이름 허용', () => expect(validName('김도연')).toBe(true))
  it('영어 이름 허용', () => expect(validName('Lucas')).toBe(true))
  it('단어 사이 단일 공백 허용', () => {
    expect(validName('김 지우')).toBe(true)
    expect(validName('Mary Jane')).toBe(true)
  })
  it('한영 혼합 허용', () => expect(validName('지우Kim')).toBe(true))
  it('숫자·특수문자 거부', () => {
    expect(validName('지우1')).toBe(false)
    expect(validName('지우!')).toBe(false)
    expect(validName('지우 😀')).toBe(false)
  })
  it('자모 단독 거부 (완성형만)', () => expect(validName('ㄱㄴ')).toBe(false))
  it('빈 문자열·공백만 거부', () => {
    expect(validName('')).toBe(false)
    expect(validName(' ')).toBe(false)
  })
  it('연속 공백·앞뒤 공백 거부 (호출 전 정규화 전제)', () => {
    expect(validName('김  지우')).toBe(false)
    expect(validName(' 김지우')).toBe(false)
  })
  it('30자 초과 거부', () => expect(validName('a'.repeat(31))).toBe(false))
  it('문자열 아니면 거부', () => expect(validName(3 as unknown)).toBe(false))
})

describe('validAge', () => {
  it('1~999 정수 허용 (기존 3~19 제한 삭제 확인)', () => {
    expect(validAge(1)).toBe(true)
    expect(validAge(20)).toBe(true)   // 기존 규칙에선 거부되던 값
    expect(validAge(999)).toBe(true)
  })
  it('0·음수·1000 이상 거부', () => {
    expect(validAge(0)).toBe(false)
    expect(validAge(-1)).toBe(false)
    expect(validAge(1000)).toBe(false)
  })
  it('소수·NaN·문자열 거부', () => {
    expect(validAge(8.5)).toBe(false)
    expect(validAge(NaN)).toBe(false)
    expect(validAge('8' as unknown)).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/validate.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validate'`

- [ ] **Step 3: 구현**

`lib/validate.ts`:

```ts
/** 이름: 완성형 한글·영문만, 단어 사이 단일 공백, 1~30자.
 *  호출 측에서 trim + 연속공백 정규화 후 넘길 것 (클라이언트는 IME 조합 중 개입 금지). */
export const NAME_RE = /^[가-힣a-zA-Z]+( [가-힣a-zA-Z]+)*$/

export function validName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 30 && NAME_RE.test(name)
}

/** 나이: 정수 1~999 (숫자 1~3자리). 기존 3~19 범위 제한은 폐기됨. */
export function validAge(age: unknown): age is number {
  return typeof age === 'number' && Number.isInteger(age) && age >= 1 && age <= 999
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/validate.test.ts`
Expected: PASS (전 케이스)

- [ ] **Step 5: Commit**

```bash
git add lib/validate.ts tests/validate.test.ts
git commit -m "feat: 이름(한글·영어만)/나이(1~999) 검증 모듈"
```

---

### Task 2: 자동 비교 모듈 `lib/compare.ts`

**Files:**
- Create: `lib/compare.ts`
- Test: `tests/compare.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/compare.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compareUtterance, normalize } from '@/lib/compare'

describe('normalize', () => {
  it('소문자화·구두점 제거·공백 축약', () => {
    expect(normalize('The cat sits on the mat.')).toBe('the cat sits on the mat')
    expect(normalize("  Don't   run! ")).toBe('dont run')
  })
})

describe('compareUtterance', () => {
  it('대소문자·구두점 차이는 일치', () =>
    expect(compareUtterance('I like apples.', 'i like apples')).toBe('matched'))
  it('아포스트로피 유무는 일치', () =>
    expect(compareUtterance("Don't run.", 'dont run')).toBe('matched'))
  it('단어가 다르면 불일치', () =>
    expect(compareUtterance('I like apples and oranges.', 'I like apple and orange.')).toBe('mismatched'))
  it('STT 빈 값·공백만이면 인식 안 됨', () => {
    expect(compareUtterance('Hello.', '')).toBe('unrecognized')
    expect(compareUtterance('Hello.', '  ')).toBe('unrecognized')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/compare.test.ts`
Expected: FAIL — `Cannot find module '@/lib/compare'`

- [ ] **Step 3: 구현**

`lib/compare.ts`:

```ts
export type MatchResult = 'matched' | 'mismatched' | 'unrecognized'

/** 소문자화 → 글자·숫자·공백 외 제거 → 공백 축약. 자동 비교는 참고용 지표다. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function compareUtterance(target: string, stt: string): MatchResult {
  if (!stt.trim()) return 'unrecognized'
  return normalize(target) === normalize(stt) ? 'matched' : 'mismatched'
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/compare.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/compare.ts tests/compare.test.ts
git commit -m "feat: STT 자동 비교(matched/mismatched/unrecognized) 모듈"
```

---

### Task 3: `/api/sessions` 검증 교체

**Files:**
- Modify: `app/api/sessions/route.ts`
- Test: `tests/sessions-route.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/sessions-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  createSession: vi.fn().mockResolvedValue('sess-1'),
  listQuestions: vi.fn().mockResolvedValue([{ id: 1, order_no: 1, text: 'Hi.', difficulty: 'easy' }]),
}))

import { POST } from '@/app/api/sessions/route'
import * as db from '@/lib/db'

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/sessions', () => {
  it('한글 이름 + 나이 20 허용 (기존 3~19 제한 폐기 확인)', async () => {
    const res = await POST(makeReq({ name: '김도연', age: 20 }))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith('김도연', 20)
  })
  it('영어 공백 이름 허용, 연속 공백은 서버가 정규화', async () => {
    const res = await POST(makeReq({ name: '  Mary   Jane ', age: 8 }))
    expect(res.status).toBe(200)
    expect(db.createSession).toHaveBeenCalledWith('Mary Jane', 8)
  })
  it('숫자·특수문자 이름 400', async () => {
    expect((await POST(makeReq({ name: '지우1', age: 8 }))).status).toBe(400)
    expect((await POST(makeReq({ name: '지우!', age: 8 }))).status).toBe(400)
  })
  it('나이 0·비숫자·1000 400', async () => {
    expect((await POST(makeReq({ name: '지우', age: 0 }))).status).toBe(400)
    expect((await POST(makeReq({ name: '지우', age: 'abc' }))).status).toBe(400)
    expect((await POST(makeReq({ name: '지우', age: 1000 }))).status).toBe(400)
  })
  it('본문 없음 400', async () => {
    const res = await POST(new Request('http://x', { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/sessions-route.test.ts`
Expected: FAIL — "나이 20 허용" 케이스가 400 (기존 3~19 규칙), "연속 공백 정규화" 실패

- [ ] **Step 3: 라우트 구현 교체**

`app/api/sessions/route.ts` 전체를 다음으로 교체:

```ts
import { NextResponse } from 'next/server'
import { createSession, listQuestions } from '@/lib/db'
import { validAge, validName } from '@/lib/validate'

export async function POST(req: Request) {
  const { name, age } = await req.json().catch(() => ({}))
  const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
  const ageNum = Number(age)
  if (!validName(cleanName))
    return NextResponse.json({ error: '이름은 한글이나 영어로만 쓸 수 있어요.' }, { status: 400 })
  if (!validAge(ageNum))
    return NextResponse.json({ error: '나이는 숫자로만 쓸 수 있어요.' }, { status: 400 })
  const [sessionId, questions] = await Promise.all([createSession(cleanName, ageNum), listQuestions()])
  return NextResponse.json({ sessionId, questions })
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/sessions-route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/route.ts tests/sessions-route.test.ts
git commit -m "feat: 세션 생성 검증 교체 - 이름 한글·영어만, 나이 범위 제한 삭제"
```

---

### Task 4: `/api/transcribe` — sttText 비노출 + STT 실패 무차단

아이 기기로 STT 결과가 전송되지 않게 하고(평가 비노출), STT/변환 실패가 아이 진행을 막지 않게 한다(오디오는 이미 저장됨 — 판단은 결과지에서). 시도 저장 = 문항 완료로 의미 변경.

**Files:**
- Modify: `app/api/transcribe/route.ts`
- Modify: `lib/db.ts:46-48` (insertAttempt)
- Test: `tests/transcribe-route.test.ts` (재작성)

- [ ] **Step 1: 테스트 재작성 (실패 예상)**

`tests/transcribe-route.test.ts` 전체를 다음으로 교체:

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
import * as conv from '@/lib/audio-convert'
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
  it('성공: 업로드→STT→attempt 저장. 응답에 sttText 없음 (아이에게 결과 비노출)', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })   // sttText·attemptId 미포함
    expect(db.uploadRecording).toHaveBeenCalledWith('s-1/5_1.webm', expect.any(Buffer), 'audio/webm;codecs=opus')
    expect(db.insertAttempt).toHaveBeenCalledWith(expect.objectContaining({ responseId: 'resp-1', attemptNo: 1, sttText: 'i like apples' }))
  })
  it('STT 실패해도 200 — 빈 STT로 attempt 저장 (진행 무차단)', async () => {
    vi.mocked(azure.transcribeShortAudio).mockRejectedValueOnce(new Error('timeout'))
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.insertAttempt).toHaveBeenCalledWith(expect.objectContaining({ sttText: '' }))
  })
  it('오디오 변환 실패해도 200 — 빈 STT로 attempt 저장', async () => {
    vi.mocked(conv.toAzureFormat).mockRejectedValueOnce(new Error('ffmpeg fail'))
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.insertAttempt).toHaveBeenCalledWith(expect.objectContaining({ sttText: '' }))
  })
  it('업로드 실패면 502, STT 진행 안 함 (녹음 없는 텍스트 방지)', async () => {
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
    expect(azure.transcribeShortAudio).not.toHaveBeenCalled()
  })
  it('DB 저장 실패면 502 (클라이언트가 재시도 안내)', async () => {
    vi.mocked(db.insertAttempt).mockRejectedValueOnce(new Error('db down'))
    const res = await POST(makeReq())
    expect(res.status).toBe(502)
  })
  it('필수 필드 누락이면 400', async () => {
    const fd = new FormData(); fd.set('sessionId', 's-1')
    const res = await POST(new Request('http://x', { method: 'POST', body: fd }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/transcribe-route.test.ts`
Expected: FAIL — 성공 응답이 `{ sttText, attemptId }`, STT 실패 케이스가 502

- [ ] **Step 3: 라우트 구현 교체**

`app/api/transcribe/route.ts`의 `POST` 본문 중 try/catch 이후 부분(31행~)을 다음으로 교체 (업로드까지는 기존 유지):

```ts
  // STT·변환 실패는 진행을 막지 않는다 — 오디오는 저장됐고 판단은 선생님 결과지에서.
  let sttText = ''
  try {
    const converted = await toAzureFormat(bytes, mime)
    sttText = await transcribeShortAudio(converted.data, converted.contentType)
  } catch {
    sttText = ''
  }
  try {
    const responseId = await getOrCreateResponse(sessionId, questionId)
    await insertAttempt({ responseId, attemptNo, sttText, audioPath, durationSec })
  } catch (e) {
    return NextResponse.json({ error: `응답 저장 실패: ${(e as Error).message}` }, { status: 502 })
  }
  // 아이 기기로 STT 결과를 보내지 않는다 (평가 비노출 — 네트워크 탭에서도 안 보이게).
  return NextResponse.json({ ok: true })
```

- [ ] **Step 4: `lib/db.ts` insertAttempt 의미 변경**

`lib/db.ts:46-48`의

```ts
  const patch: Record<string, unknown> = { retry_count: a.attemptNo }
  if (a.sttText.trim()) { patch.status = 'completed'; patch.final_attempt_id = data!.id }
```

를 다음으로 교체:

```ts
  // 시도가 저장되면 STT 인식 여부와 무관하게 문항 완료 (진행 게이트 = 업로드 성공)
  const patch: Record<string, unknown> = {
    retry_count: a.attemptNo, status: 'completed', final_attempt_id: data!.id,
  }
```

- [ ] **Step 5: 통과 확인 + 전체 회귀**

Run: `npx vitest run tests/transcribe-route.test.ts && npm test`
Expected: transcribe 6케이스 PASS, 전체 스위트 PASS

- [ ] **Step 6: Commit**

```bash
git add app/api/transcribe/route.ts lib/db.ts tests/transcribe-route.test.ts
git commit -m "feat: STT 결과 비노출 + 진행 게이트를 업로드 성공으로 변경"
```

---

### Task 5: CSV에 자동비교 컬럼 추가

**Files:**
- Modify: `app/api/admin/export/route.ts`
- Test: `tests/export-route.test.ts`

- [ ] **Step 1: 테스트 기대값 갱신 (실패 예상)**

`tests/export-route.test.ts`의 36-38행 기대값을 다음으로 교체:

```ts
    expect(header).toBe('이름,나이,세션시작,문항번호,난이도,목표문장,시도순번,STT텍스트,자동비교,재시도총횟수,건너뜀,발화길이초,녹음경로')
    expect(row1).toBe('민준,8,2026-07-13T04:55:00Z,1,easy,I like apples.,2,i like apples,matched,2,N,3.2,s1/1_2.webm')
    expect(row2).toBe('민준,8,2026-07-13T04:55:00Z,2,easy,I like bananas.,,,skipped,0,Y,,')
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/export-route.test.ts`
Expected: FAIL — 헤더에 자동비교 없음

- [ ] **Step 3: 라우트 수정**

`app/api/admin/export/route.ts` 전체를 다음으로 교체:

```ts
import { buildCsv } from '@/lib/csv'
import { exportRows } from '@/lib/db'
import { compareUtterance } from '@/lib/compare'

export const dynamic = 'force-dynamic'

const HEADER = ['이름', '나이', '세션시작', '문항번호', '난이도', '목표문장', '시도순번', 'STT텍스트', '자동비교', '재시도총횟수', '건너뜀', '발화길이초', '녹음경로']

export async function GET() {
  const responses = await exportRows()
  const cells = responses.flatMap((r: any) => {
    const base = [
      r.sessions.child_name, r.sessions.child_age, r.sessions.started_at,
      r.questions.order_no, r.questions.difficulty, r.questions.text,
    ]
    const skipFlag = r.status === 'skipped' ? 'Y' : 'N'
    const attempts = [...(r.attempts ?? [])].sort((a: any, b: any) => a.attempt_no - b.attempt_no)
    if (attempts.length === 0) {
      return [[...base, '', '', r.status === 'skipped' ? 'skipped' : '', r.retry_count, skipFlag, '', '']]
    }
    return attempts.map((a: any) => [
      ...base, a.attempt_no, a.stt_text, compareUtterance(r.questions.text, a.stt_text),
      r.retry_count, skipFlag, a.duration_sec, a.audio_path,
    ])
  })
  return new Response(buildCsv(HEADER, cells), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="survey-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/export-route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/export/route.ts tests/export-route.test.ts
git commit -m "feat: CSV 자동비교(matched/mismatched/unrecognized/skipped) 컬럼"
```

---

### Task 6: 디자인 파운데이션 — 토큰·폰트·Blip 캐릭터

**Files:**
- Rewrite: `app/globals.css`
- Rewrite: `app/layout.tsx`
- Create: `components/Blip.tsx`

- [ ] **Step 1: `app/globals.css` 전체 교체**

```css
@import "tailwindcss";

@theme {
  --color-blue: #2F6BFF;
  --color-blue-deep: #1E4FCC;
  --color-rec: #E5484D;        /* 녹음 중 전용 (아이 화면에서 유일한 빨강) */
  --color-rec-deep: #C13A3E;
  --color-mint: #0BA37A;       /* 관리자 전용 — 일치 배지 */
  --color-amber: #B97F10;      /* 관리자 전용 — 불일치 배지 */
  --color-ink: #0E1526;
  --color-ink-soft: #3A4256;
  --color-ink-mute: #8A94AD;
  --color-bg: #F4F6FB;
  --color-line: #E3E8F3;
  --color-well: #F7F9FE;
  --font-read: var(--font-lexend), sans-serif;
}

body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-noto), sans-serif;
}

/* ---------- 공용 컴포넌트 클래스 ---------- */
.card {
  background: #fff;
  border: 1px solid var(--color-line);
  border-radius: 18px;
  box-shadow: 0 10px 24px -18px rgb(30 79 204 / .25);
}
.cta {
  display: flex; height: 54px; width: 100%; align-items: center; justify-content: center;
  border-radius: 15px; background: var(--color-blue);
  font-size: 16px; font-weight: 700; color: #fff;
  box-shadow: 0 3px 0 var(--color-blue-deep), 0 12px 20px -10px rgb(30 79 204 / .45);
  transition: transform .08s, box-shadow .08s, opacity .15s;
}
.cta:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--color-blue-deep); }
.cta:disabled { opacity: .4; pointer-events: none; }
.kpi {
  background: var(--color-well); border: 1px solid var(--color-line);
  border-radius: 11px; padding: 7px 13px; font-size: 12px; color: var(--color-ink-soft);
}
.kpi b { color: var(--color-ink); font-family: var(--font-read), sans-serif; }

/* ---------- 모션 (기능 피드백 전용) ---------- */
@keyframes blip-blink { 0%, 93%, 100% { transform: scaleY(1) } 96% { transform: scaleY(.08) } }
@keyframes blip-antp { 0%, 100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.28); opacity: .85 } }
@keyframes rip { 0% { transform: scale(.88); opacity: 1 } 100% { transform: scale(1.3); opacity: 0 } }

.blip-blink { transform-box: fill-box; transform-origin: center; animation: blip-blink 4.6s infinite; }
.blip-antpulse { transform-box: fill-box; transform-origin: center; animation: blip-antp 1.3s ease-in-out infinite; }
.ripple { position: relative; }
.ripple::before {
  content: ""; position: absolute; inset: -12px; border-radius: 9999px;
  border: 2.5px solid rgb(47 107 255 / .3); animation: rip 2s ease-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2: `app/layout.tsx` 전체 교체 (Jua 삭제)**

```tsx
import type { Metadata } from 'next'
import { Noto_Sans_KR, Lexend } from 'next/font/google'
import './globals.css'

const noto = Noto_Sans_KR({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-noto' })
const lexend = Lexend({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-lexend' })

export const metadata: Metadata = { title: '말하기 설문', description: '영어 문장을 소리 내어 읽는 설문' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${noto.variable} ${lexend.variable} min-h-dvh`}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: `components/Blip.tsx` 생성**

목업 `2026-07-13-redesign-mockup-v3.html`의 SVG를 컴포넌트화. `useId`는 RSC에서 동작하므로 `'use client'` 불필요.

```tsx
import { useId } from 'react'

type Variant = 'logo' | 'idle' | 'recording'

/** 블립 — 로고 + 녹음 상태등. 감정 연출(축하·응원) 변형은 만들지 않는다(스펙: 평가 비노출). */
export function Blip({ variant = 'idle', className }: { variant?: Variant; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const g = `blip-g-${uid}`, e = `blip-e-${uid}`
  const defs = (
    <defs>
      <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5A90FF" /><stop offset="1" stopColor="#2454DB" />
      </linearGradient>
      <radialGradient id={e} cx="38%" cy="32%" r="75%">
        <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#DCE6FF" />
      </radialGradient>
    </defs>
  )

  if (variant === 'logo') return (
    <svg viewBox="0 0 56 60" className={className} role="img" aria-label="말하기 설문 로고">
      {defs}
      <line x1="28" y1="12" x2="28" y2="5" stroke="#22335C" strokeWidth="3" strokeLinecap="round" />
      <circle cx="28" cy="4" r="3.5" fill="#2F6BFF" />
      <rect x="4" y="13" width="48" height="42" rx="15" fill={`url(#${g})`} />
      <circle cx="20" cy="31" r="7" fill={`url(#${e})`} /><circle cx="36" cy="31" r="7" fill={`url(#${e})`} />
      <g className="blip-blink">
        <circle cx="21" cy="32" r="3.5" fill="#0E1526" /><circle cx="37" cy="32" r="3.5" fill="#0E1526" />
      </g>
      <path d="M21 43 Q28 48 35 43" fill="none" stroke="#0E1526" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )

  const rec = variant === 'recording'
  const eyeY = rec ? 66 : 68
  return (
    <svg viewBox="0 0 140 132" className={className} role="img" aria-label={rec ? '녹음 중' : '블립'}>
      {defs}
      <ellipse cx="70" cy="124" rx="40" ry="7" fill="#1E3A86" opacity=".12" />
      <line x1="70" y1="30" x2="70" y2="15" stroke="#22335C" strokeWidth="4.5" strokeLinecap="round" />
      <circle className={rec ? 'blip-antpulse' : undefined} cx="70" cy="11" r="7.5"
        fill={rec ? '#E5484D' : '#2F6BFF'} />
      <rect x="28" y="32" width="84" height="76" rx="27" fill={`url(#${g})`} />
      <rect x="38" y="41" width="48" height="17" rx="8.5" fill="#fff" opacity=".14" />
      <circle cx="54" cy={eyeY} r="13" fill={`url(#${e})`} /><circle cx="86" cy={eyeY} r="13" fill={`url(#${e})`} />
      <g className="blip-blink">
        <circle cx="56" cy={eyeY + 2} r="6.5" fill="#0E1526" /><circle cx="88" cy={eyeY + 2} r="6.5" fill="#0E1526" />
      </g>
      {rec
        ? <ellipse cx="70" cy="92" rx="7" ry="9" fill="#0E1526" />
        : <path d="M58 89 Q70 96 82 89" fill="none" stroke="#0E1526" strokeWidth="4" strokeLinecap="round" />}
      <rect x="46" y="108" width="18" height="11" rx="5.5" fill="#2454DB" />
      <rect x="76" y="108" width="18" height="11" rx="5.5" fill="#2454DB" />
    </svg>
  )
}
```

- [ ] **Step 4: 타입 확인**

Run: `npm run typecheck`
Expected: 에러 0. (기존 페이지들이 아직 구 토큰 `bg-peach` 등을 클래스 문자열로 참조하지만 이는 CSS라 타입에러 아님 — Task 8-9에서 교체)

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx components/Blip.tsx
git commit -m "feat: v3 디자인 토큰·폰트(Noto Sans KR+Lexend)·블립 캐릭터"
```

---

### Task 7: 공용 컴포넌트 — ProgressBar·LevelMeter·RecordButton·AudioPlayer

**Files:**
- Rewrite: `components/ProgressBar.tsx`
- Rewrite: `components/LevelMeter.tsx`
- Rewrite: `components/RecordButton.tsx`
- Create: `components/AudioPlayer.tsx`

- [ ] **Step 1: `components/ProgressBar.tsx` 전체 교체**

```tsx
export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full">
      <p className="mb-1.5 text-xs text-ink-mute">
        문항 <b className="font-read font-semibold text-ink-soft">{current} / {total}</b>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E7ECF8]">
        <div className="h-full rounded-full bg-blue transition-all"
          style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `components/LevelMeter.tsx` 전체 교체**

```tsx
'use client'
/** 목소리 크기 막대 5개 — "기계가 듣고 있다"는 기능 피드백 (칭찬 신호 아님) */
const BARS = [
  { h: 10, t: 0.05 }, { h: 19, t: 0.15 }, { h: 28, t: 0.3 }, { h: 17, t: 0.5 }, { h: 12, t: 0.7 },
]

export function LevelMeter({ level }: { level: number }) {
  return (
    <div className="flex h-8 items-end justify-center gap-[5px]" aria-label="목소리 크기">
      {BARS.map((b, i) => (
        <div key={i}
          className={`w-1.5 rounded-[3px] transition-colors duration-75 ${level > b.t ? 'bg-blue' : 'bg-line'}`}
          style={{ height: b.h }} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: `components/RecordButton.tsx` 전체 교체 (20초 링 타이머 내장)**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { RecState } from '@/hooks/useRecorder'

const R = 54
const CIRC = 2 * Math.PI * R

export function RecordButton({ state, onStart, onStop, disabled, maxSec = 20 }: {
  state: RecState; onStart: () => void; onStop: () => void; disabled?: boolean; maxSec?: number
}) {
  const recording = state === 'recording'
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!recording) { setElapsed(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100)
    return () => clearInterval(id)
  }, [recording])

  if (!recording) return (
    <button onClick={onStart} disabled={disabled} aria-label="녹음 시작"
      className="ripple flex h-[92px] w-[92px] items-center justify-center rounded-full bg-blue text-white shadow-[0_4px_0_var(--color-blue-deep),0_16px_24px_-12px_rgba(30,79,204,.5)] transition active:translate-y-[2px] disabled:opacity-40">
      <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
      </svg>
    </button>
  )

  return (
    <button onClick={onStop} aria-label="녹음 끝내기"
      className="relative flex h-[92px] w-[92px] items-center justify-center rounded-full bg-rec shadow-[0_4px_0_var(--color-rec-deep),0_16px_24px_-12px_rgba(197,58,62,.45)] transition active:translate-y-[2px]">
      <svg className="absolute -inset-2 -rotate-90" viewBox="0 0 116 116" aria-hidden="true">
        <circle cx="58" cy="58" r={R} fill="none" stroke="rgb(197 58 62 / .15)" strokeWidth="4.5" />
        <circle cx="58" cy="58" r={R} fill="none" stroke="#E5484D" strokeWidth="4.5"
          strokeLinecap="round" strokeDasharray={CIRC}
          strokeDashoffset={CIRC * Math.min(elapsed / maxSec, 1)} />
      </svg>
      <span className="h-7 w-7 rounded-lg bg-white" />
    </button>
  )
}
```

- [ ] **Step 4: `components/AudioPlayer.tsx` 생성 (관리자 전용)**

```tsx
'use client'
import { useRef, useState } from 'react'

export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [prog, setProg] = useState(0)

  function toggle() {
    const a = ref.current
    if (!a) return
    if (playing) a.pause()
    else void a.play()
  }

  return (
    <div className="flex w-44 items-center gap-2">
      <button onClick={toggle} aria-label={playing ? '일시정지' : '재생'}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-white">
        {playing ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          </svg>
        ) : (
          <svg className="ml-0.5 h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="h-1.5 flex-1 rounded-full bg-line">
        <div className="h-full rounded-full bg-blue" style={{ width: `${prog * 100}%` }} />
      </div>
      <audio ref={ref} src={src} preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProg(0) }}
        onTimeUpdate={e => { const a = e.currentTarget; if (a.duration) setProg(a.currentTime / a.duration) }} />
    </div>
  )
}
```

- [ ] **Step 5: 타입 확인**

Run: `npm run typecheck`
Expected: 에러 0

- [ ] **Step 6: Commit**

```bash
git add components/ProgressBar.tsx components/LevelMeter.tsx components/RecordButton.tsx components/AudioPlayer.tsx
git commit -m "feat: v3 공용 컴포넌트 - 진행바·레벨미터·링타이머 녹음버튼·오디오플레이어"
```

---

### Task 8: 아이 화면 — 랜딩·설문·완료 재작성

**Files:**
- Rewrite: `app/page.tsx`
- Rewrite: `app/survey/page.tsx`
- Rewrite: `app/done/page.tsx`

- [ ] **Step 1: `app/page.tsx` 전체 교체**

IME 안전: 이름 입력은 타이핑 중 필터링하지 않고(조합 깨짐 방지) 제출 시 검증. 나이는 숫자만 즉시 필터(IME 무관).

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { validAge, validName } from '@/lib/validate'

export default function StartPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function begin() {
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const ageNum = Number(age)
    if (!validName(cleanName)) { setErr('이름은 한글이나 영어로만 쓸 수 있어요.'); return }
    if (!validAge(ageNum)) { setErr('나이는 숫자로만 쓸 수 있어요.'); return }
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, age: ageNum }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? '문제가 생겼어요. 다시 시도해 주세요.'); return }
      sessionStorage.setItem('survey', JSON.stringify({ sessionId: json.sessionId, questions: json.questions, name: cleanName }))
      router.push('/survey')
    } finally { setBusy(false) }
  }

  const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">말하기 설문</span>
      </div>
      <h1 className="mt-14 text-2xl font-bold">안녕하세요!</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        화면에 나오는 영어 문장을<br />소리 내어 읽는 설문이에요.
      </p>
      <div className="card mt-8 w-full p-5">
        <label className="text-[13px] font-bold text-ink-soft" htmlFor="name">이름</label>
        <input id="name" value={name} maxLength={30} onChange={e => setName(e.target.value)}
          className={inputCls} />
        <label className="mt-4 block text-[13px] font-bold text-ink-soft" htmlFor="age">나이</label>
        <input id="age" value={age} inputMode="numeric" maxLength={3}
          onChange={e => setAge(e.target.value.replace(/\D/g, ''))} className={inputCls} />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">이름은 한글·영어만, 나이는 숫자만 쓸 수 있어요.</p>
        {err && <p role="alert" className="mt-2 text-sm text-rec-deep">{err}</p>}
        <button onClick={begin} disabled={busy || !name.trim() || !age} className="cta mt-4">
          {busy ? '준비 중…' : '시작하기'}
        </button>
      </div>
      <p className="mt-auto pt-6 text-center text-[11px] text-ink-mute">녹음된 목소리는 설문 확인 용도로만 사용돼요.</p>
    </main>
  )
}
```

- [ ] **Step 2: `app/survey/page.tsx` 전체 교체**

핵심 로직 변경: `sttText` 상태·표시 삭제 → `saved`(업로드 성공 래치)가 다음 게이트. `lowVolume`은 기술 안내만(진행 무차단). 재녹음은 attemptNo 증가 후 즉시 녹음 시작.

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { LevelMeter } from '@/components/LevelMeter'
import { ProgressBar } from '@/components/ProgressBar'
import { RecordButton } from '@/components/RecordButton'
import { Blip } from '@/components/Blip'

interface Question { id: number; order_no: number; text: string }
interface Survey { sessionId: string; questions: Question[]; name: string }
type Phase = 'mic' | 'question'

const MAX_SEC = 20
const SILENT_PEAK = 0.01 // 이 미만이면 무음 의심 — 기술 안내만, 진행은 막지 않음

export default function SurveyPage() {
  const router = useRouter()
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [phase, setPhase] = useState<Phase>('mic')
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [qIdx, setQIdx] = useState(0)
  const [attemptNo, setAttemptNo] = useState(1)
  const [saved, setSaved] = useState(false)       // 이 문항에 저장된 시도 존재 → 다음 활성 (STT 무관)
  const [lowVolume, setLowVolume] = useState(false)
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

  // 녹음 업로드 — 서버가 저장+STT 수행. STT 결과는 응답에 없다(평가 비노출).
  async function upload(rec: Recording) {
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
      if (!res.ok) { setErr('저장에 문제가 생겼어요. 다시 시도해 주세요.'); return }
      setSaved(true)
      setLowVolume(rec.peak < SILENT_PEAK)
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  async function handleComplete(rec: Recording) {
    setLastRec(rec)
    if (phase === 'mic') { setMicOk(rec.peak > 0.1 ? 'ok' : 'quiet'); return }
    await upload(rec)
  }

  const recorder = useRecorder(MAX_SEC, handleComplete)

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicDenied(false) }
    catch { setMicDenied(true) }
  }

  function retryRecord() {
    setAttemptNo(n => n + 1)
    setLowVolume(false)
    void startRecording()
  }

  function resetForQuestion() {
    setSaved(false); setLowVolume(false); setErr(''); setConfirmSkip(false); setLastRec(null)
  }

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

  // ---------- 마이크 권한 거부 ----------
  if (micDenied) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h2 className="text-xl font-bold">마이크를 쓸 수 없어요</h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        브라우저 주소창의 자물쇠 아이콘을 눌러<br />마이크를 <b>허용</b>으로 바꾼 뒤 다시 눌러 주세요.
      </p>
      <button onClick={startRecording} className="cta mt-2 max-w-60">다시 시도</button>
    </main>
  )

  // ---------- 마이크 확인 ----------
  if (phase === 'mic') return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">말하기 설문</span>
      </div>
      <h1 className="mt-14 text-2xl font-bold">마이크 확인</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        버튼을 누르고<br /><b>&ldquo;안녕하세요&rdquo;</b>라고 말해 주세요.
      </p>
      <div className="mt-9">
        <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop} maxSec={MAX_SEC} />
      </div>
      <div className="mt-6"><LevelMeter level={recorder.level} /></div>
      <p className="mt-2 text-[11px] text-ink-mute">목소리가 들리면 막대가 움직여요.</p>
      {micOk === 'quiet' && (
        <p className="mt-3 text-sm text-ink-soft">목소리가 잘 안 들려요. 마이크 가까이에서 다시 한번 해 주세요.</p>
      )}
      <div className="mt-auto w-full pb-2">
        {micOk === 'ok' && (
          <button onClick={() => { setPhase('question'); resetForQuestion() }} className="cta">설문 시작</button>
        )}
      </div>
    </main>
  )

  // ---------- 문항 ----------
  const recording = recorder.state === 'recording'
  const showRecordButton = recording || (!saved && !busy)
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8">
      <ProgressBar current={qIdx + 1} total={survey.questions.length} />
      <div className="card mt-5 p-5">
        <p className="text-xs font-bold text-blue">아래 문장을 소리 내어 읽어 주세요</p>
        <p className="font-read mt-2 text-[22px] font-medium leading-snug">{q!.text}</p>
      </div>

      {recording && (
        <div className="mt-4 flex items-center gap-3">
          <Blip variant="recording" className="h-[50px] w-[53px]" />
          <span className="blip-antpulse inline-block h-2 w-2 rounded-full bg-rec" />
          <span className="text-[13px] font-bold text-rec-deep">녹음 중</span>
          <LevelMeter level={recorder.level} />
        </div>
      )}

      {busy && <p className="mt-4 text-sm text-ink-mute">저장하고 있어요…</p>}

      {saved && !recording && !busy && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </span>
          <p className="text-sm text-ink-soft">
            {lowVolume ? '목소리가 잘 안 담긴 것 같아요. 한 번 더 말해 볼까요?' : '목소리가 잘 담겼어요.'}
          </p>
        </div>
      )}

      {err && !busy && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-center text-sm text-ink-soft">{err}</p>
          {lastRec && <button onClick={() => upload(lastRec)} className="cta max-w-60">다시 시도</button>}
        </div>
      )}

      <div className="mt-auto flex flex-col items-center gap-2.5 pb-2 pt-6">
        {showRecordButton && (
          <>
            <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop}
              disabled={busy} maxSec={MAX_SEC} />
            <p className="text-xs font-bold text-ink-soft">
              {recording ? '다 읽었으면 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
            </p>
          </>
        )}
        {saved && !recording && !busy && (
          <>
            <button onClick={next} className="cta">다음 문장</button>
            <button onClick={retryRecord} className="text-[13px] text-ink-mute underline">다시 녹음하기</button>
          </>
        )}
        {!recording && (confirmSkip ? (
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span>정말 건너뛸까요?</span>
            <button onClick={skip} className="rounded-full bg-ink/10 px-4 py-1">네</button>
            <button onClick={() => setConfirmSkip(false)} className="rounded-full bg-ink/10 px-4 py-1">아니요</button>
          </div>
        ) : (
          <button onClick={() => setConfirmSkip(true)} className="mt-1 text-xs text-ink-mute underline">
            이 문장 건너뛰기
          </button>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: `app/done/page.tsx` 전체 교체 (중립 마무리 — 축하 아님)**

```tsx
import Link from 'next/link'
import { Blip } from '@/components/Blip'

export default function DonePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-28 w-[118px]" />
      <h1 className="mt-2 text-2xl font-bold">설문이 끝났어요</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        참여해 줘서 고마워요.<br />이제 화면을 선생님께 보여 주세요.
      </p>
      <Link href="/" className="cta mt-6 max-w-60">처음 화면으로</Link>
    </main>
  )
}
```

- [ ] **Step 4: 타입 + 회귀 확인**

Run: `npm run typecheck && npm test`
Expected: 타입 에러 0, 전체 테스트 PASS

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx app/survey/page.tsx app/done/page.tsx
git commit -m "feat: 아이 화면 v3 재작성 - 평가 비노출, 업로드 성공 게이트, IME 안전 검증"
```

---

### Task 9: 관리자 — 로그인·목록·결과지

**Files:**
- Rewrite: `app/admin/login/page.tsx`
- Rewrite: `app/admin/page.tsx`
- Rewrite: `app/admin/[id]/page.tsx`
- Delete: `components/AttemptList.tsx`

- [ ] **Step 1: `app/admin/login/page.tsx` 전체 교체**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'

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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <div className="card p-6">
        <div className="flex items-center gap-2">
          <Blip variant="logo" className="h-8 w-8" />
          <span className="text-sm font-bold text-ink-soft">말하기 설문 · 관리자</span>
        </div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()} placeholder="비밀번호"
          className="mt-5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15" />
        {err && <p role="alert" className="mt-2 text-sm text-rec-deep">{err}</p>}
        <button onClick={login} className="cta mt-4">로그인</button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: `app/admin/page.tsx` 전체 교체 (KPI 칩 + 차분한 테이블)**

```tsx
import Link from 'next/link'
import { listQuestions, listSessions } from '@/lib/db'
import { Blip } from '@/components/Blip'

export const dynamic = 'force-dynamic'

export default async function AdminList() {
  const [sessions, questions] = await Promise.all([listSessions(), listQuestions()])
  const total = questions.length
  const done = sessions.filter(s => s.completed_at).length
  const todayKey = new Date().toDateString()
  const today = sessions.filter(s => new Date(s.started_at).toDateString() === todayKey).length

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Blip variant="logo" className="h-8 w-8" />
          <div>
            <p className="text-[15px] font-bold">말하기 설문 · 관리자</p>
            <p className="text-[11px] text-ink-mute">이름을 누르면 결과지가 열립니다</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="kpi">세션 <b>{sessions.length}</b></span>
            <span className="kpi">완료 <b>{done}</b></span>
            <span className="kpi">오늘 <b>{today}</b></span>
            <a href="/api/admin/export" className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white">
              CSV 내보내기
            </a>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th className="px-5 py-3 font-medium">이름</th>
              <th className="font-medium">나이</th>
              <th className="font-medium">시작</th>
              <th className="font-medium">진행</th>
              <th className="font-medium">상태</th>
              <th className="pr-5 font-medium">건너뜀</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              const answered = s.responses.filter(r => r.status === 'completed' || r.status === 'skipped').length
              const skipped = s.responses.filter(r => r.status === 'skipped').length
              return (
                <tr key={s.id} className="border-t border-line/60 hover:bg-well">
                  <td className="px-5 py-3">
                    <Link href={`/admin/${s.id}`} className="font-bold text-blue">{s.child_name}</Link>
                  </td>
                  <td>{s.child_age}</td>
                  <td className="text-ink-soft">{new Date(s.started_at).toLocaleString('ko-KR')}</td>
                  <td className="font-read">{answered} / {total}</td>
                  <td>
                    {s.completed_at
                      ? <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">완료</span>
                      : <span className="rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">진행 중</span>}
                  </td>
                  <td className="pr-5">{skipped > 0 ? `${skipped}개` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sessions.length === 0 && <p className="p-8 text-center text-sm text-ink-mute">아직 참여한 세션이 없습니다.</p>}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: `app/admin/[id]/page.tsx` 전체 교체 (결과지)**

```tsx
import Link from 'next/link'
import { sessionDetail, signedAudioUrl } from '@/lib/db'
import { compareUtterance, type MatchResult } from '@/lib/compare'
import { AudioPlayer } from '@/components/AudioPlayer'
import { Blip } from '@/components/Blip'

export const dynamic = 'force-dynamic'

const PILL: Record<MatchResult | 'skipped' | 'none', { label: string; cls: string }> = {
  matched: { label: '일치', cls: 'bg-mint/10 text-mint' },
  mismatched: { label: '불일치', cls: 'bg-amber/10 text-amber' },
  unrecognized: { label: '인식 안 됨', cls: 'bg-ink/5 text-ink-mute' },
  skipped: { label: '건너뜀', cls: 'bg-ink/5 text-ink-mute' },
  none: { label: '미응답', cls: 'bg-ink/5 text-ink-mute' },
}

function Pill({ kind }: { kind: keyof typeof PILL }) {
  const p = PILL[kind]
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${p.cls}`}>{p.label}</span>
}

export default async function AdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, rows } = await sessionDetail(id)
  const items = await Promise.all(rows.map(async r => ({
    ...r,
    views: await Promise.all(r.attempts.map(async a => ({
      no: a.attempt_no, stt: a.stt_text,
      url: await signedAudioUrl(a.audio_path),
      match: compareUtterance(r.question.text, a.stt_text),
    }))),
  })))
  const answered = items.filter(r => r.views.length > 0).length
  const skipped = items.filter(r => r.status === 'skipped').length
  const matched = items.filter(r => r.views.length > 0 && r.views[r.views.length - 1].match === 'matched').length

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href="/admin" className="text-sm text-ink-mute underline">← 목록</Link>
      <div className="mt-3 overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Blip variant="logo" className="h-8 w-8" />
          <div>
            <p className="text-[15px] font-bold">결과지 — {session.child_name} ({session.child_age}세)</p>
            <p className="text-[11px] text-ink-mute">
              {new Date(session.started_at).toLocaleString('ko-KR')} · {session.completed_at ? '완료' : '진행 중'}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <span className="kpi">응답 <b>{answered} / {items.length}</b></span>
            <span className="kpi">자동 일치 <b>{matched}</b></span>
            <span className="kpi">건너뜀 <b>{skipped}</b></span>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th className="w-11 px-5 py-3 font-medium">#</th>
              <th className="font-medium">제시 문장</th>
              <th className="w-14 font-medium">시도</th>
              <th className="font-medium">들린 말 (STT)</th>
              <th className="w-28 font-medium">자동 비교</th>
              <th className="w-52 pr-5 font-medium">듣기</th>
            </tr>
          </thead>
          <tbody>
            {items.flatMap(r => {
              if (r.views.length === 0) return [(
                <tr key={r.question.id} className="border-t border-line/60">
                  <td className="px-5 py-3 text-ink-mute">{r.question.order_no}</td>
                  <td className="font-read">{r.question.text}</td>
                  <td>—</td>
                  <td className="text-ink-mute">—</td>
                  <td><Pill kind={r.status === 'skipped' ? 'skipped' : 'none'} /></td>
                  <td className="pr-5">—</td>
                </tr>
              )]
              return r.views.map((v, i) => (
                <tr key={`${r.question.id}-${v.no}`} className={i === 0 ? 'border-t border-line/60' : ''}>
                  <td className="px-5 py-3 text-ink-mute">{i === 0 ? r.question.order_no : ''}</td>
                  <td className="font-read">
                    {i === 0 ? r.question.text : ''}
                    {i === 0 && r.status === 'skipped' && <span className="ml-2 text-xs text-ink-mute">(이후 건너뜀)</span>}
                  </td>
                  <td className="text-ink-mute">{r.views.length > 1 ? `#${v.no}` : ''}</td>
                  <td className="font-read">{v.stt || <span className="text-ink-mute">(인식되지 않음)</span>}</td>
                  <td><Pill kind={v.match} /></td>
                  <td className="py-2 pr-5"><AudioPlayer src={v.url} /></td>
                </tr>
              ))
            })}
          </tbody>
        </table>
        <p className="border-t border-line bg-well px-5 py-3 text-[11.5px] text-ink-mute">
          자동 비교는 참고용입니다 — 최종 평가는 녹음을 직접 듣고 판단해 주세요. 모든 시도(재녹음 포함)가 순서대로 저장됩니다.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: AttemptList 삭제**

```bash
git rm components/AttemptList.tsx
```

- [ ] **Step 5: 구 토큰 잔재 확인 + 타입/회귀**

Run: `grep -rn "peach\|berry\|cream\|bg-sky\|text-sky\|font-cute\|Jua" app components lib; npm run typecheck && npm test`
Expected: grep 결과 0건, 타입 에러 0, 전체 테스트 PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: 관리자 v3 재작성 - KPI 칩 목록 + 자동비교 결과지, AttemptList 제거"
```

---

### Task 10: 최종 검증 — 빌드·E2E·README

**Files:**
- Modify: `README.md:3-4`, `README.md:22`, `README.md:27`

- [ ] **Step 1: 전체 게이트**

Run: `npm test && npm run typecheck && npm run build`
Expected: 테스트 전부 PASS, 타입 에러 0, 빌드 성공

- [ ] **Step 2: README 갱신**

`README.md:3-4`를 다음으로 교체:

```markdown
화면의 영어 문장을 아이가 소리 내어 읽으면 녹음을 저장하고 Azure STT로 변환한다.
아이 화면에는 인식 결과·정오가 표시되지 않으며(평가 비노출), 평가는 관리자 결과지(`/admin`)에서
문항별 STT·자동 비교·청취로 수행한다. CSV 다운로드 지원.
```

`README.md:22`(체크리스트 첫 항목)를 다음으로 교체:

```markdown
  - [ ] Chrome(PC): 시작(이름 한글·영어만/나이 숫자만)→마이크 확인→녹음→"목소리가 잘 담겼어요"(STT 미표시 확인)→다시 녹음→다음→건너뛰기→완료
```

`README.md:27`(무음 항목)을 다음으로 교체:

```markdown
  - [ ] 무음 녹음 → "잘 안 담긴 것 같아요" 안내가 뜨되 [다음 문장]은 활성 유지 (진행 무차단)
```

- [ ] **Step 3: 실 서버 E2E — 목업과 대조**

```bash
lsof -ti:3000 | xargs kill -9; npm run dev &
```

브라우저(`http://localhost:3000`)에서 확인 — `docs/superpowers/specs/2026-07-13-redesign-mockup-v3.html`을 다른 탭에 띄워 대조:

1. 랜딩: 블립 로고+카드 폼. 이름 "지우1" 제출 → 오류 문구. 이름 "김도연"/나이 "20" → 통과(구 3~19 제한 폐기 확인). 한글 조합 중 글자 깨짐 없는지 확인.
2. 마이크 확인: 말하면 파란 막대 반응 → "설문 시작" 활성.
3. 문항: 녹음 시작 → 빨간 정지 버튼+링 감소+블립 안테나 빨강. 정지 → "저장하고 있어요…" → "목소리가 잘 담겼어요." **STT 텍스트가 어디에도 없어야 함.** 개발자도구 Network에서 `/api/transcribe` 응답이 `{"ok":true}`인지 확인.
4. "다시 녹음하기" → 즉시 재녹음 → 저장 후에도 "다음 문장" 활성.
5. 건너뛰기 확인 플로우 → 완료 화면(중립 문구, 축하 없음).
6. `/admin`: 로그인(개발 비번 `admin1234`) → KPI 칩+테이블 → 세션 클릭 → 결과지: 문항별 STT·자동 비교 pill·커스텀 플레이어 재생. CSV 다운로드 → 자동비교 컬럼 확인.
7. 아이 화면 3페이지에 이모지·별·칭찬 문구가 없는지 육안 최종 확인.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README를 평가 비노출 흐름·신규 검증 규칙에 맞게 갱신"
```

- [ ] **Step 5: 완료 보고**

superpowers:verification-before-completion 체크 후, 최종 요약을 **한국어**로 작성 (사용자 선호).
