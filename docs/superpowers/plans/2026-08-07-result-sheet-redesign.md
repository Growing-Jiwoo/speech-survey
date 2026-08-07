# 결과지 재설계 (검사지 양식 기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 결과지를 종이 검사지(`[최종] 초등 1학년 선별검사지.pdf`)와 같은 구조로 재구성해, 아동의 결과물(녹음·검사 중 응답)과 채점을 한 자리에서 보게 하고, 인쇄하면 검사지 양식 그대로의 A4 결과지가 나오게 한다.

**Architecture:** 검사지 정의를 학년별 데이터(`lib/forms/`)로 분리하고, 결과지 화면이 그 정의로부터 렌더링한다. 화면 구조는 종이 검사지와 1:1 — 낱말 해독(격자 + 페이지 녹음) → 문장 읽기유창성(문장 + 녹음 + 어절 수) → 낱말 쓰기(격자, 검사 중 기록) → 체크리스트. 상단에 총평 밴드를 두어 점수를 크게 드러낸다. PDF는 브라우저 인쇄(`@page A4`)로 생성한다.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Vitest (`environment: 'node'`)

---

## 배경 — 지금 무엇이 문제인가

담당자/사용자 피드백 3가지:

1. **점수가 눈에 안 띈다.** `총 20 / 36 Fail`이 본문과 같은 크기의 회색 잔글씨로 섹션 사이에 끼어 있다.
2. **채점지와 결과가 뒤죽박죽이다.** 현재 상세 화면은 `녹음 표(6줄, 페이지 단위)` → `채점(낱말 O/X, 문장 입력)` → `낱말 쓰기 표(10줄)` → `체크리스트` 순서다. 같은 문항의 **녹음**과 **채점**이 화면 위아래로 갈라져 있어, 채점자가 소리를 듣고 O/X를 찍으려면 시선이 왔다갔다 해야 한다. 낱말 쓰기도 점수(`총 0/10`)와 문항별 답(별도 표)이 떨어져 있다.
3. **결과지 PDF가 검사지 양식과 다르다.** 지금은 화면을 그대로 인쇄할 뿐이다.

추가로 코드 점검에서 나온 사실:

- **검사지에는 낱말 쓰기도 `의미 /5 · 무의미 /5` 소계가 있는데** `lib/scoring.ts`는 총점 `/10`만 계산한다. (검사지 양식 재현에 필요)
- `lib/schema.ts:19`의 `gradeSchema`는 1~6학년을 허용하지만 문항은 1학년치만 있다. 사용자 결정: **학년 제한은 두지 않는다.** 대신 결과지에 어떤 양식으로 채점했는지(`KODYS-G1`)를 명시해 데이터가 조용히 뒤섞이지 않게 한다.

## 확정된 방향 (사용자 선택)

| 항목 | 결정 |
|---|---|
| PDF 생성 | **브라우저 인쇄 기반** (`@page A4`). 새 의존성 0 |
| 화면 구성 | **검사지 양식 그대로 + 듣기/입력을 각 줄에 인라인** |
| 학년 확장 | **구조만 분리**(`lib/forms/`), 학년 선택 제한은 두지 않음 |

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `lib/forms/index.ts` | `SurveyForm` 타입, 양식 레지스트리, `formForGrade(grade)` |
| `lib/forms/g1.ts` | KODYS-G1 검사지 정의(낱말·문장·제한시간·메타) |
| `components/admin/ResultSheet.tsx` | 결과지 전체 조립 + 채점 상태 소유 + 저장 |
| `components/admin/sheet/ScoreBand.tsx` | 상단 총평 밴드(과제별 점수·Pass/Fail 크게) |
| `components/admin/sheet/WordGrid.tsx` | 낱말 격자(검사지의 가로 배열). 해독=편집, 쓰기=읽기전용 |
| `components/admin/sheet/SentenceRows.tsx` | 문장 행(문장 + 녹음 + 어절 수 입력) |
| `components/admin/sheet/PageAudio.tsx` | 페이지 녹음 재생(시도 여러 개 처리) |
| `components/admin/sheet/Subtotal.tsx` | 검사지의 소계 행(의미/무의미/총점) |
| `tests/forms.test.ts` | 양식 조회·G1 정의 검증 |

**수정**

| 파일 | 변경 |
|---|---|
| `lib/items.ts` | 낱말/문장 원본을 `lib/forms/g1.ts`에서 가져오도록 (단일 출처화) |
| `lib/scoring.ts` | 낱말 쓰기 `의미/무의미` 소계 추가 |
| `components/admin/AdminDetailView.tsx` | `RecordingsTable` + `ScoreSheet` → `ResultSheet` 하나로 교체 |
| `app/globals.css` | `@page A4` 및 결과지 인쇄 규칙 |
| `tests/scoring.test.ts` | 낱말 쓰기 소계 테스트 추가 |

**삭제**

| 파일 | 사유 |
|---|---|
| `components/admin/ScoreSheet.tsx` | `ResultSheet` + `sheet/*`로 대체 |
| `components/admin/RecordingsTable.tsx` | 녹음이 각 섹션 안으로 들어가 표가 사라짐 |

> `RecordingsTable`의 **"미녹음" 표시**와 **제한 시간 초과 경고(`over`)** 는 임상적으로 의미 있는 정보다. `PageAudio`로 반드시 이관할 것 — 이 계획의 Task 5가 그 책임을 진다.

---

## Task 1: 검사지 정의를 학년별 데이터로 분리

**Files:**
- Create: `lib/forms/index.ts`
- Create: `lib/forms/g1.ts`
- Create: `tests/forms.test.ts`
- Modify: `lib/items.ts:16-25` (원본 배열을 g1에서 import)

**배경:** 지금 낱말·문장이 `lib/items.ts`에 하드코딩돼 있다. 학년이 늘면 이 파일을 갈라야 한다. 원본 데이터를 양식 파일로 옮겨 두면, 새 학년은 `lib/forms/g2.ts` 추가 + 레지스트리 한 줄로 끝난다. **검사 진행 흐름(PAGES)은 이번에 건드리지 않는다** — G2 문항이 실제로 오기 전까지는 이득 없이 위험만 크다. 이번 범위는 "정의를 데이터로 빼고, 결과지가 그 데이터로 렌더링한다"까지다.

- [ ] **Step 1: 양식 타입과 레지스트리를 작성한다**

`lib/forms/index.ts`:

```ts
// lib/forms/index.ts — 학년별 검사지 정의 레지스트리.
// 검사지(종이)가 학년마다 다르므로, 문항·배점·머리글을 양식 데이터로 두고
// 결과지 화면이 이 정의로부터 렌더링한다. 새 학년 = 양식 파일 추가 + FORMS 등록.
import { G1 } from './g1'

export interface SurveyForm {
  /** 결과지에 표기되는 양식 식별자 — 어떤 검사지로 채점했는지 기록에 남긴다 */
  id: string
  /** 결과지 머리글 큰 제목 (예: 'KODYS - G1') */
  title: string
  /** 머리글 작은 제목 (예: 'Korean Dyslexia Screening Test') */
  subtitle: string
  /** 이 양식이 담당하는 학년 */
  grades: number[]
  readMeaning: string[]
  readNonsense: string[]
  sentences: string[]
  writeMeaning: string[]
  writeNonsense: string[]
  /** 검사지 제한 시간(초) — 채점 기준 */
  limits: { wordSec: number; sentenceSec: number }
}

export const FORMS: SurveyForm[] = [G1]

/** 기본 양식 — 담당 양식이 없는 학년의 폴백이자, 검사 진행 흐름이 쓰는 현재 양식. */
export const DEFAULT_FORM = G1

/**
 * 학년에 해당하는 검사지를 돌려준다.
 * 담당 양식이 없으면 DEFAULT_FORM으로 폴백한다 — 검사 진행 흐름이 아직 단일 양식이라,
 * 2~6학년으로 시작한 세션도 실제로는 G1 문항으로 검사받았기 때문이다.
 * (그래서 결과지에 form.id를 표기해 어떤 양식으로 채점했는지 드러낸다.)
 */
export function formForGrade(grade: number): SurveyForm {
  return FORMS.find(f => f.grades.includes(grade)) ?? DEFAULT_FORM
}
```

- [ ] **Step 2: G1 양식 정의를 작성한다**

`lib/forms/g1.ts` — 값은 `lib/items.ts:16-25`에서 그대로 옮긴다(변경 금지):

```ts
// lib/forms/g1.ts — KODYS-G1 (초등 1학년) 검사지 정의.
// 출처: [최종] 초등 1학년 선별검사지.pdf
import type { SurveyForm } from './index'

export const G1: SurveyForm = {
  id: 'KODYS-G1',
  title: 'KODYS - G1',
  subtitle: 'Korean Dyslexia Screening Test',
  grades: [1],
  readMeaning: ['어디', '바지', '양보', '그늘', '설탕', '장갑', '방법'],
  readNonsense: ['아로', '부림', '영추', '주곡', '구말', '솔텅', '봉밥'],
  sentences: [
    '아이가 아빠와 우유 사러 가서 고기도 사요.',
    '스라소니가 피리 가져오고 개구리가 해바라기 가지고 와요.',
    '다람쥐가 두꺼비를 보고 도망가요 그래서 부엉이가 다람쥐를 숨겨줘요.',
    '쉬는시간에 친구가 나에게 장난을 계속 쳐서 다투었어요.\n학교가 끝난 후에 친구가 다가와서 사과를 했어요.',
  ],
  writeMeaning: ['우비', '까치', '수박', '동상', '생각'],
  writeNonsense: ['오거', '끼추', '소벅', '당송', '갈먹'],
  limits: { wordSec: 30, sentenceSec: 40 },
}
```

> `g1.ts`가 `./index`에서 타입만 import하고 `index.ts`가 `./g1`에서 값을 import하는 순환은 **타입 전용 import**라 런타임 순환이 아니다. TypeScript가 지운다.

- [ ] **Step 3: `lib/items.ts`가 양식 데이터를 쓰도록 바꾼다**

`lib/items.ts:16-25`의 리터럴 배열 6개를 삭제하고 상단에 import를 추가한 뒤, 아래 상수로 교체한다:

```ts
import { DEFAULT_FORM } from './forms'

// 검사 진행 흐름은 아직 단일 양식(G1)이다. 학년별 분기는 결과지에만 있다.
// G2 문항이 실제로 들어오면 이 상수를 세션의 학년으로 주입하도록 바꾼다.
const FORM = DEFAULT_FORM

const READ_MEANING = FORM.readMeaning
const READ_NONSENSE = FORM.readNonsense
const SENTENCES = FORM.sentences
const WRITE_MEANING = FORM.writeMeaning
const WRITE_NONSENSE = FORM.writeNonsense
```

그리고 `ITEMS` 안의 `maxSec: 30` → `maxSec: FORM.limits.wordSec`, `maxSec: 40` → `maxSec: FORM.limits.sentenceSec` 로 바꾼다.
`PAGES` 안의 `limitSec: 30` → `FORM.limits.wordSec`, `limitSec: 40` → `FORM.limits.sentenceSec` 로 바꾼다.
(연습 페이지 `p_practice_rw`의 `limitSec: 30`도 `FORM.limits.wordSec`)

- [ ] **Step 4: 실패하는 테스트를 쓴다**

`tests/forms.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_FORM, FORMS, formForGrade } from '@/lib/forms'
import { ITEMS } from '@/lib/items'

describe('formForGrade', () => {
  it('1학년은 KODYS-G1', () => {
    expect(formForGrade(1).id).toBe('KODYS-G1')
  })
  it('담당 양식이 없는 학년은 기본 양식으로 폴백한다', () => {
    // 검사 진행 흐름이 단일 양식이라, 3학년 세션도 실제로는 G1 문항으로 검사받았다.
    expect(formForGrade(3)).toBe(DEFAULT_FORM)
    expect(formForGrade(6)).toBe(DEFAULT_FORM)
  })
  it('모든 양식의 담당 학년은 서로 겹치지 않는다', () => {
    const seen = new Set<number>()
    for (const f of FORMS) for (const g of f.grades) {
      expect(seen.has(g)).toBe(false)
      seen.add(g)
    }
  })
})

describe('G1 정의와 ITEMS의 정합', () => {
  const g1 = formForGrade(1)
  it('낱말 해독은 의미 7 + 무의미 7', () => {
    expect(g1.readMeaning).toHaveLength(7)
    expect(g1.readNonsense).toHaveLength(7)
  })
  it('낱말 쓰기는 의미 5 + 무의미 5', () => {
    expect(g1.writeMeaning).toHaveLength(5)
    expect(g1.writeNonsense).toHaveLength(5)
  })
  it('ITEMS의 제시어가 양식과 같은 순서로 만들어진다', () => {
    const readText = ITEMS.filter(i => i.section === 'word_reading').map(i => i.text)
    expect(readText).toEqual([...g1.readMeaning, ...g1.readNonsense])
    const writeText = ITEMS.filter(i => i.section === 'word_writing').map(i => i.text)
    expect(writeText).toEqual([...g1.writeMeaning, ...g1.writeNonsense])
  })
})
```

