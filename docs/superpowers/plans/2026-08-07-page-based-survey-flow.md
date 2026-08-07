# 페이지 단위 검사 진행 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검사 화면을 "문항 1개 = 1화면"에서 "과제 1페이지 = 1화면 + 1녹음"으로 바꾸고, 검사지의 시간 제한·중단 규칙·연습 문항·시작 신호를 그대로 구현한다.

**Architecture:** 채점 단위(개별 낱말·문장 = 기존 `ITEMS`)와 화면·녹음 단위(페이지 = 신규 `PAGES`)를 분리한다. `ITEMS`는 그대로 두고 `PAGES`가 그것을 묶어 참조한다. 검사 흐름 규칙(중단 판정, 진행할 페이지 목록)은 순수 함수만 담은 `lib/survey-flow.ts`로 빼서 UI 없이 테스트한다. 낱말 해독 의미 낱말의 현장 채점(O/X)은 새 테이블 `reading_marks`에 저장한다 — 기존 `writing_answers`를 건드리지 않아 관리자 집계가 깨지지 않는다.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase · Zod · Vitest (`environment: 'node'`)

**검사지 근거:** `[최종] 초등 1학년 선별검사지.pdf` (KODYS-G1)
- 낱말 해독: **30초** 동안 정확하게 읽은 낱말 수 (의미 7 + 무의미 7 = /14)
- 문장 읽기유창성: **40초** 동안 정확하게 읽은 어절 수 (7+7+8+14 = /36)
- 낱말 쓰기: 정확하게 쓴 낱말 1점 (의미 5 + 무의미 5 = /10)
- **중단 규칙 ①** 낱말 해독 의미 낱말 첫 3개 연속 오반응 → 문장 읽기유창성·낱말 쓰기 미실시
- **중단 규칙 ②** 낱말 쓰기 의미 낱말 첫 3개 연속 오반응 → 검사 중단

---

## 이 계획에 포함되지 않는 것 (별도 계획)

- **2단계 — 검사 진행 편의:** 일시정지/저장 버튼, "자동 저장됨" 표시, 이메일·전화 분리, 반 드롭다운
- **3단계 — 관리자 채점·결과지:** 채점 입력 UI, Pass/Fail 판정, 검사지 양식 결과지 인쇄, 검사자(교사/전문가) 구분
- **"몰라요" 버튼:** 넣지 않는 쪽으로 회신했고 담당자 답을 기다리는 중이다. 점수상 무응답과 동일하게 0점이고, 페이지 전체에 제한 시간이 걸리므로 아동이 갇히지 않는다.

이 계획(1단계)은 그 둘의 전제다. 페이지 코드가 곧 녹음 저장 키이자 채점 단위이므로 먼저 확정한다.

---

## 실행 전 확인해야 할 결정 사항

계획대로 진행하되, 아래 3건은 **담당자 확인 후 바뀔 수 있는 가정**이다. 각 가정은 한 곳에만 있어 나중에 바꾸기 쉽게 설계한다.

| # | 가정 | 근거 | 바뀌면 고칠 곳 |
|---|---|---|---|
| A1 | 중단 규칙 ②(쓰기 중단) 이후에도 **검사자 체크리스트는 진행**한다 | 체크리스트는 아동 과제가 아니라 검사자 관찰 기록 | `lib/survey-flow.ts`의 `visiblePages` |
| A2 | 연습 페이지는 **낱말 해독 앞에 1개만** 둔다 | 문장 읽기는 조작이 동일, 쓰기는 아동 조작이 없음 | `lib/items.ts`의 `PAGES` 배열 |
| A3 | 연습 낱말은 **임시 placeholder** (`나무·구름·바다`) | 담당자 제공 전 | `lib/items.ts`의 `PRACTICE_WORDS` |

**추가로 담당자에게 반드시 물어야 할 것 (이 계획에서는 현행 유지):**
낱말 쓰기 페이지에 **낱말 10개가 화면에 그대로 보인다.** 현재 코드도 그렇지만(`WritingItem`이 낱말을 44px로 표시), 한 페이지에 10개를 모두 나열하면 아동이 화면을 보고 베껴 쓸 수 있다. 검사자가 태블릿을 들고 불러주는 운영이라면 문제없지만, 아동이 화면을 보는 배치라면 검사 타당도가 깨진다. **담당자 답이 오기 전까지는 요청받은 대로(10개 노출) 구현한다.**

---

## File Structure

**신규**
| 경로 | 책임 |
|---|---|
| `lib/survey-flow.ts` | 중단 규칙 판정, 진행할 페이지 목록 계산 (순수 함수만) |
| `components/survey/Countdown.tsx` | "준비… 3·2·1·시작!" 시작 신호 |
| `components/survey/ReadingPage.tsx` | 낱말 그리드/문장 표시 + 카운트다운 + 페이지 단위 녹음 (연습 모드 포함) |
| `components/survey/MarkPage.tsx` | 검사자 현장 채점(의미 낱말 7개 O/X) |
| `components/survey/WritingPage.tsx` | 낱말 쓰기 10개 목록 + 전체 선택 + 중단 규칙 ② |
| `supabase/migrations/009_reading_marks.sql` | 현장 채점 저장 테이블 |
| `tests/survey-flow.test.ts` | 중단 규칙·페이지 흐름 |

**수정**
| 경로 | 변경 |
|---|---|
| `lib/items.ts` | `PAGES` 모델·연습 문항·`GRACE_SEC` 추가, `ITEM_TOTALS` 분모 변경 |
| `lib/survey-state.ts` | 스키마 v4 (`idx`→`pageIdx`, `marks` 추가) |
| `lib/db.ts` | `reading_marks` 저장/조회 |
| `app/api/recordings/route.ts` | 문항 코드 → 페이지 코드 검증 |
| `app/api/sessions/submit/route.ts` | `marks` 수신·저장 |
| `app/survey/page.tsx` | 페이지 기반 위저드로 전환 |
| `app/review/page.tsx` | 페이지 기반 목록 |
| `components/admin/RecordingsTable.tsx` | 페이지 단위 표 |
| `components/admin/AdminDetailView.tsx` | 녹음 진행 집계를 페이지 기준으로 |

**삭제**
| 경로 | 사유 |
|---|---|
| `components/survey/RecordingItem.tsx` | `ReadingPage.tsx`가 대체 |
| `components/survey/WritingItem.tsx` | `WritingPage.tsx`가 대체 |

---

## Task 1: 페이지 모델 (`PAGES`)

**Files:**
- Modify: `lib/items.ts:1-104`
- Test: `tests/items.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/items.test.ts` 파일 맨 아래에 아래 describe 블록을 추가한다. 파일 상단 import 문도 아래처럼 교체한다.

```ts
import { describe, it, expect } from 'vitest'
import {
  ITEMS, ITEM_TOTALS, RECORDING_ITEMS, WRITING_ITEMS, CHECKLIST_AREAS,
  areaLabel, isRecordingItem, itemByCode, toggleChecklistArea,
  PAGES, RECORDING_PAGES, pageByCode, isRecordingPage, maxRecSec,
  GRACE_SEC, MEANING_READ_CODES, MEANING_WRITE_CODES, PRACTICE_PLACEHOLDER,
} from '@/lib/items'
```

```ts
describe('PAGES (화면·녹음 단위)', () => {
  it('페이지 순서와 코드 — 연습→의미→현장채점→무의미→문장4→쓰기→체크리스트', () => {
    expect(PAGES.map(p => p.code)).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_meaning_mark', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_ww', 'p_cl',
    ])
  })

  it('page.code 중복 없음', () => {
    expect(new Set(PAGES.map(p => p.code)).size).toBe(PAGES.length)
  })

  it('낱말 해독 페이지는 의미 7개 / 무의미 7개를 묶는다', () => {
    expect(pageByCode.get('p_rw_meaning')!.items.map(i => i.text))
      .toEqual(['어디', '바지', '양보', '그늘', '설탕', '장갑', '방법'])
    expect(pageByCode.get('p_rw_nonsense')!.items.map(i => i.text))
      .toEqual(['아로', '부림', '영추', '주곡', '구말', '솔텅', '봉밥'])
  })

  it('문장 페이지는 문장 1개씩', () => {
    expect(pageByCode.get('p_rs01')!.items.map(i => i.code)).toEqual(['rs01'])
    expect(pageByCode.get('p_rs04')!.items[0].text).toContain('사과를 했어요')
  })

  it('쓰기 페이지는 낱말 10개를 한 번에 묶는다', () => {
    expect(pageByCode.get('p_ww')!.items).toHaveLength(10)
    expect(pageByCode.get('p_ww')!.items[0].text).toBe('우비')
  })

  it('제한 시간(검사지 기준): 낱말 30초, 문장 40초, 비녹음 0초', () => {
    expect(pageByCode.get('p_rw_meaning')!.limitSec).toBe(30)
    expect(pageByCode.get('p_rw_nonsense')!.limitSec).toBe(30)
    expect(pageByCode.get('p_rs01')!.limitSec).toBe(40)
    expect(pageByCode.get('p_ww')!.limitSec).toBe(0)
    expect(pageByCode.get('p_cl')!.limitSec).toBe(0)
  })

  it('녹음 자동 종료 = 제한 + 여유(GRACE_SEC)', () => {
    expect(GRACE_SEC).toBe(5)
    expect(maxRecSec(pageByCode.get('p_rw_meaning')!)).toBe(35)
    expect(maxRecSec(pageByCode.get('p_rs01')!)).toBe(45)
  })

  it('연습 페이지는 practice=true이고 본 문항과 낱말이 겹치지 않는다', () => {
    const practice = pageByCode.get('p_practice_rw')!
    expect(practice.practice).toBe(true)
    const realTexts = new Set(ITEMS.map(i => i.text))
    practice.items.forEach(i => expect(realTexts.has(i.text)).toBe(false))
  })

  it('현장 채점 페이지는 검사자용(role=examiner)이며 의미 낱말 7개를 다룬다', () => {
    const mark = pageByCode.get('p_rw_meaning_mark')!
    expect(mark.role).toBe('examiner')
    expect(mark.items.map(i => i.code)).toEqual(MEANING_READ_CODES)
    expect(MEANING_READ_CODES).toHaveLength(7)
  })

  it('아동 조작 페이지 / 검사자 조작 페이지 구분', () => {
    const roleOf = (c: string) => pageByCode.get(c)!.role
    expect(roleOf('p_rw_meaning')).toBe('child')
    expect(roleOf('p_rs01')).toBe('child')
    expect(roleOf('p_ww')).toBe('examiner')
    expect(roleOf('p_cl')).toBe('examiner')
  })

  it('RECORDING_PAGES는 업로드 대상만 — 연습 제외 6페이지', () => {
    expect(RECORDING_PAGES.map(p => p.code))
      .toEqual(['p_rw_meaning', 'p_rw_nonsense', 'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04'])
    expect(RECORDING_PAGES.every(p => !p.practice)).toBe(true)
    expect(isRecordingPage(pageByCode.get('p_ww')!)).toBe(false)
  })

  it('ITEM_TOTALS 분모는 페이지 기준(녹음 6, 쓰기 10)', () => {
    expect(ITEM_TOTALS).toEqual({ rec: 6, write: 10 })
  })

  it('의미 낱말 코드 목록 (중단 규칙 판정에 쓰임)', () => {
    expect(MEANING_READ_CODES).toEqual(['rw01', 'rw02', 'rw03', 'rw04', 'rw05', 'rw06', 'rw07'])
    expect(MEANING_WRITE_CODES).toEqual(['ww01', 'ww02', 'ww03', 'ww04', 'ww05'])
  })

  it('연습 낱말이 임시 placeholder임을 코드가 명시한다', () => {
    // 담당자에게 실제 연습용 낱말을 받으면 PRACTICE_WORDS를 교체하고 이 플래그를 false로 바꾼다.
    expect(PRACTICE_PLACEHOLDER).toBe(true)
  })
})
```

