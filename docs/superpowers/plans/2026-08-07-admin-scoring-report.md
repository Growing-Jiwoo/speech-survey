# 관리자 채점·결과지 (3단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자가 녹음을 들으며 점수를 매기면 검사지 양식의 결과지가 나오도록 한다 — 낱말 O/X 14개 + 문장 어절 수 4칸 입력 → 자동 합산 → Pass/Fail(임시 기준) 판정 → 인쇄.

**Architecture:** 채점 계산은 `lib/scoring.ts` 순수 함수에 몰아 넣고(화면·API·인쇄가 같은 값을 쓰도록), 입력은 관리자 결과지 화면에서 직접 하고 전용 API로 저장한다. **문장 배점은 하드코딩하지 않는다** — 검사지의 7/7/8/14가 문장 텍스트의 어절 수와 정확히 일치하므로 `text.trim().split(/\s+/).length`로 유도한다(문항이 바뀌어도 배점이 따라간다). 낱말 채점은 이미 있는 `reading_marks`를 14개 전체로 확장해 재사용하고(현장 채점 7개가 그대로 초기값이 된다), 문장 어절 수만 새 테이블에 담는다.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase · Zod · Vitest

**검사지 근거 (KODYS-G1):**
- 낱말 해독: 의미 7 + 무의미 7 = **/14** (30초 내 정확 반응 수)
- 문장 읽기유창성: 7 + 7 + 8 + 14 = **/36** (40초 내 정확 어절 수)
- 낱말 쓰기: 의미 5 + 무의미 5 = **/10** (이미 검사 중 수집됨 — 재입력 불필요)
- 검사자 체크리스트 (이미 수집됨)
- 검사지 헤더에 **검사자: 교사 / 전문가** 구분란이 있으나 현재 수집하지 않음 → 이번에 추가

**담당자 확정:** Pass/Fail 기준 점수는 아직 미정. **"대강 입력해둬도 괜찮다"**고 확인받았으므로 임시값을 넣되, 화면·인쇄물에 **"임시 기준 · 확정 전"**을 반드시 표시한다(시범 운영 중 나온 판정이 실제 판정으로 오해되지 않도록).

---

## 이 계획에 포함되지 않는 것

- 픽셀 단위로 검사지를 재현한 별도 인쇄 레이아웃 — 우선 기능이 도는 결과지를 만들고 담당자 반응을 본다(담당자: "일단 구현해두고 결과물 보고 다시 얘기하자")
- 채점 이력·감사 로그(누가 언제 고쳤는지). 관리자 계정이 단일 비밀번호라 행위자 특정이 불가능해 의미가 적다.

---

## File Structure

**신규**
| 경로 | 책임 |
|---|---|
| `lib/scoring.ts` | 배점·합산·Pass/Fail 판정(순수 함수) |
| `supabase/migrations/011_scoring.sql` | 문장 점수 테이블 + 검사자 구분 컬럼 |
| `app/api/admin/sessions/[id]/scores/route.ts` | 채점 저장(PUT) |
| `components/admin/ScoreSheet.tsx` | 결과지 — 채점 입력 + 합산 + 판정 |
| `tests/scoring.test.ts` | 배점·합산·판정 |

**수정**
| 경로 | 변경 |
|---|---|
| `lib/db.ts` | `sentence_scores` 저장/조회, `examiner_type` |
| `lib/schema.ts` | 검사자 구분 |
| `app/page.tsx` | 검사자(교사/전문가) 선택 |
| `app/api/sessions/route.ts` | 검사자 구분 전달 |
| `app/api/admin/sessions/[id]/route.ts` | 상세 응답에 문장 점수 포함 |
| `hooks/useAdminQueries.ts` | 상세 타입에 문장 점수 |
| `components/admin/AdminDetailView.tsx` | ScoreSheet 삽입, 검사자 표시, 인쇄 버튼 |
| `app/globals.css` | 인쇄용 스타일 |

---

## Task 1: 채점 로직 (`lib/scoring.ts`)

