# STT 정확도 개선 Implementation Plan

> **[폐기됨 2026-07-14]** STT 자체가 제거되어 이 계획은 더 이상 유효하지 않다.
> 대체: `docs/superpowers/plans/2026-07-14-kodys-g1-redesign.md`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자동 비교를 완전일치 → 단어 단위 퍼지 점수(0~100, 4단계)로 바꾸고, Azure STT를 `format=detailed`+`Lexical`(ITN 회피)로 전환하며 타임아웃을 25초로 늘려, 아동 발화 판정의 공정성과 견고성을 높인다. 아이 화면·평가 비노출 원칙·DB 스키마는 무변경.

**Architecture:** 순수 함수(`lib/compare.ts`)를 TDD로 먼저 바꾸고(반환 타입 breaking: 문자열→객체), Azure 호출부(`lib/azure-stt.ts`)를 TDD로 전환한 뒤, 그 breaking change를 소비하는 두 곳(CSV export 라우트, 관리자 결과지)을 순서대로 맞춘다. `/api/transcribe`·DB·아이 페이지는 건드리지 않는다(`transcribeShortAudio`의 반환 타입은 `Promise<string>` 유지, `compareUtterance`는 export/admin에서만 소비).

**Tech Stack:** Next.js 16, React 19, TS 7.0.2(tsgo), Vitest 4. 타입검증 `npm run typecheck`(빌드 아님). Azure Speech REST 단문 STT.

**스펙:** `docs/superpowers/specs/2026-07-13-stt-accuracy-improvements-design.md`

**규칙:**
- 아이 화면(app/page.tsx, app/survey/page.tsx, app/done/page.tsx)·`/api/transcribe`·`lib/db.ts`·DB 마이그레이션은 이 작업에서 건드리지 않는다.
- TypeScript 다운그레이드 금지.

---

## File Structure

| 파일 | 변경 |
|---|---|
| `lib/compare.ts` | 퍼지 점수 + 4단계, 반환 타입 `CompareResult` 객체로 변경 |
| `tests/compare.test.ts` | 재작성 |
| `lib/azure-stt.ts` | `format=detailed`, `NBest[0].Lexical` 파싱, 타임아웃 25초 |
| `tests/azure-stt.test.ts` | 갱신 |
| `app/api/admin/export/route.ts` | 새 반환 타입 반영 + `유사도` 컬럼 |
| `tests/export-route.test.ts` | 기대값 갱신 |
| `app/admin/[id]/page.tsx` | `partial` pill + 유사도% + KPI 부분일치 |

---

### Task 1: `lib/compare.ts` — 단어 퍼지 점수 + 4단계

**Files:** Modify `lib/compare.ts`, Rewrite `tests/compare.test.ts`.

- [ ] **Step 1: 테스트 재작성 (실패 예상)**

`tests/compare.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect } from 'vitest'
import { compareUtterance, normalize, wordMatchScore } from '@/lib/compare'

describe('normalize', () => {
  it('소문자화·구두점 제거·공백 축약', () => {
    expect(normalize('The cat sits on the mat.')).toBe('the cat sits on the mat')
    expect(normalize("  Don't   run! ")).toBe('dont run')
  })
  it('NFKC: 전각·합자 정규화', () => {
    expect(normalize('ＡＢＣ')).toBe('abc')
    expect(normalize('ﬁne')).toBe('fine')
  })
})

describe('wordMatchScore', () => {
  it('완전 일치 = 100', () =>
    expect(wordMatchScore('The cat sits on the mat.', 'the cat sits on the mat')).toBe(100))
  it('근접 치환(단·복수)은 부분점수', () =>
    // 5단어 중 apple(≈apples)·orange(≈oranges) 각 0.5 → (1+1+0.5+1+0.5)/5 = 80
    expect(wordMatchScore('I like apples and oranges.', 'I like apple and orange.')).toBe(80))
  it('누락 단어는 0점 처리', () =>
    // the,ball 일치 / big,red 누락 → 2/4 = 50
    expect(wordMatchScore('the big red ball', 'the ball')).toBe(50))
  it('여분의 단어(삽입)는 감점하지 않음', () =>
    expect(wordMatchScore('I see a bird', 'um I see a a bird yes')).toBe(100))
  it('전혀 다른 문장은 저점', () =>
    expect(wordMatchScore('I like apples', 'dog runs fast')).toBe(0))
})

describe('compareUtterance', () => {
  it('완전 일치 → matched 100', () =>
    expect(compareUtterance('I like apples.', 'i like apples')).toEqual({ status: 'matched', score: 100 }))
  it('근접(80) → partial', () =>
    expect(compareUtterance('I like apples and oranges.', 'I like apple and orange.')).toEqual({ status: 'partial', score: 80 }))
  it('전혀 다름 → mismatched', () =>
    expect(compareUtterance('I like apples', 'dog runs fast')).toEqual({ status: 'mismatched', score: 0 }))
  it('STT 빈 값·공백만 → unrecognized 0', () => {
    expect(compareUtterance('Hello.', '')).toEqual({ status: 'unrecognized', score: 0 })
    expect(compareUtterance('Hello.', '  ')).toEqual({ status: 'unrecognized', score: 0 })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/compare.test.ts`
