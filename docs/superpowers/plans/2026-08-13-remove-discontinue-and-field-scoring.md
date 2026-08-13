# PR A — 중단·현장채점 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검사 중 판정(현장 채점 MarkPage · 중단 규칙 ①·② 전부)을 제거해 검사 화면은 수집만 하고, 채점·해석은 관리자 결과지가 전담하게 한다.

**Architecture:** 삭제 위주. `reading_marks` 테이블은 관리자 채점 전용 저장소로 남고, 쓰기 검사자 입력과 미녹음 기본채점(`withUnrecordedDefaults`)은 유지된다. `discontinued` 파생(`lib/scoring.ts`)과 `discontinued_at` 컬럼은 완전히 사라진다.

**Tech Stack:** Next.js 16 App Router · React 19 · Supabase · vitest(node 환경만, 컴포넌트 렌더 테스트 없음 — `tests/README.md`)

**Spec:** `docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md`

## Global Constraints

- 브랜치: `feat/admin-only-scoring-and-class-codes` (스펙 커밋이 이미 있음) 위에서 그대로 작업. 이 브랜치가 PR A가 된다.
- **모든 커밋 전에 4종 전부 통과**: `npm run typecheck && npm run lint && npm test && npm run build` (CLAUDE.md 규칙 4). 태스크 순서는 각 커밋에서 typecheck가 깨지지 않게 설계돼 있다 — 순서를 바꾸지 말 것.
- `next-env.d.ts`에 변경분이 생기면 커밋하지 말고 `git checkout next-env.d.ts`.
- 코드를 고치면 그 폴더 README·주석을 같은 커밋에서 고친다(CLAUDE.md 규칙 3). Task 1~8에서는 삭제로 무의미해진 주석만 제거하고, README 일괄 개정은 Task 9에서 한다.
- 임상 규칙 주석 출처 표기: 이번 제거의 근거는 `담당자 확정(2026-08-13)`(현장 채점·중단 기능 제거), 규칙 ② 제거와 규칙 ① 폐기 범위는 `사용자 확정(2026-08-13)` (스펙 "확정 경위와 출처" 표 참고).
- 유지되는 것(지우면 안 됨): 쓰기 과제 검사자 입력 전체, `withUnrecordedDefaults`(미녹음=X·0), `reading_marks` 테이블과 관리자 scores 라우트, Pass/Fail·`complete`·`sheetPdfGate`의 쓰기 `overridable` 예외.
- 테스트 관례: `it()` 설명은 한국어, import는 `@/` 별칭, 회귀 핀은 `[REGRESSION]` 접두, 라우트 테스트는 `vi.mock('@/lib/db', …)`를 import보다 앞에.

---

### Task 1: `lib/survey-flow.ts` 게이팅 축소 (visiblePages·canAdvance·FlowState)

중단 함수(`hitsCeiling` 등)는 아직 다른 파일(scoring·adminStats·submit route 등)이 쓰므로 **이 태스크에서는 지우지 않는다**(Task 8에서 삭제). 게이팅 두 함수와 `FlowState`만 먼저 줄인다.

**Files:**
- Modify: `lib/survey-flow.ts`
- Test: `tests/survey-flow.test.ts`

**Interfaces:**
- Produces: `visiblePages(f: FormItems, s: Partial<Pick<FlowState, 'practice'>>): SurveyPage[]` — 연습 제외 필터만. `canAdvance(f, page, s: Omit<FlowState, 'practice'>): boolean` — 쓰기 전 문항 + 체크리스트 1개 이상. `FlowState`에서 `marks` 필드 제거.
- Consumes: 없음(순수 함수 계층).

- [ ] **Step 1: 테스트를 새 기대값으로 수정**

`tests/survey-flow.test.ts`에서:
- `describe('visiblePages (중단 규칙 반영한 진행 페이지)', …)` 블록(85~106행 부근) 전체 삭제 — 중단 케이스 3개가 들어 있다.
- `describe('visiblePages — 연습 실시 여부 …')`에서 `it('연습 건너뛰기와 중단 규칙 ①은 함께 적용된다', …)` 삭제. 나머지 두 케이스(건너뛰면 빠진다 / 실시하면 첫 페이지)는 유지하되, 호출부의 `marks: {}` 인자가 있으면 제거.
- `describe('canAdvance …')`에서 현장 채점 페이지 2개 케이스(220·226행 부근)와 "중단 규칙에 걸리면 1번만 선택해도 진행 가능"(238) · "items 나열 순서가 바뀌어도 중단 규칙은 …"(249) · "첫 문장 0점이면 그것만으로 진행 가능"(262) 케이스를 삭제. 남는 케이스의 `s` 인자에서 `marks` 키 제거.
- 새 케이스 추가:

```ts
describe('canAdvance — 쓰기는 전 문항 입력이 완료 조건이다 (중단 규칙 폐기, 담당자 확정 2026-08-13)', () => {
  const wwPage = (f: typeof g1) => f.pages.find(p => p.section === f.writingSection)!
  it('G1: 1번이 0점이어도 나머지를 다 입력해야 진행 가능', () => {
    const partial = { ww01: 0 }
    expect(canAdvance(g1, wwPage(g1), { writing: partial, checklist: [] })).toBe(false)
    const all = Object.fromEntries(g1.writingItems.map(i => [i.code, 0]))
    expect(canAdvance(g1, wwPage(g1), { writing: all, checklist: [] })).toBe(true)
  })
  it('G2: 첫 문장이 0점이어도 5문항 전부 입력해야 진행 가능', () => {
    expect(canAdvance(g2, wwPage(g2), { writing: { sw01: 0 }, checklist: [] })).toBe(false)
    const all = Object.fromEntries(g2.writingItems.map(i => [i.code, 0]))
    expect(canAdvance(g2, wwPage(g2), { writing: all, checklist: [] })).toBe(true)
  })
})
```

(참고: `hitsCeiling`·`readingCeilingHit`·`isWritingWrong`·`writingCeilingHit`·`keepImplementedWriting`·`requiredWritingCodes`의 describe들은 **이 태스크에서는 그대로 둔다** — 함수가 아직 살아 있다. Task 8에서 함수와 함께 삭제.)

