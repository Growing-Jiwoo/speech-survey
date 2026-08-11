# 중단 규칙 재정의 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 담당자 확정안대로 중단 규칙 ①(의미 낱말 3연속 오반응 → 무의미·문장 미실시, 쓰기로 진입)·②(쓰기 1번 오반응 → 즉시 중단)를 검사 화면·채점·관리자 화면·PDF에 반영한다.

**Architecture:** 판정 함수(`readingCeilingHit`·`writingCeilingHit`)는 이미 있고 소비처 네 곳(visiblePages·requiredWritingCodes·complete·expectedTotals)의 조건만 새 규칙으로 바꾼다. 통합 함수·새 컬럼을 만들지 않는다 — 규칙 ②의 분모는 저장된 쓰기 답에서 파생한다.

**Tech Stack:** Next.js(App Router) · TypeScript · Vitest · pdf-lib · Supabase

**스펙:** `docs/superpowers/specs/2026-08-11-discontinue-rules-design.md` — 이 계획과 어긋나면 스펙이 옳다.

**검증 명령(전 태스크 공통):** `cd /Users/kimjiwoo/dev/kids-speech-survey` 후
```bash
npx tsc --noEmit && npm run lint && TZ=UTC npx vitest run
```
빌드는 마지막 태스크에서 한 번. 커밋 후 `next-env.d.ts`가 바뀌어 있으면 `git checkout next-env.d.ts`.

---

### Task 1: `lib/survey-flow.ts` — 규칙 교체

**Files:**
- Modify: `lib/survey-flow.ts`
- Test: `tests/survey-flow.test.ts`

- [ ] **Step 1: 실패하는 테스트로 갱신**

`tests/survey-flow.test.ts`에서 아래 블록들을 교체한다.

`describe('writingCeilingHit …')` 전체 교체 (65~81행):

```ts
describe('writingCeilingHit — 1번 문항 하나로 판정 (담당자 확정)', () => {
  it('G1: 1번 낱말(ww01)만 0점이면 중단 — 2·3번은 보지 않는다', () => {
    expect(writingCeilingHit(g1, { ww01: 0 })).toBe(true)
    expect(writingCeilingHit(g1, { ww01: 1 })).toBe(false)
    expect(writingCeilingHit(g1, { ww01: 1, ww02: 0, ww03: 0 })).toBe(false)
    expect(writingCeilingHit(g1, {})).toBe(false)
  })
  it('G2: 첫 문장 하나만 0점이면 중단', () => {
    expect(writingCeilingHit(g2, { sw01: 0 })).toBe(true)
    // 두 어절 중 하나라도 맞혔으면 오반응이 아니다(1점은 오반응 아님 — 담당자 확정) → 계속
    expect(writingCeilingHit(g2, { sw01: 1 })).toBe(false)
    expect(writingCeilingHit(g2, { sw01: 2 })).toBe(false)
    expect(writingCeilingHit(g2, {})).toBe(false)
  })
  it('둘째 문항이 0점이어도 중단이 아니다 ("첫 문항" 규칙)', () => {
    expect(writingCeilingHit(g2, { sw01: 2, sw02: 0 })).toBe(false)
    expect(writingCeilingHit(g1, { ww01: 1, ww02: 0 })).toBe(false)
  })
})
```

`describe('visiblePages …')`의 중단 케이스 교체 (91~100행):

```ts
  it('낱말 해독 중단 시 무의미 낱말·문장을 빼고 쓰기로 간다 (담당자 확정 — 검사지 문구와 다름)', () => {
    const hit = { rw01: false, rw02: false, rw03: false }
    expect(codes(hit)).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_meaning_mark', 'p_ww', 'p_cl',
    ])
    expect(codes(hit, g2)).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_meaning_mark', 'p_sw', 'p_cl',
    ])
  })
```

`describe('requiredWritingCodes …')`의 G1 중단 케이스 교체 (114~120행):

```ts
  it('중단 걸리면 ww01만 요구 — items 배열을 뒤섞거나 걸러도 결과는 동일 (코드 기반, 위치 기반 아님)', () => {
    const writing = { ww01: 0 }
    expect(requiredWritingCodes(g1, page.items, writing)).toEqual(new Set(['ww01']))
    const reorderedSubset = [...page.items].reverse().slice(0, 4)
    expect(requiredWritingCodes(g1, reorderedSubset, writing)).toEqual(new Set(['ww01']))
  })
```

`describe('requiredWritingCodes로 구현하는 …')`의 세 it 내부 기대값 교체 (136~150행):

```ts
  it('빈 상태에서 "모두 아니오": 중단이 걸려 1번만 요구 — 나머지 9개는 기록되지 않아야 함', () => {
    const tentative = Object.fromEntries(page.items.map(i => [i.code, 0]))
    expect(requiredWritingCodes(g1, page.items, tentative)).toEqual(new Set(['ww01']))
  })

  it('빈 상태에서 "모두 예": 중단이 걸리지 않아 10개 전체를 요구', () => {
    const tentative = Object.fromEntries(page.items.map(i => [i.code, 1]))
    expect(requiredWritingCodes(g1, page.items, tentative)).toEqual(new Set(page.items.map(i => i.code)))
  })

  it('ww01이 이미 오반응인 상태에서 일괄 "모두 아니오": 1번만 요구', () => {
    const tentative = { ww01: 0, ...Object.fromEntries(page.items.map(i => [i.code, 0])) }
    expect(requiredWritingCodes(g1, page.items, tentative)).toEqual(new Set(['ww01']))
  })
```

`describe('canAdvance …')`의 낱말 쓰기 중단 케이스 교체 (182~186행):

```ts
  it('낱말 쓰기 페이지: 중단 규칙에 걸리면 1번만 선택해도 진행 가능', () => {
    const page = g1.pageByCode.get('p_ww')!
    expect(canAdvance(g1, page, { ...empty, writing: { ww01: 0 } })).toBe(true)
  })
```

194~199행(순서 뒤집기 케이스)의 writing을 `{ ww01: 0 }`으로:

```ts
  it('낱말 쓰기 페이지: items 나열 순서가 바뀌어도 중단 규칙은 문항 코드(ww01) 기준으로 판정된다', () => {
    const page = g1.pageByCode.get('p_ww')!
    const reorderedPage = { ...page, items: [...page.items].reverse() }
    expect(canAdvance(g1, reorderedPage, { ...empty, writing: { ww01: 0 } })).toBe(true)
  })
```

- [ ] **Step 2: 실패 확인**

Run: `TZ=UTC npx vitest run tests/survey-flow.test.ts`
Expected: FAIL — `writingCeilingHit(g1, { ww01: 0 })`이 false, visiblePages에 `p_ww`/`p_sw` 없음 등

- [ ] **Step 3: 구현**

`lib/survey-flow.ts` 파일 머리 주석(1~9행) 교체:

```ts
// lib/survey-flow.ts — 검사 진행 흐름 규칙(중단 규칙 포함). 순수 함수만 둔다.
// 근거: 담당자 확정(2026-08-11, docs/superpowers/specs/2026-08-11-discontinue-rules-design.md).
// ⚠️ 검사지 인쇄 문구와 다르다 — 검사지가 실제 시행 절차와 다를 때는 담당자 회신이 우선한다(스펙 참고).
//  ① 낱말 해독 의미 낱말 첫 3개 연속 오반응 → 무의미 낱말·문장 읽기유창성을 실시하지 않고
//     쓰기 과제로 넘어간다. (검사지 문구는 "문장 읽기유창성과 낱말 쓰기 미실시" — 폐기됨)
//  ② 쓰기 과제 1번 문항 오반응 → 즉시 중단. 양식 무관하게 첫 문항 하나로 판정한다.
//     (검사지 G1 문구는 "의미 낱말 첫 3개" — 폐기됨)
// ※ 검사자 체크리스트는 어느 중단에서도 진행한다(아동 과제가 아니라 검사자 관찰 기록).
// ※ ①과 ②는 서로 다른 방식으로 구현된다: ①은 visiblePages()가 페이지 자체를 제거하고,
//   ②는 쓰기 화면이 직접 남은 문항을 잠그는 방식이다(requiredWritingCodes 참고).
```