- [ ] **Step 5: 테스트가 실패하는 것을 확인한다**

Run: `npx vitest run tests/forms.test.ts`
Expected: FAIL — `Cannot find module '@/lib/forms'` (Step 1~3 전이라면) 또는 PASS (Step 1~3을 먼저 했다면 그대로 통과)

- [ ] **Step 6: 전체 테스트가 통과하는지 확인한다**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 기존 358개 + 신규 테스트 모두 PASS, 타입 오류 0

**중요:** 이 작업은 순수 리팩터링이다. `ITEMS`/`PAGES`의 **값이 하나도 바뀌면 안 된다.** 기존 `tests/items.test.ts`가 그대로 통과하는 것이 그 증거다.

- [ ] **Step 7: Commit**

```bash
git add lib/forms lib/items.ts tests/forms.test.ts
git commit -m "refactor(items): 검사지 정의를 학년별 양식 데이터로 분리"
```

---

## Task 2: 낱말 쓰기 의미/무의미 소계

**Files:**
- Modify: `lib/scoring.ts:14, 51-85`
- Test: `tests/scoring.test.ts`

**배경:** 종이 검사지의 낱말 쓰기 칸에는 `의미 점수 /5`, `무의미 점수 /5`, `총 점수 /10` 세 칸이 있다. 낱말 해독에는 이미 `wordMeaning`/`wordNonsense`가 있는데 낱말 쓰기에는 없어 검사지를 그대로 재현할 수 없다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/scoring.test.ts` 끝에 추가:

```ts
describe('낱말 쓰기 의미/무의미 소계', () => {
  it('의미·무의미를 나눠 세고 합이 총점과 같다', () => {
    // ww01~ww05 = 의미, ww06~ww10 = 무의미
    const writing = {
      ww01: true, ww02: true, ww03: false, ww04: true, ww05: false,
      ww06: true, ww07: false, ww08: false, ww09: false, ww10: false,
    }
    const r = scoreSession({ marks: {}, sentences: {}, writing })
    expect(r.writeMeaning).toBe(3)
    expect(r.writeNonsense).toBe(1)
    expect(r.wordWriting).toBe(4)
    expect(r.writeMeaning + r.writeNonsense).toBe(r.wordWriting)
  })
  it('미응답(undefined)은 0점으로 센다', () => {
    const r = scoreSession({ marks: {}, sentences: {}, writing: {} })
    expect(r.writeMeaning).toBe(0)
    expect(r.writeNonsense).toBe(0)
    expect(r.wordWriting).toBe(0)
  })
})

describe('과제별 만점', () => {
  it('의미·무의미 만점의 합이 과제 만점과 같다', () => {
    expect(WRITE_MAX.meaning + WRITE_MAX.nonsense).toBe(TASK_MAX.wordWriting)
    expect(READ_MAX.meaning + READ_MAX.nonsense).toBe(TASK_MAX.wordReading)
  })
})
```

`tests/scoring.test.ts` 상단 import에 `WRITE_MAX`, `READ_MAX`를 추가한다.

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `npx vitest run tests/scoring.test.ts`
Expected: FAIL — `r.writeMeaning` is undefined, `WRITE_MAX` is not exported

- [ ] **Step 3: `lib/scoring.ts`를 고친다**

`lib/scoring.ts:14` 아래에 코드 분리를 추가한다:

```ts
const WRITE_CODES = ITEMS.filter(i => i.section === 'word_writing').map(i => i.code)
const MEANING_WRITE_SET = new Set(
  ITEMS.filter(i => i.section === 'word_writing' && i.kind === 'meaning').map(i => i.code),
)
const MEANING_WRITE_CODES = WRITE_CODES.filter(c => MEANING_WRITE_SET.has(c))
const NONSENSE_WRITE_CODES = WRITE_CODES.filter(c => !MEANING_WRITE_SET.has(c))
```

`TASK_MAX` 정의 아래에 검사지의 소계 만점을 추가한다:

```ts
/** 검사지의 의미/무의미 소계 만점 — 결과지가 '/ 7', '/ 5'를 이 값으로 찍는다. */
export const READ_MAX = {
  meaning: MEANING_READ_CODES.length,
  nonsense: READ_CODES.length - MEANING_READ_CODES.length,
} as const
export const WRITE_MAX = {
  meaning: MEANING_WRITE_CODES.length,
  nonsense: NONSENSE_WRITE_CODES.length,
} as const
```

`ScoreResult`에 두 필드를 추가한다:

```ts
export interface ScoreResult {
  wordMeaning: number
  wordNonsense: number
  wordReading: number
  sentenceReading: number
  writeMeaning: number
  writeNonsense: number
  wordWriting: number
  verdict: Record<TaskKey, Verdict>
}
```

`scoreSession`의 `wordWriting` 계산을 소계 합으로 바꾼다:

```ts
  const writeMeaning = countTrue(MEANING_WRITE_CODES, s.writing)
  const writeNonsense = countTrue(NONSENSE_WRITE_CODES, s.writing)
  const wordWriting = writeMeaning + writeNonsense
```

반환 객체에 `writeMeaning, writeNonsense`를 추가한다.

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전부 PASS, 타입 오류 0

- [ ] **Step 5: Commit**

```bash
git add lib/scoring.ts tests/scoring.test.ts
git commit -m "feat(scoring): 낱말 쓰기 의미/무의미 소계 (검사지 양식 재현용)"
```

---

## Task 3: 소계 행 컴포넌트 (Subtotal)

**Files:**
- Create: `components/admin/sheet/Subtotal.tsx`

**배경:** 검사지의 소계 행은 연한 갈색(tan) 배경에 `의미 점수 __/7 | 무의미 점수 __/7 | 총 점수 __/14` 형태다. 낱말 해독·낱말 쓰기가 같은 모양을 쓰고, 문장은 `총점 __/36` 하나만 쓴다. 점수가 눈에 띄어야 한다는 피드백을 여기서 해결한다 — 숫자를 크게, 총점은 색으로.

- [ ] **Step 1: 컴포넌트를 작성한다**

`components/admin/sheet/Subtotal.tsx`:

```tsx
// components/admin/sheet/Subtotal.tsx — 검사지의 소계 행.
// 종이 검사지와 같이 연한 배경 띠 위에 '의미 __/7 · 무의미 __/7 · 총 __/14'를 둔다.
// 채점 결과가 잘 안 보인다는 피드백에 따라 숫자를 본문보다 크게, 총점은 색으로 강조한다.
import { Badge } from '@/components/Badge'
import type { Verdict } from '@/lib/scoring'

interface Cell { label: string; value: number; max: number }