**Files:**
- Create: `lib/scoring.ts`
- Test: `tests/scoring.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/scoring.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  PASS_MARK, PROVISIONAL_CRITERIA, SENTENCE_MAX, TASK_MAX,
  sentenceMaxWords, scoreSession, type ScoreInput,
} from '@/lib/scoring'
import { itemByCode } from '@/lib/items'

const empty: ScoreInput = { marks: {}, sentences: {}, writing: {} }

describe('배점 — 검사지 대조', () => {
  it('문장 배점은 어절 수에서 유도된다 (7·7·8·14)', () => {
    expect(sentenceMaxWords(itemByCode.get('rs01')!)).toBe(7)
    expect(sentenceMaxWords(itemByCode.get('rs02')!)).toBe(7)
    expect(sentenceMaxWords(itemByCode.get('rs03')!)).toBe(8)
    expect(sentenceMaxWords(itemByCode.get('rs04')!)).toBe(14)
  })
  it('과제별 만점: 낱말 14 · 문장 36 · 쓰기 10', () => {
    expect(TASK_MAX).toEqual({ wordReading: 14, sentenceReading: 36, wordWriting: 10 })
    expect(SENTENCE_MAX).toBe(36)
  })
  it('임시 Pass 기준이 만점보다 작고 0보다 크다 (확정 전 표시 대상)', () => {
    expect(PROVISIONAL_CRITERIA).toBe(true)
    expect(PASS_MARK.wordReading).toBeGreaterThan(0)
    expect(PASS_MARK.wordReading).toBeLessThan(TASK_MAX.wordReading)
    expect(PASS_MARK.sentenceReading).toBeLessThan(TASK_MAX.sentenceReading)
    expect(PASS_MARK.wordWriting).toBeLessThan(TASK_MAX.wordWriting)
  })
})

describe('scoreSession — 합산', () => {
  it('아무것도 채점하지 않으면 전부 0점', () => {
    const r = scoreSession(empty)
    expect(r.wordMeaning).toBe(0)
    expect(r.wordNonsense).toBe(0)
    expect(r.wordReading).toBe(0)
    expect(r.sentenceReading).toBe(0)
    expect(r.wordWriting).toBe(0)
  })

  it('낱말은 정반응(true)만 센다 — 의미/무의미를 나눠서도 집계', () => {
    const r = scoreSession({ ...empty, marks: {
      rw01: true, rw02: true, rw03: false, rw04: true,   // 의미 3점
      rw08: true, rw09: false, rw10: true,               // 무의미 2점
    } })
    expect(r.wordMeaning).toBe(3)
    expect(r.wordNonsense).toBe(2)
    expect(r.wordReading).toBe(5)
  })

  it('문장은 입력한 어절 수를 더한다', () => {
    const r = scoreSession({ ...empty, sentences: { rs01: 7, rs02: 5, rs03: 0, rs04: 10 } })
    expect(r.sentenceReading).toBe(22)
  })

  it('문장 점수는 해당 문항 만점을 넘지 못한다 (오입력 방어)', () => {
    const r = scoreSession({ ...empty, sentences: { rs01: 999 } })
    expect(r.sentenceReading).toBe(7)
  })

  it('음수 문장 점수는 0으로 본다', () => {
    expect(scoreSession({ ...empty, sentences: { rs01: -5 } }).sentenceReading).toBe(0)
  })

  it('쓰기는 검사 중 수집한 예(true)를 1점으로 센다', () => {
    const r = scoreSession({ ...empty, writing: { ww01: true, ww02: false, ww03: true } })
    expect(r.wordWriting).toBe(2)
  })

  it('낱말 해독 만점', () => {
    const all = Object.fromEntries(
      ['rw01','rw02','rw03','rw04','rw05','rw06','rw07',
       'rw08','rw09','rw10','rw11','rw12','rw13','rw14'].map(c => [c, true]))
    expect(scoreSession({ ...empty, marks: all }).wordReading).toBe(14)
  })
})

describe('scoreSession — Pass/Fail 판정', () => {
  it('기준 이상이면 pass, 미만이면 fail', () => {
    const pass = scoreSession({ ...empty, sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 } })
    expect(pass.sentenceReading).toBe(36)
    expect(pass.verdict.sentenceReading).toBe('pass')
    expect(scoreSession(empty).verdict.sentenceReading).toBe('fail')
  })

  it('기준값과 정확히 같으면 pass (경계 포함)', () => {
    const marks = Object.fromEntries(
      Array.from({ length: PASS_MARK.wordReading }, (_, i) => [`rw${String(i + 1).padStart(2, '0')}`, true]))
    const r = scoreSession({ ...empty, marks })
    expect(r.wordReading).toBe(PASS_MARK.wordReading)
    expect(r.verdict.wordReading).toBe('pass')
  })

  it('과제별로 따로 판정한다', () => {
    const r = scoreSession(empty)
    expect(Object.keys(r.verdict).sort()).toEqual(['sentenceReading', 'wordReading', 'wordWriting'])
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/scoring.test.ts`
Expected: FAIL — `Cannot find module '@/lib/scoring'`

- [ ] **Step 3: 구현**

Create `lib/scoring.ts`:

```ts
// lib/scoring.ts — 검사지 채점 규칙(배점·합산·Pass/Fail). 순수 함수만 둔다.
// 화면·저장 API·인쇄가 모두 이 파일 하나로 점수를 계산해, 표시되는 값과 저장되는 값이 어긋나지 않게 한다.
import { ITEMS, MEANING_READ_CODES, itemByCode, type SurveyItem } from './items'

/** 문장 배점 = 어절 수. 검사지의 7·7·8·14가 문항 텍스트의 어절 수와 정확히 일치하므로
 *  숫자를 따로 적어두지 않고 유도한다 — 문항이 바뀌면 배점이 자동으로 따라간다. */
export function sentenceMaxWords(item: SurveyItem): number {
  return item.text.trim().split(/\s+/).length
}

const SENTENCE_ITEMS = ITEMS.filter(i => i.section === 'sentence_reading')
const READ_CODES = ITEMS.filter(i => i.section === 'word_reading').map(i => i.code)
const NONSENSE_READ_CODES = READ_CODES.filter(c => !MEANING_READ_CODES.includes(c))
const WRITE_CODES = ITEMS.filter(i => i.section === 'word_writing').map(i => i.code)

export const SENTENCE_MAX = SENTENCE_ITEMS.reduce((sum, i) => sum + sentenceMaxWords(i), 0)

/** 과제별 만점(검사지) */
export const TASK_MAX = {
  wordReading: READ_CODES.length,
  sentenceReading: SENTENCE_MAX,
  wordWriting: WRITE_CODES.length,
} as const

/**
 * ⚠️ 임시 Pass 기준 — 담당자에게 실제 기준표를 받기 전까지 쓰는 값(만점의 약 65%).
 * 담당자 확인: "점수 기준이 아직 명확하지 않은데 대강 입력해둬도 괜찮다."
 * 임의의 숫자이므로 화면·인쇄물에 반드시 "임시 기준 · 확정 전"을 함께 표시한다
 * (시범 운영 중 나온 판정이 실제 판정으로 학교에 전달되는 것을 막기 위함).
 * 실제 기준표가 오면 이 숫자만 바꾸면 되고, 이미 채점한 세션도 저장된 점수로 다시 계산된다.
 */
export const PROVISIONAL_CRITERIA = true
export const PASS_MARK = {
  wordReading: 9,        // /14
  sentenceReading: 23,   // /36
  wordWriting: 6,        // /10
} as const

export type TaskKey = keyof typeof TASK_MAX
export type Verdict = 'pass' | 'fail'

export interface ScoreInput {
  /** 낱말 해독 itemCode(rw01~rw14) → 정반응 여부 */
  marks: Partial<Record<string, boolean>>
  /** 문장 itemCode(rs01~rs04) → 제한 시간 내 정확히 읽은 어절 수 */
  sentences: Partial<Record<string, number>>
  /** 낱말 쓰기 itemCode(ww01~ww10) → 정확히 씀 (검사 중 수집) */
  writing: Partial<Record<string, boolean>>
}

export interface ScoreResult {
  wordMeaning: number
  wordNonsense: number
  wordReading: number
  sentenceReading: number
  wordWriting: number
  verdict: Record<TaskKey, Verdict>
}

const countTrue = (codes: string[], m: Partial<Record<string, boolean>>) =>
  codes.reduce((n, c) => n + (m[c] === true ? 1 : 0), 0)

/** 문항 만점을 넘거나 음수인 입력은 잘라낸다 — 오입력이 총점을 왜곡하지 않도록. */
function clampSentence(code: string, raw: number | undefined): number {
  const item = itemByCode.get(code)
  if (!item || raw == null || !Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(Math.floor(raw), sentenceMaxWords(item)))
}

export function scoreSession(s: ScoreInput): ScoreResult {
  const wordMeaning = countTrue(MEANING_READ_CODES, s.marks)
  const wordNonsense = countTrue(NONSENSE_READ_CODES, s.marks)
  const wordReading = wordMeaning + wordNonsense
  const sentenceReading = SENTENCE_ITEMS.reduce((sum, i) => sum + clampSentence(i.code, s.sentences[i.code]), 0)
  const wordWriting = countTrue(WRITE_CODES, s.writing)
  const at = (v: number, mark: number): Verdict => (v >= mark ? 'pass' : 'fail')
  return {
    wordMeaning, wordNonsense, wordReading, sentenceReading, wordWriting,
    verdict: {
      wordReading: at(wordReading, PASS_MARK.wordReading),
      sentenceReading: at(sentenceReading, PASS_MARK.sentenceReading),
      wordWriting: at(wordWriting, PASS_MARK.wordWriting),
    },
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/scoring.test.ts && npx tsc --noEmit`
Expected: PASS, 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add lib/scoring.ts tests/scoring.test.ts
git commit -m "feat(scoring): 검사지 배점·합산·임시 Pass 기준 순수 함수"
```

---

## Task 2: 마이그레이션 + DB (문장 점수 · 검사자 구분)

**Files:**
- Create: `supabase/migrations/011_scoring.sql`
- Modify: `lib/db.ts`
- Test: `tests/db.test.ts`

- [ ] **Step 1: 마이그레이션**

Create `supabase/migrations/011_scoring.sql`:

```sql
-- 011_scoring.sql — 관리자 채점(3단계): 문장 어절 점수 저장 + 검사자 구분.
-- ① 문장 읽기유창성은 "제한 시간 내 정확히 읽은 어절 수"라 O/X가 아닌 정수다 →
--    boolean인 reading_marks와 타입이 달라 별도 테이블에 담는다.
--    (낱말 해독 14개의 O/X는 reading_marks를 그대로 재사용한다 — 현장 채점 7개가 초기값이 된다.)
-- ② 검사지 헤더의 "교사 / 전문가" 구분을 수집한다. 도입 전 수집분은 null.
-- 비파괴적·재실행 안전(idempotent). Supabase SQL Editor에서 직접 실행할 것.

create table if not exists sentence_scores (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  item_code  text not null,          -- rs01~rs04
  words      int  not null check (words >= 0),
  unique (session_id, item_code)
);

create index if not exists sentence_scores_session_id_idx on sentence_scores(session_id);

alter table sentence_scores enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근 (001과 동일 방침).

alter table sessions add column if not exists examiner_type text
  check (examiner_type in ('teacher', 'expert'));
```

**이 파일은 만들고 커밋만 할 것 — DB에 직접 실행하지 말 것**(권한 없음). 컨트롤러가 별도로 적용한다.

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/db.test.ts` 맨 아래에 추가한다. 이 파일의 기존 스텁(`enqueue`로 테이블별 응답을 큐에 넣고 `fromCalls`로 접근 테이블을 기록하는 프록시, 상수 `SID`)을 그대로 쓴다.

```ts
describe('saveScores — 관리자 채점 저장', () => {
  it('낱말 O/X는 reading_marks에, 문장 어절 수는 sentence_scores에 upsert한다', async () => {
    enqueue('reading_marks', { error: null })
    enqueue('sentence_scores', { error: null })
    await saveScores(SID,
      [{ itemCode: 'rw01', correct: true }, { itemCode: 'rw08', correct: false }],
      [{ itemCode: 'rs01', words: 7 }])
    expect(fromCalls).toContain('reading_marks')
    expect(fromCalls).toContain('sentence_scores')
  })

  it('빈 배열은 해당 테이블을 건드리지 않는다', async () => {
    enqueue('reading_marks', { error: null })
    await saveScores(SID, [{ itemCode: 'rw01', correct: true }], [])
    expect(fromCalls).not.toContain('sentence_scores')
  })

  it('저장 실패는 삼키지 않고 throw한다 (채점 결과의 조용한 손실 방지)', async () => {
    enqueue('reading_marks', { error: { message: 'boom' } })
    await expect(saveScores(SID, [{ itemCode: 'rw01', correct: true }], []))
      .rejects.toThrow('boom')
  })
})
```

파일 상단의 `import { ... } from '@/lib/db'`에 `saveScores`를 추가한다.

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — `saveScores`가 없음

- [ ] **Step 4: `lib/db.ts` 구현**

`ReadingMark` 인터페이스 아래에 추가한다.