`isWritingWrong` 주석(29~37행)의 마지막 두 문장 교체 — 함수 본문은 그대로:

```ts
/**
 * 쓰기 과제의 "오반응" — **한 어절도 맞히지 못한 것(0점)**.
 * 담당자 확정(2026-08-11): 문항 배점이 0·1·2인 문장 쓰기에서 1점은 오반응이 아니다.
 */
```

`writingCeilingRule` 함수(41~47행) **삭제**하고 `writingCeilingHit`·`requiredWritingCodes` 교체:

```ts
/** 쓰기 과제 중단 여부 (규칙 ②) — 양식 무관하게 1번 문항 하나로 판정한다(담당자 확정).
 *  ⚠️ visiblePages에는 반영하지 않는다 — 이 규칙은 페이지를 빼는 대신 쓰기 화면이
 *  직접 남은 문항을 잠그는 방식으로 구현된다(requiredWritingCodes). 잘못 연결하지 말 것. */
export function writingCeilingHit(f: FormItems, writing: Partial<Record<string, number>>): boolean {
  return hitsCeiling(f.writingItems.map(i => isWritingWrong(writing[i.code])), 1)
}

/**
 * 쓰기 과제에서 실제로 응답이 요구되는 문항 코드 집합.
 * 중단 규칙 ②에 걸리면 판정에 쓰인 1번 문항만 요구하고, 그렇지 않으면 페이지의 모든 문항을 요구한다.
 * 쓰기 화면의 잠금·다음 버튼 활성화(canAdvance)·검토 화면의 완료 집계가 모두 이 함수 하나로
 * "요구되는 문항"을 판정해, 배열 위치가 아닌 문항 코드로 안전하게 동작한다.
 */
export function requiredWritingCodes(
  f: FormItems, items: SurveyItem[], writing: Partial<Record<string, number>>,
): Set<string> {
  if (!writingCeilingHit(f, writing)) return new Set(items.map(i => i.code))
  return new Set([f.writingItems[0].code])
}
```

`visiblePages`(77~83행) 교체:

```ts
/** 진행 상태에서 실제로 실시할 페이지 목록. 중단 규칙 ①에 걸리면 무의미 낱말·문장 페이지가 빠진다. */
export function visiblePages(f: FormItems, s: Pick<FlowState, 'marks'>) {
  if (!readingCeilingHit(f, s.marks)) return f.pages
  // 무의미 낱말은 섹션이 의미 낱말과 같아(word_reading) 섹션 필터로는 걸러지지 않는다 —
  // kind로 가른다(연습·의미·현장채점 페이지는 모두 kind가 'meaning'이다).
  return f.pages.filter(p =>
    (p.section === 'word_reading' && p.kind !== 'nonsense')
    || p.section === f.writingSection || p.section === 'checklist')
}
```

- [ ] **Step 4: 통과 확인**

Run: `TZ=UTC npx vitest run tests/survey-flow.test.ts`
Expected: PASS

이 시점에 다른 테스트 파일이 깨질 수 있다(scoring·items·adminStats — 이후 태스크에서 갱신). `npx tsc --noEmit`은 통과해야 한다.

- [ ] **Step 5: Commit**

```bash
git add lib/survey-flow.ts tests/survey-flow.test.ts
git commit -m "feat(flow): 중단 규칙을 담당자 확정안으로 교체

① 의미 낱말 3연속 오반응 시 무의미 낱말·문장을 빼고 쓰기로 진입한다.
② 쓰기 중단은 양식 무관하게 1번 문항 하나로 판정한다 — G1의 '의미 낱말
첫 3개' 분기(writingCeilingRule)가 사라진다.

검사지 인쇄 문구와 다르다. 검사지가 실제 시행 절차와 다를 때는 담당자
회신이 우선한다(스펙 2026-08-11-discontinue-rules-design.md)."
```

---

### Task 2: `lib/items.ts` — `discontinuedTotals` 제거

**Files:**
- Modify: `lib/items.ts:139-141` (인터페이스), `lib/items.ts:261-264` (build)
- Test: `tests/items.test.ts:206-213`

- [ ] **Step 1: 테스트에서 discontinuedTotals 기대 제거**

`tests/items.test.ts` 207~213행을 교체:

```ts
  it('진행률 분모는 페이지 기준 — 쓰기 문항 수가 양식마다 다르다', () => {
    expect(g1.totals).toEqual({ rec: 6, write: 10 })
    expect(g2.totals).toEqual({ rec: 6, write: 5 })
    // 중단 규칙이 적용된 세션의 분모는 정적값이 아니라 adminStats.expectedTotalsFor가 계산한다
  })
```

- [ ] **Step 2: 구현 — 필드 삭제**

`lib/items.ts`에서:
- `FormItems` 인터페이스의 139~141행(`discontinuedTotals` 필드와 그 주석) 삭제
- `build()` 반환 객체의 261~264행(`discontinuedTotals: { ... }`) 삭제

- [ ] **Step 3: 확인**

Run: `TZ=UTC npx vitest run tests/items.test.ts && npx tsc --noEmit`
Expected: items.test PASS. **tsc는 `lib/adminStats.ts:42`에서 FAIL** — `discontinuedTotals` 참조가 남아 있다. Task 3에서 풀리므로 여기서는 커밋하지 않고 Task 3과 함께 간다.

---

### Task 3: `lib/db.ts` + `lib/adminStats.ts` — 분모를 파생 계산으로

**Files:**
- Modify: `lib/db.ts:265-269` (SessionListRow), `lib/db.ts` listSessions select
- Modify: `lib/adminStats.ts:37-43`
- Modify: `components/admin/AdminDetailView.tsx:96-127`
- Test: `tests/adminStats.test.ts`

- [ ] **Step 1: 실패하는 테스트로 갱신**

`tests/adminStats.test.ts`의 `describe('중단 규칙이 적용된 세션의 진행률 …')` 블록 전체(291~328행)를 교체:

```ts
describe('중단 규칙이 적용된 세션의 진행률 (규칙대로 끝난 검사를 미완료로 세지 않기 위함)', () => {
  // 규칙 ① 세션: 무의미 낱말도 실시하지 않으므로 녹음 분모가 1(의미 낱말)이다.
  // 쓰기는 실시한다 — 쓰기가 비면 미완료가 맞다.
  it('① 세션은 의미 낱말 녹음 1건 + 쓰기 전체로 완료다', () => {
    const s = mkSession({
      discontinued_at: '2026-08-10T01:00:00.000Z',
      recordings: [{ item_code: 'p_rw_meaning' }],
      writing_answers: G1_WRITE.map(item_code => ({ item_code, can_write: false })),
    })
    expect(sessionProgress(s).incomplete).toBe(false)
  })

  it('① 세션이라도 쓰기가 비면 미완료다 (쓰기는 실시하는 과제다)', () => {
    const s = mkSession({
      discontinued_at: '2026-08-10T01:00:00.000Z',
      recordings: [{ item_code: 'p_rw_meaning' }],
      writing_answers: [],
    })
    expect(sessionProgress(s).incomplete).toBe(true)
  })

  it('① 세션에서 쓰기 1번이 0점이면(규칙 ②) 쓰기 분모도 1이다', () => {
    const s = mkSession({
      discontinued_at: '2026-08-10T01:00:00.000Z',
      recordings: [{ item_code: 'p_rw_meaning' }],
      writing_answers: [{ item_code: 'ww01', can_write: false }],
    })
    expect(sessionProgress(s).incomplete).toBe(false)
  })

  it('중단되지 않은 같은 데이터는 미완료다', () => {
    const s = mkSession({
      discontinued_at: null,
      recordings: [{ item_code: 'p_rw_meaning' }],
      writing_answers: [{ item_code: 'ww01', can_write: true }],
    })
    expect(sessionProgress(s).incomplete).toBe(true)
  })

  it('expectedTotals: 중단 여부·학년·쓰기 답으로 분모가 갈린다', () => {
    expect(expectedTotals(mkSession({ grade: 1 }))).toEqual({ rec: 6, write: 10 })
    expect(expectedTotals(mkSession({ grade: 2 }))).toEqual({ rec: 6, write: 5 })
    const disc = '2026-08-10T01:00:00.000Z'
    expect(expectedTotals(mkSession({ discontinued_at: disc, grade: 1 })))
      .toEqual({ rec: 1, write: 10 })
    expect(expectedTotals(mkSession({ discontinued_at: disc, grade: 2 })))
      .toEqual({ rec: 1, write: 5 })
    // 규칙 ② — 1번 문항 0점이 저장돼 있으면 쓰기 분모가 1로 준다
    expect(expectedTotals(mkSession({
      grade: 2, sentence_scores: [{ item_code: 'sw01', words: 0 }],
    }))).toEqual({ rec: 6, write: 1 })
    expect(expectedTotals(mkSession({
      grade: 1, writing_answers: [{ item_code: 'ww01', can_write: false }],
    }))).toEqual({ rec: 6, write: 1 })
    // 1점은 오반응이 아니다 — 분모 전체 유지
    expect(expectedTotals(mkSession({
      grade: 2, sentence_scores: [{ item_code: 'sw01', words: 1 }],
    }))).toEqual({ rec: 6, write: 5 })
  })
})
```

