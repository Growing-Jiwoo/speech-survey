# Phase 1 — 아동/검사자 흐름 안정성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KODYS-G1 아동/검사자 흐름의 신뢰성·접근성 결함(상태 유실, iOS 무음 녹음, 타이머 불일치, 임계값 불일치, 모달 a11y 등 10개 항목)을 신규 런타임 의존성 없이 외과적으로 고친다.

**Architecture:** 순수 로직(상태 저장, 오디오 상수/헬퍼, 체크리스트 배타, 녹음 에러 분류)을 `lib`/헬퍼로 추출해 vitest로 TDD하고, 그 위에서 `useRecorder` 훅을 단일 시계 + 정리 순서 교정 + `ctx.resume()` + 타입드 에러로 리팩터한 뒤, 컴포넌트(RecordButton/LevelMeter/RecordingItem/MicCheck/survey·review 페이지)를 이 헬퍼·훅에 배선한다. 컴포넌트/DOM/iOS 동작은 `typecheck` + 수동 브라우저 검증으로 확인한다.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.9, Tailwind 4, Vitest 4 (환경: `node`). 신규 의존성 없음.

## Global Constraints

- 신규 **런타임** 의존성 추가 금지 (Phase 1). devDependency도 추가하지 않는다 (jsdom/testing-library 도입 안 함).
- 테스트 환경은 `vitest.config.ts`의 `environment: 'node'` — 브라우저 전역(`localStorage`, `MediaRecorder`, `AudioContext`, `requestAnimationFrame`)은 테스트에서 직접 스텁한다.
- 경로 별칭: `@/*` → 저장소 루트 (`tsconfig.json`, `vitest.config.ts`).
- 디자인 토큰·Tailwind 유틸 유지, UI 껍데기 재작성 금지. 색/그림자/라운드 등 기존 클래스 보존.
- 기능 전달용 움직임(레벨미터 막대, 카운트다운 숫자, 녹음 링)은 유지, 순수 장식(펄스·스케일)만 `prefers-reduced-motion`에서 정지.
- 타입 검증: 각 컴포넌트 태스크 종료 시 `npm run typecheck`(= `tsc --noEmit`) 통과 필수. Next 빌드 타입체크는 꺼져 있으므로 이것으로만 판단.
- 커밋 메시지 말미에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 포함.
- 작업 브랜치: `docs/usability-improvement-specs`에서 분기하거나 신규 기능 브랜치 사용 (main 직접 커밋 금지).

---

### Task 1: 공유 오디오 상수·헬퍼 (`lib/audio.ts`)