- [ ] **Step 2: 테스트 실행 — 새 케이스가 실패하는지 확인**

Run: `npx vitest run tests/survey-flow.test.ts`
Expected: FAIL — `canAdvance`가 `s.marks` 접근·`requiredWritingCodes` 사용으로 기존 동작(중단 시 1번만 요구)을 유지하고 있어 새 케이스와 어긋난다. (컴파일 에러 형태일 수 있음: `marks` 없는 인자.)

- [ ] **Step 3: 구현**

`lib/survey-flow.ts`에서:
- `FlowState`에서 `marks` 필드 삭제.
- `visiblePages`를 아래로 교체(중단 분기 삭제):

```ts
/** 진행 상태에서 실제로 실시할 페이지 목록 — 연습을 건너뛰기로 했으면(practice === false)
 *  연습 페이지가 빠진다. (중단 규칙에 의한 페이지 제거는 2026-08-13 담당자 확정으로 폐기) */
export function visiblePages(f: FormItems, s: Partial<Pick<FlowState, 'practice'>>) {
  // practice가 undefined인 호출(옛 저장 상태·테스트)은 연습을 실시하는 쪽으로 본다 —
  // 빠뜨려서 연습이 사라지는 쪽보다 남는 쪽이 안전하다.
  return s.practice === false ? f.pages.filter(p => !p.practice) : f.pages
}
```

- `canAdvance`를 아래로 교체(현장 채점·중단 분기 삭제):

```ts
/**
 * 현재 페이지에서 [다음]을 누를 수 있는지 — 페이지 종류별 완료 조건.
 * 쓰기: 전 문항 입력. 체크리스트: 1개 이상 선택.
 * (녹음 문항 자체의 완료 여부는 이 함수가 판단하지 않는다 — 호출부에서 busy로 이미 잠겨 있다.)
 */
export function canAdvance(
  f: FormItems, page: FormItems['pages'][number],
  s: Omit<FlowState, 'practice'>,
): boolean {
  const writingDone = page.items.every(i => s.writing[i.code] !== undefined)
  return (page.section !== f.writingSection || writingDone)
    && (page.section !== 'checklist' || s.checklist.length > 0)
}
```

- 파일 상단 헤더 주석(1~10행)에서 중단 규칙 설명을 제거하고 아래로 교체:

```ts
// lib/survey-flow.ts — 검사 진행 흐름 규칙. 순수 함수만 둔다.
// 중단 규칙(①·②)과 현장 채점은 2026-08-13 담당자 확정으로 폐기됐다 — 검사 화면은 수집만
// 하고, 판정·채점은 전부 관리자 결과지가 한다(스펙: 2026-08-13-admin-only-scoring-and-class-codes).
// ⚠️ 검사지에 인쇄된 중단 규칙 문구는 적용하지 않는다 — 시행 절차는 담당자 회신이 우선한다.
```