```ts
/** 문장 읽기유창성 채점 — 제한 시간 내 정확히 읽은 어절 수 */
export interface SentenceScore { itemCode: string; words: number }
```

`submitSession` 아래(같은 영역)에 추가한다.

```ts
/**
 * 관리자 채점 저장. 낱말 O/X는 reading_marks(현장 채점과 같은 테이블 — 관리자가 확정값으로 덮어쓴다),
 * 문장 어절 수는 sentence_scores에 upsert한다. 제출 여부와 무관하게 언제든 다시 채점할 수 있다.
 */
export async function saveScores(
  sessionId: string, marks: ReadingMark[], sentences: SentenceScore[],
): Promise<void> {
  if (marks.length > 0) {
    const rows = marks.map(m => ({ session_id: sessionId, item_code: m.itemCode, correct: m.correct }))
    const { error } = await sb().from('reading_marks').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(error)
  }
  if (sentences.length > 0) {
    const rows = sentences.map(s => ({ session_id: sessionId, item_code: s.itemCode, words: s.words }))
    const { error } = await sb().from('sentence_scores').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(error)
  }
}
```

`SessionRow`에 검사자 구분을 추가한다(기존 필드 뒤에).

```ts
  /** 검사지 헤더의 "교사 / 전문가" 구분. 도입 전(011 이전) 수집분은 null */
  examiner_type: 'teacher' | 'expert' | null
```

`SESSION_COLS`에 `examiner_type`을 더한다(문자열 끝 `guardian_consented_at` 뒤).

```ts
const SESSION_COLS = 'id, school_region, school_id, school_name, birth_ymd, grade, class_no, gender, child_name, teacher_name, teacher_phone, teacher_email, teacher_contact, checklist, started_at, submitted_at, guardian_consented_at, examiner_type'
```

`NewSessionInput`에 추가하고, `createSession`의 insert에도 넣는다.

```ts
  examinerType: 'teacher' | 'expert'
```

insert 객체에 한 줄 추가:

```ts
    examiner_type: s.examinerType,
```

`MarkRow` 정의 옆에 행 타입을 추가한다.

```ts
export interface SentenceScoreRow { item_code: string; words: number }
```

`sessionDetail` 전체를 아래로 교체한다(쿼리가 5개로 늘어 구조분해·`fail`·반환 객체가 모두 바뀌므로 통째로 갈아끼우는 편이 안전하다).

```ts
export async function sessionDetail(sessionId: string): Promise<{
  session: SessionRow; recordings: RecordingRow[]; writing: WritingRow[]
  marks: MarkRow[]; sentences: SentenceScoreRow[]
}> {
  const [{ data: s, error: e1 }, { data: recs, error: e2 }, { data: ans, error: e3 },
    { data: mk, error: e4 }, { data: ss, error: e5 }] = await Promise.all([
      sb().from('sessions').select(SESSION_COLS).eq('id', sessionId).single(),
      sb().from('recordings').select('item_code, attempt_no, audio_path, duration_sec, created_at')
        .eq('session_id', sessionId).order('item_code').order('attempt_no'),
      sb().from('writing_answers').select('item_code, can_write').eq('session_id', sessionId),
      sb().from('reading_marks').select('item_code, correct').eq('session_id', sessionId),
      sb().from('sentence_scores').select('item_code, words').eq('session_id', sessionId),
    ])
  fail(e1); fail(e2); fail(e3); fail(e4); fail(e5)
  return {
    session: s as unknown as SessionRow,
    recordings: (recs ?? []) as RecordingRow[],
    writing: (ans ?? []) as WritingRow[],
    marks: (mk ?? []) as MarkRow[],
    sentences: (ss ?? []) as SentenceScoreRow[],
  }
}
```

- [ ] **Step 5: 검증**

Run: `npx vitest run tests/db.test.ts && npx tsc --noEmit`
Expected: `db.test.ts` PASS. `tsc`는 `createSession` 호출부(`app/api/sessions/route.ts`)와 `sessionDetail` 소비부에서 오류가 날 수 있다 — **Task 3·5에서 고치므로 여기서는 어떤 오류가 났는지 보고만 한다.**

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/011_scoring.sql lib/db.ts tests/db.test.ts
git commit -m "feat(db): 문장 어절 점수 테이블과 검사자 구분"
```

---

## Task 3: 검사자 구분 — 스키마·폼·세션 생성

**Files:**
- Modify: `lib/schema.ts`, `app/api/sessions/route.ts`, `app/page.tsx`
- Test: `tests/schema.test.ts`, `tests/sessions-route.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`tests/schema.test.ts`의 `VALID`에 `examinerType: 'teacher',`를 추가하고, 아래 블록을 파일 맨 아래에 더한다.

```ts
describe('검사자 구분(examinerType)', () => {
  it("'teacher'와 'expert'만 허용한다", () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, examinerType: 'teacher' }).success).toBe(true)
    expect(sessionCreateSchema.safeParse({ ...VALID, examinerType: 'expert' }).success).toBe(true)
  })
  it('그 외 값·누락은 거부한다 (검사지 헤더의 필수 구분란)', () => {
    expect(sessionCreateSchema.safeParse({ ...VALID, examinerType: '기타' }).success).toBe(false)
    const { examinerType: _omit, ...without } = VALID
    expect(sessionCreateSchema.safeParse(without).success).toBe(false)
  })
})
```

`tests/sessions-route.test.ts`의 `VALID`에도 `examinerType: 'teacher',`를 추가하고, `createSession` 호출 인자 단언에 `examinerType: 'teacher'`를 더한다.

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/schema.test.ts tests/sessions-route.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`lib/schema.ts`의 `sessionCreateSchema` 객체에 한 줄 추가한다(`guardianConsent` 앞).

```ts
  // 검사지 헤더의 "교사 / 전문가" 구분
  examinerType: z.enum(['teacher', 'expert']),
```