같은 파일의 나머지 픽스처에 값 필드를 붙인다(타입이 강제한다 — tsc가 남김없이 잡아 준다):
- 36행 `writing_answers: [{ item_code: 'ww01' }]` → `[{ item_code: 'ww01', can_write: true }]`
- 46행 `G1_WRITE.map(item_code => ({ item_code }))` → `G1_WRITE.map(item_code => ({ item_code, can_write: true }))`
- 55행 부근 `sentence_scores: [...]`의 각 원소에 `words: 0` 추가
- 84행 `['sw01',…].map(item_code => ({ item_code }))` → `.map(item_code => ({ item_code, words: 2 }))`
- 190행 `[{ item_code: 'ww01' }, { item_code: 'ww02' }]` → 각각 `can_write: true` 추가

- [ ] **Step 2: 실패 확인**

Run: `TZ=UTC npx vitest run tests/adminStats.test.ts`
Expected: FAIL (tsc 수준 — can_write/words가 타입에 없음, expectedTotals 시그니처 불일치)

- [ ] **Step 3: 구현**

`lib/db.ts` — `SessionListRow`(265~269행)에 값 필드 추가:

```ts
export type SessionListRow = SessionRow & {
  recordings: { item_code: string }[]
  /** 진행률 분모 파생(규칙 ②)에 값이 필요해 can_write까지 싣는다 */
  writing_answers: { item_code: string; can_write: boolean }[]
  /** 문장 읽기유창성(rs..)과 문장 쓰기(sw..)가 섞여 있다 — 진행률은 쓰기 코드만 센다 */
  sentence_scores: { item_code: string; words: number }[]
}
```

`listSessions()`의 select 문자열 교체:

```ts
    .select(`${SESSION_COLS}, recordings(item_code), writing_answers(item_code, can_write), sentence_scores(item_code, words)`)
```

`lib/adminStats.ts` — import에 `scoreInputFrom`·`writingCeilingHit`·`FormItems` 추가하고 `expectedTotals`(37~43행) 교체:

```ts
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'
import { scoreInputFrom } from '@/lib/scoring'
import { writingCeilingHit } from '@/lib/survey-flow'
import type { FormItems, Totals } from '@/lib/items'
import type { SessionListRow } from '@/lib/db'
```

(※ `Totals`는 기존에 `from '@/lib/items'`로 이미 온다 — import 정리만 맞추면 된다)

```ts
/** 이 세션에서 "전부"에 해당하는 분모. 중단 규칙이 실시 범위를 줄인다:
 *  · 규칙 ①(discontinued_at) — 무의미 낱말·문장을 실시하지 않아 녹음 분모가 1(의미 낱말)
 *  · 규칙 ② — 쓰기 1번 문항 오반응이면 쓰기 분모가 1
 *  ②는 컬럼이 아니라 저장된 쓰기 답에서 파생한다. 관리자가 1번을 0→1로 고치면 분모가
 *  전체로 돌아와 "미완료"가 되는데, 그 아동은 중단되지 말았어야 했으므로 그것이 정확하다
 *  (컬럼으로 박으면 잘못 중단된 검사가 영원히 "정상 완료"로 남는다 — 스펙 참고). */
export function expectedTotalsFor(
  f: FormItems, discontinued: boolean, writing: Partial<Record<string, number>>,
): Totals {
  return {
    rec: (discontinued ? f.recordingPages.filter(p => p.kind === 'meaning') : f.recordingPages).length,
    write: writingCeilingHit(f, writing) ? 1 : f.writingItems.length,
  }
}

export function expectedTotals(
  s: Pick<SessionListRow, 'discontinued_at' | 'grade' | 'writing_answers' | 'sentence_scores'>,
): Totals {
  const f = itemsFor(formForGrade(s.grade))
  // 쓰기 답이 두 테이블에 나뉘어 있는 사실은 scoreInputFrom만 안다 — 목록 행도 같은 경로로 읽는다.
  const { writing } = scoreInputFrom(f, { marks: [], sentences: s.sentence_scores, writing: s.writing_answers })
  return expectedTotalsFor(f, !!s.discontinued_at, writing)
}
```

`components/admin/AdminDetailView.tsx` — import의 `expectedTotals`를 `expectedTotalsFor`로 바꾸고 99행과 KPI 줄(124~127행) 교체:

```ts
  const expected = expectedTotalsFor(f, !!s.discontinued_at, input.writing)
```

```tsx
          <span className="kpi">녹음 <b>{recordedCount} / {expected.rec}</b></span>
          <span className="kpi">{SECTION_LABEL[f.writingSection]} <b>{writtenCount} / {expected.write}</b></span>
```

- [ ] **Step 4: 통과 확인**

Run: `TZ=UTC npx vitest run tests/adminStats.test.ts tests/items.test.ts && npx tsc --noEmit`
Expected: PASS (tsc 전체 통과 — Task 2의 잔여 참조가 여기서 다 풀린다)

- [ ] **Step 5: Commit (Task 2 변경 포함)**

```bash
git add lib/items.ts lib/db.ts lib/adminStats.ts components/admin/AdminDetailView.tsx tests/items.test.ts tests/adminStats.test.ts
git commit -m "feat(admin): 진행률 분모를 중단 규칙 조합으로 파생 계산

discontinuedTotals 정적 필드를 없애고 expectedTotalsFor(f, 중단, 쓰기답)로
바꾼다. 규칙이 둘이라 분모 조합이 넷인데(①: rec 1 / ②: write 1), ②는
컬럼 없이 저장된 쓰기 답에서 파생한다 — 관리자가 1번 점수를 고치면 분모가
전체로 돌아와 미완료가 되는 것이 정확하기 때문이다(스펙 참고).

목록 질의가 writing_answers.can_write·sentence_scores.words까지 싣는다.
상세 화면 KPI 분모도 고정값(6/10)에서 expected로 — ① 세션이 '녹음 1/6'로
영영 미완료로 보이던 것을 잡는다."
```

---

### Task 4: `lib/scoring.ts` — `discontinued` + `complete.wordReading`

**Files:**
- Modify: `lib/scoring.ts:76-95` (ScoreResult), `lib/scoring.ts:146-173` (scoreSession)
- Test: `tests/scoring.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/scoring.test.ts` 끝에 추가:

```ts
describe('중단 규칙과 채점 (discontinued — 판정을 Pass/Fail이 아니라 중단으로)', () => {
  const MEANING = g1.meaningReadCodes
  const ceilingMarks = Object.fromEntries(MEANING.map((c, i) => [c, i >= 3]))  // 첫 3개 X, 나머지 O

  it('① 세션: 의미 7문항만 채점되면 낱말 해독은 완료다 (무의미는 미실시)', () => {
    const r = score({ marks: ceilingMarks })
    expect(r.complete.wordReading).toBe(true)
    expect(r.wordReading).toBe(4)          // 의미 4문항 정반응, 무의미 기여 0
  })

  it('① 세션: discontinued가 낱말 해독·문장 읽기유창성에 선다', () => {
    const r = score({ marks: ceilingMarks })
    expect(r.discontinued).toEqual({ wordReading: true, sentenceReading: true, writing: false })
  })

  it('중단 아닌 세션: 의미만 채점됐으면 여전히 미완료다 (기존 동작 보존)', () => {
    const okMarks = Object.fromEntries(MEANING.map(c => [c, true]))
    const r = score({ marks: okMarks })
    expect(r.complete.wordReading).toBe(false)
    expect(r.discontinued.wordReading).toBe(false)
  })

  it('② 세션: 쓰기 1번 0점이면 discontinued.writing — 1번만으로 완료다', () => {
    const r = score({ writing: { ww01: 0 } })
    expect(r.discontinued.writing).toBe(true)
    expect(r.complete.writing).toBe(true)
    const r2 = score({ writing: { sw01: 0 } }, G2)
    expect(r2.discontinued.writing).toBe(true)
    expect(r2.complete.writing).toBe(true)
  })

  it('중단이 없으면 discontinued는 전부 false — Pass/Fail 경로가 그대로다', () => {
    expect(score({}).discontinued)
      .toEqual({ wordReading: false, sentenceReading: false, writing: false })
  })
})
```

※ 기존 테스트 중 `complete.writing` 관련(192·197행 부근)이 규칙 ② 변경(n=3→1)으로 깨질 수 있다 — 깨지면 해당 케이스의 writing 입력을 새 규칙에 맞게 갱신한다(예: `{ ww01: 0, ww02: 0, ww03: 0 }`로 완료를 만들던 곳은 `{ ww01: 0 }`로).

- [ ] **Step 2: 실패 확인**

Run: `TZ=UTC npx vitest run tests/scoring.test.ts`
Expected: FAIL — `discontinued` 프로퍼티 없음

- [ ] **Step 3: 구현**

`lib/scoring.ts` import 갱신:

```ts
import { readingCeilingHit, requiredWritingCodes, writingCeilingHit } from './survey-flow'
```

`ScoreResult`에 필드 추가(complete 아래):

```ts
  /**
   * 과제별 중단 여부. true면 **Pass/Fail을 내지 않는다** — passMark는 전체 실시를 전제한
   * 기준이라(낱말 해독 9/14), 의미 7문항만 실시한 세션에 들이대면 근거가 성립하지 않는다.
   * 중단은 척도 위의 값이 아니라 그 자체가 결론이다. 화면은 `중단` 배지를 내고
   * PDF는 소계·총점 칸을 비운다(스펙 "검사지 PDF" 절).
   */
  discontinued: Record<TaskKey, boolean>
```

`scoreSession` — 판정 두 개를 계산해 `complete.wordReading` 조건과 반환에 반영:

```ts
export function scoreSession(form: SurveyForm, s: ScoreInput): ScoreResult {
  const f = itemsFor(form)
  const { passMark } = scoringFor(form)
  const total = (codes: string[]) => codes.reduce((n, c) => n + clampWords(f, c, s.writing[c]), 0)
  // 중단 규칙 ①·② — 어느 문항까지가 "실시된 전부"인지를 정한다
  const discReading = readingCeilingHit(f, s.marks)
  const discWriting = writingCeilingHit(f, s.writing)

  const wordMeaning = countTrue(f.meaningReadCodes, s.marks)
  const wordNonsense = countTrue(f.nonsenseReadCodes, s.marks)
  const wordReading = wordMeaning + wordNonsense
  const sentenceReading = f.sentenceItems.reduce((n, i) => n + clampWords(f, i.code, s.sentences[i.code]), 0)
  const writeMeaning = total(f.meaningWriteCodes)
  const writeNonsense = total(f.nonsenseWriteCodes)
  const writing = total(f.writingItems.map(i => i.code))
  const at = (v: number, key: TaskKey): Verdict => (v >= passMark[key] ? 'pass' : 'fail')
  return {
    wordMeaning, wordNonsense, wordReading, sentenceReading, writeMeaning, writeNonsense, writing,
    verdict: {
      wordReading: at(wordReading, 'wordReading'),
      sentenceReading: at(sentenceReading, 'sentenceReading'),
      writing: at(writing, 'writing'),
    },
    complete: {
      // ①이 걸리면 무의미는 실시하지 않으므로 의미 7문항이 "실시된 전부"다.
      wordReading: allAnswered(discReading ? f.meaningReadCodes : f.readItems.map(i => i.code), s.marks),
      sentenceReading: allAnswered(f.sentenceItems.map(i => i.code), s.sentences),
      // 쓰기는 중단 규칙 ②에 걸리면 1번만 요구된다 — 요구 문항이 다 채워졌으면 완료다.
      writing: allAnswered(requiredWritingCodes(f, f.writingItems, s.writing), s.writing),
    },
    discontinued: {
      wordReading: discReading,
      sentenceReading: discReading,
      writing: discWriting,
    },
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `TZ=UTC npx vitest run tests/scoring.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/scoring.ts tests/scoring.test.ts
git commit -m "feat(scoring): 중단 과제에 Pass/Fail 대신 discontinued 판정

① 세션의 낱말 해독은 의미 7문항으로 완료다 — 판정을 감추면 중단 세션의
결과지가 빈 문서가 되는데, 정작 중단의 근거가 그 낱말 해독이다.

단 Pass/Fail은 내지 않는다. passMark 9는 /14 기준이라 의미 7문항만 실시한
세션에 들이대면 근거가 성립하지 않는다(7점짜리 과제에 9점을 요구한 셈).
중단은 척도 위의 값이 아니라 그 자체가 결론이다."
```

---

### Task 5: `lib/pdf/stamp-sheet.ts` — 중단 이후는 점수를 적지 않는다

**Files:**
- Modify: `lib/pdf/stamp-sheet.ts:66-83`, `lib/pdf/stamp-sheet.ts:110-122`
- Test: `tests/stamp-sheet.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

`tests/stamp-sheet.test.ts` 끝에 추가 (파일 상단의 기존 헬퍼 활용 — `describe.each` 블록의 `base` 입력 생성 방식을 그대로 따른다. 실제 파일의 헬퍼 이름이 다르면 그 이름을 쓸 것):

```ts
describe('stampSheet — 중단 규칙: 중단 이후는 점수를 적지 않는다 (담당자 확정)', () => {
  const G1 = FORMS.find(f => f.id === 'KODYS-G1')!
  const f1 = itemsFor(G1)
  const session = {
    school_name: '가나초', grade: 1, class_no: 1, child_name: '테스트',
    birth_ymd: '2019-01-01', started_at: '2026-08-11T00:00:00Z',
    examiner_type: 'teacher' as const, checklist: ['none'],
  }
  // ① 성립: 의미 첫 3개 X, 나머지 4개 O — 무의미는 미채점(미실시)
  const ceilingMarks = Object.fromEntries(f1.meaningReadCodes.map((c, i) => [c, i >= 3]))

  it('① 세션: 낱말 해독 소계가 찍힌 출력과 안 찍힌 출력이 달라야 한다', async () => {
    // 같은 marks로 "중단 아님" 상황을 만들 수 없으므로(중단은 marks에서 파생),
    // 소계가 찍히는 완주 세션과 크기를 비교해 "덜 그려졌음"을 확인한다.
    const fullMarks = Object.fromEntries(f1.readItems.map(i => [i.code, true]))
    const discontinued = await stampSheet({ form: G1, session, marks: ceilingMarks, sentences: {}, writing: {} })
    const complete = await stampSheet({ form: G1, session, marks: fullMarks, sentences: {}, writing: {} })
    // 중단본은 의미 7개 O/X만, 완주본은 14개 O/X + 소계 3칸 — 반드시 더 작다
    expect(discontinued.byteLength).toBeLessThan(complete.byteLength)
  })

  it('② 세션(G1): 쓰기 1번 X만 찍히고 쓰기 소계는 비는데, 문서 자체는 만들어진다', async () => {
    const out = await stampSheet({ form: G1, session, marks: {}, sentences: {}, writing: { ww01: 0 } })
    expect(out.byteLength).toBeGreaterThan(0)
  })
})
```

(바이트 비교는 간접 증거다 — 좌표 렌더 검증은 기존 테스트 관례를 따른 것이고, 직접 확인은 마지막 태스크의 PDF 육안 확인이 담당한다.)

- [ ] **Step 2: 실패 확인**