녹음 관련 순수 로직을 한 곳에 모아 임계값 중복(#6), 카운트다운 계산(#5), 에러 분류(#2)를 테스트 가능하게 만든다.

**Files:**
- Create: `lib/audio.ts`
- Test: `tests/audio.test.ts`

**Interfaces:**
- Produces:
  - `MIC_MIN_PEAK: number` — 마이크 통과/저음 경고 공통 임계값.
  - `remainingSec(elapsedMs: number, maxSec: number): number` — 남은 초(올림, 0 하한).
  - `class RecorderError extends Error { kind: RecorderErrorKind }`
  - `type RecorderErrorKind = 'denied' | 'unsupported' | 'failed'`
  - `classifyRecorderError(err: unknown): RecorderErrorKind`

- [ ] **Step 1: Write the failing test**

```ts
// tests/audio.test.ts
import { describe, it, expect } from 'vitest'
import { MIC_MIN_PEAK, remainingSec, classifyRecorderError, RecorderError } from '@/lib/audio'

describe('MIC_MIN_PEAK', () => {
  it('0과 1 사이 단일 임계값', () => {
    expect(MIC_MIN_PEAK).toBeGreaterThan(0)
    expect(MIC_MIN_PEAK).toBeLessThan(1)
  })
})

describe('remainingSec', () => {
  it('경과 0이면 maxSec', () => expect(remainingSec(0, 30)).toBe(30))
  it('올림 규칙 (0.2초 경과 → 30초 표기 유지)', () => expect(remainingSec(200, 30)).toBe(30))
  it('중간값 올림', () => expect(remainingSec(1500, 30)).toBe(29))
  it('초과 시 0 하한', () => expect(remainingSec(40_000, 30)).toBe(0))
})

describe('classifyRecorderError', () => {
  it('권한 거부 계열 → denied', () => {
    expect(classifyRecorderError({ name: 'NotAllowedError' })).toBe('denied')
    expect(classifyRecorderError({ name: 'SecurityError' })).toBe('denied')
  })
  it('미지원 계열 → unsupported', () => {
    expect(classifyRecorderError({ name: 'NotSupportedError' })).toBe('unsupported')
  })
  it('RecorderError는 kind 그대로 전달', () => {
    expect(classifyRecorderError(new RecorderError('unsupported'))).toBe('unsupported')
  })
  it('그 외 → failed', () => {
    expect(classifyRecorderError({ name: 'NotFoundError' })).toBe('failed')
    expect(classifyRecorderError(new Error('boom'))).toBe('failed')
    expect(classifyRecorderError(undefined)).toBe('failed')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/audio.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audio'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/audio.ts — 녹음 공유 상수·순수 헬퍼 (테스트 가능 단위)
/** 마이크 확인 통과 및 녹음 저음 경고 공통 임계값 (peak 0~1). 실기기 튜닝 여지 있음. */
export const MIC_MIN_PEAK = 0.1

/** 남은 녹음 시간(초). 링·라벨·자동정지가 공유하는 단일 계산식. */
export function remainingSec(elapsedMs: number, maxSec: number): number {
  return Math.max(0, Math.ceil(maxSec - elapsedMs / 1000))
}

export type RecorderErrorKind = 'denied' | 'unsupported' | 'failed'

/** 녹음 시작 실패를 종류로 구분해 던지기 위한 에러. */
export class RecorderError extends Error {
  kind: RecorderErrorKind
  constructor(kind: RecorderErrorKind, message?: string) {
    super(message ?? kind)
    this.name = 'RecorderError'
    this.kind = kind
  }
}

/** DOMException 등에서 실패 종류를 판별. RecorderError는 kind를 그대로 전달. */
export function classifyRecorderError(err: unknown): RecorderErrorKind {
  if (err instanceof RecorderError) return err.kind
  const name = (err as { name?: string } | null | undefined)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotSupportedError') return 'unsupported'
  return 'failed'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/audio.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/audio.ts tests/audio.test.ts
git commit -m "feat(audio): 공유 오디오 상수·헬퍼(임계값·남은시간·에러분류) 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 설문 상태에 문항 위치·단계 저장 + 세션별 localStorage (#1)

**Files:**
- Modify: `lib/survey-state.ts` (전체 재작성)
- Test: `tests/survey-state.test.ts` (신규)

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `SurveyState` 에 `idx: number`, `phase: 'mic' | 'item'` 추가.
  - `newState(sessionId, childName)` → `idx:0, phase:'mic'` 포함.
  - `saveState(s)` — `localStorage['kodys-survey:{id}']` + `localStorage['kodys-survey:last'] = id` 기록.
  - `loadState()` — last 포인터로 현재 세션 상태 반환(없거나 손상 시 `null`).
  - `clearState()` — 현재(last) 세션 키 + last 포인터 제거.

- [ ] **Step 1: Write the failing test**

```ts
// tests/survey-state.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { newState, saveState, loadState, clearState } from '@/lib/survey-state'

// node 환경에는 localStorage가 없으므로 Map 기반 스텁을 주입한다.
beforeEach(() => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

describe('survey-state', () => {
  it('newState는 idx=0, phase=mic로 시작', () => {
    const s = newState('sid-1', '김도연')
    expect(s.idx).toBe(0)
    expect(s.phase).toBe('mic')
    expect(s.micDone).toBe(false)
  })

  it('save→load 왕복으로 idx·phase 복원', () => {
    const s = newState('sid-1', '김도연')
    saveState({ ...s, idx: 12, phase: 'item', micDone: true })
    const loaded = loadState()
    expect(loaded?.sessionId).toBe('sid-1')
    expect(loaded?.idx).toBe(12)
    expect(loaded?.phase).toBe('item')
  })

  it('세션별 키 분리 + last 포인터가 최신 세션을 가리킴', () => {
    saveState({ ...newState('sid-1', 'A'), idx: 3 })
    saveState({ ...newState('sid-2', 'B'), idx: 7 })
    expect(loadState()?.sessionId).toBe('sid-2')
    expect(loadState()?.idx).toBe(7)
  })

  it('clearState는 현재 세션과 포인터를 제거해 load가 null', () => {
    saveState({ ...newState('sid-1', 'A'), idx: 3 })
    clearState()
    expect(loadState()).toBeNull()
  })

  it('포인터·데이터 없으면 null', () => {
    expect(loadState()).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/survey-state.test.ts`
Expected: FAIL — `idx`/`phase` 미정의 또는 세션별 키 미구현으로 assertion 실패.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/survey-state.ts — 설문 진행 상태 (localStorage, 세션별 키).
// 저장 시점: 녹음=즉시(서버), 낱말쓰기·체크리스트=최종 제출(서버). 로컬은 진행 위치·답 캐시.
export interface SurveyState {
  sessionId: string
  childName: string
  micDone: boolean
  idx: number                        // 현재 문항 인덱스(0-based)
  phase: 'mic' | 'item'              // 마이크 확인 단계 / 문항 단계
  recorded: Record<string, number>   // itemCode → 저장된 시도 수
  writing: Record<string, boolean>   // itemCode → 예(true)/아니오(false)
  checklist: string[]                // 선택된 영역 코드
}

const PREFIX = 'kodys-survey:'
const LAST_KEY = 'kodys-survey:last'
const keyOf = (sessionId: string) => `${PREFIX}${sessionId}`

export function newState(sessionId: string, childName: string): SurveyState {
  return { sessionId, childName, micDone: false, idx: 0, phase: 'mic', recorded: {}, writing: {}, checklist: [] }
}

export function loadState(): SurveyState | null {
  try {
    const last = localStorage.getItem(LAST_KEY)
    if (!last) return null
    const raw = localStorage.getItem(keyOf(last))
    if (!raw) return null
    const s = JSON.parse(raw)
    return typeof s?.sessionId === 'string' && s.sessionId ? s as SurveyState : null
  } catch { return null }
}

export function saveState(s: SurveyState): void {
  try {
    localStorage.setItem(keyOf(s.sessionId), JSON.stringify(s))
    localStorage.setItem(LAST_KEY, s.sessionId)
  } catch { /* 프라이빗 모드 등 저장 실패 시 메모리 상태로만 진행 */ }
}

export function clearState(): void {
  try {
    const last = localStorage.getItem(LAST_KEY)
    if (last) localStorage.removeItem(keyOf(last))
    localStorage.removeItem(LAST_KEY)
  } catch { /* noop */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/survey-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/survey-state.ts tests/survey-state.test.ts
git commit -m "feat(survey-state): 문항 위치·단계 저장 + 세션별 localStorage 재개

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 체크리스트 배타 선택 순수 헬퍼 (#7)

**Files:**
- Modify: `lib/items.ts` (헬퍼 추가; 기존 export 유지)
- Test: `tests/items.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Produces: `toggleChecklistArea(current: string[], code: string): string[]`
  - `code === 'none'` 선택 시 → `['none']` (이미 있으면 `[]`).
  - 다른 코드 선택 시 → `none` 제거 후 해당 코드 토글.

- [ ] **Step 1: Write the failing test** (기존 `tests/items.test.ts` 하단에 추가)

```ts
// tests/items.test.ts 상단 import에 toggleChecklistArea 추가
import { toggleChecklistArea } from '@/lib/items'

describe('toggleChecklistArea (배타 선택)', () => {
  it('none 선택 시 나머지 모두 해제', () => {
    expect(toggleChecklistArea(['cognition', 'language'], 'none')).toEqual(['none'])
  })
  it('none 재선택 시 해제', () => {
    expect(toggleChecklistArea(['none'], 'none')).toEqual([])
  })
  it('영역 선택 시 none 제거 후 추가', () => {
    expect(toggleChecklistArea(['none'], 'cognition')).toEqual(['cognition'])
  })
  it('영역 토글 (있으면 제거)', () => {
    expect(toggleChecklistArea(['cognition', 'speech'], 'cognition')).toEqual(['speech'])
  })
  it('영역 추가는 기존 유지 + append', () => {
    expect(toggleChecklistArea(['cognition'], 'speech')).toEqual(['cognition', 'speech'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/items.test.ts`
Expected: FAIL — `toggleChecklistArea` is not a function.

- [ ] **Step 3: Write minimal implementation** (`lib/items.ts` 하단, `areaLabel` 근처에 추가)

```ts
/** 체크리스트 배타 토글: 'none'(특이사항 없음)과 실제 영역은 상호 배타. */
export function toggleChecklistArea(current: string[], code: string): string[] {
  if (code === 'none') return current.includes('none') ? [] : ['none']
  const base = current.filter(c => c !== 'none')
  return base.includes(code) ? base.filter(c => c !== code) : [...base, code]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/items.ts tests/items.test.ts
git commit -m "feat(items): 체크리스트 배타 선택 헬퍼(toggleChecklistArea) 추가

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: useRecorder 리팩터 — 단일 시계·정리 순서·resume·타입드 에러 (#2, #5)

`useRecorder`를 (a) `getUserMedia` 직후 즉시 정리 등록, (b) `ctx.resume()`, (c) MediaRecorder 생성/시작 try/catch + `RecorderError`, (d) 단일 rAF 시계로 `elapsedMs`/`remainingSec` 노출하도록 고친다.

**Files:**
- Modify: `hooks/useRecorder.ts` (전체 재작성)

**Interfaces:**
- Consumes: `RecorderError`, `remainingSec`, `RecorderErrorKind` (`@/lib/audio`, Task 1).
- Produces: `useRecorder(maxSec, onComplete)` 반환 `{ state, level, elapsedMs, remainingSec, start, stop }`.
  - `start(): Promise<void>` — 실패 시 `RecorderError`(또는 DOMException) throw. 호출부는 `classifyRecorderError`로 분류.
  - `elapsedMs: number`, `remainingSec: number` — 녹음 중 갱신, idle이면 0/`maxSec`.

- [ ] **Step 1: 구현 재작성**

```ts
// hooks/useRecorder.ts
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RecorderError, remainingSec as calcRemaining } from '@/lib/audio'

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
  const [elapsedMs, setElapsedMs] = useState(0)
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
    // 미지원 브라우저는 getUserMedia 이전에 구분 (권한 문제로 오표시 방지)
    const mime = pickMimeType()
    if (typeof MediaRecorder === 'undefined' || mime === '')
      throw new RecorderError('unsupported', '이 브라우저는 녹음을 지원하지 않습니다.')

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }) // 거부 시 throw
    // 스트림 확보 즉시 정리 콜백 등록 → 이후 어느 줄에서 throw해도 마이크 트랙 정지
    let raf = 0
    let ctx: AudioContext | null = null
    cleanupRef.current = () => {
      cancelAnimationFrame(raf)
      if (ctx && ctx.state !== 'closed') void ctx.close()
      stream.getTracks().forEach(t => t.stop())
    }

    try {
      ctx = new AudioContext()
      await ctx.resume() // iOS: suspended로 시작하면 레벨미터가 0 고정되는 문제 방지
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(buf)
        let p = 0
        for (const v of buf) p = Math.max(p, Math.abs(v - 128) / 128)
        peakRef.current = Math.max(peakRef.current, p)
        setLevel(p)
        setElapsedMs(Date.now() - startedRef.current)
        raf = requestAnimationFrame(tick)
      }

      const rec = new MediaRecorder(stream, { mimeType: mime })
      const chunks: Blob[] = []
      rec.ondataavailable = e => chunks.push(e.data)
      rec.onstop = () => {
        cleanupRef.current()
        setState('idle'); setLevel(0); setElapsedMs(0)
        onCompleteRef.current({
          blob: new Blob(chunks, { type: rec.mimeType }),
          durationSec: (Date.now() - startedRef.current) / 1000,
          mime: rec.mimeType, peak: peakRef.current,
        })
      }
      recRef.current = rec
      peakRef.current = 0
      startedRef.current = Date.now()
      rec.start() // NotSupportedError 등은 아래 catch에서 분류
      tick()
      setState('recording')
      setElapsedMs(0)
      timerRef.current = setTimeout(stop, maxSec * 1000)
    } catch (e) {
      cleanupRef.current()
      setState('idle'); setLevel(0); setElapsedMs(0)
      // MediaRecorder 생성/시작 실패는 미지원으로 분류(iOS start() NotSupportedError 포함)
      throw e instanceof RecorderError ? e
        : new RecorderError((e as { name?: string })?.name === 'NotSupportedError' ? 'unsupported' : 'failed',
            (e as Error)?.message)
    }
  }, [maxSec, stop])

  useEffect(() => () => { clearTimeout(timerRef.current); cleanupRef.current() }, [])
  return { state, level, elapsedMs, remainingSec: calcRemaining(elapsedMs, maxSec), start, stop }
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: PASS (에러 없음). — 이 태스크는 브라우저 API 의존이라 단위 테스트 대신 타입체크 + Task 5~7의 수동 검증으로 확인한다.