export function Subtotal({ cells, total, verdict }: {
  /** 의미/무의미 같은 부분 점수. 없으면(문장) 총점만 표시한다 */
  cells?: Cell[]
  total: Cell
  verdict?: Verdict
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 border-y border-amber/30 bg-amber/10 px-4 py-2.5 print:bg-amber/10">
      {cells?.map(c => (
        <span key={c.label} className="text-[13px] text-ink-soft">
          {c.label} <b className="text-[15px] tabular-nums text-ink">{c.value}</b>
          <span className="text-ink-mute"> / {c.max}</span>
        </span>
      ))}
      <span className="text-[13px] font-bold text-ink-soft">
        {total.label} <b className="text-[19px] tabular-nums text-blue">{total.value}</b>
        <span className="text-ink-mute"> / {total.max}</span>
      </span>
      {verdict && (
        verdict === 'pass'
          ? <Badge tone="mint" size="lg">Pass</Badge>
          : <Badge tone="rec" size="lg">Fail</Badge>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입이 맞는지 확인한다**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 3: Commit**

```bash
git add components/admin/sheet/Subtotal.tsx
git commit -m "feat(admin): 결과지 소계 행 컴포넌트"
```

---

## Task 4: 총평 밴드 (ScoreBand)

**Files:**
- Create: `components/admin/sheet/ScoreBand.tsx`

**배경:** "채점 결과가 눈에 잘 띄지 않음"의 정면 대응. 결과지 맨 위에 세 과제의 점수와 Pass/Fail을 큰 숫자로 띄운다. 채점자가 스크롤하지 않고도 결론을 본다.

- [ ] **Step 1: 컴포넌트를 작성한다**

`components/admin/sheet/ScoreBand.tsx`:

```tsx
// components/admin/sheet/ScoreBand.tsx — 결과지 상단 총평 밴드.
// 과제별 점수·Pass/Fail을 큰 숫자로 한 줄에 모아, 스크롤 없이 결론이 보이게 한다.
import { PASS_MARK, TASK_MAX, type ScoreResult, type TaskKey } from '@/lib/scoring'

const TASKS: { key: TaskKey; label: string; get: (r: ScoreResult) => number }[] = [
  { key: 'wordReading', label: '낱말 해독', get: r => r.wordReading },
  { key: 'sentenceReading', label: '문장 읽기유창성', get: r => r.sentenceReading },
  { key: 'wordWriting', label: '낱말 쓰기', get: r => r.wordWriting },
]

export function ScoreBand({ result }: { result: ScoreResult }) {
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-3">
      {TASKS.map(t => {
        const value = t.get(result)
        const pass = result.verdict[t.key] === 'pass'
        return (
          <div key={t.key}
            className={`rounded-xl border-[1.5px] px-4 py-3 ${
              pass ? 'border-mint/50 bg-mint/5' : 'border-rec/50 bg-rec/5'}`}>
            <p className="text-[11.5px] font-bold text-ink-mute">{t.label}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <b className={`text-[30px] leading-none tabular-nums ${pass ? 'text-mint' : 'text-rec-deep'}`}>
                {value}
              </b>
              <span className="text-[15px] text-ink-mute">/ {TASK_MAX[t.key]}</span>
              <span className={`ml-auto text-[13px] font-bold ${pass ? 'text-mint' : 'text-rec-deep'}`}>
                {pass ? 'Pass' : 'Fail'}
              </span>
            </p>
            <p className="mt-1 text-[10.5px] text-ink-mute">기준 {PASS_MARK[t.key]}점 이상</p>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 3: Commit**

```bash
git add components/admin/sheet/ScoreBand.tsx
git commit -m "feat(admin): 결과지 총평 밴드 (과제별 점수 강조)"
```

---

## Task 5: 페이지 녹음 재생 (PageAudio)

**Files:**
- Create: `components/admin/sheet/PageAudio.tsx`

**배경:** 지금 녹음은 별도 표에 있다. 이걸 각 섹션 안으로 옮긴다. 한 페이지에 시도(재녹음)가 여러 개일 수 있으므로 시도 전환이 필요하다. **`RecordingsTable`이 갖고 있던 두 정보를 반드시 이관한다:** ① 녹음이 없으면 "미녹음" 표시 ② `duration_sec > limitSec`이면 제한 시간 초과 경고.

- [ ] **Step 1: 컴포넌트를 작성한다**

`components/admin/sheet/PageAudio.tsx`:

```tsx
// components/admin/sheet/PageAudio.tsx — 결과지 각 섹션에 인라인으로 붙는 페이지 녹음.
// 채점 대상(낱말 격자·문장)과 같은 줄에 두어, 듣고 바로 O/X를 찍을 수 있게 한다.
// 시도(재녹음)가 여러 개면 전환 버튼을 낸다. 인쇄물에서는 통째로 숨긴다.
'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { fmtDuration } from '@/lib/format'
import { Badge } from '@/components/Badge'
import type { DetailRecording } from '@/hooks/useAdminQueries'

// wavesurfer.js(수십 KB)는 재생기가 실제로 필요할 때만 청크를 받도록 지연 로드.
const AudioPlayer = dynamic(() => import('@/components/AudioPlayer').then(m => m.AudioPlayer), {
  ssr: false,
  loading: () => <div className="h-8 w-full max-w-[240px] animate-pulse rounded-lg bg-well" />,
})

export type Attempt = Pick<DetailRecording, 'attempt_no' | 'url' | 'duration_sec'>

export function PageAudio({ label, attempts, limitSec, onAudioError }: {
  /** 무엇의 녹음인지 (예: '의미 낱말') */
  label: string
  attempts: Attempt[]
  /** 검사지 제한 시간(초). 이 값을 넘는 녹음은 초과분이 채점 대상이 아님을 알린다 */
  limitSec: number
  onAudioError: () => void
}) {
  const [idx, setIdx] = useState(0)

  if (attempts.length === 0) {
    return (
      <div className="flex items-center gap-2 print:hidden">
        <span className="text-[11px] text-ink-mute">{label}</span>
        <Badge tone="rec">미녹음</Badge>
      </div>
    )
  }

  const cur = attempts[Math.min(idx, attempts.length - 1)]
  // 여유 시간(GRACE_SEC)까지는 정상 — 채점 기준(limitSec) 초과만 알린다.
  const over = cur.duration_sec != null && cur.duration_sec > limitSec

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <span className="text-[11px] text-ink-mute">{label}</span>
      {attempts.length > 1 && (
        <div className="flex gap-1">
          {attempts.map((a, i) => (
            <button key={a.attempt_no} type="button" aria-pressed={i === idx}
              aria-label={`${label} ${a.attempt_no}번째 시도`}
              onClick={() => setIdx(i)}
              className={`h-6 rounded-md border px-1.5 text-[10.5px] font-bold transition ${
                i === idx ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-mute'}`}>
              #{a.attempt_no}
            </button>
          ))}
        </div>
      )}
      <span className={`font-read text-[11px] tabular-nums ${over ? 'font-bold text-amber' : 'text-ink-soft'}`}
        title={over ? `채점 기준(${limitSec}초) 초과분 포함` : undefined}>
        {fmtDuration(cur.duration_sec)}{over && ' !'}
      </span>
      <AudioPlayer src={cur.url} onError={onAudioError} />
    </div>
  )
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 3: Commit**

```bash
git add components/admin/sheet/PageAudio.tsx
git commit -m "feat(admin): 섹션 인라인 녹음 재생 (미녹음·시간 초과 표시 이관)"
```

---

## Task 6: 낱말 격자 (WordGrid)

**Files:**
- Create: `components/admin/sheet/WordGrid.tsx`

**배경:** 검사지는 낱말을 **가로 한 줄**로 배열한다 (`의미 낱말 | 어디 | 바지 | 양보 | 그늘 | 설탕 | 장갑 | 방법`). 지금 화면은 2열 세로 목록이라 검사지와 전혀 다르게 보인다.

같은 격자를 **낱말 해독(편집 가능)** 과 **낱말 쓰기(검사 중 기록, 읽기 전용)** 둘 다에서 쓴다 — 검사지에서도 두 칸의 생김새가 같다.

- [ ] **Step 1: 컴포넌트를 작성한다**

`components/admin/sheet/WordGrid.tsx`:

```tsx
// components/admin/sheet/WordGrid.tsx — 검사지의 낱말 격자(가로 배열).
// 낱말 해독은 채점자가 O/X를 찍고(readOnly=false), 낱말 쓰기는 검사 중 기록을 보여준다(readOnly=true).
// 좁은 화면에서는 가로 스크롤로 살린다 — 검사지의 가로 배열을 세로로 접으면 양식이 무너진다.
'use client'

export function WordGrid({ rowLabel, words, marks, onMark, readOnly = false }: {
  /** 행 이름 (예: '의미 낱말') */
  rowLabel: string
  /** { code, text } 순서대로 */
  words: { code: string; text: string }[]
  marks: Partial<Record<string, boolean>>
  onMark?: (code: string, v: boolean) => void
  readOnly?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-stretch border-b border-line/60">
        <div className="flex w-24 flex-none items-center bg-amber/10 px-3 py-2 text-[11.5px] font-bold text-ink-soft print:bg-amber/10">
          {rowLabel}
        </div>
        {words.map(w => {
          const v = marks[w.code]
          return (
            <div key={w.code}
              className="flex w-[92px] flex-none flex-col items-center gap-1 border-l border-line/60 px-1 py-2">
              <span className="font-read text-[15px]">{w.text}</span>
              {readOnly ? (
                // 검사 중 기록 — 채점자가 여기서 바꾸지 않는다. 응답 없음은 '—'.
                <span aria-label={`${w.text} ${v === undefined ? '미응답' : v ? '정반응' : '오반응'}`}
                  className={`font-read text-[15px] font-bold ${
                    v === undefined ? 'text-ink-mute' : v ? 'text-mint' : 'text-rec-deep'}`}>
                  {v === undefined ? '—' : v ? 'O' : 'X'}
                </span>
              ) : (
                <div className="flex gap-0.5">
                  {([['O', true], ['X', false]] as const).map(([label, want]) => (
                    <button key={label} type="button" aria-pressed={v === want}
                      aria-label={`${w.text} ${want ? '정반응' : '오반응'}`}
                      onClick={() => onMark?.(w.code, want)}
                      className={`h-8 w-8 rounded-md border-[1.5px] font-read text-sm font-bold transition print:hidden ${
                        v === want
                          ? want ? 'border-mint bg-mint/10 text-mint' : 'border-rec bg-rec/10 text-rec-deep'
                          : 'border-line bg-well text-ink-mute'}`}>
                      {label}
                    </button>
                  ))}
                  {/* 인쇄물에는 버튼 대신 선택된 표시만 남긴다 (종이 검사지와 같은 모양) */}
                  <span aria-hidden className={`hidden font-read text-[15px] font-bold print:block ${
                    v === undefined ? 'text-ink-mute' : v ? 'text-mint' : 'text-rec-deep'}`}>
                    {v === undefined ? '—' : v ? 'O' : 'X'}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 3: Commit**

```bash
git add components/admin/sheet/WordGrid.tsx
git commit -m "feat(admin): 검사지형 낱말 격자 (해독 채점·쓰기 기록 공용)"
```

---

## Task 7: 문장 행 (SentenceRows)

**Files:**
- Create: `components/admin/sheet/SentenceRows.tsx`

**배경:** 검사지의 문장 칸은 `문항 | 점수` 두 열 표다. 여기에 각 문장의 녹음을 인라인으로 붙인다 (문장 하나 = 페이지 하나 = 녹음 하나라 1:1로 맞는다).

- [ ] **Step 1: 컴포넌트를 작성한다**

`components/admin/sheet/SentenceRows.tsx`:

```tsx
// components/admin/sheet/SentenceRows.tsx — 검사지의 문장 읽기유창성 칸.
// 문장 하나가 곧 녹음 페이지 하나이므로, 문장·녹음·점수 입력을 한 줄에 둔다.
'use client'
import { sentenceMaxWords } from '@/lib/scoring'
import type { SurveyItem } from '@/lib/items'
import { PageAudio, type Attempt } from './PageAudio'

export function SentenceRows({ items, sentences, onChange, attemptsFor, limitSec, onAudioError }: {
  items: SurveyItem[]
  sentences: Partial<Record<string, number>>
  onChange: (code: string, v: number | undefined) => void
  /** 문항 코드 → 그 문장 페이지의 녹음 시도들 */
  attemptsFor: (code: string) => Attempt[]
  limitSec: number
  onAudioError: () => void
}) {
  return (
    <div>
      <div className="flex items-center border-b border-line/60 bg-amber/10 px-4 py-1.5 text-[11.5px] font-bold text-ink-soft print:bg-amber/10">
        <span className="flex-1">문항</span>
        <span className="w-24 text-right">점수</span>
      </div>
      {items.map((item, i) => {
        const max = sentenceMaxWords(item)
        return (
          <div key={item.code} className="flex items-start gap-3 border-b border-line/60 px-4 py-2.5">
            <span className="w-4 flex-none pt-1 text-xs font-bold text-ink-mute">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-read whitespace-pre-line break-keep text-[14px] leading-relaxed">{item.text}</p>
              <div className="mt-1.5">
                <PageAudio label={`${i + 1}번 문장`} attempts={attemptsFor(item.code)}
                  limitSec={limitSec} onAudioError={onAudioError} />
              </div>
            </div>
            <div className="flex w-24 flex-none items-center justify-end gap-1.5 pt-0.5">
              <input type="number" min={0} max={max} inputMode="numeric"
                aria-label={`${i + 1}번 문장 정확 어절 수 (최대 ${max})`}
                value={sentences[item.code] ?? ''}
                onChange={e => {
                  const raw = e.target.value
                  if (raw === '') { onChange(item.code, undefined); return }
                  const n = Number(raw)
                  if (Number.isNaN(n)) return
                  onChange(item.code, Math.max(0, Math.min(Math.floor(n), max)))
                }}
                className="h-9 w-14 rounded-lg border-[1.5px] border-line bg-well px-2 text-center text-sm tabular-nums outline-none focus:border-blue print:border-0 print:bg-transparent print:text-[15px] print:font-bold" />
              <span className="text-xs text-ink-mute">/ {max}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 오류 0

- [ ] **Step 3: Commit**

```bash
git add components/admin/sheet/SentenceRows.tsx
git commit -m "feat(admin): 문장 읽기유창성 행 (문장·녹음·점수 한 줄)"
```

---

## Task 8: 결과지 조립 (ResultSheet) + 상세 화면 교체

**Files:**
- Create: `components/admin/ResultSheet.tsx`
- Modify: `components/admin/AdminDetailView.tsx`
- Delete: `components/admin/ScoreSheet.tsx`, `components/admin/RecordingsTable.tsx`

**배경:** 앞의 조각들을 검사지 순서대로 조립한다. 채점 상태(marks·sentences)와 저장은 여기가 소유한다 — 기존 `ScoreSheet.tsx`의 상태·저장 로직을 그대로 옮긴다.

- [ ] **Step 1: ResultSheet를 작성한다**

`components/admin/ResultSheet.tsx`:

```tsx
// components/admin/ResultSheet.tsx — 관리자 결과지.
// 종이 검사지([최종] 초등 N학년 선별검사지.pdf)와 같은 순서·구조로 두고,
// 각 줄에 아동의 결과물(녹음·검사 중 응답)과 채점 입력을 함께 놓는다.
// 인쇄하면 이 화면이 그대로 A4 결과지가 된다(app/globals.css의 @page).
'use client'
import { useState } from 'react'
import { ITEMS, KIND_LABEL, WRITING_ITEMS, areaLabel } from '@/lib/items'
import { formForGrade } from '@/lib/forms'
import {
  PASS_MARK, PROVISIONAL_CRITERIA, READ_MAX, TASK_MAX, WRITE_MAX, scoreSession,
} from '@/lib/scoring'
import { contactLabel, gradeClassLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { Badge } from '@/components/Badge'
import { ScoreBand } from './sheet/ScoreBand'
import { Subtotal } from './sheet/Subtotal'
import { WordGrid } from './sheet/WordGrid'
import { SentenceRows } from './sheet/SentenceRows'
import { PageAudio, type Attempt } from './sheet/PageAudio'
import type { SessionRow } from '@/lib/db'

const READ_MEANING_ITEMS = ITEMS.filter(i => i.section === 'word_reading' && i.kind === 'meaning')
const READ_NONSENSE_ITEMS = ITEMS.filter(i => i.section === 'word_reading' && i.kind === 'nonsense')
const SENTENCE_ITEMS = ITEMS.filter(i => i.section === 'sentence_reading')
const WRITE_MEANING_ITEMS = WRITING_ITEMS.filter(i => i.kind === 'meaning')
const WRITE_NONSENSE_ITEMS = WRITING_ITEMS.filter(i => i.kind === 'nonsense')

const examinerLabel = (t: string | null | undefined) =>
  t === 'expert' ? '전문가' : t === 'teacher' ? '교사' : '기록 없음'

export function ResultSheet({ sessionId, session, writing, initialMarks, initialSentences, attemptsOf, onAudioError }: {
  sessionId: string
  session: SessionRow
  /** 낱말 쓰기는 검사 중 수집돼 여기서 다시 채점하지 않는다(예=1점) */
  writing: Record<string, boolean>
  initialMarks: Record<string, boolean>
  initialSentences: Record<string, number>
  /** 페이지 코드 → 녹음 시도들 */
  attemptsOf: (pageCode: string) => Attempt[]
  onAudioError: () => void
}) {
  const [marks, setMarks] = useState(initialMarks)
  const [sentences, setSentences] = useState(initialSentences)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const form = formForGrade(session.grade)
  const r = scoreSession({ marks, sentences, writing })

  async function save() {
    setSaving(true); setMsg('')
    // requestJson은 init으로 { method?, body? }만 받고, body가 있으면 Content-Type과 직렬화를 스스로 한다.
    const res = await requestJson(`/api/admin/sessions/${sessionId}/scores`,
      { method: 'PUT', body: { marks, sentences } },
      '채점 저장에 실패했어요. 다시 시도해 주세요.')
    setSaving(false)
    setMsg(res.ok ? '저장했어요.' : res.error)
  }

  const setMark = (code: string, v: boolean) => setMarks(m => ({ ...m, [code]: v }))
  const setSentence = (code: string, v: number | undefined) => setSentences(s => {
    const next = { ...s }
    if (v === undefined) delete next[code]
    else next[code] = v
    return next
  })

  return (
    <section className="result-sheet">
      {/* 머리글 — 종이 검사지 상단과 같은 항목 */}
      <header className="border-b-2 border-ink/80 px-5 pb-3 pt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-bold leading-none tracking-tight">{form.title}</h1>
            <p className="mt-1 text-[10.5px] font-bold text-ink-mute">{form.subtitle}</p>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px]">
            {[
              ['학교', session.school_name],
              ['학년', gradeClassLabel(session.grade, session.class_no)],
              ['학생명', session.child_name],
              ['생년월일', session.birth_ymd],
              ['검사일', new Date(session.started_at).toLocaleDateString('ko-KR')],
              ['검사자', examinerLabel(session.examiner_type)],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-ink-mute">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-2 text-[10.5px] text-ink-mute">
          담임 {session.teacher_name} ({contactLabel(session.teacher_phone, session.teacher_email, session.teacher_contact)})
          {' · '}{session.submitted_at ? '제출 완료' : '진행 중'}
          {PROVISIONAL_CRITERIA && (
            // 임시 기준으로 나온 Pass/Fail이 실제 판정으로 학교에 전달되지 않도록 화면·인쇄물 모두에 남긴다.
            <span className="ml-2 rounded border border-amber/50 bg-amber/10 px-1.5 py-0.5 font-bold text-amber print:bg-amber/10">
              임시 기준 · 확정 전
            </span>
          )}
        </p>
      </header>

      <ScoreBand result={r} />

      {/* 낱말 해독 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 pb-1.5 pt-3">
        <h2 className="text-[13px] font-bold">낱말 해독
          <span className="ml-2 font-normal text-[11px] text-ink-mute">
            {form.limits.wordSec}초 동안 정확하게 읽은 낱말 수
          </span>
        </h2>
        <div className="flex flex-wrap gap-3">
          <PageAudio label={`${KIND_LABEL.meaning} 낱말`} attempts={attemptsOf('p_rw_meaning')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />
          <PageAudio label={`${KIND_LABEL.nonsense} 낱말`} attempts={attemptsOf('p_rw_nonsense')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />
        </div>
      </div>
      <WordGrid rowLabel="의미 낱말" words={READ_MEANING_ITEMS} marks={marks} onMark={setMark} />
      <WordGrid rowLabel="무의미 낱말" words={READ_NONSENSE_ITEMS} marks={marks} onMark={setMark} />
      <Subtotal
        cells={[
          { label: '의미 점수', value: r.wordMeaning, max: READ_MAX.meaning },
          { label: '무의미 점수', value: r.wordNonsense, max: READ_MAX.nonsense },
        ]}
        total={{ label: '총 점수', value: r.wordReading, max: TASK_MAX.wordReading }}
        verdict={r.verdict.wordReading} />

      {/* 문장 읽기유창성 */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">문장 읽기유창성
        <span className="ml-2 font-normal text-[11px] text-ink-mute">
          {form.limits.sentenceSec}초 동안 정확하게 읽은 어절 수
        </span>
      </h2>
      <SentenceRows items={SENTENCE_ITEMS} sentences={sentences} onChange={setSentence}
        attemptsFor={code => attemptsOf(`p_${code}`)}
        limitSec={form.limits.sentenceSec} onAudioError={onAudioError} />
      <Subtotal total={{ label: '총점', value: r.sentenceReading, max: TASK_MAX.sentenceReading }}
        verdict={r.verdict.sentenceReading} />

      {/* 낱말 쓰기 — 검사 중 수집분(읽기 전용) */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">낱말 쓰기
        <span className="ml-2 font-normal text-[11px] text-ink-mute">검사 중 기록 · 정확하게 쓴 낱말 1점</span>
      </h2>
      <WordGrid rowLabel="의미 낱말" words={WRITE_MEANING_ITEMS} marks={writing} readOnly />
      <WordGrid rowLabel="무의미 낱말" words={WRITE_NONSENSE_ITEMS} marks={writing} readOnly />
      <Subtotal
        cells={[
          { label: '의미 점수', value: r.writeMeaning, max: WRITE_MAX.meaning },
          { label: '무의미 점수', value: r.writeNonsense, max: WRITE_MAX.nonsense },
        ]}
        total={{ label: '총 점수', value: r.wordWriting, max: TASK_MAX.wordWriting }}
        verdict={r.verdict.wordWriting} />

      {/* 검사자 체크리스트 */}
      <h2 className="border-t border-line px-4 pb-1.5 pt-3 text-[13px] font-bold">검사자 체크리스트</h2>
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {session.checklist.length === 0
          ? <span className="text-sm text-ink-mute">선택 없음</span>
          : session.checklist.map(c => <Badge key={c} tone="amber">{areaLabel(c)}</Badge>)}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-4 print:hidden">
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-blue px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40">
          {saving ? '저장 중…' : '채점 저장'}
        </button>
        <button type="button" onClick={() => window.print()}
          className="rounded-lg border-[1.5px] border-line bg-well px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-blue">
          결과지 PDF · 인쇄
        </button>
        {msg && <span aria-live="polite" className="text-xs text-ink-soft">{msg}</span>}
      </div>

      <p className="border-t border-line bg-well px-4 py-2.5 text-[10.5px] leading-relaxed text-ink-mute">
        채점 기준({form.id}): 낱말 해독은 {form.limits.wordSec}초, 문장 읽기유창성은 {form.limits.sentenceSec}초 내 정확 반응 수.
        녹음은 마지막 반응이 잘리지 않도록 조금 더 담기므로, 기준 시간 이후 반응은 채점하지 않습니다.
        {PROVISIONAL_CRITERIA && (
          <> Pass 기준은 <b>임시값</b>입니다 — 낱말 해독 {PASS_MARK.wordReading} / {TASK_MAX.wordReading} ·
          문장 읽기유창성 {PASS_MARK.sentenceReading} / {TASK_MAX.sentenceReading} ·
          낱말 쓰기 {PASS_MARK.wordWriting} / {TASK_MAX.wordWriting}.
          실제 기준표를 받으면 숫자만 교체되며, 이미 채점한 세션도 저장된 점수로 다시 계산됩니다.</>
        )}
      </p>
    </section>
  )
}
```

- [ ] **Step 2: AdminDetailView를 교체한다**

`components/admin/AdminDetailView.tsx`에서:

1. import 교체 — `RecordingsTable`/`ScoreSheet` 제거, `ResultSheet` 추가:

```ts
import { ResultSheet } from '@/components/admin/ResultSheet'
```

2. `byItem` useMemo는 그대로 둔다(페이지 코드 → 시도 목록). 그 아래에 조회 함수를 만든다:

```ts
  const attemptsOf = (pageCode: string) => byItem.get(pageCode) ?? []
```

3. 카드 안의 `<h2>녹음 문항 …</h2>` + `<RecordingsTable …/>` + `<ScoreSheet …/>` + `<h2>낱말 쓰기 (예/아니오)</h2>` 표 전체 + `<h2>{SECTION_LABEL.checklist}</h2>` 블록 + 하단 채점 기준 `<p>` 를 **모두 지우고** 다음 하나로 바꾼다:

```tsx
          <ResultSheet sessionId={id} session={s} writing={writingByCode}
            initialMarks={Object.fromEntries(data.marks.map(m => [m.item_code, m.correct]))}
            initialSentences={Object.fromEntries(data.sentences.map(x => [x.item_code, x.words]))}
            attemptsOf={attemptsOf}
            onAudioError={() => queryClient.invalidateQueries({ queryKey: adminKeys.session(id) })} />
```

`writingByCode`는 지금 `Map`인데 `ResultSheet`는 `Record`를 받는다. 선언을 바꾼다:

```ts
  const writingByCode = Object.fromEntries(writing.map(w => [w.item_code, w.can_write]))
```

4. 기존 머리글 블록(`결과지 — {child_name} …`, kpi 배지, 확인 필요 영역)은 `ResultSheet`의 머리글·총평 밴드와 **중복된다.** 진행 상황(`녹음 n/6`, `낱말쓰기 n/10`, `미완료 n건`)만 남기고 나머지는 지운다 — 이건 채점 결과가 아니라 **수집 상태**라서 결과지 밖에 있는 게 맞다:

```tsx
        <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
          <span className="kpi">녹음 <b>{recordedCount} / {RECORDING_PAGES.length}</b></span>
          <span className="kpi">낱말쓰기 <b>{writing.length} / {WRITING_ITEMS.length}</b></span>
          {missingCount > 0 && <Badge tone="rec" size="lg">미완료 {missingCount}건</Badge>}
        </div>
```

5. 쓰지 않게 된 import(`KIND_LABEL`, `SECTION_LABEL`, `areaLabel`, `RecordingsByItem` 등)를 정리한다. `gradeClassLabel`은 삭제 확인 모달이 계속 쓰므로 남긴다.

- [ ] **Step 3: 낡은 컴포넌트를 지운다**

```bash
git rm components/admin/ScoreSheet.tsx components/admin/RecordingsTable.tsx
```

- [ ] **Step 4: 타입·린트·테스트를 확인한다**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 타입 오류 0, 린트 clean, 전체 테스트 PASS

린트가 미사용 import를 잡으면 그 자리에서 지운다.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(admin): 결과지를 검사지 양식으로 재구성 (녹음·채점 통합)"
```

---

## Task 9: A4 인쇄 스타일

**Files:**
- Modify: `app/globals.css`

**배경:** "결과지 PDF는 선별검사지를 기준으로 채점 완료된 부분이 딱딱 기입되어 나오면 좋겠다." 브라우저 인쇄로 A4 PDF를 만든다.

- [ ] **Step 1: 인쇄 규칙을 추가한다**

`app/globals.css` 끝에 추가한다 (기존 `@media print` 블록이 있으면 그 안에 합친다):

```css
@media print {
  /* A4 세로, 검사지와 비슷한 여백 */
  @page {
    size: A4 portrait;
    margin: 12mm 10mm;
  }

  /* 소계 띠·머리글의 배경색이 인쇄에서 사라지지 않도록 */
  .result-sheet,
  .result-sheet * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* 결과지만 남기고 앱 크롬을 걷어낸다 */
  body {
    background: #fff;
  }

  /* 섹션이 페이지 경계에서 잘리지 않게 */
  .result-sheet h2,
  .result-sheet header {
    break-after: avoid;
  }
  .result-sheet > div,
  .result-sheet section {
    break-inside: avoid;
  }

  /* 낱말 격자는 인쇄에서 가로 스크롤이 없다 — 한 줄에 다 들어가야 한다 */
  .result-sheet .overflow-x-auto {
    overflow: visible !important;
  }
}
```

- [ ] **Step 2: 인쇄 미리보기로 확인한다**

개발 서버에서 결과지를 열고 인쇄 미리보기(⌘P)를 띄워 확인한다:

- A4 한 장 또는 두 장에 들어가는가
- 상단 내비·`채점 저장`·`결과지 PDF · 인쇄`·`세션 삭제`·오디오 재생기가 **안 보이는가**
- O/X가 버튼이 아니라 **선택된 표시만** 찍히는가
- 문장 점수 입력칸이 테두리 없이 **숫자만** 찍히는가
- `임시 기준 · 확정 전` 배지가 **남아 있는가**
- 소계 띠의 배경색이 나오는가

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(admin): 결과지 A4 인쇄 스타일 (@page)"
```

---

## Task 10: 브라우저 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 개발 서버를 띄우고 결과지를 연다**

`.claude/launch.json`의 `dev` 구성으로 preview를 시작하고, 채점 데이터가 있는 세션 상세로 이동한다.

- [ ] **Step 2: 다음을 확인한다**

| 확인 | 기대 |
|---|---|
| 머리글 | `KODYS - G1` + 학교·학년·학생명·생년월일·검사일·검사자 |
| 총평 밴드 | 과제 3개, 큰 숫자, Pass/Fail 색 구분 |
| 낱말 해독 | 의미 7 + 무의미 7이 **가로 한 줄**로, 각 낱말 아래 O/X |
| 낱말 해독 녹음 | 섹션 머리에 `의미 낱말`·`무의미 낱말` 재생기 |
| 소계 | `의미 __/7 · 무의미 __/7 · 총 __/14` + Pass/Fail |
| 문장 | 문장별 재생기 + 입력칸 + `/ 7`·`/ 8`·`/ 14` |
| 낱말 쓰기 | 의미 5 + 무의미 5 격자, O/X는 **읽기 전용**, 소계 `__/5 · __/5 · __/10` |
| 미녹음 | 녹음 없는 페이지에 `미녹음` 배지 |
| 시간 초과 | `duration > limitSec`이면 길이가 주황색 + `!` |

- [ ] **Step 3: 채점 왕복을 확인한다**

O/X를 몇 개 바꾸고 문장 점수를 넣은 뒤 `채점 저장` → `PUT /api/admin/sessions/{id}/scores` 200 → 새로고침 후 값이 유지되는지.

- [ ] **Step 4: 반응형을 확인한다**

375px로 줄여 본문에 가로 넘침이 없는지(낱말 격자는 자체 컨테이너 안에서만 가로 스크롤), 총평 밴드가 세로로 쌓이는지.

- [ ] **Step 5: 회귀를 확인한다**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 전부 통과

---

## Self-Review 메모

- **Task 1은 순수 리팩터링이다.** `ITEMS`/`PAGES`의 값이 바뀌면 검사 진행·저장·기존 세션이 전부 깨진다. 기존 `tests/items.test.ts` 통과가 그 증거.
- **`RecordingsTable`을 지울 때 정보가 새지 않게 할 것.** 미녹음 배지와 제한 시간 초과 경고는 `PageAudio`(Task 5)로 이관된다. Task 10의 검증 표에 두 항목이 들어 있다.
- **낱말 쓰기는 읽기 전용이다.** 검사 중 아동이 응답한 기록이라 채점자가 바꾸지 않는다. `WordGrid`의 `readOnly`가 그 경계다.
- **`formForGrade`의 폴백은 의도된 것이다.** 검사 진행이 단일 양식이라 2~6학년 세션도 실제로 G1 문항으로 검사받았다. 그래서 결과지 하단에 `form.id`를 찍어 어떤 양식으로 채점했는지 남긴다.
- **`PROVISIONAL_CRITERIA` 표시는 인쇄물에 남아야 한다.** `print:hidden`을 붙이지 말 것.