Run: `TZ=UTC npx vitest run tests/stamp-sheet.test.ts`
Expected: 첫 케이스 FAIL — 현재는 ① 세션도 `complete.wordReading=true`(Task 4 반영 후)라 소계 3칸이 찍혀 크기 차가 뒤집히거나 근소하다. (Task 4 이전이면 이 테스트를 실행할 수 없으니 태스크 순서를 지킬 것.)

- [ ] **Step 3: 구현**

`stamp-sheet.ts` 66~74행의 조건과 주석 교체:

```ts
  // 채점이 끝나지 않았거나 **중단으로 실시하지 않은** 과제는 소계·총점 칸을 비운다.
  // 없는 데이터를 0으로 세어 찍으면 "실시하지 않았다"가 "0점을 받았다"로 둔갑한다.
  // 중단 이후에는 아무 점수도 적지 않는다(담당자 확정) — 빈칸이 곧 표기다.
  // 종이 검사지에서도 채점하지 않은 칸은 비워 두므로, 빈칸이 곧 올바른 표기다.
  if (r.complete.wordReading && !r.discontinued.wordReading) {
    put(L.readScores.meaning, r.wordMeaning)
    put(L.readScores.nonsense, r.wordNonsense)
    put(L.readScores.total, r.wordReading)
  }
```

81행 문장 총점 조건 교체:

```ts
  if (r.complete.sentenceReading && !r.discontinued.sentenceReading) put(L.sentenceTotal, r.sentenceReading)
```

`stampWriting` 내부의 두 소계 조건(110행·122행) 교체:

```ts
    if (r.complete.writing && !r.discontinued.writing) {
```
```ts
  if (r.complete.writing && !r.discontinued.writing) put(layout.total, r.writing)
```

문항별 표시(`stampGrid`·`circleChoice`·문장 점수)는 손대지 않는다 — 값이 `undefined`면 이미 건너뛰고, 실시하지 않은 문항은 값 자체가 없다. 쓰기 1번의 X/동그라미는 실시된 기록이므로 계속 찍힌다(스펙 표).

- [ ] **Step 4: 통과 확인**

Run: `TZ=UTC npx vitest run tests/stamp-sheet.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pdf/stamp-sheet.ts tests/stamp-sheet.test.ts
git commit -m "feat(pdf): 중단 이후에는 점수를 적지 않는다 (담당자 확정)

complete.wordReading이 ① 세션에서 true가 되므로(의미 7문항 완료) 그대로
두면 '무의미 0 / 7 · 총 1 / 14'가 찍힌다 — 실시하지 않은 과제의 0점이
공식 문서에 남는다. 소계 조건을 complete && !discontinued로 좁힌다.

중단 이전의 기록(의미 낱말 O/X, 쓰기 1번)은 계속 찍힌다. 별도 안내
문구는 넣지 않는다 — 빈칸이 곧 표기다."
```

---

### Task 6: 검사 화면 — 중단 모달 2개

**Files:**
- Modify: `app/survey/page.tsx`
- Modify: `components/survey/MarkPage.tsx` (배너 문구 — **지금 두 군데 틀렸다**)
- Modify: `components/survey/WritingPage.tsx` (배너 문구)
- Test: 없음(컴포넌트 테스트 부재 — 이 저장소 관례). 검증은 tsc/lint + Task 9 브라우저 확인.

> ⚠️ **Task 1 리뷰에서 추가된 파일:** `MarkPage.tsx`는 계획 초안에 없었다. Task 1이 규칙을
> 바꾸면서 이 배너가 **사실과 다른 내용을 검사자에게 보여주는 상태**가 됐다 — 배포 전에
> 반드시 고쳐야 한다.

- [ ] **Step 1: 모달 문구 상수와 상태 추가**

`app/survey/page.tsx` import에 추가:

```ts
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { canAdvance, readingCeilingHit, requiredWritingCodes, visiblePages, writingCeilingHit } from '@/lib/survey-flow'
```

컴포넌트 밖(파일 상단, `function SurveyInner` 위)에 상수:

```ts
// 중단 안내 모달 문구 — 담당자가 "문구는 나중에 수정"이라 했으므로 여기 한 곳에 모아 둔다.
// ⚠️ 아동이 보는 화면에 뜬다 — 문구 확정 시 아동 노출을 전제로 재검토할 것(스펙 참고).
// ①의 담당자 제안 원문("낱말 쓰기 과제를 실시하지 않습니다")은 쓸 수 없다 —
// 같은 회신에서 쓰기를 실시하는 쪽으로 바뀌어, 원문 그대로면 화면이 거짓을 말한다.
const CEILING_COPY = {
  reading: {
    title: '낱말 해독을 중단합니다',
    body: '의미 낱말 첫 3개 연속 오반응하여 낱말 해독과 문장 읽기유창성 과제를 중단합니다. 쓰기 과제로 넘어갑니다.',
    confirm: '쓰기 과제로 이동',
    cancel: '다시 채점',
  },
  word_writing: {
    title: '검사를 중단합니다',
    body: '1번 낱말이 오반응하여 검사를 중단합니다. 검사자 체크리스트로 넘어갑니다.',
    confirm: '체크리스트로 이동',
    cancel: '다시 입력',
  },
  sentence_writing: {
    title: '검사를 중단합니다',
    body: '첫 문장이 오반응하여 검사를 중단합니다. 검사자 체크리스트로 넘어갑니다.',
    confirm: '체크리스트로 이동',
    cancel: '다시 입력',
  },
} as const
```

`SurveyInner` 안, 기존 state 옆에:

```ts
  // 중단 안내 모달. ②(쓰기)는 입력 즉시 뜨므로 취소(다시 입력) 후 같은 화면에서
  // 다시 뜨지 않도록 한 번만 띄운다 — 페이지를 이동하면 초기화된다(goToIdx).
  const [ceilingModal, setCeilingModal] = useState<keyof typeof CEILING_COPY | null>(null)
  const [writingModalSeen, setWritingModalSeen] = useState(false)
```

- [ ] **Step 2: 발화 지점 연결**

`goToIdx`에 초기화 한 줄:

```ts
  function goToIdx(n: number) { patch({ pageIdx: n }); setWritingModalSeen(false); window.scrollTo(0, 0) }
```

`goNext` 위에 `tryNext` 추가하고, 하단 내비의 `<button onClick={goNext} …>`를 `onClick={tryNext}`로 교체:

```ts
  // 규칙 ①: 의미 낱말 채점 페이지에서 중단이 성립한 채 [다음] — 이동 전에 안내한다.
  // 입력 즉시(3개째 X)에 띄우지 않는 이유: 의미 7문항은 전부 채점한다(아동은 이미 다
  // 읽었고 채점은 사후 표시다 — 스펙 "확정 규칙 ①").
  function tryNext() {
    if (page.code === 'p_rw_meaning_mark' && readingCeilingHit(f, st.marks)) {
      setCeilingModal('reading'); return
    }
    goNext()
  }
```

쓰기 입력 핸들러 — 기존 `WritingPage`/`SentenceWritingPage`의 `onChange` 인라인 함수를 공용 함수로 교체:

```ts
  // 규칙 ②: 이 입력으로 중단이 성립하면 즉시 안내한다(1번 하나로 판정이 끝나 더 받을
  // 입력이 없다). 취소하면 화면에 머물러 점수를 고칠 수 있다 — ConfirmDialog의 취소가
  // 오입력 복구 경로다.
  function changeWriting(code: string, v: number) {
    patch(prev => ({ writing: { ...prev.writing, [code]: v } }))
    if (!writingModalSeen && writingCeilingHit(f, { ...st.writing, [code]: v })) {
      setWritingModalSeen(true)
      setCeilingModal(f.writingSection)
    }
  }
```

JSX에서 두 컴포넌트의 `onChange`를 교체:

```tsx
              {page.section === 'word_writing' && (
                <WritingPage form={f} items={page.items} value={st.writing}
                  onChange={changeWriting}
                  onSetAll={v => {
                    patch(prev => {
                      const tentative = { ...prev.writing, ...Object.fromEntries(page.items.map(i => [i.code, v])) }
                      const required = requiredWritingCodes(f, page.items, tentative)
                      const applied = Object.fromEntries(
                        page.items.filter(i => required.has(i.code)).map(i => [i.code, v]),
                      )
                      return { writing: { ...prev.writing, ...applied } }
                    })
                    // "모두 아니오" 첫 클릭이 곧 중단을 유발한다 — 1번에 v가 들어간 상태로 판정
                    if (!writingModalSeen && writingCeilingHit(f, { ...st.writing, [f.writingItems[0].code]: v })) {
                      setWritingModalSeen(true)
                      setCeilingModal(f.writingSection)
                    }
                  }} />
              )}

              {page.section === 'sentence_writing' && (
                <SentenceWritingPage form={f} items={page.items} value={st.writing}
                  onChange={changeWriting} />
              )}
```

모달 렌더 — `</main>` 닫기 직전(일시정지 오버레이 위)에:

```tsx
      {ceilingModal && (
        <ConfirmDialog open title={CEILING_COPY[ceilingModal].title}
          confirmLabel={CEILING_COPY[ceilingModal].confirm}
          cancelLabel={CEILING_COPY[ceilingModal].cancel}
          onConfirm={() => { setCeilingModal(null); goNext() }}
          onClose={() => setCeilingModal(null)}>
          <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
            {CEILING_COPY[ceilingModal].body}
          </p>
        </ConfirmDialog>
      )}
```

※ ① 확인 → `goNext()` — `visiblePages`가 이미 무의미·문장을 뺐으므로 다음 페이지가 쓰기다. 별도 이동 로직 없음. 직후 쓰기 섹션의 `SectionIntro`가 뜨는 것은 의도된 연쇄다(스펙). ② 확인 → 다음 페이지가 체크리스트다.

- [ ] **Step 3a: `MarkPage` 배너 문구 갱신 — 지금 두 군데 틀렸다**

`components/survey/MarkPage.tsx`의 배너(현재 51~58행)는 Task 1 이후 **사실과 다르다**:

> "…문장 읽기유창성과 **낱말 쓰기는 실시하지 않습니다.** **무의미 낱말까지 진행한 뒤** 마무리 단계로 넘어갑니다."

쓰기는 이제 **실시**하고, 무의미 낱말은 **실시하지 않는다** — 둘 다 뒤집혔다. 교체:

```tsx
      {ceiling && (
        // 담당자 확정(2026-08-11): 무의미 낱말·문장 읽기유창성을 실시하지 않고 쓰기로 넘어간다.
        // (검사지 인쇄 문구는 "문장 읽기유창성과 낱말 쓰기 미실시" — 폐기됐다. 스펙 참고)
        <p className="mt-4 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-[13px] font-bold leading-relaxed text-amber">
          의미 낱말 첫 {CEILING_N}개가 모두 오반응이라, 중단 규칙에 따라{' '}
          <b>무의미 낱말과 문장 읽기유창성은 실시하지 않습니다.</b>
          {' '}남은 의미 낱말을 마저 표시한 뒤 {SECTION_LABEL[form.writingSection]} 과제로 넘어갑니다.
        </p>
      )}
```

"남은 의미 낱말을 마저 표시한 뒤"가 중요하다 — 검사자는 3개째 X 이후에도 4~7번을 계속 채점해야 하는데(낱말 해독 판정을 의미 7문항으로 낸다), 배너만 보면 바로 넘어가야 하는 줄 안다.

`SECTION_LABEL`·`CEILING_N` import가 이미 있는지 확인하고 없으면 추가한다.

- [ ] **Step 3b: `WritingPage` 배너 문구 갱신 (G1)**

`components/survey/WritingPage.tsx`:
- import에서 `CEILING_N` 제거: `import { requiredWritingCodes, writingCeilingHit } from '@/lib/survey-flow'`
- `const meaningCount = form.meaningWriteCodes.length` 줄 삭제
- 파일 머리 주석의 "의미 낱말 첫 3개 연속 오반응 시" 문장을 "1번 문항 오반응 시(담당자 확정)"로 교체
- 배너 교체:

```tsx
      {ceiling && (
        <p className="mt-4 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-[13px] font-bold leading-relaxed text-amber">
          1번 낱말이 오반응이라, 중단 규칙에 따라 <b>낱말 쓰기를 여기서 중단합니다.</b>
          마무리 단계로 넘어가 주세요.
        </p>
      )}
```

(`SentenceWritingPage`의 배너는 "첫 문장이 오반응(0점)이라…"로 이미 새 규칙과 일치 — 변경 없음.)

- [ ] **Step 4: 확인**

Run: `npx tsc --noEmit && npm run lint && TZ=UTC npx vitest run`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add app/survey/page.tsx components/survey/MarkPage.tsx components/survey/WritingPage.tsx
git commit -m "feat(survey): 중단 안내 모달 — ①은 [다음]에서, ②는 입력 즉시

① 채점 화면에서 [다음]에 거는 이유: 의미 7문항은 전부 채점한다(아동은
이미 다 읽었고 채점은 사후 표시다). 3개째 X에서 띄우면 4~7번 채점을 막는다.
② 1번 오반응 입력 즉시: 1번 하나로 판정이 끝나 더 받을 입력이 없다.

확인은 goNext() 하나다 — visiblePages가 이미 다음 페이지를 정해 놓았다.
취소(다시 채점/다시 입력)가 오입력 복구 경로가 된다. 문구는 담당자가
나중에 수정한다고 해 CEILING_COPY 한 곳에 모았다.

MarkPage·WritingPage의 인라인 배너도 규칙 변경분을 반영한다 — 각각
'쓰기 미실시'(이제 실시함)와 '첫 3개'(이제 1번 하나)로 어긋나 있었다."
```

---

### Task 7: 관리자 결과지 — 미실시 표기·입력 잠금·`중단` 배지

**Files:**
- Modify: `components/admin/sheet/Subtotal.tsx`
- Modify: `components/admin/sheet/ScoreBand.tsx`
- Modify: `components/admin/sheet/PageAudio.tsx`
- Modify: `components/admin/sheet/WordScoreRows.tsx`
- Modify: `components/admin/sheet/SentenceRows.tsx`
- Modify: `components/admin/ResultSheet.tsx`
- Test: 없음(표시 계층 — 저장소 관례). tsc/lint + Task 9 브라우저 확인.

`WritingChips`·`SentenceWriteRows`는 **변경하지 않는다** — 미응답을 이미 회색 `—`로 그려 X/0점과 구분되고(스펙 표 6번 "확인 후 필요 시 분기"의 확인 결과), 과제 상태는 바로 아래 Subtotal의 `중단` 배지가 말한다.

- [ ] **Step 1: `Subtotal` — 미실시 셀과 `중단` 배지**

`components/admin/sheet/Subtotal.tsx` 전체 교체:

```tsx
// components/admin/sheet/Subtotal.tsx — 검사지의 소계 행.
// 종이 검사지와 같이 연한 배경 띠 위에 '의미 __/7 · 무의미 __/7 · 총 __/14'를 둔다.
// 채점 결과가 잘 안 보인다는 피드백에 따라 숫자를 본문보다 크게, 총점은 색으로 강조한다.
import { Badge } from '@/components/Badge'
import type { Verdict } from '@/lib/scoring'

interface Cell {
  label: string; value: number; max: number
  /** 중단 규칙으로 실시하지 않은 부분 — 숫자 대신 '미실시'. 0점으로 보이면 안 된다 */
  na?: boolean
}

