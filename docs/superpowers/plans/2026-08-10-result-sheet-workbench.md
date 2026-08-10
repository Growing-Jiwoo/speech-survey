# 결과지 → 채점 작업대 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 결과지(`/admin/[id]`)를 검사지 재현물에서 "듣고 찍는" 채점 작업대로 바꾼다. 채점 로직 무변경, 표시 계층만.

**Architecture:** 스펙 `docs/superpowers/specs/2026-08-10-result-sheet-workbench-design.md` 승인본을 그대로 구현한다. 낱말 격자(가로) → 그룹별 세로 행 리스트 + sticky 플레이어 바, 배속 `1×` → `배속 1.0`, 타이포 바닥값 12px, amber는 경고 전용. **되돌리기 전제**: 전 작업을 `feat/result-sheet-workbench` 브랜치에서만 하고, 사용자 시각 승인 전에는 머지하지 않는다.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, wavesurfer.js 7

**테스트 노트:** 이 저장소의 vitest는 컴포넌트를 렌더하지 않는다(전부 lib/라우트 테스트). 이 계획은 순수 표시 변경이라 TDD 대상 로직이 없다 — 회귀 증거는 ① 기존 400+ 테스트 전체 통과(로직 무변경 확인), ② 작업마다 `npx tsc --noEmit`, ③ 마지막에 실녹음 세션(동선테스트, `201ce890-…`)으로 브라우저 검증이다.

---

### Task 0: 브랜치 생성

- [x] **Step 1: feat/kodys-g2에서 분기**

```bash
git checkout feat/kodys-g2 && git checkout -b feat/result-sheet-workbench
```

---

### Task 1: AudioPlayer — 배속 라벨 `N×` 폐기 + 컨트롤 승격

**Files:** Modify: `components/AudioPlayer.tsx`

- [x] **Step 1: RATE_OPTIONS 라벨 교체**

`const RATE_OPTIONS = RATES.map(...)` 줄을 다음으로 교체. O/X 채점 화면에서 `1×`의 ×가 오답 X로 읽혔다(사용자 확인) — × 기호를 어디에도 남기지 않는다.

```ts
// '1×'의 ×가 채점 O/X의 X로 읽힌다(실사용 피드백) — 기호 대신 말로 쓴다.
const RATE_LABELS: Record<(typeof RATES)[number], string> = {
  0.5: '배속 0.5', 0.75: '배속 0.75', 1: '배속 1.0', 1.25: '배속 1.25', 1.5: '배속 1.5',
}
const RATE_OPTIONS = RATES.map(r => ({ value: String(r), label: RATE_LABELS[r] }))
```

- [x] **Step 2: 컨트롤 크기 승격**

return JSX에서 세 곳 교체:

```tsx
// 재생 버튼: h-8 w-8 → h-10 w-10, 아이콘 h-3.5 → h-4
className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ink text-white disabled:opacity-40"
// (Spinner·svg 두 아이콘 모두 h-3.5 w-3.5 → h-4 w-4)

// 시간 표기: text-[11px] → text-[12.5px]
<span className="flex-none font-read text-[12.5px] tabular-nums text-ink-mute">{fmtDuration(cur)}/{fmtDuration(dur)}</span>

// 배속 Select: w-[84px] → w-[104px] (라벨이 길어짐)
<Select value={String(rate)} options={RATE_OPTIONS} placeholder="배속" onChange={changeRate}
  ariaLabel="재생 속도" disabled={!ready} size="sm" className="w-[104px] flex-none" />
```

컨테이너 `max-w-[280px]` → `max-w-[420px]` (파형이 좁아 시크 정밀도가 떨어졌다).

- [x] **Step 3: 검증 후 커밋**

```bash
npx tsc --noEmit && git add -A && git commit -m "fix(audio): 배속 라벨 1×→'배속 1.0' — ×가 오답 X로 읽히던 혼동 제거"
```

---

### Task 2: PageAudio — sticky 바용 크기 승격

**Files:** Modify: `components/admin/sheet/PageAudio.tsx`

- [x] **Step 1: 라벨·칩·시간 크기 교체**