Expected: FAIL — `wordMatchScore` 없음, `compareUtterance`가 문자열 반환.

- [ ] **Step 3: `lib/compare.ts` 전체 교체**

```ts
export type MatchStatus = 'matched' | 'partial' | 'mismatched' | 'unrecognized'
export interface CompareResult { status: MatchStatus; score: number }

/** 소문자화 → NFKC 정규화 → 글자·숫자·공백 외 제거 → 공백 축약. 자동 비교는 참고용 지표다. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => i)
  for (let j = 1; j <= n; j++) {
    let prev = dp[0]
    dp[0] = j
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i]
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1])
      prev = tmp
    }
  }
  return dp[m]
}

/** 두 단어의 크레딧: 동일 1.0, 글자 유사도 0.75 이상이면 0.5(근접 오차), 그 외 0. */
function wordCredit(a: string, b: string): number {
  if (a === b) return 1
  const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length)
  return sim >= 0.75 ? 0.5 : 0
}

/** 정답 단어 대비 크레딧 합 비율(0~100). 삽입(여분 단어)은 무감점, 누락은 0점. */
export function wordMatchScore(target: string, stt: string): number {
  const t = normalize(target).split(' ').filter(Boolean)
  const s = normalize(stt).split(' ').filter(Boolean)
  const T = t.length, S = s.length
  if (T === 0) return 0
  const dp: number[][] = Array.from({ length: T + 1 }, () => new Array(S + 1).fill(0))
  for (let i = 1; i <= T; i++) {
    for (let j = 1; j <= S; j++) {
      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + wordCredit(t[i - 1], s[j - 1]), // 정렬/치환
        dp[i - 1][j],                                       // 정답 단어 누락(0점)
        dp[i][j - 1],                                       // STT 여분 단어(무감점)
      )
    }
  }
  return Math.round((dp[T][S] / T) * 100)
}

export function compareUtterance(target: string, stt: string): CompareResult {
  if (!stt.trim()) return { status: 'unrecognized', score: 0 }
  const score = wordMatchScore(target, stt)
  const status: MatchStatus = score >= 90 ? 'matched' : score >= 60 ? 'partial' : 'mismatched'
  return { status, score }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/compare.test.ts`
Expected: PASS (전 케이스). 특히 `wordMatchScore('I like apples and oranges.','I like apple and orange.')`가 정확히 80.

- [ ] **Step 5: Commit**

```bash
git add lib/compare.ts tests/compare.test.ts
git commit -m "feat: 자동 비교를 단어 퍼지 점수(0~100, 4단계)로 전환"
```

---

### Task 2: `lib/azure-stt.ts` — detailed + Lexical + 타임아웃 25초

**Files:** Modify `lib/azure-stt.ts`, Modify `tests/azure-stt.test.ts`.

- [ ] **Step 1: 테스트 갱신 (실패 예상)**

`tests/azure-stt.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseAzureResponse, transcribeShortAudio } from '@/lib/azure-stt'

afterEach(() => vi.unstubAllGlobals())

describe('parseAzureResponse', () => {
  it('Success면 NBest[0].Lexical 우선 반환', () => {
    expect(parseAzureResponse({
      RecognitionStatus: 'Success', DisplayText: 'Hello world.',
      NBest: [{ Confidence: 0.9, Lexical: 'hello world' }],
    })).toBe('hello world')
  })
  it('NBest 없으면 DisplayText로 폴백', () => {
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
  it('detailed 엔드포인트 호출하고 Lexical 반환', async () => {
    process.env.AZURE_SPEECH_KEY = 'k'
    process.env.AZURE_SPEECH_REGION = 'koreacentral'
    const mock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ RecognitionStatus: 'Success', DisplayText: 'Hello.', NBest: [{ Lexical: 'hello' }] }), { status: 200 }))
    vi.stubGlobal('fetch', mock)
    const text = await transcribeShortAudio(Buffer.from('xx'), 'audio/wav')
    expect(text).toBe('hello')
    const [url, init] = mock.mock.calls[0]
    expect(String(url)).toBe('https://koreacentral.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed')
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

Run: `npx vitest run tests/azure-stt.test.ts`
Expected: FAIL — URL이 `format=simple`, Lexical 미추출.

- [ ] **Step 3: `lib/azure-stt.ts` 전체 교체**

```ts
import { env } from './env'