export function Subtotal({ cells, total, verdict, complete = true, discontinued = false }: {
  /** 의미/무의미 같은 부분 점수. 없으면(문장) 총점만 표시한다 */
  cells?: Cell[]
  total: Cell
  verdict?: Verdict
  /** 채점이 끝났는지. false면 숫자를 확정값으로 보이지 않게 하고 판정을 감춘다. */
  complete?: boolean
  /** 중단 규칙이 걸린 과제 — Pass/Fail 대신 '중단'. passMark는 전체 실시 전제라
   *  부분 실시 점수에 들이대면 판정 근거가 성립하지 않는다(스펙 참고). */
  discontinued?: boolean
}) {
  // amber는 경고 전용 — 소계 띠는 중립 배경으로(색이 신호 구실을 하게)
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 border-y border-line bg-well px-4 py-2.5">
      {/* 채점 전에는 부분 점수도 확정값처럼 보이면 안 된다. 총점만 비워 두면 옆의
          '무의미 점수 0 / 7'이 "0점을 받았다"로 읽히는데, 실제로는 아직 채점하지 않은 것이다
          — 이 화면이 가장 경계하는 오독이다. 숫자를 흐리고 '현재'를 붙여 진행 중임을 밝힌다. */}
      {cells?.map(c => c.na ? (
        <span key={c.label} className="text-[13px] text-ink-mute">
          {c.label} <b className="text-[14px]">미실시</b>
        </span>
      ) : (
        <span key={c.label} className={`text-[13px] ${complete ? 'text-ink-soft' : 'text-ink-mute'}`}>
          {!complete && '현재 '}{c.label}{' '}
          <b className={`text-[16px] tabular-nums ${complete ? 'text-ink' : 'text-ink-mute'}`}>{c.value}</b>
          <span className="text-ink-mute"> / {c.max}</span>
        </span>
      ))}
      <span className="text-[14px] font-bold text-ink-soft">
        {total.label}{' '}
        {/* 미채점일 때 '— / 36'처럼 작대기를 세우면 값이 있는 것처럼 읽히고 모양도 어수선하다.
            숫자 자리를 비우고 척도만 알려 준다 — 판정은 옆 배지가 한다. */}
        {complete ? (
          <>
            <b className="text-[20px] tabular-nums text-blue">{total.value}</b>
            <span className="text-ink-mute"> / {total.max}</span>
          </>
        ) : (
          <span className="font-normal text-ink-mute">{total.max}점 만점</span>
        )}
      </span>
      {/* 배지 우선순위: 중단 → 채점 전 → Pass/Fail (스펙 "낱말 해독 — …" 절) */}
      {discontinued
        ? <Badge tone="mute" size="lg">중단</Badge>
        : !complete
          ? <Badge tone="mute" size="lg">채점 전</Badge>
          : verdict && (verdict === 'pass'
            ? <Badge tone="mint" size="lg">Pass</Badge>
            : <Badge tone="rec" size="lg">Fail</Badge>)}
    </div>
  )
}
```

- [ ] **Step 2: `ScoreBand` — 중단 카드**

`components/admin/sheet/ScoreBand.tsx`의 `TASK_KEYS.map` 내부, `if (!done) return (…)` **앞에** 추가:

```tsx
        // 중단 규칙이 걸린 과제 — Pass/Fail을 내지 않는다. passMark는 전체 실시를
        // 전제한 기준이라 부분 실시 점수에 들이대면 근거가 성립하지 않는다(스펙 참고).
        if (result.discontinued[key]) return (
          <div key={key} className="rounded-xl border-[1.5px] border-line bg-well px-4 py-3">
            <p className="text-[13px] font-bold text-ink-mute">{label[key]}</p>
            <p className="mt-1 flex items-baseline gap-2">
              <b className="text-[22px] leading-none text-ink">중단</b>
              <span className="ml-auto text-[13px] text-ink-mute">{taskMax[key]}점 만점</span>
            </p>
            <p className="mt-1.5 text-[12px] text-ink-mute">
              {key === 'writing'
                ? `1번 문항 오반응 · 실시분 ${value}점`
                : key === 'wordReading'
                  ? `의미 낱말 첫 3개 연속 오반응 · 실시분 ${value}점`
                  : '낱말 해독 중단으로 실시하지 않음'}
            </p>
          </div>
        )
```

- [ ] **Step 3: `PageAudio` — 미실시 배지 분기**

`components/admin/sheet/PageAudio.tsx`의 props에 `notAdministered`를 추가하고 빈 시도 분기 교체:

```tsx
export function PageAudio({ label, attempts, limitSec, onAudioError, notAdministered = false }: {
  /** 무엇의 녹음인지 (예: '의미 낱말'). 문장처럼 바로 옆에 문항이 적혀 있으면 생략한다 */
  label?: string
  attempts: Attempt[]
  /** 검사지 제한 시간(초). 이 값을 넘는 녹음은 초과분이 채점 대상이 아님을 알린다 */
  limitSec: number
  onAudioError: () => void
  /** 중단 규칙으로 실시하지 않은 과제 — 녹음이 "빠진" 게 아니므로 경고(미녹음)를 내지 않는다.
   *  녹음이 실제로 있으면(옛 규칙 세션 등) 데이터가 우선한다 — 그대로 재생기를 낸다. */
  notAdministered?: boolean
}) {
  const [idx, setIdx] = useState(0)

  if (attempts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 print:hidden">
        {label && <span className="text-[14px] font-bold text-ink">{label}</span>}
        {notAdministered ? <Badge tone="mute">미실시</Badge> : <Badge tone="rec">미녹음</Badge>}
      </div>
    )
  }