기존 `it('ITEM_TOTALS는 진행률 분모(녹음 18, 쓰기 10)', ...)` 블록은 위 `'ITEM_TOTALS 분모는 페이지 기준'`이 대체하므로 **삭제한다.**

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/items.test.ts`
Expected: FAIL — `PAGES`, `pageByCode` 등이 `lib/items.ts`에서 export되지 않아 import 에러

- [ ] **Step 3: 구현**

`lib/items.ts`에서 `ITEM_TOTALS` 정의(59행)를 아래로 교체한다.

```ts
/** 진행률 분모 — 화면·녹음 단위(페이지)와 쓰기 문항 수. 관리자 목록·결과지가 같은 값을 쓴다. */
export const ITEM_TOTALS = { rec: RECORDING_PAGES.length, write: WRITING_ITEMS.length }
```

그리고 `lib/items.ts` 파일 맨 아래(`KIND_LABEL` 정의 뒤)에 아래를 추가한다.
`ITEM_TOTALS`가 `RECORDING_PAGES`를 참조하므로, **`ITEM_TOTALS` 정의를 이 블록 뒤로 옮긴다**(선언 순서 주의 — `const`는 호이스팅되지 않는다).

```ts
// ── 페이지 모델 ────────────────────────────────────────────────────────
// 검사지는 "한 페이지에 문항 전체를 두고, 시작하면 전체를 읽는" 방식이다.
// 따라서 화면·녹음·제한시간의 단위는 문항이 아니라 페이지다.
// 채점 단위는 여전히 개별 문항(ITEMS) — 페이지가 그것을 묶어 참조만 한다.

/** 녹음 여유(초). 제한 시간에 칼같이 끊으면 마지막 낱말이 잘리므로 조금 더 녹음한다.
 *  채점은 어디까지나 limitSec까지만 한다(검사지 기준) — 이 값은 채점 기준이 아니다. */
export const GRACE_SEC = 5

/** 페이지를 조작하는 주체. examiner 페이지는 아동이 아니라 검사자가 응답한다. */
export type PageRole = 'child' | 'examiner'

export interface SurveyPage {
  /** 화면 키이자 녹음 저장 키(recordings.item_code). 문항 코드와 네임스페이스가 겹치지 않게 p_ 접두. */
  code: string
  section: Section
  role: PageRole
  kind: WordKind
  /** 이 페이지에 표시되는 문항들(채점 단위) */
  items: SurveyItem[]
  /** 검사지 제한 시간(초). 채점 기준. 0이면 비녹음 페이지 */
  limitSec: number
  /** 연습 페이지 — 녹음 동작은 본 검사와 같지만 업로드·채점하지 않는다 */
  practice: boolean
}

/** ⚠️ 임시 연습 낱말. 담당자에게 받은 연습용 낱말로 교체하고 PRACTICE_PLACEHOLDER를 false로 바꿀 것.
 *  교체 전에는 실제 아동 대상 시범검사를 돌리지 말 것 — 본 문항과의 난이도·중복이 검증되지 않았다. */
export const PRACTICE_PLACEHOLDER = true
const PRACTICE_WORDS = ['나무', '구름', '바다']

/** 연습 문항은 채점하지 않으므로 orderNo=0으로 둔다(본 문항 1~29와 구분). */
const PRACTICE_ITEMS: SurveyItem[] = PRACTICE_WORDS.map((text, i) => ({
  code: `pw${pad2(i + 1)}`, orderNo: 0,
  section: 'word_reading', kind: 'meaning', text, maxSec: 0,
}))

const readWords = (kind: 'meaning' | 'nonsense') =>
  ITEMS.filter(i => i.section === 'word_reading' && i.kind === kind)

/** 중단 규칙 판정에 쓰는 의미 낱말 코드(문항 순서 유지) */
export const MEANING_READ_CODES = readWords('meaning').map(i => i.code)
export const MEANING_WRITE_CODES =
  ITEMS.filter(i => i.section === 'word_writing' && i.kind === 'meaning').map(i => i.code)

export const PAGES: SurveyPage[] = [
  { code: 'p_practice_rw', section: 'word_reading', role: 'child', kind: 'meaning',
    items: PRACTICE_ITEMS, limitSec: 30, practice: true },
  { code: 'p_rw_meaning', section: 'word_reading', role: 'child', kind: 'meaning',
    items: readWords('meaning'), limitSec: 30, practice: false },
  // 검사지 중단 규칙 판정을 위해 의미 낱말 직후 검사자가 현장에서 O/X를 표시한다.
  { code: 'p_rw_meaning_mark', section: 'word_reading', role: 'examiner', kind: 'meaning',
    items: readWords('meaning'), limitSec: 0, practice: false },
  { code: 'p_rw_nonsense', section: 'word_reading', role: 'child', kind: 'nonsense',
    items: readWords('nonsense'), limitSec: 30, practice: false },
  ...ITEMS.filter(i => i.section === 'sentence_reading').map(i => ({
    code: `p_${i.code}`, section: 'sentence_reading' as const, role: 'child' as const,
    kind: null, items: [i], limitSec: 40, practice: false,
  })),
  { code: 'p_ww', section: 'word_writing', role: 'examiner', kind: null,
    items: WRITING_ITEMS, limitSec: 0, practice: false },
  { code: 'p_cl', section: 'checklist', role: 'examiner', kind: null,
    items: [], limitSec: 0, practice: false },
]

export const pageByCode = new Map(PAGES.map(p => [p.code, p]))

/** 녹음이 있는 페이지인지 — "limitSec > 0" 규약이 화면마다 재표현되는 것을 막는다. */
export const isRecordingPage = (p: SurveyPage): boolean => p.limitSec > 0

/** 서버에 업로드되는 녹음 페이지(연습 제외). 진행률 분모·관리자 결과지가 공유한다. */
export const RECORDING_PAGES = PAGES.filter(p => isRecordingPage(p) && !p.practice)

/** 녹음 자동 종료 시각(초) = 검사지 제한 + 여유 */
export const maxRecSec = (p: SurveyPage): number => p.limitSec + GRACE_SEC
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/items.test.ts`
Expected: PASS (기존 문항 테스트 + 신규 페이지 테스트 모두)

- [ ] **Step 5: 커밋**

```bash
git add lib/items.ts tests/items.test.ts
git commit -m "feat(items): 화면·녹음 단위인 PAGES 모델 추가 (문항 채점 단위는 유지)"
```

---

## Task 2: 중단 규칙과 진행 흐름 (`lib/survey-flow.ts`)

**Files:**
- Create: `lib/survey-flow.ts`
- Test: `tests/survey-flow.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/survey-flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hitsCeiling, readingCeilingHit, writingCeilingHit, visiblePages, CEILING_N } from '@/lib/survey-flow'

const codes = (marks: Record<string, boolean>) => visiblePages({ marks }).map(p => p.code)

describe('hitsCeiling (앞 3개 연속 오반응)', () => {
  it('앞 3개가 모두 오반응이면 중단', () => {
    expect(hitsCeiling([false, false, false, true, true])).toBe(true)
  })
  it('앞 3개 중 하나라도 정반응이면 중단 아님', () => {
    expect(hitsCeiling([false, true, false])).toBe(false)
    expect(hitsCeiling([true, false, false])).toBe(false)
    expect(hitsCeiling([false, false, true])).toBe(false)
  })
  it('4번째부터 3연속 오반응은 중단 아님 (검사지는 "첫 3개")', () => {
    expect(hitsCeiling([true, true, true, false, false, false])).toBe(false)
  })
  it('아직 3개를 채점하지 않았으면 중단 아님', () => {
    expect(hitsCeiling([false, false])).toBe(false)
    expect(hitsCeiling([false, false, undefined])).toBe(false)
    expect(hitsCeiling([])).toBe(false)
  })
  it('임계값은 3', () => {
    expect(CEILING_N).toBe(3)
  })
})

describe('readingCeilingHit (낱말 해독 의미 낱말)', () => {
  it('rw01~03 모두 오반응 → 중단', () => {
    expect(readingCeilingHit({ rw01: false, rw02: false, rw03: false })).toBe(true)
  })
  it('하나라도 정반응이면 계속', () => {
    expect(readingCeilingHit({ rw01: false, rw02: true, rw03: false })).toBe(false)
  })
  it('미채점이면 계속', () => {
    expect(readingCeilingHit({})).toBe(false)
  })
})

describe('writingCeilingHit (낱말 쓰기 의미 낱말)', () => {
  it('ww01~03 모두 못 씀 → 중단', () => {
    expect(writingCeilingHit({ ww01: false, ww02: false, ww03: false })).toBe(true)
  })
  it('하나라도 쓸 수 있으면 계속', () => {
    expect(writingCeilingHit({ ww01: false, ww02: false, ww03: true })).toBe(false)
  })
})