export function parseAzureResponse(json: unknown): string {
  if (!json || typeof json !== 'object') return ''
  const o = json as Record<string, unknown>
  if (o.RecognitionStatus !== 'Success') return ''
  const nbest = o.NBest
  if (Array.isArray(nbest) && nbest[0] && typeof nbest[0] === 'object') {
    const top = nbest[0] as Record<string, unknown>
    if (typeof top.Lexical === 'string') return top.Lexical
  }
  return typeof o.DisplayText === 'string' ? o.DisplayText : ''
}

export type AzureContentType = 'audio/wav' | 'audio/ogg; codecs=opus'

export async function transcribeShortAudio(audio: Buffer, contentType: AzureContentType): Promise<string> {
  const region = env('AZURE_SPEECH_REGION')
  const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': env('AZURE_SPEECH_KEY'), 'Content-Type': contentType, Accept: 'application/json' },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`Azure STT ${res.status}: ${await res.text()}`)
  return parseAzureResponse(await res.json())
}
```

- [ ] **Step 4: 통과 + 전체 회귀**

Run: `npx vitest run tests/azure-stt.test.ts && npm test`
Expected: azure-stt PASS, 전체 스위트 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/azure-stt.ts tests/azure-stt.test.ts
git commit -m "feat: Azure STT detailed 포맷+Lexical 채택, 타임아웃 25초"
```

---

### Task 3: CSV export — 새 반환 타입 반영 + 유사도 컬럼

**Files:** Modify `app/api/admin/export/route.ts`, Modify `tests/export-route.test.ts`.

- [ ] **Step 1: 테스트 기대값 갱신 (실패 예상)**

`tests/export-route.test.ts`의 header/row1/row2 기대값(현재 36-38행 부근)을 다음으로 교체:

```ts
    expect(header).toBe('이름,나이,세션시작,문항번호,난이도,목표문장,시도순번,STT텍스트,자동비교,유사도,재시도총횟수,건너뜀,발화길이초,녹음경로')
    expect(row1).toBe('민준,8,2026-07-13T04:55:00Z,1,easy,I like apples.,2,i like apples,matched,100,2,N,3.2,s1/1_2.webm')
    expect(row2).toBe('민준,8,2026-07-13T04:55:00Z,2,easy,I like bananas.,,,skipped,,0,Y,,')
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/export-route.test.ts`
Expected: FAIL — 헤더에 유사도 없음, 자동비교 셀이 `[object Object]`.

- [ ] **Step 3: `app/api/admin/export/route.ts` 전체 교체**

```ts
import { buildCsv } from '@/lib/csv'
import { exportRows } from '@/lib/db'
import { compareUtterance } from '@/lib/compare'

export const dynamic = 'force-dynamic'

const HEADER = ['이름', '나이', '세션시작', '문항번호', '난이도', '목표문장', '시도순번', 'STT텍스트', '자동비교', '유사도', '재시도총횟수', '건너뜀', '발화길이초', '녹음경로']

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
      return [[...base, '', '', r.status === 'skipped' ? 'skipped' : '', '', r.retry_count, skipFlag, '', '']]
    }
    return attempts.map((a: any) => {
      const cmp = compareUtterance(r.questions.text, a.stt_text)
      return [...base, a.attempt_no, a.stt_text, cmp.status, cmp.score, r.retry_count, skipFlag, a.duration_sec, a.audio_path]
    })
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
Expected: PASS. (14열 정렬 확인: base6 + 시도순번·STT·자동비교·유사도(4) + 재시도·건너뜀·발화·경로(4))

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/export/route.ts tests/export-route.test.ts
git commit -m "feat: CSV에 유사도 컬럼 추가 + 4단계 자동비교 반영"
```

---

### Task 4: 관리자 결과지 — partial pill + 유사도% + KPI