```

(이하 기존 코드 그대로.)

- [ ] **Step 4: `WordScoreRows`·`SentenceRows` — 입력 잠금**

`WordScoreRows.tsx` — props에 `locked`, 버튼에 disabled:

```tsx
export function WordScoreRows({ audio, items, marks, onMark, locked = false }: {
  /** sticky 바에 앉는 플레이어(그룹 라벨 포함 — PageAudio) */
  audio: ReactNode
  items: SurveyItem[]
  marks: Partial<Record<string, boolean>>
  onMark: (code: string, v: boolean) => void
  /** 중단 규칙으로 실시하지 않은 그룹 — 채점을 잠근다(찍으면 총점이 오염된다) */
  locked?: boolean
}) {
```

버튼(`<button key={label} …>`)에 `disabled={locked}` 추가하고 className 끝에 `disabled:opacity-40 disabled:cursor-not-allowed` 추가. `<ul>`을 감싸는 요소는 그대로.

`SentenceRows.tsx` — props에 `locked`·`notAdministered` 추가:

```tsx
export function SentenceRows({ items, sentences, onChange, attemptsFor, limitSec, onAudioError, locked = false }: {
  items: SurveyItem[]
  sentences: Partial<Record<string, number>>
  onChange: (code: string, v: number | undefined) => void
  /** 문항 코드 → 그 문장 페이지의 녹음 시도들 */
  attemptsFor: (code: string) => Attempt[]
  limitSec: number
  onAudioError: () => void
  /** 중단 규칙으로 실시하지 않은 과제 — 점수 입력을 잠그고 미녹음 경고 대신 미실시를 낸다 */
  locked?: boolean
}) {
```

`<input type="number" …>`에 `disabled={locked}` + className에 `disabled:opacity-40` 추가.
`<PageAudio attempts={…} limitSec={…} onAudioError={…} />`에 `notAdministered={locked}` 추가.

- [ ] **Step 5: `ResultSheet` — 판정 한 번, 하위로 전달**

`components/admin/ResultSheet.tsx`의 `const r = scoreSession(…)` 아래에:

```ts
  // 중단 판정은 여기서 한 번만 — 하위 컴포넌트 여섯 곳이 각자 판정하면 어긋난다(스펙).
  const disc = r.discontinued
```

낱말 해독 섹션(137~149행) 교체:

```tsx
        <WordScoreRows items={readItemsOf('meaning')} marks={marks} onMark={setMark}
          audio={<PageAudio label={`${KIND_LABEL.meaning} 낱말`} attempts={attemptsOf('p_rw_meaning')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError} />} />
        <WordScoreRows items={readItemsOf('nonsense')} marks={marks} onMark={setMark}
          locked={disc.wordReading}
          audio={<PageAudio label={`${KIND_LABEL.nonsense} 낱말`} attempts={attemptsOf('p_rw_nonsense')}
            limitSec={form.limits.wordSec} onAudioError={onAudioError}
            notAdministered={disc.wordReading} />} />
        <Subtotal
          cells={[
            { label: '의미 점수', value: r.wordMeaning, max: readMax.meaning },
            { label: '무의미 점수', value: r.wordNonsense, max: readMax.nonsense, na: disc.wordReading },
          ]}
          total={{ label: '총 점수', value: r.wordReading, max: taskMax.wordReading }}
          verdict={r.verdict.wordReading} complete={r.complete.wordReading}
          discontinued={disc.wordReading} />
```

문장 섹션(154~158행) 교체:

```tsx
        <SentenceRows items={f.sentenceItems} sentences={sentences} onChange={setSentence}
          attemptsFor={code => attemptsOf(`p_${code}`)} locked={disc.sentenceReading}
          limitSec={form.limits.sentenceSec} onAudioError={onAudioError} />
        <Subtotal total={{ label: '총점', value: r.sentenceReading, max: taskMax.sentenceReading }}
          verdict={r.verdict.sentenceReading} complete={r.complete.sentenceReading}
          discontinued={disc.sentenceReading} />
```

쓰기 섹션의 두 `<Subtotal …>`(167~173행·178~179행)에 각각 `discontinued={disc.writing}` 추가.

`BadgeLegend`의 첫 항목(222~225행) desc에 `중단` 설명을 덧붙인다:

```tsx
          {
            badge: (
              <span className="flex gap-1">
                <Badge tone="mute">채점 전</Badge><Badge tone="mute">중단</Badge>
              </span>
            ),
            desc: <>아직 채점하지 않았거나 중단 규칙으로 <b>실시하지 않은</b> 과제입니다.
              <b className="text-rec-deep"> 0점이 아닙니다</b> — 검사지 PDF에도 점수 칸이 비어 나갑니다.
              중단된 과제는 기준 점수 판정(Pass/Fail)을 하지 않습니다.</>,
          },
```

- [ ] **Step 6: 확인**

Run: `npx tsc --noEmit && npm run lint && TZ=UTC npx vitest run`
Expected: 전부 PASS

- [ ] **Step 7: Commit**

```bash
git add components/admin
git commit -m "feat(admin): 중단 세션의 결과지 — 미실시 표기·입력 잠금·중단 배지

① 세션에서 무의미 소계가 '0 / 7'로 찍히던 것을 '미실시'로 — 이 화면이
가장 경계하는 오독(미실시가 0점으로 읽힘) 그 자체였다. 실시하지 않은
과제의 O/X·점수 입력은 잠근다(찍으면 총점이 오염된다). 빨간 '미녹음'
배지도 미실시 과제에서는 회색 '미실시'로 — 없는 파일을 찾게 만드는
경보 피로의 재발을 막는다(PR #24 참고).

판정 배지는 중단 → 채점 전 → Pass/Fail 순 — 중단 과제에 Pass/Fail을
내지 않는 이유는 lib/scoring.ts의 discontinued 주석에 있다.
녹음이 실제로 있으면 데이터가 우선한다(옛 규칙 세션 호환 — 스펙)."
```

---

### Task 8: 마이그레이션 013 — 컬럼 주석 갱신

**Files:**
- Create: `supabase/migrations/013_discontinued_comment.sql`

- [ ] **Step 1: 파일 작성**

```sql
-- 013_discontinued_comment.sql — discontinued_at 주석 갱신 (스키마 변경 없음).
--
-- 담당자 확정(2026-08-11)으로 중단 규칙 ①의 실시 범위가 바뀌었다:
--   (구) 문장 읽기유창성·낱말 쓰기 미실시, 무의미 낱말은 실시
--   (신) 무의미 낱말·문장 읽기유창성 미실시, 쓰기 과제는 실시
-- 컬럼 값의 의미(이 세션에 규칙 ①이 걸렸다)는 그대로지만, 그 결과로 무엇이
-- 미실시인지가 바뀌었다. 임상 데이터의 컬럼 설명이 틀린 채 남으면 안 된다.
--
-- 적용 시점에 discontinued_at이 있는 행은 0건이었다(2026-08-11 확인) —
-- 옛 규칙으로 진행된 중단 세션이 없어 소급 문제가 없다.
comment on column sessions.discontinued_at is
  '중단 규칙 ①(의미 낱말 첫 3개 연속 오반응)으로 무의미 낱말·문장 읽기유창성을 실시하지 않은 시각. 쓰기 과제는 실시한다(담당자 확정 2026-08-11). 제출 시점에 확정되며 이후 채점 수정에 영향받지 않는다.';
```

- [ ] **Step 2: 실 Supabase 적용**

기존 관례대로 적용한다(supabase CLI 또는 대시보드 SQL 편집기 — 이전 012 적용 방식과 동일하게). 주석 변경뿐이라 롤백 부담이 없다. 적용 후 확인:

```bash
set -a && . ./.env.local && set +a
# comment는 REST로 조회되지 않으므로 적용 완료만 사용자에게 보고하고 넘어간다
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/013_discontinued_comment.sql
git commit -m "docs(db): discontinued_at 주석을 확정 규칙으로 갱신 (스키마 변경 없음)

규칙 ①의 미실시 범위가 문장·쓰기에서 무의미·문장으로 바뀌었다. 값의
의미는 그대로라 데이터 이행이 없다 — 적용 시점에 해당 행 0건 확인."
```

---

### Task 9: 최종 검증 — 전체 스위트·빌드·화면·PDF

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 검증 명령**

```bash
npx tsc --noEmit && npm run lint && TZ=UTC npx vitest run && npm run build
git checkout next-env.d.ts 2>/dev/null; git status --short
```
Expected: 전부 통과, 워킹트리 깨끗(계획 문서 제외)

- [ ] **Step 2: 검사 화면 육안 확인 (브라우저)**

dev 서버를 띄우고(`.claude/launch.json`의 기존 설정 사용) 새 검사 세션으로:
1. G1 의미 낱말 채점에서 1·2·3번 X → 4~7번 **채점 가능**해야 함(잠기면 안 됨) → 7개 채점 후 [다음] → 모달 ① → [다시 채점]으로 닫힘 확인 → 다시 [다음] → [쓰기 과제로 이동] → **낱말 쓰기 섹션 안내**가 뜨는지
2. 낱말 쓰기 1번 "아니오" → **즉시 모달 ②** → [다시 입력] → 1번을 "예"로 바꾸면 2~10번이 풀리는지 → 다시 1번 "아니오" → 모달이 **다시 뜨지 않는지**(같은 화면 1회) → [다음]으로 진행되는지
3. "모두 아니오" 첫 클릭 → 모달 ② 발화 확인
4. 진행률 바 분모가 페이지 감소를 따라가는지

- [ ] **Step 3: 관리자 화면·PDF 육안 확인**

①이 걸린 테스트 세션을 제출한 뒤(관리자 로그인은 **사용자에게 요청** — 에이전트가 비밀번호를 입력하지 않는다):
1. 목록: 해당 세션이 "제출 완료"(미완료 아님)인지
2. 결과지: 무의미 그룹에 회색 `미실시`, O/X 잠김, 소계 "무의미 점수 미실시", 배지 `중단`, ScoreBand 낱말 해독 카드 `중단`
3. PDF 다운로드 후:

```bash
pdftoppm -r 400 -png -f 1 -l 1 <받은 pdf> /tmp/sheet   # → Read 도구로 확인
```
   - 의미 낱말 O/X 7개 찍힘 · 의미 점수 칸 **빈칸 아님** 여부는 스펙 표와 대조:
     의미 소계는 **찍힌다**, 무의미·총 점수 빈칸, 문장 전체 빈칸, 쓰기는 실시분 찍힘, 체크리스트 체크 찍힘

- [ ] **Step 4: 확인 후 테스트 세션 정리**

관리자 화면의 [세션 삭제]로 확인용 세션을 지운다(스토리지까지 지워지는 경로). 기존 테스트 세션 10건은 **건드리지 않는다**(사용자 지시).

- [ ] **Step 5: 마무리**

superpowers:finishing-a-development-branch 스킬로 통합한다. 저장소 관례: 검증 통과 시 확인 없이 커밋 → 푸시 → PR → **merge commit** 머지(squash 아님).

---

## 태스크 의존 관계

```
Task 1 (survey-flow) ─┬─ Task 2·3 (items → adminStats·db)
                      ├─ Task 4 (scoring) ─── Task 5 (stamp-sheet)
                      ├─ Task 6 (검사 화면)
                      └─ Task 4 ─── Task 7 (관리자 화면)
Task 8 (migration)    독립
Task 9 (검증)         전부 완료 후
```

Task 2는 단독 커밋이 불가능(adminStats가 참조) — Task 3과 한 커밋으로 간다.