describe('visiblePages (중단 규칙 반영한 진행 페이지)', () => {
  it('중단 없으면 전체 페이지', () => {
    expect(codes({})).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_meaning_mark', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_ww', 'p_cl',
    ])
  })

  it('낱말 해독 중단 시 문장·쓰기를 뺀다 (무의미 낱말은 계속 — 검사지 명시)', () => {
    expect(codes({ rw01: false, rw02: false, rw03: false })).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_meaning_mark', 'p_rw_nonsense', 'p_cl',
    ])
  })

  it('중단되어도 검사자 체크리스트는 남는다 (아동 과제가 아니라 검사자 관찰 기록 — 가정 A1)', () => {
    expect(codes({ rw01: false, rw02: false, rw03: false })).toContain('p_cl')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/survey-flow.test.ts`
Expected: FAIL — `Cannot find module '@/lib/survey-flow'`

- [ ] **Step 3: 구현**

Create `lib/survey-flow.ts`:

```ts
// lib/survey-flow.ts — 검사 진행 흐름 규칙(검사지의 중단 규칙 포함). 순수 함수만 둔다.
// 검사지 근거:
//  ① 낱말 해독 의미 낱말 첫 3개 연속 오반응 → 문장 읽기유창성·낱말 쓰기 과제를 실시하지 않는다.
//  ② 낱말 쓰기 의미 낱말 첫 3개 연속 오반응 → 검사를 중단한다.
// ※ 가정 A1: ②로 중단되어도 검사자 체크리스트는 진행한다(아동 과제가 아니라 검사자 관찰 기록).
import { MEANING_READ_CODES, MEANING_WRITE_CODES, PAGES, type SurveyPage } from './items'

/** 중단 판정 개수 — "첫 N개 연속 오반응" */
export const CEILING_N = 3

/**
 * 문항 순서대로 나열한 정반응 여부에서 중단 여부를 판정한다.
 * 앞 N개가 "모두 채점되었고 모두 오반응"일 때만 참 — 미채점(undefined)은 중단으로 보지 않는다.
 */
export function hitsCeiling(marks: (boolean | undefined)[]): boolean {
  const head = marks.slice(0, CEILING_N)
  return head.length === CEILING_N && head.every(m => m === false)
}

/** 낱말 해독 의미 낱말(rw01~rw07) 기준 중단 여부 */
export function readingCeilingHit(marks: Record<string, boolean>): boolean {
  return hitsCeiling(MEANING_READ_CODES.map(c => marks[c]))
}

/** 낱말 쓰기 의미 낱말(ww01~ww05) 기준 중단 여부 */
export function writingCeilingHit(writing: Record<string, boolean>): boolean {
  return hitsCeiling(MEANING_WRITE_CODES.map(c => writing[c]))
}

/** 진행 상태에서 실제로 실시할 페이지 목록. 중단 규칙 ①에 걸리면 문장·쓰기 페이지가 빠진다. */
export function visiblePages(s: { marks: Record<string, boolean> }): SurveyPage[] {
  if (!readingCeilingHit(s.marks)) return PAGES
  return PAGES.filter(p => p.section !== 'sentence_reading' && p.section !== 'word_writing')
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/survey-flow.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/survey-flow.ts tests/survey-flow.test.ts
git commit -m "feat(flow): 검사지 중단 규칙(첫 3개 연속 오반응) 순수 함수로 구현"
```

---

## Task 3: 진행 상태 스키마 v4

**Files:**
- Modify: `lib/survey-state.ts:1-59`
- Test: `tests/survey-state.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/survey-state.test.ts`에서 `idx`를 쓰는 기존 테스트를 아래로 교체한다(파일 상단 `beforeEach` 스텁은 그대로 둔다).

```ts
describe('survey-state', () => {
  it('newState는 pageIdx=0, phase=mic로 시작하고 marks가 비어 있다', () => {
    const s = newState('sid-1', '홍길동', 'tok')
    expect(s.v).toBe(4)
    expect(s.pageIdx).toBe(0)
    expect(s.phase).toBe('mic')
    expect(s.micDone).toBe(false)
    expect(s.marks).toEqual({})
  })

  it('save→load 왕복으로 pageIdx·phase·childName·marks 복원', () => {
    const s = newState('sid-1', '홍길동', 'tok')
    saveState({ ...s, pageIdx: 3, phase: 'page', micDone: true, marks: { rw01: true, rw02: false } })
    const loaded = loadState()
    expect(loaded?.sessionId).toBe('sid-1')
    expect(loaded?.pageIdx).toBe(3)
    expect(loaded?.phase).toBe('page')
    expect(loaded?.sessionToken).toBe('tok')
    expect(loaded?.childName).toBe('홍길동')
    expect(loaded?.marks).toEqual({ rw01: true, rw02: false })
  })

  it('세션별 키 분리 + last 포인터가 최신 세션을 가리킴', () => {
    saveState({ ...newState('sid-1', '홍길동', 'tok'), pageIdx: 1 })
    saveState({ ...newState('sid-2', '김철수', 'tok'), pageIdx: 2 })
    expect(loadState()?.sessionId).toBe('sid-2')
    expect(loadState()?.pageIdx).toBe(2)
  })

  it('구버전(v3) 상태는 로드하지 않는다 — 필드 구조가 달라 재개 위치가 어긋난다', () => {
    localStorage.setItem('kodys-survey:last', 'old')
    localStorage.setItem('kodys-survey:old', JSON.stringify({ v: 3, sessionId: 'old', idx: 12 }))
    expect(loadState()).toBeNull()
  })

  it('clearState는 진행 상태를 파기한다', () => {
    saveState({ ...newState('sid-1', '홍길동', 'tok'), pageIdx: 2 })
    clearState()
    expect(loadState()).toBeNull()
  })
})
```

파일에 이미 존재하는 기존 `describe('survey-state', ...)` 블록 전체를 위 블록으로 **교체**한다. 파일 하단에 다른 describe 블록이 있다면 그대로 둔다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/survey-state.test.ts`
Expected: FAIL — `s.pageIdx`가 `undefined`, `s.v`가 3

- [ ] **Step 3: 구현**

`lib/survey-state.ts`의 8~30행을 아래로 교체한다.

```ts
const SCHEMA_V = 4

export interface SurveyState {
  v: typeof SCHEMA_V
  sessionId: string
  sessionToken: string               // /api/sessions가 발급 — 녹음/제출 요청에 동봉
  childName: string                  // 진행 화면·이어하기 안내 표시용(서버 세션 행이 원본)
  micDone: boolean
  pageIdx: number                    // 현재 페이지 인덱스(0-based, visiblePages 기준)
  phase: 'mic' | 'page'              // 마이크 확인 단계 / 페이지 단계
  recorded: Record<string, number>   // pageCode → 저장된 시도 수
  marks: Record<string, boolean>     // 낱말 해독 의미 낱말 itemCode → 정반응 여부(검사자 현장 채점)
  writing: Record<string, boolean>   // itemCode → 예(true)/아니오(false)
  checklist: string[]                // 선택된 영역 코드
  introsSeen: string[]               // 진입 안내를 이미 본 섹션 코드(새로고침·왕복에도 재노출 방지)
}

const PREFIX = 'kodys-survey:'
const LAST_KEY = 'kodys-survey:last'
const keyOf = (sessionId: string) => `${PREFIX}${sessionId}`

export function newState(sessionId: string, childName: string, sessionToken: string): SurveyState {
  return {
    v: SCHEMA_V, sessionId, sessionToken, childName,
    micDone: false, pageIdx: 0, phase: 'mic',
    recorded: {}, marks: {}, writing: {}, checklist: [], introsSeen: [],
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/survey-state.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/survey-state.ts tests/survey-state.test.ts
git commit -m "feat(state): 진행 상태 v4 — 페이지 인덱스와 현장 채점(marks) 보관"
```

---

## Task 4: 현장 채점 저장 테이블

**Files:**
- Create: `supabase/migrations/009_reading_marks.sql`
- Modify: `lib/db.ts:34-59`, `lib/db.ts:198-213`

> **설계 메모:** 기존 `writing_answers`를 일반화(rename)하지 않고 새 테이블을 만든다. `lib/adminStats.ts:39`의 `sessionProgress`가 `writing_answers.length`를 쓰기 진행률로 세고 있어서, 한 테이블에 낱말 해독 채점까지 섞으면 진행률이 조용히 부풀려진다. 테이블을 나누면 기존 조회·집계를 한 줄도 건드리지 않아도 된다.

- [ ] **Step 1: 마이그레이션 작성**

Create `supabase/migrations/009_reading_marks.sql`:

```sql
-- 009_reading_marks.sql — 낱말 해독 의미 낱말의 검사자 현장 채점(O/X).
-- 검사지의 중단 규칙("의미 낱말 첫 3개 연속 오반응 시 문장·쓰기 미실시")은 검사 도중 판정해야 하므로,
-- 검사자가 현장에서 표시한 정반응 여부를 최종 제출 시 함께 저장한다.
-- 이 값은 관리자 채점(3단계)의 초기값이 된다.
-- 비파괴적·재실행 안전(idempotent). Supabase SQL Editor에서 직접 실행할 것.

create table if not exists reading_marks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  item_code  text not null,          -- rw01~rw07 (의미 낱말)
  correct    boolean not null,
  unique (session_id, item_code)
);

create index if not exists reading_marks_session_id_idx on reading_marks(session_id);

alter table reading_marks enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근 (001과 동일 방침).
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/db.test.ts` 맨 아래에 아래 블록을 추가한다. 이 파일의 기존 스텁(`enqueue`로 테이블별 응답을 큐에 넣고
`fromCalls`로 접근한 테이블을 기록하는 프록시)을 그대로 쓴다 — 쿼리 문법이 아니라 "어떤 테이블을 건드렸는가와
결과에 따른 분기"를 검증하는 것이 이 파일의 설계다.

```ts
describe('submitSession — 현장 채점(marks) 저장', () => {
  it('marks가 있으면 reading_marks에도 upsert한다', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    enqueue('writing_answers', { error: null })
    enqueue('reading_marks', { error: null })
    const r = await submitSession(SID, [{ itemCode: 'ww01', canWrite: true }], ['none'],
      [{ itemCode: 'rw01', correct: true }, { itemCode: 'rw02', correct: false }])
    expect(r).toBe('ok')
    expect(fromCalls).toContain('reading_marks')
  })

  it('marks가 비어 있으면 reading_marks를 건드리지 않는다', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    enqueue('writing_answers', { error: null })
    const r = await submitSession(SID, [{ itemCode: 'ww01', canWrite: true }], ['none'])
    expect(r).toBe('ok')
    expect(fromCalls).not.toContain('reading_marks')
  })

  it('reading_marks 저장 실패는 삼키지 않고 throw한다 (채점 근거의 조용한 손실 방지)', async () => {
    enqueue('sessions', { data: [{ id: SID }], error: null })
    enqueue('reading_marks', { error: { message: 'boom' } })
    await expect(submitSession(SID, [], ['none'], [{ itemCode: 'rw01', correct: false }]))
      .rejects.toThrow('boom')
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — `submitSession`이 4번째 인자를 받지 않음

- [ ] **Step 4: 구현**

`lib/db.ts`의 34행 아래에 타입을 추가한다.

```ts
export interface WritingAnswer { itemCode: string; canWrite: boolean }
/** 낱말 해독 의미 낱말의 검사자 현장 채점 */
export interface ReadingMark { itemCode: string; correct: boolean }
```

`submitSession`(42~59행)을 아래로 교체한다.

```ts
/**
 * 최종 제출: 미제출 세션만 업데이트하고(제출 후 재제출·변조 차단), 성공했을 때만
 * 낱말쓰기·현장 채점을 upsert한다.
 * 업데이트 0건이면 미존재/기제출을 구분해 반환(라우트에서 404/409 처리).
 */
export async function submitSession(
  sessionId: string, writing: WritingAnswer[], checklist: string[], marks: ReadingMark[] = [],
): Promise<SubmitResult> {
  const { data, error } = await sb().from('sessions')
    .update({ checklist, submitted_at: new Date().toISOString() })
    .eq('id', sessionId).is('submitted_at', null).select('id')
  fail(error)
  if ((data ?? []).length === 0) {
    const state = await sessionSubmitState(sessionId)
    return state === 'submitted' ? 'already_submitted' : 'not_found'
  }
  if (writing.length > 0) {
    const rows = writing.map(w => ({ session_id: sessionId, item_code: w.itemCode, can_write: w.canWrite }))
    const { error: e2 } = await sb().from('writing_answers').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(e2)
  }
  if (marks.length > 0) {
    const rows = marks.map(m => ({ session_id: sessionId, item_code: m.itemCode, correct: m.correct }))
    const { error: e3 } = await sb().from('reading_marks').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(e3)
  }
  return 'ok'
}
```

`sessionDetail`(198~213행)을 아래로 교체해 관리자 결과지가 현장 채점을 함께 받도록 한다.

```ts
export interface MarkRow { item_code: string; correct: boolean }

export async function sessionDetail(sessionId: string): Promise<{
  session: SessionRow; recordings: RecordingRow[]; writing: WritingRow[]; marks: MarkRow[]
}> {
  const [{ data: s, error: e1 }, { data: recs, error: e2 }, { data: ans, error: e3 }, { data: mk, error: e4 }] =
    await Promise.all([
      sb().from('sessions').select(SESSION_COLS).eq('id', sessionId).single(),
      sb().from('recordings').select('item_code, attempt_no, audio_path, duration_sec, created_at')
        .eq('session_id', sessionId).order('item_code').order('attempt_no'),
      sb().from('writing_answers').select('item_code, can_write').eq('session_id', sessionId),
      sb().from('reading_marks').select('item_code, correct').eq('session_id', sessionId),
    ])
  fail(e1); fail(e2); fail(e3); fail(e4)
  return {
    session: s as unknown as SessionRow,
    recordings: (recs ?? []) as RecordingRow[],
    writing: (ans ?? []) as WritingRow[],
    marks: (mk ?? []) as MarkRow[],
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/db.test.ts && npx tsc --noEmit`
Expected: PASS + 타입 오류 없음

- [ ] **Step 6: Supabase에 마이그레이션 적용**

Supabase SQL Editor에서 `supabase/migrations/009_reading_marks.sql` 내용을 그대로 실행한다.
확인: `select * from reading_marks limit 1;` → `0 rows` (에러 없이 실행되면 성공)

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/009_reading_marks.sql lib/db.ts tests/db.test.ts
git commit -m "feat(db): 낱말 해독 현장 채점 저장용 reading_marks 테이블"
```

---

## Task 5: 업로드/제출 API를 페이지 단위로

**Files:**
- Modify: `app/api/recordings/route.ts:9`, `:15-32`
- Modify: `app/api/sessions/submit/route.ts:7`, `:15-45`
- Test: `tests/recordings-route.test.ts`, `tests/submit-route.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

**(1) `tests/recordings-route.test.ts`** — 기본 요청의 `itemCode`가 문항 코드(`rw01`)라 이 파일의 거의 모든 테스트가
깨진다. 먼저 기본값을 페이지 코드로 바꾼다. 26행을 아래로 교체한다.

```ts
  fd.set('itemCode', 'p_rw_meaning')
```

첫 테스트(`'업로드 + 녹음 기록(서버 고정 Content-Type)'`)의 경로 기대값도 함께 교체한다.

```ts
  it('업로드 + 녹음 기록(서버 고정 Content-Type)', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.uploadRecording).toHaveBeenCalledWith(`${SID}/p_rw_meaning_1.webm`, expect.any(Buffer), 'audio/webm')
    expect(db.insertRecording).toHaveBeenCalledWith({
      sessionId: SID, itemCode: 'p_rw_meaning', attemptNo: 1,
      audioPath: `${SID}/p_rw_meaning_1.webm`, durationSec: 3.2,
    })
  })
```

기존 `it('녹음 문항이 아닌 코드 400 (ww01, cl, 미지 코드)', ...)` 블록을 아래로 교체한다.

```ts
  it('녹음 페이지가 아닌 코드 400 (쓰기·체크리스트·미지 코드)', async () => {
    expect((await POST(makeReq({ itemCode: 'p_ww' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'p_cl' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'zz99' }))).status).toBe(400)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })

  it('개별 문항 코드는 더 이상 허용하지 않는다 (녹음 단위가 페이지로 바뀜)', async () => {
    expect((await POST(makeReq({ itemCode: 'rw01' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'rs01' }))).status).toBe(400)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })

  it('연습 페이지 코드는 거부한다 (아동 연습용 — 서버에 남기지 않는다)', async () => {
    expect((await POST(makeReq({ itemCode: 'p_practice_rw' }))).status).toBe(400)
    expect(db.uploadRecording).not.toHaveBeenCalled()
  })

  it('문장 페이지 코드는 허용된다', async () => {
    expect((await POST(makeReq({ itemCode: 'p_rs04' }))).status).toBe(200)
  })
```

**(2) `tests/submit-route.test.ts`** — `submitSession` 인자가 4개로 늘어 기존 `toHaveBeenCalledWith` 단언이 깨진다.
아래 두 블록을 교체한다.

```ts
  it('낱말쓰기 답 + 체크리스트 저장', async () => {
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1',
      [{ itemCode: 'ww01', canWrite: true }, { itemCode: 'ww02', canWrite: false }], ['none'], [])
  })
  it('답이 하나도 없어도 제출 가능', async () => {
    const res = await POST(makeReq({ sessionId: SID, sessionToken: TOKEN, writing: {}, checklist: [] }))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1', [], [], [])
  })
```

`it('체크리스트 중복 코드는 dedup되어 저장된다', ...)`의 단언도 인자 하나를 추가한다.

```ts
    expect(db.submitSession).toHaveBeenCalledWith(SID, expect.anything(), ['speech', 'attention'], [])
```

그리고 `describe` 블록 안에 아래 테스트를 추가한다.

```ts
  it('marks에 의미 낱말 코드와 boolean이 오면 저장된다', async () => {
    const res = await POST(makeReq({ ...VALID(), marks: { rw01: true, rw02: false } }))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith(SID, expect.anything(), ['none'],
      [{ itemCode: 'rw01', correct: true }, { itemCode: 'rw02', correct: false }])
  })
  it('marks가 없으면 빈 배열로 저장된다 (구버전 클라이언트 호환)', async () => {
    const res = await POST(makeReq(VALID()))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith(SID, expect.anything(), ['none'], [])
  })
  it('의미 낱말이 아닌 코드는 400 (무의미 낱말·쓰기 문항은 현장 채점 대상이 아님)', async () => {
    expect((await POST(makeReq({ ...VALID(), marks: { rw08: true } }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID(), marks: { ww01: true } }))).status).toBe(400)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('marks 값이 boolean이 아니면 400', async () => {
    expect((await POST(makeReq({ ...VALID(), marks: { rw01: 'yes' } }))).status).toBe(400)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
  it('marks가 배열이면 400 (객체만 허용)', async () => {
    expect((await POST(makeReq({ ...VALID(), marks: [['rw01', true]] }))).status).toBe(400)
    expect(db.submitSession).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/recordings-route.test.ts tests/submit-route.test.ts`
Expected: FAIL — 페이지 코드가 `itemByCode`에 없어 400, marks 검증 없음

- [ ] **Step 3: recordings 라우트 구현**

`app/api/recordings/route.ts` 9행의 import를 교체한다.

```ts
import { isRecordingPage, pageByCode } from '@/lib/items'
```

15~18행의 상수 주석을 갱신한다.

```ts
const MAX_BYTES = 5 * 1024 * 1024   // 최대 45초 opus 녹음의 수 배 여유 — 스토리지 남용 방지
const MAX_ATTEMPTS = 10             // 페이지당 재녹음 상한
const MAX_DURATION_SEC = 120        // numeric(5,2) 오버플로 방지 + 비정상 장시간 차단(현재 페이지 최대 45초 대비 여유)
const MAX_PER_SESSION = 200         // 세션당 총 녹음 상한 — 스토리지/DB 남용 방지
```

28~32행을 교체한다.

```ts
  // 녹음 단위는 페이지다(검사지: 한 페이지 전체를 제한 시간 안에 읽는다).
  // 연습 페이지는 아동 연습용이라 서버에 남기지 않는다.
  const page = pageByCode.get(itemCode)
  if (!(audio instanceof File) || !UUID_RE.test(sessionId) || !page || !isRecordingPage(page) || page.practice
    || !Number.isInteger(attemptNo) || attemptNo < 1 || attemptNo > MAX_ATTEMPTS
    || !Number.isFinite(durationSec) || durationSec < 0 || durationSec > MAX_DURATION_SEC)
    return jsonError('필수 항목 누락', 400)
```

- [ ] **Step 4: submit 라우트 구현**

`app/api/sessions/submit/route.ts` 7행의 import를 교체한다.

```ts
import { AREA_CODES, MEANING_READ_CODES, WRITING_ITEMS } from '@/lib/items'
```

12행 아래에 상수를 추가한다.

```ts
const WRITING_CODES = new Set(WRITING_ITEMS.map(i => i.code))
const MARK_CODES = new Set(MEANING_READ_CODES)
```

`import { submitSession, type WritingAnswer } from '@/lib/db'`를 아래로 교체한다.

```ts
import { submitSession, type ReadingMark, type WritingAnswer } from '@/lib/db'
```

27행(`const checklist = ...`) 아래에 marks 검증을 추가한다.

```ts
  // 낱말 해독 의미 낱말의 검사자 현장 채점(중단 규칙 판정 근거). 없어도 제출은 통과시킨다.
  const marks: ReadingMark[] = []
  if (b.marks !== undefined) {
    if (typeof b.marks !== 'object' || b.marks === null || Array.isArray(b.marks))
      return bad('현장 채점 형식 오류')
    for (const [itemCode, correct] of Object.entries(b.marks)) {
      if (!MARK_CODES.has(itemCode) || typeof correct !== 'boolean') return bad('현장 채점 형식 오류')
      marks.push({ itemCode, correct })
    }
  }
```

35행의 `submitSession` 호출을 교체한다.

```ts
    const result = await submitSession(b.sessionId, writing, checklist, marks)
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/recordings-route.test.ts tests/submit-route.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/api/recordings/route.ts app/api/sessions/submit/route.ts tests/recordings-route.test.ts tests/submit-route.test.ts
git commit -m "feat(api): 녹음 단위를 페이지로 전환하고 현장 채점 수신"
```

---

## Task 6: 시작 신호 (Countdown)

**Files:**
- Create: `components/survey/Countdown.tsx`

> 컴포넌트 테스트 도구(@testing-library/react·jsdom)가 이 저장소에 없다. 새 의존성을 들이는 대신 로직을 최소로 유지하고, Task 13의 브라우저 검증으로 확인한다.

- [ ] **Step 1: 구현**

Create `components/survey/Countdown.tsx`:

```tsx
// components/survey/Countdown.tsx — "준비… 3·2·1·시작!" 시작 신호.
// 종이 검사에서 검사자가 "시작!"과 동시에 초시계를 누르는 동작을 그대로 옮긴 것.
// 버튼을 누르는 즉시 제한 시간이 흐르면 아동이 화면을 파악하는 몇 초가 그대로 점수 손실이 된다.
'use client'
import { useEffect, useRef, useState } from 'react'

export const COUNTDOWN_FROM = 3

export function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(COUNTDOWN_FROM)
  // 최신 콜백 유지(latest-ref) — onDone의 참조가 바뀌어도 진행 중인 1초 타이머가 리셋되지 않는다
  // (hooks/useRecorder.ts와 같은 패턴).
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })
  // 중복 호출 방지: 0에 도달하는 순간 정확히 한 번만 시작한다.
  const fired = useRef(false)

  useEffect(() => {
    if (n > 0) {
      const t = setTimeout(() => setN(v => v - 1), 1000)
      return () => clearTimeout(t)
    }
    if (!fired.current) { fired.current = true; onDoneRef.current() }
  }, [n])

  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="assertive">
      <p className="text-sm font-bold text-ink-soft">준비하세요</p>
      {/* 매초 key가 바뀌며 리마운트돼 확대 애니메이션이 다시 재생된다. */}
      <p key={n} className="font-read text-[88px] font-bold leading-none text-blue motion-safe:animate-[ping_0.35s_ease-out_1] lg:text-[120px]">
        {n > 0 ? n : '시작!'}
      </p>
    </div>
  )
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add components/survey/Countdown.tsx
git commit -m "feat(survey): 녹음 시작 전 3·2·1 카운트다운 신호"
```

---

## Task 7: 읽기 페이지 (ReadingPage)

**Files:**
- Create: `components/survey/ReadingPage.tsx`
- Delete: `components/survey/RecordingItem.tsx` (Task 10에서 참조가 사라진 뒤 삭제)

- [ ] **Step 1: 구현**

Create `components/survey/ReadingPage.tsx`:

```tsx
// components/survey/ReadingPage.tsx — 낱말/문장 읽기 페이지(페이지 전체 = 1녹음).
// 검사지대로 한 페이지의 문항 전체를 제한 시간 안에 읽는다. 카운트다운 후 녹음이 시작되고,
// 제한 시간(limitSec)에 도달하면 "여기까지예요" 안내가 뜨며 여유 시간(GRACE_SEC) 뒤 자동 종료된다.
// 연습 페이지(page.practice)는 동작이 동일하되 업로드하지 않는다.
'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { maxRecSec, type SurveyPage } from '@/lib/items'
import { micPermissionHint } from '@/lib/platform'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import { Spinner } from '@/components/Spinner'
import { Countdown } from '@/components/survey/Countdown'
import { uploadRecording } from '@/lib/upload'

export function ReadingPage({ page, sessionId, sessionToken, attemptCount, onSaved, onRecordingChange, onUploadFailed }: {
  page: SurveyPage; sessionId: string; sessionToken: string; attemptCount: number; onSaved: () => void
  /** 녹음/카운트다운 중 여부를 부모에 알려 [다음] 버튼을 잠근다 */
  onRecordingChange?: (busy: boolean) => void
  /** 업로드 실패를 부모에 알려 페이지 이동 후에도 재시도할 수 있게 한다 */
  onUploadFailed?: (rec: Recording) => void
}) {
  const [counting, setCounting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lowVolume, setLowVolume] = useState(false)
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const [lastRec, setLastRec] = useState<Recording | null>(null)
  const words = page.section === 'word_reading'
  const hardStopSec = maxRecSec(page)

  async function upload(rec: Recording) {
    setBusy(true); setErr('')
    const ok = await uploadRecording({
      sessionId, sessionToken, itemCode: page.code, attemptNo: attemptCount + 1, rec,
    })
    if (!ok) { setErr('저장에 문제가 생겼어요. 다시 시도해 주세요.'); onUploadFailed?.(rec); setBusy(false); return }
    setLowVolume(rec.peak < MIC_MIN_PEAK)
    setBusy(false)
    onSaved()
  }

  function handleComplete(rec: Recording) {
    setLastRec(rec)
    // 연습 페이지는 서버에 남기지 않는다 — 완료 표시만 하고 버린다.
    if (page.practice) { setLowVolume(rec.peak < MIC_MIN_PEAK); onSaved(); return }
    void upload(rec)
  }

  const recorder = useRecorder(hardStopSec, handleComplete)
  const recording = recorder.state === 'recording'
  // 제한 시간을 넘겨 여유 구간에 들어섰는지 — 채점은 limitSec까지만이므로 아동에게 종료를 알린다.
  const pastLimit = recording && recorder.elapsedMs / 1000 >= page.limitSec

  useEffect(() => {
    onRecordingChange?.(recording || counting)
    return () => onRecordingChange?.(false)
  }, [recording, counting, onRecordingChange])

  const startAfterCountdown = useCallback(async () => {
    setCounting(false)
    try { await recorder.start(); setMicErr(null) }
    catch (e) { setMicErr(classifyRecorderError(e)) }
  }, [recorder])

  function begin() { setErr(''); setMicErr(null); setCounting(true) }

  const saved = attemptCount > 0
  const savedMessage = lowVolume
    ? '목소리가 잘 안 담긴 것 같아요. 한 번 더 해 볼까요?'
    : page.practice ? '잘했어요! 이제 진짜로 해 볼게요.' : '녹음이 완료됐어요.'

  return (
    <>
      <div className="card p-5 lg:p-6">
        <p className="text-xs font-bold text-blue lg:text-sm">
          {page.practice ? '연습이에요. 아래 낱말을 소리 내어 읽어 주세요'
            : words ? '아래 낱말을 모두 소리 내어 읽어 주세요'
              : '아래 문장을 소리 내어 읽어 주세요'}
        </p>
        {/* 낱말 페이지는 검사지처럼 두 줄 격자(4+3)로 배치하고, 문장은 원문 그대로 보인다.
            제시어는 길게 눌러도 선택·iOS 콜아웃이 뜨지 않게 한다(아동 오터치 방지). */}
        <div className="flex min-h-[152px] items-center justify-center lg:min-h-[220px]">
          {words ? (
            <div className="grid w-full grid-cols-4 gap-x-2 gap-y-4 lg:gap-y-7">
              {page.items.map(i => (
                <span key={i.code}
                  className="no-select-callout font-read break-keep text-center text-[26px] font-medium leading-tight lg:text-[44px]">
                  {i.text}
                </span>
              ))}
            </div>
          ) : (
            <p className="no-select-callout font-read whitespace-pre-line break-keep text-center text-[22px] font-medium leading-relaxed lg:text-[26px]">
              {page.items[0].text}
            </p>
          )}
        </div>
      </div>

      {/* 항상 마운트된 단일 라이브 리전 — 조건부로 갈아끼우면 스크린리더 낭독이 보장되지 않는다 */}
      <p className="sr-only" aria-live="polite">
        {busy ? '녹음을 저장하고 있어요' : err ? err : saved && !recording ? savedMessage : ''}
      </p>

      <div className="mt-6 flex flex-col items-center gap-5">
        {counting ? (
          <div className="flex min-h-[116px] items-center"><Countdown onDone={startAfterCountdown} /></div>
        ) : (
          <RecordButton state={recorder.state} onStart={begin} onStop={recorder.stop}
            disabled={busy} maxSec={page.limitSec} elapsedMs={recorder.elapsedMs} />
        )}
        <p className="text-sm font-bold text-ink-soft">
          {counting ? '곧 시작해요'
            : recording ? '다 읽었으면 버튼을 눌러 주세요'
              : saved ? '다시 하려면 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
        </p>

        {/* 상태 표시는 버튼 아래 이 고정 높이 슬롯 한 곳에만 나타난다 — 상태가 바뀌어도 버튼이 밀리지 않도록 */}
        <div className="flex min-h-[92px] w-full flex-col items-center justify-start gap-2.5">
          {recording ? (
            <>
              <LevelMeter level={recorder.level} />
              <div className="flex items-center gap-2">
                <span className="blip-antpulse motion-reduce:animate-none inline-block h-2 w-2 rounded-full bg-rec" />
                {pastLimit
                  ? <span className="text-[13px] font-bold text-amber">여기까지예요! 버튼을 눌러 주세요</span>
                  : <span className="text-[13px] font-bold text-ink-soft">읽는 중이에요</span>}
              </div>
            </>
          ) : busy ? (
            <div className="flex items-center gap-2 rounded-[14px] border border-line bg-well px-4 py-3">
              <Spinner className="h-4 w-4 text-blue" />
              <p className="text-sm text-ink-soft">저장 중…</p>
            </div>
          ) : err ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-center text-sm font-bold text-rec-deep">{err}</p>
              {lastRec && <button onClick={() => upload(lastRec)} className="cta max-w-60">다시 시도</button>}
            </div>
          ) : micErr ? (
            <p className="text-center text-sm leading-relaxed text-ink-soft">
              {micErr === 'unsupported'
                ? '이 브라우저에서는 녹음을 지원하지 않아요. Safari나 Chrome 최신 버전에서 다시 시도해 주세요.'
                : micErr === 'denied'
                  ? micPermissionHint(typeof navigator !== 'undefined' ? navigator.userAgent : '')
                  : '마이크를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'}
            </p>
          ) : saved && lowVolume ? (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-amber/40 bg-amber/10 px-4 py-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-amber/20 text-amber">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 7v6" /><path d="M12 17h.01" />
                </svg>
              </span>
              <p className="text-sm font-bold text-amber">{savedMessage}</p>
            </div>
          ) : saved ? (
            <div className="flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12l5 5L20 6" />
                </svg>
              </span>
              <p className="text-sm text-ink-soft">{savedMessage}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 없음 (`RecordingItem.tsx`는 아직 남아 있어도 무방)

- [ ] **Step 3: 커밋**

```bash
git add components/survey/ReadingPage.tsx
git commit -m "feat(survey): 페이지 단위 읽기 화면 — 낱말 격자·카운트다운·연습 모드"
```

---

## Task 8: 현장 채점 페이지 (MarkPage)

**Files:**
- Create: `components/survey/MarkPage.tsx`

- [ ] **Step 1: 구현**

Create `components/survey/MarkPage.tsx`:

```tsx
// components/survey/MarkPage.tsx — 낱말 해독 의미 낱말의 검사자 현장 채점(O/X).
// 검사지의 중단 규칙("의미 낱말 첫 3개 연속 오반응 시 문장·쓰기 미실시")은 검사 도중 판정해야 하므로,
// 녹음 직후 검사자가 방금 들은 반응을 표시한다. 이 값은 관리자 채점의 초기값이 된다.
// 아동이 아니라 검사자가 보는 화면임을 색·문구로 분명히 한다(아동 화면과 톤을 다르게).
'use client'
import { readingCeilingHit } from '@/lib/survey-flow'
import type { SurveyItem } from '@/lib/items'

export function MarkPage({ items, marks, onToggle }: {
  items: SurveyItem[]
  /** itemCode → 정반응 여부(미채점은 키 없음) */
  marks: Record<string, boolean>
  onToggle: (code: string, correct: boolean) => void
}) {
  const ceiling = readingCeilingHit(marks)
  const done = items.filter(i => marks[i.code] !== undefined).length

  return (
    <div className="card mx-auto w-full max-w-2xl border-amber/40 bg-amber/[0.04] p-5 lg:p-7">
      <p className="text-xs font-bold text-amber lg:text-sm">검사자 확인</p>
      <h2 className="mt-1 text-[15px] font-bold lg:text-lg">방금 정확하게 읽은 낱말에 표시해 주세요</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">
        제한 시간(30초) 안에 읽은 것만 정반응으로 봅니다. 나중에 녹음을 들으며 고칠 수 있어요.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, idx) => (
          <li key={item.code} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
            <span className="w-5 flex-none text-xs font-bold text-ink-mute">{idx + 1}</span>
            <span className="font-read min-w-0 flex-1 truncate text-[20px] font-medium lg:text-2xl">{item.text}</span>
            <div className="flex flex-none gap-1.5">
              {([['O', true], ['X', false]] as const).map(([label, v]) => (
                <button key={label} type="button" aria-pressed={marks[item.code] === v}
                  aria-label={`${item.text} ${v ? '정반응' : '오반응'}`}
                  onClick={() => onToggle(item.code, v)}
                  className={`h-11 w-11 rounded-lg border-[1.5px] font-read text-lg font-bold transition ${
                    marks[item.code] === v
                      ? v ? 'border-mint bg-mint/10 text-mint' : 'border-rec bg-rec/10 text-rec-deep'
                      : 'border-line bg-well text-ink-mute'}`}>
                  {label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {ceiling && (
        // 검사지: 의미 낱말 첫 3개 연속 오반응 시 문장 읽기유창성·낱말 쓰기 과제를 실시하지 않는다.
        <p className="mt-4 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-[13px] font-bold leading-relaxed text-amber">
          의미 낱말 첫 3개가 모두 오반응이라, 검사지 기준에 따라 <b>문장 읽기유창성과 낱말 쓰기는 실시하지 않습니다.</b>
          무의미 낱말까지 진행한 뒤 마무리 단계로 넘어갑니다.
        </p>
      )}

      {done < items.length && (
        <p className="mt-3 text-center text-xs text-ink-mute">
          {items.length}개 중 {done}개 표시됨 — 모두 표시해야 다음으로 갈 수 있어요.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add components/survey/MarkPage.tsx
git commit -m "feat(survey): 낱말 해독 현장 채점 화면 + 중단 규칙 안내"
```

---

## Task 9: 낱말 쓰기 페이지 (WritingPage)

**Files:**
- Create: `components/survey/WritingPage.tsx`
- Delete: `components/survey/WritingItem.tsx` (Task 10에서 참조가 사라진 뒤 삭제)

- [ ] **Step 1: 구현**

Create `components/survey/WritingPage.tsx`:

```tsx
// components/survey/WritingPage.tsx — 낱말 쓰기 10문항을 한 페이지에서 체크한다.
// 검사자가 아동이 쓴 결과를 보고 낱말마다 예/아니오를 표시한다(의미 5 + 무의미 5).
// 검사지 중단 규칙 ②: 의미 낱말 첫 3개 연속 오반응 시 이후 문항을 실시하지 않는다 —
// 해당 시점부터 남은 문항의 입력을 잠그고 안내한다.
'use client'
import { KIND_LABEL, MEANING_WRITE_CODES, type SurveyItem } from '@/lib/items'
import { CEILING_N, writingCeilingHit } from '@/lib/survey-flow'

export function WritingPage({ items, value, onChange, onSetAll }: {
  items: SurveyItem[]
  /** itemCode → 예(true)/아니오(false)/미선택(undefined) */
  value: Record<string, boolean>
  onChange: (code: string, v: boolean) => void
  /** 전체 선택 — 문항 수가 10개라 하나씩 누르는 부담을 덜어 준다 */
  onSetAll: (v: boolean) => void
}) {
  const ceiling = writingCeilingHit(value)
  const meaningCount = MEANING_WRITE_CODES.length
  // 중단 시 "이미 표시한 의미 낱말 앞 3개"까지만 유효 — 그 뒤 문항은 잠근다.
  const lockedFrom = ceiling ? CEILING_N : items.length
  const answered = items.filter((i, idx) => idx < lockedFrom && value[i.code] !== undefined).length
  const required = Math.min(lockedFrom, items.length)

  return (
    <div className="card mx-auto w-full max-w-2xl p-5 lg:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-blue lg:text-base">학생이 아래 낱말을 정확하게 썼나요?</p>
        <div className="flex gap-1.5">
          {([['모두 예', true], ['모두 아니오', false]] as const).map(([label, v]) => (
            <button key={label} type="button" onClick={() => onSetAll(v)} disabled={ceiling}
              className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-40">
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {items.map((item, idx) => {
          const locked = idx >= lockedFrom
          // 의미/무의미가 바뀌는 지점에 구분선을 넣어 검사지와 같은 두 묶음으로 보이게 한다.
          const groupStart = idx === 0 || items[idx - 1].kind !== item.kind
          return (
            <li key={item.code} className={groupStart && idx > 0 ? 'mt-3 border-t border-line pt-3' : ''}>
              {groupStart && (
                <p className="mb-1.5 text-[11px] font-bold text-ink-mute">{KIND_LABEL[item.kind!]} 낱말</p>
              )}
              <div className={`flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 ${locked ? 'opacity-40' : ''}`}>
                <span className="w-5 flex-none text-xs font-bold text-ink-mute">{item.orderNo}</span>
                <span className="font-read min-w-0 flex-1 truncate text-[22px] font-bold lg:text-[28px]">{item.text}</span>
                <div className="flex flex-none gap-1.5">
                  {([['예', true], ['아니오', false]] as const).map(([label, v]) => (
                    <button key={label} type="button" disabled={locked}
                      aria-pressed={value[item.code] === v} aria-label={`${item.text} ${label}`}
                      onClick={() => onChange(item.code, v)}
                      className={`h-11 min-w-[58px] rounded-lg border-[1.5px] px-2 text-sm font-bold transition disabled:cursor-not-allowed ${
                        value[item.code] === v ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {ceiling && (
        <p className="mt-4 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-[13px] font-bold leading-relaxed text-amber">
          의미 낱말 {meaningCount}개 중 첫 3개가 모두 오반응이라, 검사지 기준에 따라 <b>낱말 쓰기를 여기서 중단합니다.</b>
          마무리 단계로 넘어가 주세요.
        </p>
      )}
      {!ceiling && answered < required && (
        <p className="mt-3 text-center text-xs text-ink-mute">
          {required}개 중 {answered}개 선택됨 — 모두 선택해야 다음으로 갈 수 있어요.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입 검사**

Run: `npx tsc --noEmit`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add components/survey/WritingPage.tsx
git commit -m "feat(survey): 낱말 쓰기 한 페이지 체크 + 전체 선택 + 중단 규칙"
```

---

## Task 10: 검사 진행 화면을 페이지 위저드로 전환

**Files:**
- Modify: `app/survey/page.tsx` (전면 교체)
- Delete: `components/survey/RecordingItem.tsx`, `components/survey/WritingItem.tsx`

- [ ] **Step 1: 구현**

`app/survey/page.tsx` 전체를 아래로 교체한다.

```tsx
// app/survey/page.tsx — 검사 진행 화면(페이지 위저드).
// 검사지대로 "한 페이지 = 한 과제 = 한 녹음" 단위로 진행한다. 페이지 종류별 UI는
// components/survey/*가 담당하고, 이 페이지는 진행 상태(현재 페이지·답 캐시)의 로드/저장과
// 페이지 간 이동만 제어한다. 진행 위치는 localStorage에 저장돼 새로고침·탭 닫힘 후에도 재개된다.
// 중단 규칙에 걸리면 visiblePages가 해당 페이지들을 빼므로, 이동 로직은 그 목록만 따라가면 된다.
'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Recording } from '@/hooks/useRecorder'
import { SECTION_FIRST_CODES, SECTION_LABEL, isRecordingPage, toggleChecklistArea } from '@/lib/items'
import { CEILING_N, visiblePages, writingCeilingHit } from '@/lib/survey-flow'
import { loadState, saveState, type SurveyState } from '@/lib/survey-state'
import { uploadRecording } from '@/lib/upload'
import { ProgressBar } from '@/components/ProgressBar'
import { ChecklistItem } from '@/components/survey/ChecklistItem'
import { MarkPage } from '@/components/survey/MarkPage'
import { MicCheck } from '@/components/survey/MicCheck'
import { ReadingPage } from '@/components/survey/ReadingPage'
import { RetryBanner } from '@/components/survey/RetryBanner'
import { SectionIntro } from '@/components/survey/SectionIntro'
import { WritingPage } from '@/components/survey/WritingPage'

function SurveyInner() {
  const router = useRouter()
  const params = useSearchParams()
  // 진행 상태의 단일 소스 — 현재 페이지(pageIdx)·단계(phase)도 여기에만 둔다.
  const [st, setSt] = useState<SurveyState | null>(null)
  const [busy, setBusy] = useState(false)
  // 페이지 이동 중 업로드가 실패한 녹음: 다른 페이지로 넘어가도 배너에서 재시도할 수 있다
  const [pendingRetries, setPendingRetries] = useState<Record<string, Recording>>({})
  const fromReview = params.get('from') === 'review'

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    // ?p=N 딥링크(검토 화면에서 페이지 클릭): 해당 페이지로 이동한 상태로 복원하고 즉시 저장한다.
    const p = Number(params.get('p'))
    const total = visiblePages(s).length
    const jumped = Number.isInteger(p) && p >= 1 && p <= total
      ? { ...s, pageIdx: p - 1, phase: 'page' as const }
      : s
    if (jumped !== s) {
      saveState(jumped)
      // p는 1회만 소비하고 URL에서 제거한다(from은 유지) — 이후 페이지를 이동한 뒤 새로고침해도
      // stale p가 저장된 위치를 덮어쓰지 않도록.
      const sp = new URLSearchParams(params.toString())
      sp.delete('p')
      router.replace(sp.toString() ? `/survey?${sp}` : '/survey', { scroll: false })
    }
    // 서버 프리렌더와 첫 페인트를 일치시키기 위해(하이드레이션 불일치 방지) localStorage는
    // 마운트 후 1회 읽어 복원한다 — 이 setState는 의도된 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(jumped)
  }, [router, params])

  // 녹음 중 새로고침·탭 닫기 실수 방지(해당 시도의 소리가 유실되므로 확인창을 띄운다)
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  // 검사 중 화면 자동 잠금 방지(교사 설명이 길어져도 화면이 꺼지지 않게). 미지원 브라우저는 무시하고,
  // 탭이 백그라운드로 갔다 오면 잠금이 해제되므로 visible 복귀 시 재획득한다.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      if (!('wakeLock' in navigator)) return
      try { sentinel = await navigator.wakeLock.request('screen') } catch { /* 배터리 절약 모드 등 — 무시 */ }
    }
    void acquire()
    const onVisible = () => { if (document.visibilityState === 'visible' && !cancelled) void acquire() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [])

  /** 상태 갱신 + localStorage 저장(항상 함께 — 저장 누락으로 재개 위치가 어긋나지 않도록) */
  const patch = useCallback((p: Partial<SurveyState> | ((prev: SurveyState) => Partial<SurveyState>)) => {
    setSt(prev => {
      const merged = { ...prev!, ...(typeof p === 'function' ? p(prev!) : p) }
      saveState(merged)
      return merged
    })
  }, [])

  const markSaved = useCallback((code: string) => {
    patch(prev => ({ recorded: { ...prev.recorded, [code]: (prev.recorded[code] ?? 0) + 1 } }))
    setPendingRetries(prev => {
      if (!(code in prev)) return prev
      const { [code]: _removed, ...rest } = prev
      return rest
    })
  }, [patch])

  if (!st) return null

  if (st.phase === 'mic')
    return <MicCheck onOk={() => patch({ micDone: true, phase: 'page' })} />

  // 중단 규칙을 반영한 진행 목록. marks가 바뀌면 목록이 줄어들 수 있으므로 인덱스를 clamp한다.
  const pages = visiblePages(st)
  const idx = Math.min(st.pageIdx, pages.length - 1)
  const page = pages[idx]
  const isLast = idx === pages.length - 1

  function goToIdx(n: number) { patch({ pageIdx: n }); window.scrollTo(0, 0) }

  function goNext() {
    // 검토에서 넘어온 경우(from=review) 순차 진행 대신 검토 화면으로 복귀한다.
    if (fromReview || isLast) { router.push('/review'); return }
    goToIdx(idx + 1)
  }

  async function retryUpload(code: string) {
    const rec = pendingRetries[code]
    if (!rec || !st) return
    const ok = await uploadRecording({ sessionId: st.sessionId, sessionToken: st.sessionToken,
      itemCode: code, attemptNo: (st.recorded[code] ?? 0) + 1, rec })
    if (ok) markSaved(code)
  }

  // 다음으로 넘어갈 수 있는 조건:
  //  - 현장 채점 페이지: 낱말 전부 표시
  //  - 낱말 쓰기: 전부 선택(단, 중단 규칙에 걸리면 앞 3개만)
  //  - 체크리스트: 최소 1개 선택
  //  - 녹음/카운트다운 중에는 항상 잠금
  const markDone = page.items.every(i => st.marks[i.code] !== undefined)
  // 중단 규칙 ②에 걸리면 앞 3개까지만 요구한다 — 판정식은 survey-flow 한 곳에만 둔다.
  const writingRequired = writingCeilingHit(st.writing) ? CEILING_N : page.items.length
  const writingDone = page.items.slice(0, writingRequired).every(i => st.writing[i.code] !== undefined)
  const canNext = !busy
    && (page.code !== 'p_rw_meaning_mark' || markDone)
    && (page.section !== 'word_writing' || writingDone)
    && (page.section !== 'checklist' || st.checklist.length > 0)

  // 녹음 페이지를 한 번도 녹음하지 않고 넘어가는 경우: 주 버튼을 "건너뛰기"로 바꿔
  // 오터치 한 번으로 페이지가 조용히 통과되지 않도록 의도를 드러낸다(진행 자체는 허용).
  const skipping = !fromReview && !isLast && isRecordingPage(page) && (st.recorded[page.code] ?? 0) === 0

  // 섹션(주제) 진입 안내: 각 섹션의 첫 페이지에 처음 도달하면 안내 화면을 먼저 보여준다.
  const showIntro = !fromReview && SECTION_FIRST_CODES.has(page.code) && !st.introsSeen.includes(page.section)

  return (
    // 고정 3분할 레이아웃: 헤더(상단 고정) · 콘텐츠(가운데 밴드) · 내비(하단 고정).
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-6 pb-6 pt-8 lg:max-w-4xl lg:pt-6">
      <header className="flex-none">
        {st.childName && (
          <p className="mb-2 text-xs font-bold text-ink-soft">
            <b className="text-blue">{st.childName}</b> 학생
          </p>
        )}
        <ProgressBar current={idx + 1} total={pages.length} />
        {fromReview && (
          <Link href="/review" className="mt-2 inline-block py-1 text-xs text-ink-mute underline">← 검토 화면으로 돌아가기</Link>
        )}
        {!showIntro && (
          <h1 className="mt-4 text-xs font-bold text-ink-mute">
            {SECTION_LABEL[page.section]}{page.practice && ' · 연습'}
          </h1>
        )}
      </header>

      {/* 가운데 밴드: 남는 높이를 모두 차지하고 내용을 세로 중앙 정렬. 내용이 밴드보다 크면
          이 구역 안에서만 스크롤(헤더·내비는 그대로). */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col justify-center py-4">
          {showIntro ? (
            <SectionIntro section={page.section} />
          ) : (
            <>
              {page.role === 'child' && isRecordingPage(page) && (
                <ReadingPage key={page.code} page={page} sessionId={st.sessionId} sessionToken={st.sessionToken}
                  attemptCount={st.recorded[page.code] ?? 0} onRecordingChange={setBusy}
                  onUploadFailed={rec => setPendingRetries(prev => ({ ...prev, [page.code]: rec }))}
                  onSaved={() => markSaved(page.code)} />
              )}

              <RetryBanner codes={Object.keys(pendingRetries)} onRetry={retryUpload} />

              {page.code === 'p_rw_meaning_mark' && (
                <MarkPage items={page.items} marks={st.marks}
                  onToggle={(code, correct) => patch(prev => ({ marks: { ...prev.marks, [code]: correct } }))} />
              )}

              {page.section === 'word_writing' && (
                <WritingPage items={page.items} value={st.writing}
                  onChange={(code, v) => patch(prev => ({ writing: { ...prev.writing, [code]: v } }))}
                  onSetAll={v => patch(prev => ({
                    writing: { ...prev.writing, ...Object.fromEntries(page.items.map(i => [i.code, v])) },
                  }))} />
              )}

              {page.section === 'checklist' && (
                <ChecklistItem selected={st.checklist}
                  onToggle={code => patch(prev => ({ checklist: toggleChecklistArea(prev.checklist, code) }))} />
              )}
            </>
          )}
        </div>
      </div>

      <nav className="flex flex-none gap-2.5 pt-4">
        <button onClick={() => goToIdx(idx - 1)} disabled={idx === 0 || busy}
          className="btn-ghost h-[52px] flex-1">
          이전
        </button>
        {showIntro ? (
          <button onClick={() => patch(prev => ({ introsSeen: [...prev.introsSeen, page.section] }))}
            className="btn-primary h-[52px] flex-[2]">
            시작하기
          </button>
        ) : (
          <button onClick={goNext} disabled={!canNext}
            className={`${skipping ? 'btn-ghost' : 'btn-primary'} h-[52px] flex-[2]`}>
            {fromReview ? '검토로 돌아가기' : isLast ? '검토' : skipping ? '건너뛰기' : '다음'}
          </button>
        )}
      </nav>
    </main>
  )
}

export default function SurveyPage() {
  return <Suspense fallback={null}><SurveyInner /></Suspense>
}
```

- [ ] **Step 2: `SECTION_FIRST_CODES`를 페이지 코드 기준으로 수정**

`lib/items.ts`의 99~102행을 아래로 교체한다(현재는 문항 코드 기준이라 페이지 코드와 맞지 않는다).
이 정의는 `PAGES` 뒤에 와야 하므로 **파일 맨 아래 `PAGES` 정의 뒤로 옮긴다.**

```ts
/** 각 섹션의 "첫 페이지" 코드 — 이 페이지에 진입할 때 섹션 안내를 한 번 보여준다.
 *  연습 페이지가 있는 섹션은 연습이 첫 페이지가 된다(안내 → 연습 → 본 검사 순서). */
export const SECTION_FIRST_CODES = new Set(
  SECTION_ORDER.map(sec => PAGES.find(p => p.section === sec)!.code),
)
```

- [ ] **Step 3: 대체된 컴포넌트 삭제**

```bash
rm components/survey/RecordingItem.tsx components/survey/WritingItem.tsx
```

- [ ] **Step 4: 타입·린트 검사**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음. `RecordingItem`/`WritingItem`을 참조하는 곳이 남아 있으면 여기서 잡힌다.

- [ ] **Step 5: 커밋**

```bash
git add -A app/survey/page.tsx lib/items.ts components/survey
git commit -m "feat(survey): 문항 위저드를 페이지 위저드로 전환 (중단 규칙·연습 반영)"
```

---

## Task 11: 검토 화면을 페이지 기준으로

**Files:**
- Modify: `app/review/page.tsx:14`, `:41-82`, `:84-94`, `:108-129`

- [ ] **Step 1: 구현**

`app/review/page.tsx` 14행의 import를 교체한다.

```ts
import { SECTION_LABEL, isRecordingPage, areaLabel, type Section } from '@/lib/items'
import { visiblePages } from '@/lib/survey-flow'
```

41~45행(미완료 판정)을 교체한다.

```ts
  // 미완료 판정: 녹음 페이지는 저장된 시도 0회, 낱말쓰기는 예/아니오 미선택.
  // (체크리스트는 진행 화면에서 최소 1개 선택을 강제하므로 여기서는 세지 않는다)
  // 연습 페이지는 서버에 남기지 않으므로 완료 판정에서 제외한다.
  const pages = visiblePages(state)
  const missingPages = pages.filter(p => isRecordingPage(p) && !p.practice && !(state.recorded[p.code] > 0)).length
  const missingWriting = pages
    .filter(p => p.section === 'word_writing')
    .flatMap(p => p.items)
    .filter(i => state.writing[i.code] === undefined).length
  const missing = missingPages + missingWriting
```

47~82행의 `renderSection`을 교체한다.

```ts
  /** 섹션 하나를 카드로 렌더 — 얇은 구분선 행 + 작은 상태 배지의 차분한 목록. */
  function renderSection(section: Section) {
    const rows = pages.filter(p => p.section === section)
    if (rows.length === 0) return null   // 중단 규칙으로 미실시된 섹션
    return (
      <section className="card p-4 lg:p-5">
        <h2 className="text-[13px] font-bold text-ink-soft">{SECTION_LABEL[section]}</h2>
        <ul className="mt-1 flex flex-col">
          {rows.map(p => {
            const no = pages.indexOf(p) + 1
            let pill: React.ReactNode
            if (p.practice) {
              pill = <span className="text-right text-xs text-ink-mute">연습 (채점 안 함)</span>
            } else if (isRecordingPage(p)) {
              const done = (state.recorded[p.code] ?? 0) > 0
              pill = <StatusPill done={done} label={done ? '녹음 완료' : '미녹음'} />
            } else if (p.code === 'p_rw_meaning_mark') {
              const done = p.items.every(i => state.marks[i.code] !== undefined)
              pill = <StatusPill done={done} label={done ? '표시 완료' : '표시 안 함'} />
            } else if (p.section === 'word_writing') {
              const done = p.items.filter(i => state.writing[i.code] !== undefined).length
              pill = <StatusPill done={done === p.items.length} label={`${done} / ${p.items.length}`} />
            } else {
              pill = (
                <span className="text-right text-xs text-ink-soft">
                  {state.checklist.length > 0 ? state.checklist.map(areaLabel).join(', ') : '선택 없음'}
                </span>
              )
            }
            // ?p=<순번>&from=review — 진행 화면이 해당 페이지로 열리고 "검토로 돌아가기" 링크를 보여준다
            const label = p.section === 'checklist' ? '검사자 체크리스트'
              : p.code === 'p_rw_meaning_mark' ? '검사자 확인 (의미 낱말 채점)'
                : p.items.map(i => i.text).join(' · ')
            return (
              <li key={p.code} className="flex items-center justify-between gap-3 border-t border-line/60 py-2.5 first:border-t-0">
                <Link href={`/survey?p=${no}&from=review`} className="flex min-w-0 items-center gap-2.5">
                  <span className="w-6 flex-none text-sm font-bold text-blue">{no}</span>
                  <span className="font-read truncate text-sm">{label}</span>
                </Link>
                {pill}
              </li>
            )
          })}
        </ul>
      </section>
    )
  }
```

84~94행의 `submit`에서 marks를 함께 보낸다.

```ts
  async function submit() {
    if (!st) return
    setBusy(true); setErr('')
    const r = await postJson('/api/sessions/submit', {
      sessionId: st.sessionId, sessionToken: st.sessionToken,
      writing: st.writing, checklist: st.checklist, marks: st.marks,
    }, '제출에 문제가 생겼어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    clearState()
    router.push('/done')
  }
```

123행의 "이전" 버튼 링크를 페이지 기준으로 교체한다.

```tsx
        <button onClick={() => router.push(`/survey?p=${pages.length}`)} className="btn-ghost h-[52px] flex-1">
```

102~106행의 안내 문구에서 "문항"을 "단계"로 바꾼다.

```tsx
      <h1 className="mt-6 text-xl font-bold">단계별 완료 여부를 확인해 주세요</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        단계 번호를 누르면 해당 화면으로 이동해요.
        {missing > 0 && <> 아직 <b className="text-rec-deep">{missing}개</b>가 완료되지 않았어요.</>}
      </p>
```

- [ ] **Step 2: 타입·린트 검사**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add app/review/page.tsx
git commit -m "feat(review): 검토 화면을 페이지 단위로 전환 (중단된 섹션은 숨김)"
```

---

## Task 12: 관리자 화면이 페이지 단위 녹음을 읽도록

> 3단계(채점·결과지 재설계)는 별도 계획이다. 여기서는 **관리자 화면이 깨지지 않고 새 녹음을 재생할 수 있게** 하는 최소 변경만 한다.

**Files:**
- Modify: `components/admin/RecordingsTable.tsx:5`, `:39-72`
- Modify: `components/admin/AdminDetailView.tsx:9`, `:81-82`, `:122`, `:177-179`
- Modify: `hooks/useAdminQueries.ts` (상세 응답 타입에 `marks` 추가)

- [ ] **Step 1: `RecordingsTable`을 페이지 기준으로**

5행의 import를 교체한다.

```ts
import { KIND_LABEL, RECORDING_PAGES } from '@/lib/items'
```

39~72행의 `RECORDING_ITEMS.flatMap(item => ...)`를 아래로 교체한다.

```tsx
          {RECORDING_PAGES.flatMap((page, pageIdx) => {
            const label = page.section === 'word_reading'
              ? `낱말 (${KIND_LABEL[page.kind!]})` : '문장'
            const text = page.items.map(i => i.text).join('  ')
            const views = byItem.get(page.code) ?? []
            if (views.length === 0) return [(
              <tr key={page.code} className="border-t border-line/60 bg-rec/5">
                <td className="px-5 py-3 text-ink-mute">{pageIdx + 1}</td>
                <td className="px-3 text-xs text-ink-mute">{label}</td>
                <td className="px-3 font-read whitespace-pre-line break-keep">{text}</td>
                <td className="px-3">—</td>
                <td className="px-3 text-ink-mute">—</td>
                <td className="px-3 pr-5"><Badge tone="rec">미녹음</Badge></td>
              </tr>
            )]
            return views.map((v, i) => {
              // 여유 시간(GRACE_SEC)까지는 정상 — 채점 기준(limitSec) 초과만 표시한다.
              const over = v.duration_sec != null && v.duration_sec > page.limitSec
              return (
                // 같은 페이지의 2번째 시도부터는 번호·구분·제시어를 비워 시각적으로 묶는다
                <tr key={`${page.code}-${v.attempt_no}`} className={i === 0 ? 'border-t border-line/60' : ''}>
                  <td className="px-5 py-3 text-ink-mute">{i === 0 ? pageIdx + 1 : ''}</td>
                  <td className="px-3 text-xs text-ink-mute">{i === 0 ? label : ''}</td>
                  <td className="px-3 font-read whitespace-pre-line break-keep">{i === 0 ? text : ''}</td>
                  <td className="px-3 text-ink-mute">{views.length > 1 ? `#${v.attempt_no}` : ''}</td>
                  <td className={`px-3 font-read text-[12px] tabular-nums ${over ? 'font-bold text-amber' : 'text-ink-soft'}`}
                    title={over ? `채점 기준(${page.limitSec}초) 초과분 포함` : undefined}>
                    {fmtDuration(v.duration_sec)}{over && ' !'}
                  </td>
                  <td className="px-3 py-2 pr-5">
                    <AudioPlayer src={v.url} onError={onAudioError} />
                  </td>
                </tr>
              )
            })
          })}
```

주석(1~2행)도 갱신한다.

```tsx
// components/admin/RecordingsTable.tsx — 결과지의 녹음 표(페이지 단위).
// 페이지마다 모든 시도(재녹음 포함)를 순서대로 보여주고, 시도별 서명 URL 오디오를 재생한다.
```

- [ ] **Step 2: `AdminDetailView`의 진행 집계를 페이지 기준으로**

9행의 import를 교체한다.

```ts
import { ITEM_TOTALS, KIND_LABEL, RECORDING_PAGES, SECTION_LABEL, WRITING_ITEMS, areaLabel } from '@/lib/items'
```

81~82행을 교체한다.

```ts
  const recordedCount = RECORDING_PAGES.filter(p => byItem.has(p.code)).length
  const missingCount = (RECORDING_PAGES.length - recordedCount) + (WRITING_ITEMS.length - writing.length)
```

122행을 교체한다.

```tsx
                <span className="kpi">녹음 <b>{recordedCount} / {RECORDING_PAGES.length}</b></span>
```

177~179행의 안내 문구를 교체한다.

```tsx
          <p className="border-t border-line bg-well px-5 py-3 text-[11.5px] text-ink-mute">
            채점 기준(검사지): 낱말 해독은 30초, 문장 읽기유창성은 40초 내 정확 반응 수.
            녹음은 마지막 반응이 잘리지 않도록 5초 더 담기므로, 기준 시간 이후 반응은 채점하지 않습니다.
            모든 시도(재녹음 포함)가 순서대로 저장됩니다.
          </p>
```

- [ ] **Step 3: 상세 응답에 `marks` 싣기**

`app/api/admin/sessions/[id]/route.ts`의 `GET` 본문(17~25행)을 아래로 교체한다.
(`sessionDetail`이 반환하는 `marks`를 응답에 포함시키지 않으면 3단계 채점 화면이 현장 채점을 초기값으로 쓸 수 없다.)

```ts
  try {
    const { session, recordings, writing, marks } = await sessionDetail(id)
    const withUrls = await Promise.all(recordings.map(async r => ({
      item_code: r.item_code,
      attempt_no: r.attempt_no,
      url: await signedAudioUrl(r.audio_path),
      duration_sec: r.duration_sec,
    })))
    return NextResponse.json({ session, recordings: withUrls, writing, marks })
  } catch (e) {
```

`hooks/useAdminQueries.ts`의 6행 import와 `SessionDetailData`(22~26행)를 교체한다.

```ts
import type { MarkRow, SessionListRow, SessionRow, WritingRow } from '@/lib/db'
```

```ts
export interface SessionDetailData {
  session: SessionRow
  recordings: DetailRecording[]
  writing: WritingRow[]
  /** 낱말 해독 의미 낱말의 검사자 현장 채점 — 3단계 채점 화면의 초기값이 된다 */
  marks: MarkRow[]
}
```

`components/admin/AdminDetailView.tsx`의 `낱말 쓰기` 표를 닫는 `</div>` 뒤(168행)에 아래를 넣는다.
(본격적인 채점 화면은 3단계다 — 여기서는 현장 채점이 저장됐음만 확인할 수 있게 한다.)

```tsx
          {data.marks.length > 0 && (
            <p className="border-t border-line px-5 py-3 text-[11.5px] text-ink-mute">
              검사 현장에서 표시한 의미 낱말 채점: {data.marks.filter(m => m.correct).length} / {data.marks.length} 정반응
              {' '}— 녹음을 들으며 확정하는 채점 화면은 3단계에서 추가됩니다.
            </p>
          )}
```

- [ ] **Step 4: 타입·린트·전체 테스트**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 모두 통과

- [ ] **Step 5: 커밋**

```bash
git add components/admin hooks/useAdminQueries.ts app/api/admin
git commit -m "feat(admin): 결과지 녹음 표를 페이지 단위로 (3단계 채점 화면 전 최소 대응)"
```

---

## Task 13: 브라우저 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 자동 검사**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: 타입 오류 0, 린트 오류 0, 테스트 전부 통과

- [ ] **Step 2: 개발 서버 기동**

`.claude/launch.json`의 `dev` 설정으로 미리보기를 연다(Bash로 서버를 직접 띄우지 말 것).

- [ ] **Step 3: 정상 흐름 확인**

`/`에서 아래를 확인한다.

1. 아동 정보를 채우고 보호자 동의 체크 → [시작하기]
2. 마이크 확인 통과 → [검사 시작]
3. **낱말 읽기 안내 → 연습 페이지** — 낱말 3개가 보이고, 버튼을 누르면 **3·2·1·시작!** 후 녹음
4. 연습 완료 후 [다음] → **의미 낱말 7개가 두 줄(4+3)로** 보임, 30초 제한
5. 30초 경과 시 "여기까지예요!" 안내, 35초에 자동 종료
6. [다음] → **검사자 확인 페이지**에서 7개 O/X (전부 표시해야 [다음] 활성)
7. 무의미 낱말 7개 → 문장 4페이지 → 낱말 쓰기 한 페이지(10개 + 모두 예/모두 아니오)
8. 체크리스트 → [검토] → 제출

각 단계에서 `read_console_messages`로 콘솔 에러가 없는지 확인한다.

- [ ] **Step 4: 중단 규칙 ① 확인**

새 검사를 시작해 **의미 낱말 현장 채점에서 첫 3개를 모두 X**로 표시한다.

- 화면에 "문장 읽기유창성과 낱말 쓰기는 실시하지 않습니다" 안내가 뜨는지
- [다음] → **무의미 낱말 페이지**로 가고, 그 다음이 **체크리스트**인지 (문장 4페이지·쓰기 페이지가 건너뛰어짐)
- 진행률 표시가 줄어든 총 개수(5)를 기준으로 나오는지

- [ ] **Step 5: 중단 규칙 ② 확인**

정상 흐름으로 낱말 쓰기 페이지까지 가서 **ww01~ww03을 모두 '아니오'**로 선택한다.

- "낱말 쓰기를 여기서 중단합니다" 안내가 뜨는지
- 나머지 7개 문항이 잠기는지(흐릿해지고 클릭 불가)
- [다음]이 활성화되어 체크리스트로 넘어가는지

- [ ] **Step 6: 새로고침 재개 확인**

문장 페이지 중간에서 새로고침 → 같은 페이지에서 재개되는지, 현장 채점(O/X)이 유지되는지 확인한다.

- [ ] **Step 7: 관리자 결과지 확인**

`/admin`으로 로그인해 방금 만든 세션을 연다.

- 녹음 표에 **6개 페이지**(또는 중단 시 그보다 적은 수)가 나오고 제시어가 페이지 전체 낱말로 보이는지
- 각 녹음이 재생되는지
- 녹음/낱말쓰기 진행 집계가 새 분모(6 / 10)로 나오는지

- [ ] **Step 8: 반응형 확인**

`resize_window`로 mobile(375) / tablet(768) / desktop(1280)에서 낱말 격자가 깨지지 않는지 확인하고, desktop 스크린샷을 남긴다.

- [ ] **Step 9: 커밋**

검증 중 수정이 있었다면 커밋한다. 없었다면 이 단계는 건너뛴다.

```bash
git add -A
git commit -m "fix(survey): 브라우저 검증에서 발견한 문제 수정"
```

---

## 완료 후 담당자에게 회신할 내용

1. **연습 낱말** — 현재 임시(`나무·구름·바다`). 실제 연습용 낱말을 받으면 `lib/items.ts`의 `PRACTICE_WORDS`만 교체하고 `PRACTICE_PLACEHOLDER`를 false로 바꾼다. **교체 전에는 실제 아동 대상 시범검사 금지.**
2. **낱말 쓰기 화면에 낱말 10개가 그대로 보인다** — 아동이 화면을 보고 베껴 쓸 수 있는 배치인지 확인 필요 (위 "실행 전 확인해야 할 결정 사항" 참고).
3. **가정 A1** — 낱말 쓰기 중단 후에도 검사자 체크리스트는 진행하도록 만들었다. 맞는지 확인.
4. **가정 A2** — 연습은 낱말 해독 앞 1개만 넣었다. 문장 읽기에도 필요한지 확인.
5. **여유 시간 5초** — 낱말 35초 / 문장 45초까지 녹음되고, 채점은 30초 / 40초까지만. 여유 폭을 바꾸려면 `GRACE_SEC` 한 값만 고치면 된다.

## 후속 계획

- `docs/superpowers/plans/YYYY-MM-DD-survey-session-controls.md` — 2단계: 일시정지·저장 버튼, "자동 저장됨" 표시, 이메일·전화 분리, 반 드롭다운
- `docs/superpowers/plans/YYYY-MM-DD-admin-scoring-report.md` — 3단계: 채점 입력, Pass/Fail 판정(임시 기준), 검사지 양식 결과지 인쇄, 검사자 구분