**Files:** Modify `app/admin/[id]/page.tsx`.

- [ ] **Step 1: import·타입 교체**

파일 상단의 compare import를 다음으로 변경:
```ts
import { compareUtterance, type MatchStatus } from '@/lib/compare'
```
(`MatchResult` → `MatchStatus`. 다른 파일에 `MatchResult` import가 남아있지 않은지 `grep -rn "MatchResult" app lib`로 확인 — 있으면 안 됨.)

- [ ] **Step 2: PILL 맵에 partial 추가**

`PILL` 상수의 타입과 항목을 다음으로 교체:
```ts
const PILL: Record<MatchStatus | 'skipped' | 'none', { label: string; cls: string }> = {
  matched: { label: '일치', cls: 'bg-mint/10 text-mint' },
  partial: { label: '부분일치', cls: 'bg-blue/10 text-blue' },
  mismatched: { label: '불일치', cls: 'bg-amber/10 text-amber' },
  unrecognized: { label: '인식 안 됨', cls: 'bg-ink/5 text-ink-mute' },
  skipped: { label: '건너뜀', cls: 'bg-ink/5 text-ink-mute' },
  none: { label: '미응답', cls: 'bg-ink/5 text-ink-mute' },
}
```

- [ ] **Step 3: views의 match를 객체로, matched·partial 카운트**

`items` 매핑에서 `match:` 라인은 그대로 두되(이제 `compareUtterance`가 객체 반환), 아래 집계 라인들을 교체:
```ts
  const answered = items.filter(r => r.views.length > 0).length
  const skipped = items.filter(r => r.status === 'skipped').length
  const matched = items.filter(r => r.status !== 'skipped' && r.views.length > 0 && r.views[r.views.length - 1].match.status === 'matched').length
  const partial = items.filter(r => r.status !== 'skipped' && r.views.length > 0 && r.views[r.views.length - 1].match.status === 'partial').length
```

- [ ] **Step 4: KPI 칩에 부분일치 추가**

헤더 KPI 영역의 칩 묶음을 다음으로 교체:
```tsx
          <div className="ml-auto flex flex-wrap gap-2">
            <span className="kpi">응답 <b>{answered} / {items.length}</b></span>
            <span className="kpi">자동 일치 <b>{matched}</b></span>
            <span className="kpi">부분일치 <b>{partial}</b></span>
            <span className="kpi">건너뜀 <b>{skipped}</b></span>
          </div>
```

- [ ] **Step 5: 시도 행의 Pill을 status로, 유사도% 표시**

시도 렌더링에서 자동비교 셀을 교체:
```tsx
                  <td><Pill kind={v.match.status} /></td>
```
을
```tsx
                  <td>
                    <Pill kind={v.match.status} />
                    {v.match.status !== 'unrecognized' && <span className="ml-1.5 text-xs text-ink-mute">{v.match.score}%</span>}
                  </td>
```
로 변경. (무응답/건너뜀 행의 `<Pill kind={r.status === 'skipped' ? 'skipped' : 'none'} />`는 그대로 — 점수 없음.)

- [ ] **Step 6: 타입·회귀 확인**

Run: `npm run typecheck && npm test`
Expected: 타입 에러 0, 전체 테스트 PASS. `grep -rn "MatchResult" app lib` → 0건.

- [ ] **Step 7: Commit**

```bash
git add app/admin/[id]/page.tsx
git commit -m "feat: 결과지에 부분일치 pill·유사도%·부분일치 KPI 추가"
```

---

### Task 5: 최종 검증

**Files:** 없음(검증만).

- [ ] **Step 1: 전체 게이트**

Run: `npm test && npm run typecheck && npm run build`
Expected: 전체 테스트 PASS, 타입 에러 0, 빌드 성공.

- [ ] **Step 2: 소비처 정합성 스팟체크**

Run: `grep -rn "compareUtterance\|MatchResult\|MatchStatus" app lib`
Expected: `compareUtterance` 소비처는 export route·admin detail 2곳뿐, `MatchResult` 잔존 0건, `MatchStatus`는 compare.ts(정의)·admin detail(import)만.

- [ ] **Step 3: 완료 보고 (한국어)**

superpowers:verification-before-completion로 근거 확인 후 요약. (실 브라우저 STT E2E는 샌드박스 시계 오차로 Supabase 접근이 막혀 있으니, 라이브 확인은 사용자 실기기 몫으로 명시.)