`app/api/sessions/route.ts`의 `createSession` 호출에 추가한다.

```ts
      examinerType: d.examinerType,
```

`app/page.tsx`:
- 상태 추가: `const [examinerType, setExaminerType] = useState<'teacher' | 'expert' | ''>('')`
- `FieldKey`/`FIELD_ORDER`에 `'examiner'` 추가(`teacher` 뒤)
- 검증 추가: `if (examinerType === '') next.examiner = '검사자 구분을 선택해 주세요.'`
- 전송 바디에 `examinerType,` 추가
- `filled`에 `&& examinerType` 추가
- 담임교사명 칸 아래에 성별과 같은 토글 버튼 UI를 넣는다.

```tsx
        <div>
          <span className={labelCls} id="examiner-label">검사자</span>
          <div className="mt-1.5 flex gap-2.5" data-field="examiner" role="group" aria-labelledby="examiner-label"
            aria-describedby={errors.examiner ? 'err-examiner' : undefined}>
            {([['교사', 'teacher'], ['전문가', 'expert']] as const).map(([label, v]) => (
              <button key={v} type="button" onClick={() => setExaminerType(v)} aria-pressed={examinerType === v}
                className={`h-[50px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
                  examinerType === v ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
                {label}
              </button>
            ))}
          </div>
          <FieldError id="err-examiner" msg={errors.examiner} />
        </div>
```

- [ ] **Step 4: 검증**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add lib/schema.ts app/api/sessions/route.ts app/page.tsx tests/schema.test.ts tests/sessions-route.test.ts
git commit -m "feat(session): 검사자(교사/전문가) 구분 수집"
```

---

## Task 4: 채점 저장 API

**Files:**
- Create: `app/api/admin/sessions/[id]/scores/route.ts`
- Test: `tests/scores-route.test.ts`

> `middleware.ts`가 `/api/admin/*`를 이미 관리자 세션 쿠키로 막고 있으므로 이 라우트에 별도 인증을 넣지 않는다(다른 admin 라우트와 동일).

- [ ] **Step 1: 실패하는 테스트 작성**

Create `tests/scores-route.test.ts`. `tests/admin-routes.test.ts`의 모킹 방식(`vi.mock('@/lib/db')`)을 그대로 따른다 — **먼저 그 파일을 읽고 스타일을 맞출 것.**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ saveScores: vi.fn().mockResolvedValue(undefined) }))

import { PUT } from '@/app/api/admin/sessions/[id]/scores/route'
import * as db from '@/lib/db'

const SID = '11111111-1111-4111-8111-111111111111'
const ctx = (id = SID) => ({ params: Promise.resolve({ id }) })
const req = (body: unknown) => new Request('http://x', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => { vi.clearAllMocks(); vi.mocked(db.saveScores).mockResolvedValue(undefined) })