- [ ] **Step 3: 회귀 확인 (기존 테스트)**

Run: `npx vitest run`
Expected: PASS (기존 + Task 1~3 테스트 전부 통과, useRecorder는 직접 테스트 없음).

- [ ] **Step 4: Commit**

```bash
git add hooks/useRecorder.ts
git commit -m "fix(recorder): iOS 무음 실패 방지(resume/정리순서/타입드에러) + 단일 시계 노출

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: RecordButton·LevelMeter — 단일 시계 사용 + a11y (#5, #9, #10)

**Files:**
- Modify: `components/RecordButton.tsx`
- Modify: `components/LevelMeter.tsx`

**Interfaces:**
- Consumes: `useRecorder`의 `elapsedMs`(Task 4).
- Produces: `RecordButton`에 `elapsedMs?: number` prop 추가(자체 타이머 제거). `LevelMeter`에 `role="meter"` 값 노출.

- [ ] **Step 1: RecordButton 재작성 (자체 elapsed 타이머 제거, prop 사용)**

```tsx
// components/RecordButton.tsx
'use client'
import type { RecState } from '@/hooks/useRecorder'

const R = 52
const CIRC = 2 * Math.PI * R

export function RecordButton({ state, onStart, onStop, disabled, maxSec = 20, elapsedMs = 0, success = false }: {
  state: RecState; onStart: () => void; onStop: () => void; disabled?: boolean; maxSec?: number
  /** 녹음 경과(ms) — useRecorder의 단일 시계에서 전달 */
  elapsedMs?: number
  /** 마이크 확인 성공 등 완료 상태를 체크 표시로 나타낸다(대기 상태에서만). */
  success?: boolean
}) {
  const recording = state === 'recording'
  const progress = Math.min(elapsedMs / 1000 / maxSec, 1)

  return (
    <div className="relative flex h-[116px] w-[116px] items-center justify-center">
      <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 116 116" aria-hidden="true">
        <circle cx="58" cy="58" r={R} fill="none"
          stroke={!recording && success ? 'var(--color-mint)' : 'var(--color-line)'} strokeWidth="4" />
        {recording && (
          <circle cx="58" cy="58" r={R} fill="none" stroke="var(--color-rec)" strokeWidth="4"
            strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * progress} />
        )}
      </svg>

      {recording ? (
        <button onClick={onStop} aria-label="녹음 끝내기"
          className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-rec shadow-[0_4px_0_var(--color-rec-deep),0_16px_24px_-12px_rgba(197,58,62,.45)] transition active:translate-y-[2px]">
          <span className="h-7 w-7 rounded-lg bg-white" />
        </button>
      ) : success ? (
        <button onClick={onStart} disabled={disabled} aria-label="마이크 인식 완료 · 다시 확인"
          className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-mint text-white shadow-[0_4px_0_var(--color-mint),0_16px_24px_-12px_rgba(20,160,120,.45)] transition active:translate-y-[2px] disabled:opacity-40">
          <svg className="h-11 w-11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12l5 5L20 6" />
          </svg>
        </button>
      ) : (
        <button onClick={onStart} disabled={disabled} aria-label="녹음 시작"
          className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-blue text-white shadow-[0_4px_0_var(--color-blue-deep),0_16px_24px_-12px_rgba(30,79,204,.5)] transition active:translate-y-[2px] disabled:opacity-40">
          <svg className="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
          </svg>
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: LevelMeter a11y (role=meter + 값, motion-reduce)**

```tsx
// components/LevelMeter.tsx
'use client'
import { MIC_MIN_PEAK } from '@/lib/audio'
/** 목소리 크기 막대 5개 — "기계가 듣고 있다"는 기능 피드백 (칭찬 신호 아님) */
const BARS = [
  { h: 16, t: 0.05 }, { h: 30, t: 0.15 }, { h: 44, t: 0.3 }, { h: 28, t: 0.5 }, { h: 18, t: 0.7 },
]

export function LevelMeter({ level }: { level: number }) {
  const pct = Math.round(Math.min(level, 1) * 100)
  return (
    <div className="flex h-11 items-end justify-center gap-[7px]"
      role="meter" aria-label="목소리 크기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      {BARS.map((b, i) => (
        <div key={i}
          className={`w-2 rounded-full transition-colors duration-75 motion-reduce:transition-none ${
            level > b.t ? 'bg-blue' : 'bg-line'}`}
          style={{ height: b.h }} />
      ))}
    </div>
  )
}
```

(참고: `MIC_MIN_PEAK` import는 현재 LevelMeter에서 직접 쓰지 않으면 제거해도 무방 — 사용하지 않을 경우 import 라인을 넣지 말 것. 위 코드는 사용하지 않으므로 import를 넣지 않는다.)

- [ ] **Step 3: LevelMeter import 정리**

`components/LevelMeter.tsx`에서 사용하지 않는 `import { MIC_MIN_PEAK }` 라인이 있다면 삭제(위 최종 코드에는 없음). 최종 파일 상단은 `'use client'`로 시작하고 불필요한 import가 없어야 한다.

- [ ] **Step 4: 타입체크**

Run: `npm run typecheck`
Expected: PASS. (`RecordButton` 사용처 MicCheck/RecordingItem은 아직 `elapsedMs` 미전달 — 선택적 prop이라 타입 에러 없음. 배선은 Task 6·7.)

- [ ] **Step 5: Commit**

```bash
git add components/RecordButton.tsx components/LevelMeter.tsx
git commit -m "refactor(record-button,level-meter): 단일 시계 prop 사용 + 미터 a11y/reduced-motion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: RecordingItem — 단일 시계·임계값 통일·업로드중 잠금·에러 종류 (#2, #4, #5, #6, #9)

**Files:**
- Modify: `components/survey/RecordingItem.tsx`

**Interfaces:**
- Consumes: `useRecorder`(elapsedMs/remainingSec), `MIC_MIN_PEAK`·`classifyRecorderError`(`@/lib/audio`).
- Produces: prop에 `onBusyChange?: (busy: boolean) => void` 추가.

- [ ] **Step 1: 재작성**

```tsx
// components/survey/RecordingItem.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import type { SurveyItem } from '@/lib/items'

/** 녹음 문항: 타이머(낱말 30초/문장 40초) 카운트다운, 즉시 업로드, 재생 없음(완료 여부만) */
export function RecordingItem({ item, sessionId, attemptCount, onSaved, onRecordingChange, onBusyChange }: {
  item: SurveyItem; sessionId: string; attemptCount: number; onSaved: () => void
  /** 녹음 중 여부를 부모에 알려 [다음] 버튼을 잠근다 */
  onRecordingChange?: (recording: boolean) => void
  /** 업로드 중 여부를 부모에 알려 [다음] 이동을 막는다(업로드 실패 시 재시도 UI 언마운트 방지) */
  onBusyChange?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lowVolume, setLowVolume] = useState(false)
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const [lastRec, setLastRec] = useState<Recording | null>(null)

  async function upload(rec: Recording) {
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.set('audio', rec.blob, 'audio')
      fd.set('sessionId', sessionId)
      fd.set('itemCode', item.code)
      fd.set('attemptNo', String(attemptCount + 1))
      fd.set('durationSec', rec.durationSec.toFixed(2))
      const res = await fetch('/api/recordings', { method: 'POST', body: fd })
      if (!res.ok) { setErr('저장에 문제가 생겼어요. 다시 시도해 주세요.'); return }
      setLowVolume(rec.peak < MIC_MIN_PEAK)
      onSaved()
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  function handleComplete(rec: Recording) { setLastRec(rec); void upload(rec) }
  const recorder = useRecorder(item.maxSec, handleComplete)
  const recording = recorder.state === 'recording'

  useEffect(() => {
    onRecordingChange?.(recording)
    return () => onRecordingChange?.(false)
  }, [recording, onRecordingChange])

  useEffect(() => {
    onBusyChange?.(busy)
    return () => onBusyChange?.(false)
  }, [busy, onBusyChange])

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicErr(null) }
    catch (e) { setMicErr(classifyRecorderError(e)) }
  }

  const saved = attemptCount > 0
  const word = item.section === 'word_reading'

  return (
    <>
      <div className="card mt-3 p-5">
        <p className="text-xs font-bold text-blue">
          {word ? '아래 낱말을 소리 내어 읽어 주세요' : '아래 문장을 소리 내어 읽어 주세요'}
        </p>
        <p className={`font-read mt-2 break-keep font-medium leading-relaxed ${
          word ? 'text-center text-[38px]' : 'whitespace-pre-line text-[22px]'}`}>
          {item.text}
        </p>
      </div>

      {micErr && (
        <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
          {micErr === 'unsupported'
            ? '이 브라우저에서는 녹음을 지원하지 않아요. Safari나 Chrome 최신 버전에서 다시 시도해 주세요.'
            : micErr === 'denied'
              ? <>마이크를 쓸 수 없어요. 브라우저 설정에서 이 사이트의 마이크를 <b>허용</b>으로 바꾼 뒤 다시 시도해 주세요.</>
              : '마이크를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'}
        </p>
      )}

      {saved && !recording && !busy && !err && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </span>
          <p className="text-sm text-ink-soft" aria-live="polite">
            {lowVolume ? '목소리가 잘 안 담긴 것 같아요. 한 번 더 해 볼까요?' : '녹음이 완료됐어요.'}
          </p>
        </div>
      )}

      {err && !busy && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p role="alert" className="text-center text-sm text-ink-soft">{err}</p>
          {lastRec && <button onClick={() => upload(lastRec)} className="cta max-w-60">다시 시도</button>}
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-5">
        <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop}
          disabled={busy} maxSec={item.maxSec} elapsedMs={recorder.elapsedMs} />
        <p className="text-sm font-bold text-ink-soft">
          {recording ? '다 읽었으면 버튼을 눌러 주세요'
            : saved ? '다시 녹음하려면 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
        </p>
        {recording && (
          <div className="flex flex-col items-center gap-2.5">
            <LevelMeter level={recorder.level} />
            <div className="flex items-center gap-2">
              <span className="blip-antpulse motion-reduce:animate-none inline-block h-2 w-2 rounded-full bg-rec" />
              <span className="text-[13px] font-bold text-rec-deep" aria-live="polite">남은 시간 {recorder.remainingSec}초</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: PASS. (`survey/page.tsx`는 아직 `onBusyChange` 미전달 — 선택 prop이라 에러 없음. 배선은 Task 8.)

- [ ] **Step 3: 회귀 테스트**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/survey/RecordingItem.tsx
git commit -m "fix(recording-item): 단일 시계·임계값 통일·업로드중 잠금 신호·에러 종류별 안내

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: MicCheck — 임계값 통일·에러 종류별 안내 (#2, #6)

**Files:**
- Modify: `components/survey/MicCheck.tsx`

**Interfaces:**
- Consumes: `MIC_MIN_PEAK`·`classifyRecorderError`(`@/lib/audio`), `RecordButton`(elapsedMs).

- [ ] **Step 1: 재작성**

```tsx
// components/survey/MicCheck.tsx
'use client'
import { useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { MIC_MIN_PEAK, classifyRecorderError, type RecorderErrorKind } from '@/lib/audio'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import { Blip } from '@/components/Blip'

const MAX_SEC = 20

export function MicCheck({ onOk }: { onOk: () => void }) {
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [micErr, setMicErr] = useState<RecorderErrorKind | null>(null)
  const recorder = useRecorder(MAX_SEC, (r: Recording) => setMicOk(r.peak > MIC_MIN_PEAK ? 'ok' : 'quiet'))

  async function start() {
    try { await recorder.start(); setMicErr(null) }
    catch (e) { setMicErr(classifyRecorderError(e)) }
  }

  if (micErr) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h2 className="text-xl font-bold">
        {micErr === 'unsupported' ? '녹음을 지원하지 않는 브라우저예요' : '마이크를 쓸 수 없어요'}
      </h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        {micErr === 'unsupported'
          ? <>Safari나 Chrome 최신 버전에서<br />다시 열어 주세요.</>
          : micErr === 'denied'
            ? <>브라우저 설정에서 이 사이트의 마이크를<br /><b>허용</b>으로 바꾼 뒤 다시 눌러 주세요.</>
            : <>마이크를 시작하지 못했어요.<br />잠시 후 다시 눌러 주세요.</>}
      </p>
      {micErr !== 'unsupported' && <button onClick={start} className="cta mt-2 max-w-60">다시 시도</button>}
    </main>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-14 text-2xl font-bold">마이크 확인</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        버튼을 누르고<br /><b>&ldquo;안녕하세요&rdquo;</b>라고 말해 주세요.
      </p>
      <div className="mt-12">
        <RecordButton state={recorder.state} onStart={start} onStop={recorder.stop}
          maxSec={MAX_SEC} elapsedMs={recorder.elapsedMs} success={micOk === 'ok'} />
      </div>
      <div className="mt-8"><LevelMeter level={recorder.level} /></div>
      {micOk === 'ok' ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-mint" aria-live="polite">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12l5 5L20 6" />
          </svg>
          마이크가 잘 인식됐어요!
        </p>
      ) : micOk === 'quiet' ? (
        <p className="mt-3 text-sm text-ink-soft" aria-live="polite">목소리가 잘 안 들려요. 마이크 가까이에서 다시 한번 해 주세요.</p>
      ) : (
        <p className="mt-3 text-[11px] text-ink-mute">목소리가 들리면 막대가 움직여요.</p>
      )}
      <div className="mt-auto w-full pb-2">
        <button onClick={onOk} disabled={micOk !== 'ok'} className="cta disabled:opacity-40">검사 시작</button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: 타입체크 + 회귀 테스트**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/survey/MicCheck.tsx
git commit -m "fix(mic-check): 임계값 통일(MIC_MIN_PEAK) + 미지원/거부/실패 구분 안내

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: survey/page — 위치 복원·업로드중 잠금·버튼 라벨·배타 선택 (#1, #3, #4, #7)

**Files:**
- Modify: `app/survey/page.tsx`

**Interfaces:**
- Consumes: `loadState`/`saveState`(idx/phase, Task 2), `toggleChecklistArea`(Task 3), `RecordingItem`의 `onBusyChange`(Task 6).

- [ ] **Step 1: `SurveyInner` 재작성** (import에 `toggleChecklistArea` 추가)

```tsx
// app/survey/page.tsx 의 SurveyInner 함수 전체를 아래로 교체.
// (import 목록에 lib/items의 toggleChecklistArea 추가)
function SurveyInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [st, setSt] = useState<SurveyState | null>(null)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'mic' | 'item'>('item')
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fromReview = params.get('from') === 'review'

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    setSt(s)
    const q = Number(params.get('q'))
    if (Number.isInteger(q) && q >= 1 && q <= ITEMS.length) {
      setIdx(q - 1); setPhase('item')
    } else {
      setIdx(s.idx ?? 0)
      setPhase(s.phase ?? (s.micDone ? 'item' : 'mic'))
    }
  }, [router, params])

  if (!st) return null

  function patch(p: Partial<SurveyState> | ((prev: SurveyState) => Partial<SurveyState>)) {
    setSt(prev => {
      const merged = { ...prev!, ...(typeof p === 'function' ? p(prev!) : p) }
      saveState(merged)
      return merged
    })
  }

  // 문항 이동 시 현재 위치를 상태에 저장(새로고침·탭 닫힘 후 재개용)
  function goToIdx(n: number) { setIdx(n); patch({ idx: n }); window.scrollTo(0, 0) }

  if (phase === 'mic')
    return <MicCheck onOk={() => { patch({ micDone: true, phase: 'item' }); setPhase('item') }} />

  const item = ITEMS[idx]
  const isLast = idx === ITEMS.length - 1
  // 녹음 쓰기 문항은 예/아니오 필수, 녹음·업로드 중에는 이동 불가
  const canNext = (item.section !== 'word_writing' || st.writing[item.code] !== undefined)
    && !isRecording && !isUploading

  function goNext() {
    if (isLast) { router.push('/review'); return }
    goToIdx(idx + 1)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8">
      <ProgressBar current={idx + 1} total={ITEMS.length} />
      {fromReview && (
        <Link href="/review" className="mt-2 text-xs text-ink-mute underline">← 검토 화면으로 돌아가기</Link>
      )}
      <p className="mt-4 text-xs font-bold text-ink-mute">
        {item.orderNo}. {SECTION_LABEL[item.section]}
      </p>

      {(item.section === 'word_reading' || item.section === 'sentence_reading') && (
        <RecordingItem key={item.code} item={item} sessionId={st.sessionId}
          attemptCount={st.recorded[item.code] ?? 0}
          onRecordingChange={setIsRecording} onBusyChange={setIsUploading}
          onSaved={() => patch(prev => ({ recorded: { ...prev.recorded, [item.code]: (prev.recorded[item.code] ?? 0) + 1 } }))} />
      )}

      {item.section === 'word_writing' && (
        <div className="card mt-3 p-5">
          <p className="text-sm font-bold">학생이 아래의 낱말을 정확하게 쓸 수 있나요?</p>
          <p className="font-read mt-5 text-center text-[38px] font-bold">{item.text}</p>
          <div className="mt-6 flex gap-2.5">
            {([['예', true], ['아니오', false]] as const).map(([label, v]) => (
              <button key={label} type="button" aria-pressed={st.writing[item.code] === v}
                onClick={() => patch(prev => ({ writing: { ...prev.writing, [item.code]: v } }))}
                className={`h-[52px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
                  st.writing[item.code] === v ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
                {label}
              </button>
            ))}
          </div>
          {st.writing[item.code] === undefined &&
            <p className="mt-3 text-center text-[11px] text-ink-mute">예 / 아니오를 선택해야 다음으로 갈 수 있어요.</p>}
        </div>
      )}

      {item.section === 'checklist' && (
        <div className="card mt-3 p-5">
          <p className="text-sm font-bold leading-relaxed">
            학생의 발달 영역 중 확인이 필요하다고 생각되는 영역에 모두 표시해 주세요.
          </p>
          <p className="mt-1 text-[11px] text-ink-mute">해당 사항이 없으면 표시하지 않아도 됩니다.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {CHECKLIST_AREAS.map(a => {
              const on = st.checklist.includes(a.code)
              return (
                <li key={a.code}>
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] px-4 py-3 transition ${
                    on ? 'border-blue bg-blue/5' : 'border-line bg-well'}`}>
                    <input type="checkbox" checked={on} className="mt-0.5 h-5 w-5 accent-[var(--color-blue)]"
                      onChange={() => patch(prev => ({ checklist: toggleChecklistArea(prev.checklist, a.code) }))} />
                    <span>
                      <span className="text-sm font-bold">{a.label}</span>
                      {a.hint && <span className="mt-0.5 block text-xs leading-relaxed text-ink-mute">{a.hint}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mt-auto flex gap-2.5 pb-2 pt-6">
        <button onClick={() => goToIdx(idx - 1)} disabled={idx === 0 || isRecording || isUploading}
          className="h-[52px] flex-1 rounded-xl border-[1.5px] border-line bg-well text-[15px] font-bold text-ink-soft transition disabled:opacity-40">
          이전
        </button>
        <button onClick={goNext} disabled={!canNext}
          className="h-[52px] flex-[2] rounded-xl bg-blue text-[15px] font-bold text-white shadow-[0_3px_0_var(--color-blue-deep)] transition active:translate-y-[2px] disabled:opacity-40">
          {isLast ? '검토' : '다음'}
        </button>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: import 라인 갱신 확인**

`app/survey/page.tsx` 상단 items import에 `toggleChecklistArea`가 포함되어야 한다:
```tsx
import { CHECKLIST_AREAS, ITEMS, SECTION_LABEL, toggleChecklistArea } from '@/lib/items'
```

- [ ] **Step 3: 타입체크 + 회귀 테스트**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 4: 수동 검증 (브라우저)**

Run: `npm run dev` → http://localhost:3000
Steps & Expected:
1. 시작 정보 입력 → 마이크 확인 통과 → 문항 몇 개 진행(녹음/쓰기) 후 **브라우저 새로고침** → 같은 문항에서 재개(1번으로 안 튐).
2. 낱말쓰기 문항 진행 후 **탭 닫고 새 탭에서** http://localhost:3000/survey 열기 → 진행하던 위치 복원.
3. 녹음 정지 직후(업로드 중) [다음]·[이전] 비활성 확인.
4. 마지막 문항(체크리스트) 버튼 라벨이 **"검토"**, 클릭 시 `/review` 이동.
5. 체크리스트에서 "특이사항 없음" 선택 → 다른 영역 자동 해제. 다른 영역 선택 → "없음" 자동 해제.

- [ ] **Step 5: Commit**

```bash
git add app/survey/page.tsx
git commit -m "fix(survey): 위치 복원·업로드중 이동 잠금·버튼 라벨(검토)·체크리스트 배타

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 포커스 트랩 훅 + 제출 확인 모달 a11y (#8)

**Files:**
- Create: `hooks/useFocusTrap.ts`
- Modify: `app/review/page.tsx`

**Interfaces:**
- Produces: `useFocusTrap(active: boolean, onEscape?: () => void): React.RefObject<HTMLDivElement | null>`
  - active로 전환 시 컨테이너 첫 포커서블로 포커스 이동, Tab 순환 트랩, Esc → `onEscape`, 해제 시 직전 포커스 복귀.

- [ ] **Step 1: 훅 구현**

```tsx
// hooks/useFocusTrap.ts
'use client'
import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'

/** 다이얼로그용 포커스 트랩: 초기 포커스·Tab 순환·Esc 닫기·해제 시 포커스 복귀. */
export function useFocusTrap(active: boolean, onEscape?: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!active) return
    const container = ref.current
    if (!container) return
    const prevFocused = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    focusables()[0]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onEscape?.(); return }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      prevFocused?.focus()
    }
  }, [active, onEscape])
  return ref
}
```

- [ ] **Step 2: review 모달에 배선** (`app/review/page.tsx`)

`import { useCallback } from 'react'`가 없으면 `useEffect, useState` import에 `useCallback` 추가하고, 상단에 훅 import 추가:
```tsx
import { useFocusTrap } from '@/hooks/useFocusTrap'
```
`ReviewPage` 컴포넌트 본문에서 `const [modal, setModal] = useState(false)` 아래에 추가:
```tsx
  const closeModal = useCallback(() => { if (!busy) setModal(false) }, [busy])
  const trapRef = useFocusTrap(modal, closeModal)
```
그리고 모달 마크업의 컨테이너 `<div role="dialog" ...>`에 `ref={trapRef}`를 부착하고, 바깥 클릭 핸들러를 `closeModal`로 통일:
```tsx
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6"
          onClick={closeModal}>
          <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-[20px] bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
```
(모달 내부 나머지 마크업·버튼은 기존 그대로 유지.)

- [ ] **Step 3: 타입체크 + 회귀 테스트**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 4: 수동 검증 (브라우저·키보드)**

`npm run dev` → 검토 화면에서 "제출" 클릭:
1. 모달 열리면 포커스가 "아니오"로 이동.
2. Tab/Shift+Tab이 모달 안(아니오↔네)에서만 순환.
3. Esc로 모달 닫힘(busy가 아닐 때). 닫히면 포커스가 "제출" 버튼으로 복귀.

- [ ] **Step 5: Commit**

```bash
git add hooks/useFocusTrap.ts app/review/page.tsx
git commit -m "feat(a11y): 포커스 트랩 훅 + 제출 확인 모달 포커스/Esc 처리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: reduced-motion·프로그레스바 정리 + README E2E 체크리스트 (#9, #10)

**Files:**
- Modify: `components/ProgressBar.tsx`
- Modify: `README.md` (수동 E2E 체크리스트 항목 추가)

**Interfaces:** 없음(마감 정리).

- [ ] **Step 1: ProgressBar motion-reduce**

```tsx
// components/ProgressBar.tsx — transition에 motion-reduce 가드 추가
export function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full">
      <p className="mb-1.5 text-xs text-ink-mute">
        문항 <b className="font-read font-semibold text-ink-soft">{current} / {total}</b>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E7ECF8]">
        <div className="h-full rounded-full bg-blue transition-all motion-reduce:transition-none"
          style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: README E2E 체크리스트 갱신**

`README.md`의 "수동 E2E 체크리스트" 목록에 다음 3줄을 추가한다(기존 줄은 유지):
```markdown
  - [ ] iOS Safari 실기기: 마이크 확인 통과 후 무음 녹음이 없는지(레벨미터 반응·완료 후 재생 없이 저장)
  - [ ] 진행 중 탭 닫기/새로고침 후 재진입 시 같은 문항·단계로 복원
  - [ ] 제출 확인 모달: 초기 포커스(아니오) · Tab 순환 · Esc 닫기 · 닫은 뒤 포커스 복귀
```

- [ ] **Step 3: 타입체크 + 전체 테스트**

Run: `npm run typecheck && npx vitest run`
Expected: PASS (전체 스위트 그린).

- [ ] **Step 4: 최종 수동 스모크**

`npm run dev` → 브라우저 개발자도구에서 "Emulate CSS prefers-reduced-motion: reduce" 활성화:
- 녹음 중 빨간 점 펄스가 멈추고, 레벨미터 막대는 여전히 목소리에 반응(기능 유지)함을 확인.
- 프로그레스바가 문항 이동 시 애니메이션 없이 즉시 갱신됨을 확인.

- [ ] **Step 5: Commit**

```bash
git add components/ProgressBar.tsx README.md
git commit -m "chore(a11y,docs): 프로그레스바 reduced-motion + iOS/재개/모달 E2E 체크리스트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검 결과)

**Spec coverage (Phase 1 항목 1~10):**
- #1 상태 유실 → Task 2(저장) + Task 8(복원). ✅
- #2 iOS 무음 → Task 1(에러분류) + Task 4(resume/정리/타입드에러) + Task 6·7(안내). ✅
- #3 버튼 라벨 → Task 8(“검토”). ✅
- #4 업로드중 잠금 → Task 6(onBusyChange) + Task 8(isUploading 게이트). ✅
- #5 타이머 단일화 → Task 4(elapsedMs/remainingSec) + Task 5·6(배선). ✅
- #6 임계값 통일 → Task 1(MIC_MIN_PEAK) + Task 6·7. ✅
- #7 배타 선택 → Task 3(헬퍼) + Task 8(배선). ✅
- #8 모달 a11y → Task 9(useFocusTrap + review). ✅
- #9 reduced-motion → Task 5(미터/버튼) + Task 6(펄스) + Task 10(프로그레스바). ✅
- #10 미터 색상 단독/체크박스 → Task 5(role=meter+값) + Task 8(체크박스 h-5 w-5, label 히트영역). ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, "TBD/적절히 처리" 없음. 컴포넌트/훅/iOS 동작은 node 테스트 불가로 명시적 수동 검증 스텝으로 대체(저장소의 기존 방침과 일치). ✅

**Type consistency:** `useRecorder` 반환 `{ state, level, elapsedMs, remainingSec, start, stop }`가 Task 5(RecordButton `elapsedMs`), Task 6·7(`recorder.elapsedMs`/`remainingSec`)에서 동일 명칭으로 소비됨. `RecorderErrorKind`/`classifyRecorderError`/`MIC_MIN_PEAK`/`remainingSec`/`RecorderError` 명칭이 Task 1 정의와 소비처(4/6/7) 일치. `toggleChecklistArea` 시그니처 Task 3↔8 일치. `SurveyState.idx/phase` Task 2↔8 일치. ✅

**주의(구현자 참고):** 체크박스 히트영역(#10)은 native input을 `h-4 w-4`→`h-5 w-5`로 키우고, 감싼 `<label>`의 `px-4 py-3` 패딩으로 실질 터치 타깃 ≥24px를 확보(Task 8 코드에 반영). 별도 태스크 불필요.