```tsx
// 라벨: text-[11px] → text-[13px] font-bold (sticky 바에서 그룹 이름 역할)
<span className="text-[13px] font-bold text-ink-soft">{label}</span>

// 시도 전환 칩: h-6 px-1.5 text-[10.5px] → h-8 px-2.5 text-[12.5px]
className={`h-8 rounded-md border px-2.5 text-[12.5px] font-bold transition ${
  i === idx ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-mute'}`}

// 길이 표기: text-[11px] → text-[12.5px]
<span className={`font-read text-[12.5px] tabular-nums ${over ? 'font-bold text-amber' : 'text-ink-soft'}`}
```

미녹음 분기의 라벨도 `text-[11px]` → `text-[13px] font-bold`. 그 외 구조 무변경.

- [x] **Step 2: 검증 후 커밋**

```bash
npx tsc --noEmit && git add -A && git commit -m "feat(admin): 결과지 플레이어 컨트롤 크기 승격 (11px대 전멸)"
```

---

### Task 3: WordScoreRows 신규 — 낱말 채점 행 리스트 + sticky 플레이어

**Files:** Create: `components/admin/sheet/WordScoreRows.tsx`

- [x] **Step 1: 컴포넌트 작성**

```tsx
// components/admin/sheet/WordScoreRows.tsx — 낱말 해독 채점: 그룹(의미/무의미) 하나의
// sticky 플레이어 바 + 낱말 행 리스트.
//
// 가로 격자(WordGrid)를 세로 행으로 바꾼 이유: 격자는 종이 검사지 재현이 목적이었는데
// 공식 출력물이 PDF 스탬핑으로 옮겨가며 그 목적이 사라졌고, 좁은 화면 가로 스크롤과
// 92px 칸의 밀집만 남았다. 행 리스트는 검사 진행 화면 MarkPage에서 이미 검증된 패턴이다.
//
// 플레이어 바를 sticky로 두는 이유: 행이 세로로 길어져(7행) 스크롤 중 플레이어가 화면
// 밖으로 나간다 — "들으면서 찍기"가 이 화면의 핵심 동선이므로 지금 듣는 그룹의 플레이어가
// 항상 보여야 한다. 그룹 래퍼가 relative라 다음 그룹에 닿으면 자연스럽게 교대한다.
'use client'
import type { ReactNode } from 'react'
import type { SurveyItem } from '@/lib/items'

export function WordScoreRows({ audio, items, marks, onMark }: {
  /** sticky 바에 앉는 플레이어(그룹 라벨 포함 — PageAudio) */
  audio: ReactNode
  items: SurveyItem[]
  marks: Partial<Record<string, boolean>>
  onMark: (code: string, v: boolean) => void
}) {
  return (
    <div className="relative border-t border-line/60">
      <div className="sticky top-0 z-10 border-b border-line/60 bg-white px-4 py-2.5">
        {audio}
      </div>
      {/* 데스크톱은 2열 — 7행 × 2그룹의 세로 길이를 절반으로 줄인다 */}
      <ul className="grid gap-x-10 px-4 py-2 lg:grid-cols-2">
        {items.map(item => {
          const v = marks[item.code]
          return (
            <li key={item.code}
              className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5">
              <span className="font-read min-w-0 truncate text-[20px]">{item.text}</span>
              <div className="flex flex-none gap-1.5">
                {([['O', true], ['X', false]] as const).map(([label, want]) => (
                  <button key={label} type="button" aria-pressed={v === want}
                    aria-label={`${item.text} ${want ? '정반응' : '오반응'}`}
                    onClick={() => onMark(item.code, want)}
                    className={`h-11 w-11 rounded-lg border-[1.5px] font-read text-lg font-bold transition ${
                      v === want
                        ? want ? 'border-mint bg-mint/10 text-mint' : 'border-rec bg-rec/10 text-rec-deep'
                        : 'border-line bg-well text-ink-mute'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [x] **Step 2: 검증 후 커밋** (`npx tsc --noEmit` — 아직 미사용이라 통과만 확인)

```bash
npx tsc --noEmit && git add -A && git commit -m "feat(admin): 낱말 채점 행 리스트 + sticky 플레이어 (WordScoreRows)"
```

---

### Task 4: WritingChips 신규 — 낱말 쓰기 기록 칩 흐름

**Files:** Create: `components/admin/sheet/WritingChips.tsx`

- [x] **Step 1: 컴포넌트 작성**

```tsx
// components/admin/sheet/WritingChips.tsx — 낱말 쓰기(검사 중 기록, 읽기 전용) 칩 흐름.
// 읽기 전용 정보에 채점 행과 같은 높이(10행)를 쓸 이유가 없다 — 낱말+O/X 칩을 줄바꿈으로
// 흘려 한두 줄에 담는다. 가로 스크롤 없음.
import { KIND_LABEL, type SurveyItem } from '@/lib/items'

export function WritingChips({ items, writing }: {
  items: SurveyItem[]
  /** itemCode → 정확히 쓴 어절 수(낱말 쓰기는 0/1). 미응답은 키 없음 */
  writing: Partial<Record<string, number>>
}) {
  const groups = (['meaning', 'nonsense'] as const)
    .map(kind => ({ kind, items: items.filter(i => i.kind === kind) }))
    .filter(g => g.items.length > 0)
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-3">
      {groups.map(g => (
        <div key={g.kind} className="flex flex-wrap items-center gap-2">
          <span className="w-16 flex-none text-[12.5px] font-bold text-ink-mute">
            {KIND_LABEL[g.kind]} 낱말
          </span>
          {g.items.map(item => {
            const v = writing[item.code]
            const ok = v === undefined ? undefined : v >= 1
            return (
              <span key={item.code}
                aria-label={`${item.text} ${ok === undefined ? '미응답' : ok ? '정반응' : '오반응'}`}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-1.5">
                <span className="font-read text-[16px]">{item.text}</span>
                <b className={`font-read text-[15px] ${
                  ok === undefined ? 'text-ink-mute' : ok ? 'text-mint' : 'text-rec-deep'}`}>
                  {ok === undefined ? '—' : ok ? 'O' : 'X'}
                </b>
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}
```

- [x] **Step 2: 검증 후 커밋**

```bash
npx tsc --noEmit && git add -A && git commit -m "feat(admin): 낱말 쓰기 기록을 칩 흐름으로 (읽기 전용에 10행을 쓰지 않는다)"
```

---

### Task 5: SentenceRows 재구성 — 문장·플레이어·점수 한 카드

**Files:** Modify: `components/admin/sheet/SentenceRows.tsx`

- [x] **Step 1: 파일 전체 교체**

```tsx
// components/admin/sheet/SentenceRows.tsx — 문장 읽기유창성 채점 행.
// 문장 하나가 곧 녹음 페이지 하나이므로 문장·플레이어·점수 입력을 한 행에 둔다.
// 플레이어는 문장 아래 자기 줄을 가진다 — 시간·배속과 뭉치던 밀집(실사용 피드백)을 푼다.
'use client'
import { itemMaxWords } from '@/lib/scoring'
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
      {items.map((item, i) => {
        const max = itemMaxWords(item)
        return (
          <div key={item.code} className="border-t border-line/60 px-4 py-3 first:border-t-0">
            <div className="flex items-start gap-3">
              <span className="w-5 flex-none pt-1 text-[13px] font-bold text-ink-mute">{i + 1}</span>
              <p className="font-read min-w-0 flex-1 whitespace-pre-line break-keep text-[15px] leading-relaxed">
                {item.text}
              </p>
              <div className="flex flex-none items-center gap-1.5 pt-0.5">
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
                  className="h-11 w-16 rounded-lg border-[1.5px] border-line bg-well px-2 text-center text-base tabular-nums outline-none focus:border-blue" />
                <span className="text-[13px] text-ink-mute">/ {max}</span>
              </div>
            </div>
            <div className="mt-2 pl-8">
              <PageAudio label={`${i + 1}번 문장`} attempts={attemptsFor(item.code)}
                limitSec={limitSec} onAudioError={onAudioError} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

주의: 기존 파일의 amber 머리행(`문항/점수`)과 인쇄용 `print:` 클래스는 의도적으로 제거 —
화면 인쇄는 참고용이고(공식 출력 = PDF), 점수 입력의 aria-label과 `/ 7` 표기가 열 이름을 대신한다.

- [x] **Step 2: 검증 후 커밋**

```bash
npx tsc --noEmit && git add -A && git commit -m "feat(admin): 문장 채점 행 재구성 — 플레이어에 자기 줄, 점수 입력 승격"
```

---

### Task 6: Subtotal·ScoreBand·SentenceWriteRows — amber 정리 + 크기 승격

**Files:** Modify: `components/admin/sheet/Subtotal.tsx`, `components/admin/sheet/ScoreBand.tsx`, `components/admin/sheet/SentenceWriteRows.tsx`

- [x] **Step 1: Subtotal 띠를 중립으로**

컨테이너 className 교체 (amber는 경고 전용 원칙):

```tsx
<div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 border-y border-line bg-well px-4 py-2.5">
```

크기 승격: 부분 점수 라벨 `text-[13px]` 유지·값 `text-[15px]` → `text-[16px]`,
총점 라벨 `text-[13px]` → `text-[14px]`, 총점 값 `text-[19px]` → `text-[20px]`.

- [x] **Step 2: ScoreBand 라벨 승격**

두 곳의 과제 라벨 `text-[11.5px]` → `text-[13px]`, 하단 힌트 `text-[10.5px]` → `text-[12px]`.
구조·색 로직 무변경.

- [x] **Step 3: SentenceWriteRows(G2 문장 쓰기 기록) 승격**

머리행 `bg-amber/10` → `bg-well`·`text-[11.5px]` → `text-[12.5px]`, 어절 칩 `text-[15px]` →
`text-[16px]`, 점수 `text-[13px]/[15px]` → `text-[13px]/[16px]`. 구조 무변경.

- [x] **Step 4: 검증 후 커밋**

```bash
npx tsc --noEmit && git add -A && git commit -m "style(admin): 소계·총평·문장쓰기 기록 — amber 띠를 중립으로, 12px 바닥값"
```

---

### Task 7: ResultSheet 조립 + WordGrid 삭제

**Files:** Modify: `components/admin/ResultSheet.tsx` · Delete: `components/admin/sheet/WordGrid.tsx`

- [x] **Step 1: import 교체**

```tsx
// 삭제: import { WordGrid } from './sheet/WordGrid'
import { WordScoreRows } from './sheet/WordScoreRows'
import { WritingChips } from './sheet/WritingChips'
```

- [x] **Step 2: 낱말 해독 섹션 교체**

기존 섹션 헤더(PageAudio 2개 포함)와 `<WordGrid …/>` 2줄을 다음으로 교체 — 플레이어가
sticky 바로 내려가므로 h2에는 제목과 기준 힌트만 남는다:

```tsx
{/* 낱말 해독 — 그룹별 sticky 플레이어 아래에서 듣면서 찍는다 */}
<h2 className="border-t border-line px-4 pb-2 pt-4 text-[16px] font-bold">{SECTION_LABEL.word_reading}
  <span className="ml-2 text-[12px] font-normal text-ink-mute">
    {form.limits.wordSec}초 동안 정확하게 읽은 낱말 수
  </span>
</h2>
<WordScoreRows items={readItemsOf('meaning')} marks={marks} onMark={setMark}
  audio={<PageAudio label={`${KIND_LABEL.meaning} 낱말`} attempts={attemptsOf('p_rw_meaning')}
    limitSec={form.limits.wordSec} onAudioError={onAudioError} />} />
<WordScoreRows items={readItemsOf('nonsense')} marks={marks} onMark={setMark}
  audio={<PageAudio label={`${KIND_LABEL.nonsense} 낱말`} attempts={attemptsOf('p_rw_nonsense')}
    limitSec={form.limits.wordSec} onAudioError={onAudioError} />} />
```

- [x] **Step 3: 쓰기 섹션(G1 분기) 교체**

`<WordGrid rowLabel="의미 낱말" … readOnly />` 2줄을 한 줄로:

```tsx
<WritingChips items={f.writingItems} writing={writing} />
```

(이때 `writingMarks`·`writeItemsOf` 파생값은 더 이상 쓰이지 않으면 함께 삭제.)

- [x] **Step 4: 섹션 제목·머리글 타이포 일괄 승격**

- 모든 섹션 h2: `text-[13px]` → `text-[16px]`, 안의 힌트 `text-[11px]` → `text-[12px]`,
  h2 패딩 `pb-1.5 pt-3` → `pb-2 pt-4`
- 머리글 인적사항 dl: `text-[11.5px]` → `text-[13px]`
- 담임·동의 줄과 하단 안내문: `text-[10.5px]` → `text-[12px]`
- 저장 버튼 옆 안내: `text-[11px]` → `text-[12px]`

- [x] **Step 5: WordGrid 삭제 + 전체 검증 후 커밋**

```bash
rm components/admin/sheet/WordGrid.tsx
npx tsc --noEmit && npm run lint && TZ=UTC npx vitest run && npm run build
git add -A && git commit -m "feat(admin): 결과지를 채점 작업대로 재조립 — 격자 폐기, sticky 플레이어"
```

Expected: 테스트 전체 통과(로직 무변경), grep으로 `WordGrid` 참조 0건 확인:
`grep -rn "WordGrid" components app | wc -l` → 0

---

### Task 8: 브라우저 검증 (실녹음 세션)

- [x] **Step 1: 동선테스트 세션으로 확인** (`/admin/201ce890-a9e0-428e-a8b2-435cbc23d5c8`)

- 데스크톱(1280+): 낱말 2열 그리드, sticky 바가 그룹 경계에서 교대하는지
- 모바일(375): 행 리스트 잘림 없음, 플레이어 줄바꿈 정상
- 재생하면서 O/X 클릭 → 저장 → 새로고침 후 값 유지
- 시도 전환(#1/#2), 배속 표기 `배속 1.0`, `1×` 부재
- 미녹음 세션(김하늘)도 열어 미녹음 배지가 그룹당 1개인지
- 문서 README(`components/admin/README.md`)의 WordGrid 행을 새 컴포넌트로 갱신

- [x] **Step 2: 스크린샷을 사용자에게 제시하고 채택/폐기 판단 받기**

채택 → push + PR. 폐기 → 브랜치 삭제로 원상복구(main·kodys-g2 무영향).