describe('PUT /api/admin/sessions/[id]/scores', () => {
  it('낱말 O/X와 문장 어절 수를 저장한다', async () => {
    const res = await PUT(req({ marks: { rw01: true, rw14: false }, sentences: { rs01: 7 } }), ctx())
    expect(res.status).toBe(200)
    expect(db.saveScores).toHaveBeenCalledWith(SID,
      [{ itemCode: 'rw01', correct: true }, { itemCode: 'rw14', correct: false }],
      [{ itemCode: 'rs01', words: 7 }])
  })

  it('낱말 해독 14개 코드를 모두 허용한다 (무의미 낱말 포함)', async () => {
    expect((await PUT(req({ marks: { rw08: true }, sentences: {} }), ctx())).status).toBe(200)
  })

  it('낱말 해독이 아닌 코드는 400', async () => {
    expect((await PUT(req({ marks: { ww01: true }, sentences: {} }), ctx())).status).toBe(400)
    expect(db.saveScores).not.toHaveBeenCalled()
  })

  it('문장이 아닌 코드는 400', async () => {
    expect((await PUT(req({ marks: {}, sentences: { rw01: 3 } }), ctx())).status).toBe(400)
  })

  it('문장 점수가 정수가 아니거나 음수면 400', async () => {
    expect((await PUT(req({ marks: {}, sentences: { rs01: 1.5 } }), ctx())).status).toBe(400)
    expect((await PUT(req({ marks: {}, sentences: { rs01: -1 } }), ctx())).status).toBe(400)
  })

  it('문항 만점을 넘는 어절 수는 400 (rs01은 7어절)', async () => {
    expect((await PUT(req({ marks: {}, sentences: { rs01: 8 } }), ctx())).status).toBe(400)
  })

  it('낱말 값이 boolean이 아니면 400', async () => {
    expect((await PUT(req({ marks: { rw01: 'yes' }, sentences: {} }), ctx())).status).toBe(400)
  })

  it('세션 id가 UUID가 아니면 400', async () => {
    expect((await PUT(req({ marks: {}, sentences: {} }), ctx('../etc/passwd'))).status).toBe(400)
    expect(db.saveScores).not.toHaveBeenCalled()
  })

  it('DB 오류는 502로 감싸고 원본 메시지를 노출하지 않는다', async () => {
    vi.mocked(db.saveScores).mockRejectedValueOnce(new Error('secret connection string'))
    const res = await PUT(req({ marks: { rw01: true }, sentences: {} }), ctx())
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/secret connection string/)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/scores-route.test.ts`
Expected: FAIL — 라우트 없음

- [ ] **Step 3: 구현**

Create `app/api/admin/sessions/[id]/scores/route.ts`:

```ts
// PUT /api/admin/sessions/[id]/scores — 관리자 채점 저장(낱말 O/X · 문장 어절 수).
// 인증은 middleware가 /api/admin/* 전체에 걸어 둔다(다른 admin 라우트와 동일).
import { NextResponse } from 'next/server'
import { saveScores, type ReadingMark, type SentenceScore } from '@/lib/db'
import { ITEMS, itemByCode } from '@/lib/items'
import { sentenceMaxWords } from '@/lib/scoring'
import { UUID_RE, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const READ_CODES = new Set(ITEMS.filter(i => i.section === 'word_reading').map(i => i.code))
const SENTENCE_CODES = new Set(ITEMS.filter(i => i.section === 'sentence_reading').map(i => i.code))
const bad = (msg: string) => jsonError(msg, 400)

/** 본문의 객체형 필드(코드 → 값)를 안전하게 꺼낸다. 객체가 아니면 null. */
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 세션 id입니다.', 400)

  const b = await req.json().catch(() => ({}))
  const rawMarks = asRecord(b.marks)
  const rawSentences = asRecord(b.sentences)
  if (!rawMarks || !rawSentences) return bad('채점 형식 오류')

  const marks: ReadingMark[] = []
  for (const [itemCode, correct] of Object.entries(rawMarks)) {
    if (!READ_CODES.has(itemCode) || typeof correct !== 'boolean') return bad('낱말 채점 형식 오류')
    marks.push({ itemCode, correct })
  }

  const sentences: SentenceScore[] = []
  for (const [itemCode, words] of Object.entries(rawSentences)) {
    if (!SENTENCE_CODES.has(itemCode) || typeof words !== 'number'
      || !Number.isInteger(words) || words < 0
      || words > sentenceMaxWords(itemByCode.get(itemCode)!))
      return bad('문장 채점 형식 오류')
    sentences.push({ itemCode, words })
  }

  try {
    await saveScores(id, marks, sentences)
  } catch (e) {
    console.error('[admin/scores] 저장 실패', e)
    return jsonError('채점 저장에 실패했습니다.', 502)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 검증**

Run: `npx vitest run tests/scores-route.test.ts && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add "app/api/admin/sessions/[id]/scores/route.ts" tests/scores-route.test.ts
git commit -m "feat(api): 관리자 채점 저장 라우트"
```

---

## Task 5: 결과지 화면 (`ScoreSheet`)

**Files:**
- Create: `components/admin/ScoreSheet.tsx`
- Modify: `app/api/admin/sessions/[id]/route.ts`, `hooks/useAdminQueries.ts`, `components/admin/AdminDetailView.tsx`

- [ ] **Step 1: 상세 응답에 문장 점수 싣기**

`app/api/admin/sessions/[id]/route.ts`의 `GET`에서 `sentences`를 함께 구조분해해 응답에 넣는다.

```ts
    const { session, recordings, writing, marks, sentences } = await sessionDetail(id)
    ...
    return NextResponse.json({ session, recordings: withUrls, writing, marks, sentences })
```

`hooks/useAdminQueries.ts`의 `SessionDetailData`에 추가하고 `@/lib/db` import에 `SentenceScoreRow`를 더한다.

```ts
  /** 문장 읽기유창성 채점(어절 수) */
  sentences: SentenceScoreRow[]
```

- [ ] **Step 2: `ScoreSheet` 구현**

Create `components/admin/ScoreSheet.tsx`:

```tsx
// components/admin/ScoreSheet.tsx — 결과지(채점 입력 + 합산 + Pass/Fail).
// 검사지 순서 그대로: 낱말 해독(의미/무의미 O/X) → 문장 읽기유창성(어절 수) → 낱말 쓰기(검사 중 수집) → 총평.
// 낱말 O/X의 초기값은 검사 현장에서 검사자가 표시한 값(reading_marks)이고, 관리자가 녹음을 들으며 고친다.
'use client'
import { useState } from 'react'
import { ITEMS, KIND_LABEL, MEANING_READ_CODES } from '@/lib/items'
import { PASS_MARK, PROVISIONAL_CRITERIA, TASK_MAX, scoreSession, sentenceMaxWords } from '@/lib/scoring'
import { requestJson } from '@/lib/http'
import { Badge } from '@/components/Badge'

const READ_ITEMS = ITEMS.filter(i => i.section === 'word_reading')
const SENTENCE_ITEMS = ITEMS.filter(i => i.section === 'sentence_reading')

export function ScoreSheet({ sessionId, initialMarks, initialSentences, writing }: {
  sessionId: string
  initialMarks: Record<string, boolean>
  initialSentences: Record<string, number>
  /** 낱말 쓰기는 검사 중 수집돼 여기서 다시 채점하지 않는다(예=1점) */
  writing: Record<string, boolean>
}) {
  const [marks, setMarks] = useState(initialMarks)
  const [sentences, setSentences] = useState(initialSentences)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const r = scoreSession({ marks, sentences, writing })

  async function save() {
    setSaving(true); setMsg('')
    // requestJson은 init으로 { method?, body? }만 받고, body가 있으면 Content-Type과 직렬화를 스스로 한다.
    // (headers를 넘기거나 JSON.stringify를 미리 하면 타입 오류가 난다 — lib/http.ts 참고)
    const res = await requestJson(`/api/admin/sessions/${sessionId}/scores`,
      { method: 'PUT', body: { marks, sentences } },
      '채점 저장에 실패했어요. 다시 시도해 주세요.')
    setSaving(false)
    setMsg(res.ok ? '저장했어요.' : res.error)
  }

  const verdictBadge = (v: 'pass' | 'fail') =>
    v === 'pass' ? <Badge tone="mint">Pass</Badge> : <Badge tone="rec">Fail</Badge>

  return (
    <section className="border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h2 className="text-[13px] font-bold text-ink-soft">결과지 — 채점</h2>
        {PROVISIONAL_CRITERIA && (
          // 임시 기준으로 나온 Pass/Fail이 실제 판정으로 학교에 전달되지 않도록 화면·인쇄물 모두에 남긴다.
          <span className="rounded-lg border border-amber/50 bg-amber/10 px-2 py-1 text-[11px] font-bold text-amber">
            임시 기준 · 확정 전
          </span>
        )}
      </div>

      {/* 낱말 해독 — 녹음을 들으며 O/X */}
      <h3 className="px-5 pt-4 text-xs font-bold text-ink-mute">낱말 해독 (30초 내 정확 반응)</h3>
      <ul className="grid gap-1.5 px-5 pt-2 sm:grid-cols-2">
        {READ_ITEMS.map(item => (
          <li key={item.code} className="flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5">
            <span className="w-9 flex-none text-[10px] font-bold text-ink-mute">
              {KIND_LABEL[item.kind!]}
            </span>
            <span className="font-read min-w-0 flex-1 truncate text-base">{item.text}</span>
            <div className="flex flex-none gap-1">
              {([['O', true], ['X', false]] as const).map(([label, v]) => (
                <button key={label} type="button" aria-pressed={marks[item.code] === v}
                  aria-label={`${item.text} ${v ? '정반응' : '오반응'}`}
                  onClick={() => setMarks(m => ({ ...m, [item.code]: v }))}
                  className={`h-8 w-8 rounded-md border-[1.5px] font-read text-sm font-bold transition ${
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
      <p className="px-5 pt-2 text-xs text-ink-soft">
        의미 <b>{r.wordMeaning}</b> / {MEANING_READ_CODES.length} ·
        무의미 <b>{r.wordNonsense}</b> / {READ_ITEMS.length - MEANING_READ_CODES.length} ·
        총 <b className="text-blue">{r.wordReading}</b> / {TASK_MAX.wordReading} {verdictBadge(r.verdict.wordReading)}
      </p>

      {/* 문장 읽기유창성 — 어절 수 입력 */}
      <h3 className="px-5 pt-5 text-xs font-bold text-ink-mute">문장 읽기유창성 (40초 내 정확 어절 수)</h3>
      <ul className="flex flex-col gap-1.5 px-5 pt-2">
        {SENTENCE_ITEMS.map((item, i) => {
          const max = sentenceMaxWords(item)
          return (
            <li key={item.code} className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2">
              <span className="w-4 flex-none text-xs font-bold text-ink-mute">{i + 1}</span>
              <span className="font-read min-w-0 flex-1 whitespace-pre-line break-keep text-[13px]">{item.text}</span>
              <div className="flex flex-none items-center gap-1">
                <input type="number" min={0} max={max} inputMode="numeric"
                  aria-label={`${i + 1}번 문장 정확 어절 수 (최대 ${max})`}
                  value={sentences[item.code] ?? ''}
                  onChange={e => {
                    const n = e.target.value === '' ? undefined : Number(e.target.value)
                    setSentences(s => {
                      const next = { ...s }
                      if (n === undefined || Number.isNaN(n)) delete next[item.code]
                      else next[item.code] = Math.max(0, Math.min(Math.floor(n), max))
                      return next
                    })
                  }}
                  className="h-9 w-16 rounded-lg border-[1.5px] border-line bg-well px-2 text-center text-sm tabular-nums outline-none focus:border-blue" />
                <span className="text-xs text-ink-mute">/ {max}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="px-5 pt-2 text-xs text-ink-soft">
        총 <b className="text-blue">{r.sentenceReading}</b> / {TASK_MAX.sentenceReading} {verdictBadge(r.verdict.sentenceReading)}
      </p>

      {/* 낱말 쓰기 — 검사 중 수집분을 그대로 합산 */}
      <h3 className="px-5 pt-5 text-xs font-bold text-ink-mute">낱말 쓰기 (검사 중 기록)</h3>
      <p className="px-5 pt-2 text-xs text-ink-soft">
        총 <b className="text-blue">{r.wordWriting}</b> / {TASK_MAX.wordWriting} {verdictBadge(r.verdict.wordWriting)}
      </p>

      <div className="flex flex-wrap items-center gap-3 px-5 py-4 print:hidden">
        <button type="button" onClick={save} disabled={saving}
          className="rounded-lg bg-blue px-4 py-2 text-sm font-bold text-white transition disabled:opacity-40">
          {saving ? '저장 중…' : '채점 저장'}
        </button>
        <button type="button" onClick={() => window.print()}
          className="rounded-lg border-[1.5px] border-line bg-well px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-blue">
          결과지 인쇄
        </button>
        {msg && <span aria-live="polite" className="text-xs text-ink-soft">{msg}</span>}
      </div>

      <p className="border-t border-line bg-well px-5 py-3 text-[11.5px] text-ink-mute">
        Pass 기준(임시): 낱말 해독 {PASS_MARK.wordReading} / {TASK_MAX.wordReading} ·
        문장 읽기유창성 {PASS_MARK.sentenceReading} / {TASK_MAX.sentenceReading} ·
        낱말 쓰기 {PASS_MARK.wordWriting} / {TASK_MAX.wordWriting}.
        담당자에게 실제 기준표를 받으면 숫자만 교체되며, 이미 채점한 세션도 저장된 점수로 다시 계산됩니다.
      </p>
    </section>
  )
}
```

- [ ] **Step 3: `AdminDetailView`에 끼우기**

`data`에서 `marks`·`sentences`를 꺼내 `ScoreSheet`에 넘긴다. `낱말 쓰기` 표 섹션 **앞**(녹음 표 뒤)에 삽입한다 — 검사지 순서와 맞추기 위해.

```tsx
          <ScoreSheet sessionId={id}
            initialMarks={Object.fromEntries(data.marks.map(m => [m.item_code, m.correct]))}
            initialSentences={Object.fromEntries(data.sentences.map(s => [s.item_code, s.words]))}
            writing={Object.fromEntries(writing.map(w => [w.item_code, w.can_write]))} />
```

헤더의 세션 요약 줄에 검사자 구분을 더한다(담임 표시 뒤).

```tsx
                  · 검사자 {s.examiner_type === 'expert' ? '전문가' : s.examiner_type === 'teacher' ? '교사' : '기록 없음'}
```

기존 "검사 현장에서 표시한 의미 낱말 채점: …" 안내 문단은 ScoreSheet가 그 역할을 대신하므로 **삭제한다.**

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add components/admin hooks/useAdminQueries.ts "app/api/admin/sessions/[id]/route.ts"
git commit -m "feat(admin): 결과지 채점 화면(낱말 O/X·문장 어절 수·Pass/Fail)"
```

---

## Task 6: 인쇄 스타일

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: 구현**

`app/globals.css` 맨 아래에 추가한다.

```css
/* 결과지 인쇄 — 관리자 결과지 화면을 그대로 종이에 낸다(별도 인쇄 전용 화면을 두지 않는다).
   ※ 요소를 숨길 때는 Tailwind의 print: 변형(print:hidden)만 쓴다 — 커스텀 .no-print 클래스를
   따로 두면 숨김 방식이 두 갈래가 되어 어느 쪽을 붙였는지 헷갈린다. 여기서는 마크업으로 제어할 수
   없는 것(오디오 재생기)과 잉크를 먹는 장식만 처리한다. */
@media print {
  @page { margin: 12mm; }

  /* 재생기는 종이에서 의미가 없다(dynamic import라 마크업에 클래스를 붙이기 번거로움) */
  audio { display: none !important; }

  body { background: #fff; }

  /* 카드 장식 제거 + 페이지 경계에서 표·섹션이 잘리지 않게 */
  .card, table, section { box-shadow: none !important; break-inside: avoid; }

  a[href]::after { content: ''; }  /* URL 꼬리표 제거 */
}
```

- [ ] **Step 2: `AdminDetailView`의 조작 요소에 `print:hidden` 붙이기**

목록으로 돌아가는 링크, 이전/다음 아동 버튼을 감싼 `<div>`, 세션 삭제 영역 `<div>` — 이 세 곳의 기존 className 끝에 ` print:hidden`을 더한다. 녹음 표의 `듣기` 열은 위 CSS가 `audio`를 숨기므로 그대로 둔다(열 자체는 남지만 빈 칸이 되어 무해하다).

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit && npm run lint`
Expected: 오류 없음

- [ ] **Step 4: 커밋**

```bash
git add app/globals.css components/admin/AdminDetailView.tsx
git commit -m "feat(admin): 결과지 인쇄 스타일"
```

---

## Task 7: 브라우저 검증

- [ ] **Step 1: 마이그레이션 적용 확인**

`supabase/migrations/011_scoring.sql`이 적용됐는지 확인한다. **적용 전에는 채점 저장이 실패하므로 이 태스크를 시작할 수 없다.**

확인: `select * from sentence_scores limit 1;` 와 `select examiner_type from sessions limit 1;` 가 에러 없이 실행되면 적용된 것.

- [ ] **Step 2: 전체 자동 검사**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

- [ ] **Step 3: 검사자 구분 수집 확인**

시작 화면에서 **검사자(교사/전문가)** 토글이 보이고, 선택하지 않으면 제출이 막히는지 확인한다. 하나 선택해 세션을 만든다.

- [ ] **Step 4: 채점 화면 확인**

`/admin`에서 해당 세션 결과지를 연다.

1. **결과지 — 채점** 섹션과 **"임시 기준 · 확정 전"** 배지가 보이는지
2. 낱말 14개가 의미/무의미 구분과 함께 O/X로 나오고, **검사 중 표시한 7개가 이미 선택된 상태**로 보이는지
3. O/X를 바꾸면 아래 합계(의미/무의미/총)와 Pass/Fail 배지가 **즉시 갱신**되는지
4. 문장 4칸에 어절 수를 넣으면 총점이 갱신되고, 만점을 넘겨 입력하면 만점으로 잘리는지(rs01에 99 입력 → 7)
5. 낱말 쓰기 점수가 검사 중 수집한 예/아니오와 일치하는지
6. **[채점 저장]** → "저장했어요." 표시, 새로고침해도 값이 유지되는지 (`PUT /api/admin/.../scores` 200 확인)

- [ ] **Step 5: 인쇄 확인**

**[결과지 인쇄]** 클릭 → 인쇄 미리보기에서 목록 링크·이전/다음 버튼·오디오 재생기가 사라지고, 채점 표와 총점·판정·"임시 기준" 문구가 남는지 확인한다.
(브라우저 자동화로 인쇄 대화상자를 띄우기 어려우면 `matchMedia('print')` 대신 devtools의 print emulation 또는 스크린샷으로 대체 확인하고, 확인 방법을 보고할 것.)

- [ ] **Step 6: 반응형 확인**

`resize_window`로 mobile / desktop에서 채점 표가 깨지지 않는지 확인하고 스크린샷을 남긴다.

---

## 완료 후 담당자에게 회신할 내용

1. **Pass/Fail 기준표** — 지금은 임시값(낱말 9/14 · 문장 23/36 · 쓰기 6/10)이고 화면·인쇄물에 "임시 기준 · 확정 전"이 붙어 있다. 실제 기준표를 주면 숫자만 바꾸면 되고, 이미 채점한 세션도 자동으로 다시 계산된다.
2. **결과지 형태** — 검사지 순서 그대로(낱말 해독 → 문장 → 쓰기 → 총평) 만들었다. 검사지와 더 똑같이 맞춰야 할 부분이 있으면 알려달라.
3. **문장 배점** — 7·7·8·14를 문항 텍스트의 어절 수에서 자동으로 계산한다. 문항이 바뀌어도 배점이 따라간다.