(그 아래 중단 함수들과 각각의 주석은 이 태스크에서 건드리지 않는다.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/survey-flow.test.ts`
Expected: PASS

- [ ] **Step 5: 4종 검증 후 커밋**

이 시점에는 `visiblePages`/`canAdvance` 소비처(app/survey, app/review)가 넘기는 인자가 초과 필드를 가질 뿐이라 typecheck가 깨지지 않는다.

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add lib/survey-flow.ts tests/survey-flow.test.ts
git commit -m "feat: 검사 진행 게이팅에서 중단 규칙 분기 제거 (담당자 확정 2026-08-13)"
```

---

### Task 2: `lib/items.ts`에서 현장 채점 페이지 제거

**Files:**
- Modify: `lib/items.ts`
- Test: `tests/items.test.ts`

**Interfaces:**
- Produces: `itemsFor(form).pages`에 `p_rw_meaning_mark` 페이지가 없다. G1·G2 모두 페이지 수가 1 줄어든다(G1: 9→8).

- [ ] **Step 1: 테스트 수정**

`tests/items.test.ts`에서 `p_rw_meaning_mark`를 참조하거나 페이지 수를 세는 케이스를 찾아(`grep -n "p_rw_meaning_mark\|pages.length" tests/items.test.ts`) 기대값을 갱신한다:
- 페이지 수 기대값을 1 줄인다.
- `p_rw_meaning_mark` 존재를 확인하는 케이스가 있으면 **부재 확인**으로 교체:

```ts
it('현장 채점 페이지는 없다 (담당자 확정 2026-08-13 — 채점은 관리자 전담)', () => {
  expect(g1.pages.some(p => p.code === 'p_rw_meaning_mark')).toBe(false)
  expect(g2.pages.some(p => p.code === 'p_rw_meaning_mark')).toBe(false)
  expect(g1.pages.every(p => p.role === 'child' || !isRecordingPage(p))).toBe(true)
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/items.test.ts` → FAIL

- [ ] **Step 3: 구현**

`lib/items.ts`에서:
- `build()`의 `pages` 배열에서 아래 항목과 그 위 주석("검사지 중단 규칙 판정을 위해 …") 삭제:

```ts
{ code: 'p_rw_meaning_mark', section: 'word_reading', role: 'examiner', kind: 'meaning',
  items: readOf('meaning'), limitSec: 0, practice: false },
```

- `pageLabel()`에서 `if (p.code === 'p_rw_meaning_mark') return '검사자 확인 (의미 낱말 채점)'` 줄 삭제.
- `FormItems.meaningReadCodes`의 주석 `/** 중단 규칙 판정에 쓰는 …*/`을 `/** 의미 낱말 코드(문항 순서 유지) — 관리자 채점·소계가 쓴다 */`로 교체.

- [ ] **Step 4: 통과 확인** — `npx vitest run tests/items.test.ts tests/survey-flow.test.ts` → PASS

- [ ] **Step 5: 4종 검증 후 커밋**

(app/survey·app/review의 `p_rw_meaning_mark` 분기는 죽은 코드가 될 뿐 컴파일된다.)

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add lib/items.ts tests/items.test.ts
git commit -m "feat: 검사자 현장 채점 페이지(p_rw_meaning_mark) 제거"
```

---

### Task 3: 검사 진행 화면 정리 (`app/survey/page.tsx` + survey 컴포넌트)

**Files:**
- Delete: `components/survey/MarkPage.tsx`
- Modify: `app/survey/page.tsx`, `components/survey/WritingPage.tsx`, `components/survey/SentenceWritingPage.tsx`, `components/survey/ReadingPage.tsx`, `components/survey/README.md`

**Interfaces:**
- Consumes: Task 1의 새 `canAdvance`/`visiblePages` 시그니처.
- Produces: `st.marks`를 읽거나 쓰는 코드가 검사 화면에서 사라진다(Task 5에서 필드 삭제 가능해짐).

컴포넌트 렌더 테스트는 관례상 없다 — 검증은 typecheck·lint·build.

- [ ] **Step 1: `app/survey/page.tsx` 수정**

1. import에서 제거: `MarkPage`, `ConfirmDialog`는 **유지 여부 확인** — 중단 모달에만 쓰였으면 제거(이 파일에서 ConfirmDialog는 중단 모달에만 쓰인다 → 제거). `CEILING_N, keepImplementedWriting, readingCeilingHit, requiredWritingCodes, writingCeilingHit`도 제거하고 `canAdvance, visiblePages`만 남긴다.
2. `CEILING_COPY` 상수 블록(31~57행) 전체 삭제.
3. state에서 `ceilingModal`·`writingModalSeen` 삭제(77~80행 부근). `goToIdx`의 `setWritingModalSeen(false);` 삭제.
4. `tryNext()`를 아래로 교체:

```ts
function tryNext() {
  // 연습 페이지에서는 곧바로 본 검사로 넘기지 않고 "연습이 끝났다"를 한 화면 보여준다
  // (연습과 본 검사의 경계가 화면에 없다는 피드백 — 2026-08-12).
  if (!fromReview && page.practice) { setPracticeEnd(true); return }
  goNext()
}
```

5. `maybeWritingCeiling()` 삭제, `changeWriting()`을 아래로 교체:

```ts
function changeWriting(code: string, v: number) {
  patch(prev => ({ writing: { ...prev.writing, [code]: v } }))
}
```

6. MarkPage 렌더 블록(337~340행) 삭제:

```tsx
{page.code === 'p_rw_meaning_mark' && (
  <MarkPage … />
)}
```

7. `WritingPage`의 `onSetAll`을 단순화(재판정 안전장치 불필요 — 중단이 없으니 전 문항에 그대로 쓴다). 긴 주석 4줄도 함께 삭제:

```tsx
{page.section === 'word_writing' && (
  <WritingPage items={page.items} value={st.writing}
    onChange={changeWriting}
    onSetAll={v => patch(prev => ({
      writing: { ...prev.writing, ...Object.fromEntries(page.items.map(i => [i.code, v])) },
    }))} />
)}
```

(`form` prop은 Step 2에서 WritingPage 시그니처에서 빠지므로 여기서도 뺀다. `SentenceWritingPage`도 동일하게 `form` prop 제거.)

8. 파일 끝의 중단 모달 JSX(`{ceilingModal && (<ConfirmDialog …>)}` 블록, 409~425행) 전체 삭제.
9. 파일 상단 헤더 주석의 "중단 규칙에 걸리면 visiblePages가 해당 페이지들을 빼므로 …" 문장 삭제.

- [ ] **Step 2: `components/survey/MarkPage.tsx` 삭제**

```bash
git rm components/survey/MarkPage.tsx
```

- [ ] **Step 3: `WritingPage.tsx` 잠금 제거**

- import에서 `requiredWritingCodes, writingCeilingHit` 제거.
- props에서 `form: FormItems` 제거(다른 용도 없음 — `FormItems` import도 제거).
- `ceiling`·`requiredCodes` 변수 삭제. `answered`/`required`는:

```ts
const answered = items.filter(i => value[i.code] !== undefined).length
const required = items.length
```

- 일괄 버튼의 `disabled={ceiling}` 제거.
- `locked` 변수와 `opacity-40`/`disabled={locked}` 분기 제거(버튼은 항상 활성).
- `{ceiling && (…낱말 쓰기를 여기서 중단합니다…)}` 경고 블록 삭제. `{!ceiling && answered < required && …}`는 `{answered < required && …}`로.
- 헤더 주석의 "중단 규칙 ②: …" 문단을 삭제하고 "검사자가 아동이 쓴 결과를 보고 낱말마다 예/아니오를 표시한다"만 남긴다.

- [ ] **Step 4: `SentenceWritingPage.tsx` 동일 처리**

WritingPage와 같은 패턴: `form` prop·`ceiling`·`requiredCodes`·`locked`·중단 경고 블록 삭제, `answered`/`required`를 전 문항 기준으로, 헤더 주석의 중단 문장 삭제.

- [ ] **Step 5: `ReadingPage.tsx` 문구 교체**

아동이 중간에 스스로 멈추는 것이 공식 경로가 됐으므로, 완료·포기 어느 쪽도 어색하지 않게:

```tsx
<p className="text-sm font-bold text-ink-soft">
  {recording ? '다 읽었으면 버튼을 눌러 주세요'
    : saved ? '다 읽었으면 [다음]을, 다시 읽으려면 녹음 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
</p>
```

- [ ] **Step 6: `components/survey/README.md`에서 MarkPage 행·중단 언급 삭제**

- [ ] **Step 7: 4종 검증 후 커밋**

주의: 이 시점에 `app/review/page.tsx`가 여전히 `st.marks`를 참조하지만 `SurveyState.marks`는 Task 5까지 존재하므로 typecheck는 통과한다.

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add -A
git commit -m "feat: 검사 화면에서 현장 채점·중단 모달·문항 잠금 제거"
```

---

### Task 4: 검토 화면 정리 + 제출 페이로드에서 marks 제거

**Files:**
- Modify: `app/review/page.tsx`

- [ ] **Step 1: `app/review/page.tsx` 수정**

1. import에서 `readingCeilingHit, requiredWritingCodes` 제거(`visiblePages`만 남김).
2. `missingWriting` 단순화:

```ts
const missingWriting = pages
  .filter(p => p.section === f.writingSection)
  .flatMap(p => p.items)
  .filter(i => state.writing[i.code] === undefined).length
```

3. `renderSection` 안의 `p.code === 'p_rw_meaning_mark'` 분기(74~78행) 삭제(죽은 코드). 쓰기 분기 단순화:

```tsx
} else if (p.section === f.writingSection) {
  const done = p.items.filter(i => state.writing[i.code] !== undefined).length
  pill = <StatusPill done={done === p.items.length} label={`${done} / ${p.items.length}`} />
}
```

4. `renderSection` 상단의 `if (rows.length === 0) return null   // 중단 규칙으로 미실시된 섹션` — 주석만 "빈 섹션 카드는 그리지 않는다"로 교체(연습 스킵 등 방어로 남겨 둔다).
5. 중단 안내 블록(135~145행)과 그 위 주석 4줄 삭제:

```tsx
{readingCeilingHit(f, state.marks) && (
  <p …>중단 규칙에 따라 문장 읽기유창성이 생략되었습니다.</p>
)}
```

6. `submit()`의 페이로드에서 `marks: st.marks` 제거:

```ts
const r = await postJson('/api/sessions/submit', {
  sessionId: st.sessionId, sessionToken: st.sessionToken,
  writing: st.writing, checklist: st.checklist,
}, '제출에 문제가 생겼어요. 다시 시도해 주세요.')
```

- [ ] **Step 2: 4종 검증 후 커밋**

(서버는 `marks` 미포함 제출을 이미 허용한다 — `submit-route.test.ts` "marks가 없으면 빈 배열로 저장된다".)

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add app/review/page.tsx
git commit -m "feat: 검토 화면에서 현장 채점 배지·중단 안내 제거, 제출에서 marks 제외"
```

---

### Task 5: `lib/survey-state.ts`에서 marks 제거 + SCHEMA_V 7

**Files:**
- Modify: `lib/survey-state.ts`
- Test: `tests/survey-state.test.ts`

- [ ] **Step 1: 테스트 수정** — `tests/survey-state.test.ts`에서 `marks`를 만들거나 단언하는 부분 제거, `SCHEMA_V` 관련 기대값을 7로. 새 핀 추가:

```ts
it('[REGRESSION] 구버전(v=6, marks 있던 스키마) 상태는 로드하지 않는다', () => {
  const stale = { ...newState('sid', '아이', 'tok', 1), v: 6, marks: {} }
  localStorage.setItem('kodys-survey:sid', JSON.stringify(stale))
  localStorage.setItem('kodys-survey:last', 'sid')
  expect(loadState()).toBeNull()
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/survey-state.test.ts` → FAIL

- [ ] **Step 3: 구현** — `lib/survey-state.ts`:
- `const SCHEMA_V = 7` (주석 그대로).
- `SurveyState`에서 `marks: Record<string, boolean>` 필드와 그 주석 삭제.
- `newState()` 반환값에서 `marks: {},` 삭제.

- [ ] **Step 4: 통과 확인** — `npx vitest run tests/survey-state.test.ts` → PASS

- [ ] **Step 5: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add lib/survey-state.ts tests/survey-state.test.ts
git commit -m "feat: 진행 상태에서 현장 채점(marks) 제거 — SCHEMA_V 7"
```

---

### Task 6: 제출 서버 경로에서 marks·discontinued 제거

**Files:**
- Modify: `app/api/sessions/submit/route.ts`, `lib/db.ts`
- Test: `tests/submit-route.test.ts`, `tests/db.test.ts`

**Interfaces:**
- Produces: `SubmitInput = { sessionId, writing, sentenceWriting, checklist }` (marks·discontinued 없음). `submitSession`은 `reading_marks`에 더 이상 쓰지 않는다.

- [ ] **Step 1: 테스트 수정**

`tests/submit-route.test.ts`:
- 삭제할 describe/it: `it('marks에 의미 낱말 코드와 boolean이 오면 저장된다')`, `it('marks가 없으면 빈 배열로 저장된다 …')`, `it('의미 낱말이 아닌 코드는 400 …')`, `it('marks 값이 boolean이 아니면 400')`, `it('marks가 배열이면 400 …')`, `describe('중단 규칙 ② — 실시하지 않은 쓰기 문항은 저장하지 않는다 (항목 10)')` 전체, `describe('중단 규칙 ① 판정을 제출 시점에 굳힌다')` 전체.
- 남는 케이스의 `submitSession` 호출 단언에서 `marks: […], discontinued: …` 키 제거.
- 새 핀 추가:

```ts
it('[REGRESSION] marks를 보내도 무시된다 — 검사자 현장 채점은 폐기됐다 (담당자 확정 2026-08-13)', async () => {
  const res = await POST(makeReq({ ...VALID_BODY, marks: { rw01: false, rw02: false, rw03: false } }))
  expect(res.status).toBe(200)
  const call = vi.mocked(db.submitSession).mock.calls[0][0]
  expect(call).not.toHaveProperty('marks')
  expect(call).not.toHaveProperty('discontinued')
})
it('쓰기 1번이 0점이어도 나머지 답이 그대로 저장된다 (중단 절삭 폐기)', async () => {
  const writing = { ww01: 0, ww02: 1, ww03: 0 }
  const res = await POST(makeReq({ ...VALID_BODY, writing }))
  expect(res.status).toBe(200)
  const call = vi.mocked(db.submitSession).mock.calls[0][0]
  expect(call.writing).toEqual([
    { itemCode: 'ww01', canWrite: false },
    { itemCode: 'ww02', canWrite: true },
    { itemCode: 'ww03', canWrite: false },
  ])
})
```

(`VALID_BODY`·`makeReq`는 파일에 이미 있는 헬퍼를 그대로 쓴다 — 이름이 다르면 파일 상단의 실제 이름을 따를 것.)

`tests/db.test.ts`: `submitSession` 입력 픽스처(52행 부근)에서 `marks: [], discontinued: false` 제거. `reading_marks` upsert·`discontinued_at` 저장을 단언하는 케이스가 있으면 삭제.

- [ ] **Step 2: 실패 확인** — `npx vitest run tests/submit-route.test.ts tests/db.test.ts` → FAIL

- [ ] **Step 3: `app/api/sessions/submit/route.ts` 구현**

- import에서 `keepImplementedWriting, readingCeilingHit`와 `type ReadingMark` 제거.
- `rawMarks` 파싱 2줄(35~36행)과 marks 검증 루프(80~86행) 삭제.
- `keepImplementedWriting` 절삭(67~72행의 주석 포함)을 삭제하고 `validWriting`을 바로 분기 저장:

```ts
const writing: WritingAnswer[] = []
const sentenceWriting: SentenceScore[] = []
for (const [itemCode, words] of Object.entries(validWriting)) {
  if (f.writingSection === 'word_writing') writing.push({ itemCode, canWrite: words >= 1 })
  else sentenceWriting.push({ itemCode, words })
}
```

- `discontinued` 파생(89~91행 주석 포함)을 삭제하고:

```ts
const result = await submitSession({ sessionId: b.sessionId, writing, sentenceWriting, checklist })
```

- 파일 헤더 주석에서 중단·현장 채점 문장 삭제.

- [ ] **Step 4: `lib/db.ts` 구현**

- `SubmitInput`에서 `marks: ReadingMark[]`·`discontinued: boolean` 필드와 그 주석 삭제.
- `submitSession`에서 `discontinued_at: …` 업데이트 키 삭제(`{ checklist, submitted_at: now }`만), `marks` 구조분해와 `reading_marks` upsert 블록(90~94행) 삭제.
- `ReadingMark` 인터페이스의 주석을 `/** 낱말 해독 O/X — 관리자 채점(saveScores)이 쓴다 */`로 교체(타입 자체는 saveScores가 쓰므로 유지).

- [ ] **Step 5: 통과 확인** — `npx vitest run tests/submit-route.test.ts tests/db.test.ts` → PASS

- [ ] **Step 6: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add app/api/sessions/submit/route.ts lib/db.ts tests/submit-route.test.ts tests/db.test.ts
git commit -m "feat: 제출 경로에서 현장 채점 저장·중단 판정·쓰기 절삭 제거"
```

---

### Task 7: 채점·통계·관리자 화면·PDF에서 중단 개념 제거

`ScoreResult.discontinued`를 지우면 소비처 전부가 한 번에 깨지므로 **한 태스크(한 커밋)**로 묶는다.

**Files:**
- Modify: `lib/scoring.ts`, `lib/adminStats.ts`, `components/admin/ResultSheet.tsx`, `components/admin/AdminDetailView.tsx`, `components/admin/sheet/Subtotal.tsx`, `components/admin/sheet/ScoreBand.tsx`, `components/admin/sheet/PageAudio.tsx`, `components/admin/sheet/WordScoreRows.tsx`, `components/admin/sheet/WritingChips.tsx`, `components/admin/sheet/SentenceRows.tsx`, `components/admin/sheet/SentenceWriteRows.tsx`, `components/admin/SessionTable.tsx`(범례 note), `lib/pdf/stamp-sheet.ts`
- Test: `tests/scoring.test.ts`, `tests/adminStats.test.ts`, `tests/stamp-sheet.test.ts`

**Interfaces:**
- Produces: `ScoreResult`에서 `discontinued` 필드 제거. `scoreSession`은 저장된 marks·문장·쓰기 답 **전부 산입**. `sheetPdfGate`의 미채점 판정은 `!complete[k]`만. `adminStats`의 `expectedTotalsFor`/`expectedTotals` 삭제 — 분모는 `itemsFor(form).totals` 상수.

- [ ] **Step 1: `tests/scoring.test.ts` 수정**

- `grep -n "discontinued\|중단" tests/scoring.test.ts`로 나오는 케이스 정리:
  - `describe('중단 규칙과 채점 (discontinued — …)')`(241~301행 부근) 전체 삭제.
  - 190행 `it('중단 규칙 ②(G2): 첫 문장이 0점이면 그것만 채워도 완료다')` → 전 문항 기준으로 교체:

```ts
it('쓰기 완료는 전 문항 입력 기준이다 (중단 규칙 폐기 — 담당자 확정 2026-08-13)', () => {
  expect(score({ writing: { sw01: 0 } }).complete.writing).toBe(false)
  const all = Object.fromEntries(itemsFor(G2).writingItems.map(i => [i.code, 0]))
  expect(score({ writing: all }).complete.writing).toBe(true)
})
```

  - `sheetPdfGate`의 `it('중단으로 실시하지 않은 과제는 관문에 걸리지 않는다 …')`(340행 부근) 삭제.
  - `withUnrecordedDefaults`의 중단 케이스 2개(377·384행 부근) → 아래로 교체:

```ts
it('[REGRESSION] 의미 낱말 첫 3개가 X로 채워져도 무의미·문장까지 전부 기본채점한다 (중단 규칙 폐기)', () => {
  const out = withUnrecordedDefaults(itemsFor(G1), { marks: {}, sentences: {}, writing: {} }, () => false)
  expect(Object.keys(out.marks)).toHaveLength(14)          // 의미 7 + 무의미 7 전부 X
  expect(Object.values(out.marks).every(v => v === false)).toBe(true)
  expect(Object.keys(out.sentences)).toHaveLength(4)       // 문장 4개 전부 0
})
```

- 새 핀(전부 산입):

```ts
it('[REGRESSION] 의미 낱말 첫 3개가 X여도 저장된 무의미·문장·쓰기 점수는 전부 산입된다', () => {
  const r = score({
    marks: { rw01: false, rw02: false, rw03: false, rw08: true },
    sentences: { rs01: 5 },
    writing: { ww01: 0, ww02: 1 },
  })
  expect(r.wordNonsense).toBe(1)
  expect(r.sentenceReading).toBe(5)
  expect(r.writing).toBe(1)
})
```

(`score`/`itemsFor` 헬퍼는 파일에 이미 있는 것을 사용 — 이름이 다르면 파일의 실제 헬퍼를 따를 것.)

- [ ] **Step 2: `tests/adminStats.test.ts` 수정**

- `describe('중단 규칙이 적용된 세션의 진행률 …')`(306~373행 부근) 전체 삭제 — `expectedTotals` 케이스 포함.
- 205행 부근의 소급 적용 케이스(`분모가 1로 줄어 10/1`)를 새 동작으로 교체:

```ts
it('쓰기 1번이 0점이어도 분모·분자는 전 문항 기준이다 (중단 규칙 폐기)', () => {
  const s = mkSession({ writing_answers: [{ item_code: 'ww01', can_write: false }] })
  const p = sessionProgress(s)
  expect(p.expected.write).toBe(10)
  expect(p.written).toBe(1)
  expect(p.incomplete).toBe(true)
})
```

- `mkSession` 픽스처의 `discontinued_at: null`은 이 태스크에서는 남겨 둔다(타입에 아직 있음 — Task 8에서 제거).

- [ ] **Step 3: `tests/stamp-sheet.test.ts` 수정**

- `describe('stampSheet — 중단 규칙: 중단 이후는 점수를 적지 않는다 (담당자 확정)')`(119행~) 전체 삭제.
- `it('중단 없는 세션: 무의미 낱말 O/X는 그대로 찍힌다')`는 이름에서 "중단 없는 세션: "만 떼고 유지.
- 새 핀:

```ts
it('[REGRESSION] 의미 첫 3개가 X인 세션도 무의미·문장·총점이 전부 찍힌다 (중단 규칙 폐기)', async () => {
  // 기존 픽스처 헬퍼로 의미 3개 X + 나머지 채점 완료 입력을 만들어 stampSheet 실행 후,
  // 무의미 소계·낱말 총점·문장 총점 좌표의 텍스트가 존재하는지 기존 좌표-읽기 헬퍼로 단언한다.
})
```

(픽스처·좌표 헬퍼는 이 파일 상단에 이미 있다 — 삭제한 describe의 케이스 하나를 복사해 기대만 "찍힌다"로 뒤집으면 된다.)

- [ ] **Step 4: 실패 확인** — `npx vitest run tests/scoring.test.ts tests/adminStats.test.ts tests/stamp-sheet.test.ts` → FAIL

- [ ] **Step 5: `lib/scoring.ts` 구현**

- import에서 `readingCeilingHit, requiredWritingCodes, writingCeilingHit` 제거(survey-flow import 자체가 사라진다).
- `ScoreResult`에서 `discontinued: Record<TaskKey, boolean>` 필드와 주석 삭제. `complete` 주석의 중단 문장도 정리.
- `sheetPdfGate`: `const left = (k: TaskKey) => !r.complete[k]`로 교체하고 주석의 "중단으로 실시하지 않은 과제는 …" 문장 삭제.
- `withUnrecordedDefaults`를 아래로 교체(주석의 중단 항목 삭제):

```ts
export function withUnrecordedDefaults(
  f: FormItems, input: ScoreInput, hasRecording: (pageCode: string) => boolean,
): ScoreInput {
  const marks = { ...input.marks }
  const sentences = { ...input.sentences }
  for (const p of f.recordingPages.filter(p => !hasRecording(p.code))) {
    if (p.section === 'word_reading') {
      for (const i of p.items) if (marks[i.code] === undefined) marks[i.code] = false
    } else {
      for (const i of p.items) if (sentences[i.code] === undefined) sentences[i.code] = 0
    }
  }
  return { ...input, marks, sentences }
}
```

- `scoreSession`을 아래로 교체:

```ts
export function scoreSession(form: SurveyForm, s: ScoreInput): ScoreResult {
  const f = itemsFor(form)
  const { passMark } = scoringFor(form)
  const total = (codes: string[]) => codes.reduce((n, c) => n + clampWords(f, c, s.writing[c]), 0)
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
      wordReading: allAnswered(f.readItems.map(i => i.code), s.marks),
      sentenceReading: allAnswered(f.sentenceItems.map(i => i.code), s.sentences),
      writing: allAnswered(f.writingItems.map(i => i.code), s.writing),
    },
  }
}
```

- [ ] **Step 6: `lib/adminStats.ts` 구현**

- import에서 `requiredWritingCodes, writingCeilingHit` 제거.
- `expectedTotalsFor`·`expectedTotals` 두 함수(주석 포함) 삭제.
- `sessionProgress`를 아래로 교체:

```ts
export function sessionProgress(s: SessionListRow): {
  recorded: number; written: number; expected: Totals; incomplete: boolean
} {
  const f = itemsFor(formForGrade(s.grade))
  const writing = writingOf(f, s)
  // 녹음도 **이 양식의 페이지 코드만** 센다. (옛 문항 단위 녹음이 분자를 부풀리지 않도록 — 항목 7)
  const recCodes = new Set(f.recordingPages.map(p => p.code))
  const recorded = new Set(s.recordings.map(r => r.item_code).filter(c => recCodes.has(c))).size
  const written = f.writingItems.filter(i => writing[i.code] !== undefined).length
  const expected = f.totals
  return { recorded, written, expected, incomplete: recorded < expected.rec || written < expected.write }
}
```

- `sortSessions`의 progress 사전 계산 주석에서 "규칙 ②가 옛 세션에 소급 …" 문장을 지우고 `Math.min(1, …)` clamp는 방어로 유지.

- [ ] **Step 7: `components/admin/ResultSheet.tsx` 구현**

- import에서 `CEILING_N, readingCeilingHit, requiredWritingCodes` 제거(survey-flow import 삭제).
- 삭제: `pendingMark` state와 그 ConfirmDialog(284~294행), `disc`·`nonsenseReadNA`·`sentenceReadNA`·`retroData`·`retroDisc`·`implementedWriting`·`nonsenseWriteNA` 변수들(56~73행)과 `retroDisc` 배너(179~187행).
- `setMark`를 `applyMark`로 단일화:

```ts
const setMark = (code: string, v: boolean) => { setMsg(''); setMarks(m => ({ ...m, [code]: v })) }
```

(`applyMark` 별도 함수 삭제.)
- `WordScoreRows`의 `locked`·`PageAudio`의 `notAdministered` prop 전달 제거, `SentenceRows`의 `locked` 제거.
- `Subtotal` 호출에서 `na:`·`discontinued` prop 제거, `WritingChips`/`SentenceWriteRows`의 `implemented` prop 제거.
- 하단 안내문 조건 단순화:

```tsx
{!(r.complete.wordReading && r.complete.sentenceReading && r.complete.writing)
  && ' · 채점이 끝나지 않은 과제는 점수 칸이 비어 나갑니다'}
```

- `BadgeLegend` items에서 「중단」 배지를 빼고 첫 항목을 다음으로 교체:

```tsx
{
  badge: <Badge tone="mute">채점 전</Badge>,
  desc: <>아직 채점하지 않은 과제입니다. <b className="text-rec-deep">0점이 아닙니다</b> —
    검사지 PDF에도 점수 칸이 비어 나갑니다.</>,
},
```

- 헤더 주석·"규칙 우선" 설명 주석(56~73행)의 중단 관련 문장 삭제.

- [ ] **Step 8: sheet 하위 컴포넌트 구현**

- `Subtotal.tsx`: `Cell.na`·`discontinued` prop과 na/중단 분기 삭제(배지: `!complete → 채점 전`, 아니면 Pass/Fail).
- `ScoreBand.tsx`: `if (result.discontinued[key]) return (…)` 블록 삭제.
- `PageAudio.tsx`: `notAdministered` prop과 `미실시` 분기 삭제(빈 시도는 항상 `미녹음`).
- `WordScoreRows.tsx`: `locked` prop·`disabled` 분기 삭제.
- `SentenceRows.tsx`: `locked` prop 삭제(`disabled`·`notAdministered` 전달 포함).
- `WritingChips.tsx`·`SentenceWriteRows.tsx`: `implemented` prop과 `na` 분기 삭제(값 없으면 `—`/미응답만).
- `SessionTable.tsx`: `BadgeLegend`의 note에서 "중단 규칙으로 끝난 검사는 …" 문장 삭제. `Track`의 소급 주석 정리(clamp 유지).

- [ ] **Step 9: `components/admin/AdminDetailView.tsx` 구현**

- import에서 `requiredWritingCodes`·`expectedTotalsFor` 제거.
- 105~111행을 교체:

```ts
const writtenCount = f.writingItems.filter(i => input.writing[i.code] !== undefined).length
const recordedCount = f.recordingPages.filter(p => byItem.has(p.code)).length
const expected = f.totals
const missingCount = Math.max(0, expected.rec - recordedCount) + Math.max(0, expected.write - writtenCount)
```

(중단 관련 주석 2개도 함께 삭제.)

- [ ] **Step 10: `lib/pdf/stamp-sheet.ts` 구현**

- import에서 `requiredWritingCodes` 제거.
- `stampGrid` 호출을 항상 전체 코드로: `r.discontinued.wordReading ? … : […]` 삼항을 `[...f.meaningReadCodes, ...f.nonsenseReadCodes]`로.
- 소계 조건에서 `!r.discontinued.*` 항 제거: `if (r.complete.wordReading) { put(meaning); put(nonsense); put(total) }`, 문장 문항 조건은 `v !== undefined && L.sentenceScores[i]`, 문장 총점 `if (r.complete.sentenceReading)`, 쓰기 `if (r.complete.writing)`.
- `stampWriting`에서 `required` 계산·필터 삭제(모든 입력값 사용).
- 중단 관련 주석 문장들(68~80행 등) 삭제 — "미채점 칸은 비운다(0점과 다르다)" 원칙 주석은 유지.

- [ ] **Step 11: 통과 확인**

Run: `npx vitest run tests/scoring.test.ts tests/adminStats.test.ts tests/stamp-sheet.test.ts tests/sheet-layout.test.ts`
Expected: PASS

- [ ] **Step 12: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add -A
git commit -m "feat: 채점·통계·결과지·PDF에서 중단 파생 제거 — 저장된 답 전부 산입"
```

---

### Task 8: 중단 함수·컬럼 최종 삭제 (survey-flow, db, migration 014)

이 시점에 `hitsCeiling`·`readingCeilingHit`·`isWritingWrong`·`writingCeilingHit`·`keepImplementedWriting`·`requiredWritingCodes`·`CEILING_N`의 소비처는 0이다(확인: `grep -rn "CeilingHit\|keepImplementedWriting\|requiredWritingCodes\|CEILING_N\|isWritingWrong" app/ components/ lib/ hooks/ --include="*.ts*"` 결과가 survey-flow.ts 자신뿐이어야 한다).

**Files:**
- Modify: `lib/survey-flow.ts`, `lib/db.ts`, `tests/survey-flow.test.ts`, `tests/adminStats.test.ts`(픽스처), `tests/admin-routes.test.ts`(픽스처에 discontinued_at 있으면)
- Create: `supabase/migrations/014_drop_discontinued.sql`
- Modify: `supabase/README.md`

- [ ] **Step 1: `tests/survey-flow.test.ts`를 새 파일로 교체**

```ts
import { describe, it, expect } from 'vitest'
import { itemsFor } from '@/lib/items'
import { formG1 } from '@/lib/forms/g1'
import { formG2 } from '@/lib/forms/g2'
import { canAdvance, visiblePages } from '@/lib/survey-flow'

const g1 = itemsFor(formG1)
const g2 = itemsFor(formG2)
```

(상단 import는 **기존 파일이 쓰던 form 가져오기 방식을 그대로 복사**한다 — `lib/forms`의 실제 export 이름이 다르면 그쪽을 따른다.) 이어서 Task 1에서 남겨 뒀던 `hitsCeiling`~`requiredWritingCodes` describe 전부를 삭제하고, Task 1의 visiblePages(연습)·canAdvance describe만 남긴다.

- [ ] **Step 2: `lib/survey-flow.ts`에서 중단 함수 삭제**

`CEILING_N`, `hitsCeiling`, `readingCeilingHit`, `isWritingWrong`, `writingCeilingHit`, `requiredWritingCodes`, `keepImplementedWriting`과 각 주석 삭제. `SurveyItem` import가 미사용이 되면 제거. 남는 것: 헤더 주석, `FlowState`, `visiblePages`, `canAdvance`.

- [ ] **Step 3: `lib/db.ts`에서 `discontinued_at` 제거**

- `SessionRow`에서 `discontinued_at: string | null` 필드와 주석 삭제.
- `SESSION_COLS` 문자열에서 `, discontinued_at` 제거.

- [ ] **Step 4: 테스트 픽스처에서 `discontinued_at` 제거**

`grep -rn "discontinued" tests/`로 남은 참조를 전부 찾아 픽스처 키를 제거한다(`tests/adminStats.test.ts:25` 등).

- [ ] **Step 5: 마이그레이션 작성**

`supabase/migrations/014_drop_discontinued.sql`:

```sql
-- 014_drop_discontinued.sql — 중단 규칙 폐기(담당자 확정 2026-08-13).
-- 검사 중 판정·사후 판정이 모두 사라져 컬럼의 존재 이유가 없다.
-- 배포 전 DB 전체 리셋이 예정돼 있어(사용자 확정 2026-08-13) 파괴적 변경을 그대로 쓴다.
-- 재실행 안전(idempotent).
alter table sessions drop column if exists discontinued_at;
```

`supabase/README.md`의 마이그레이션 표에 한 줄 추가: `014 | discontinued_at 컬럼 제거(중단 규칙 폐기 — 담당자 확정 2026-08-13)`.

- [ ] **Step 6: 소비처 0 확인 + 통과 확인**

```bash
grep -rn "CeilingHit\|keepImplementedWriting\|requiredWritingCodes\|CEILING_N\|isWritingWrong\|discontinued" app/ components/ lib/ hooks/ tests/ --include="*.ts*"
```
Expected: 결과 없음.
Run: `npx vitest run` → PASS

- [ ] **Step 7: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add -A
git commit -m "feat: 중단 규칙 함수·discontinued_at 컬럼 최종 삭제 (migration 014)"
```

---

### Task 9: 문서 갱신

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `lib/README.md`, `app/README.md`, `app/api/README.md`, `components/survey/README.md`(Task 3에서 못 다한 부분), `components/admin/README.md`, `tests/README.md`(중단 커버리지 언급 시), `docs/superpowers/specs/2026-08-11-discontinue-rules-design.md`

- [ ] **Step 1: `README.md` 개정**

- "문항 구성" 절: 표의 "쓰기 중단 규칙" 행 삭제. `⚠️ 단 하나의 예외 — 중단 규칙` 문단을 다음으로 교체:

> ⚠️ **시행 절차는 담당자 회신이 인쇄 문구를 이긴다.** 검사지에 인쇄된 중단 규칙(3연속 오반응 시 중단 등)은 **적용하지 않는다** — 담당자 확정(2026-08-13)으로 중단·현장 채점이 폐기됐고, 아동이 힘들면 녹음 버튼을 다시 눌러 스스로 멈춘다(그때까지 녹음 저장). 채점은 전부 관리자 결과지에서 한다. 근거: `docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md`.

- "미실시 · 미녹음의 표기" 절: 중단 행 삭제, 미녹음 행 유지. "사후 중단" 문단과 "중단 이후 문항의 답은 저장하지 않는다" 문단 삭제.
- 셋업 절 마이그레이션 목록에 `014` 추가.
- E2E 체크리스트에서 현장 채점·중단 항목(쓰기 1번 중단 등) 삭제, "낱말 녹음" 항목 뒤에 "읽다가 중간에 버튼을 눌러 멈추면 그때까지 녹음이 저장되는지" 추가.

- [ ] **Step 2: `CLAUDE.md` 규칙 2 개정**

"단 시행 절차는 예외" 문단의 중단 규칙 설명을 "현재: 중단 규칙 전체 미적용(담당자 확정 2026-08-13) — 근거 스펙 docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md"로 갱신.

- [ ] **Step 3: 폴더 README들** — `grep -rln "중단\|MarkPage\|현장 채점\|discontinued" */README.md lib/README.md`로 찾아 해당 문장 삭제·갱신.

- [ ] **Step 4: 2026-08-11 스펙에 폐기 표기** — 파일 최상단(제목 바로 아래)에 추가:

> **⚠️ 2026-08-13 폐기(superseded).** 이 문서의 중단 규칙 ①·②와 현장 채점은 담당자 확정(2026-08-13)으로 전면 폐기됐다 — `2026-08-13-admin-only-scoring-and-class-codes-design.md` 참고. 본문은 작성 시점 스냅샷으로 남긴다.

- [ ] **Step 5: 4종 검증 후 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git add -A
git commit -m "docs: 중단 규칙 폐기 반영 — README·CLAUDE.md·폴더 문서 개정"
```

---

### Task 10: 최종 검증 + PR

- [ ] **Step 1: 전체 검증**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git status --short   # next-env.d.ts 변경분이 있으면 git checkout next-env.d.ts
```

- [ ] **Step 2: 잔재 스캔**

```bash
grep -rn "중단\|ceiling\|Ceiling\|discontinued\|MarkPage\|marks" app/ components/ lib/ hooks/ --include="*.ts*" | grep -v "reading_marks\|initialMarks\|setMarks\|savedMarks\|rawMarks\|marks:" | head -30
```
관리자 채점(reading_marks 계열)이 아닌 잔재가 나오면 정리.

- [ ] **Step 3: PR 생성**

```bash
git push -u origin feat/admin-only-scoring-and-class-codes
gh pr create --title "feat: 중단·현장채점 제거 — 관리자 전담 채점 전환" --body "$(cat <<'EOF'
## 요약
- 검사자 현장 채점(MarkPage)·중단 규칙 ①·②(즉시 중단 + 사후 파생) 전면 제거 — 담당자 확정(2026-08-13)
- 검사 화면은 수집만, 채점은 관리자 결과지 전담. 읽은 것은 전부 산입.
- 유지: 쓰기 검사자 입력, 미녹음 기본채점(X·0), reading_marks(관리자 채점 저장소)
- migration 014: sessions.discontinued_at drop (배포 전 DB 리셋 전제)

스펙: docs/superpowers/specs/2026-08-13-admin-only-scoring-and-class-codes-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

머지 후 PR B(`docs/superpowers/plans/2026-08-13-class-codes.md`)를 이 브랜치에서 분기해 진행한다.
