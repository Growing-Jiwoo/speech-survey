# Phase 2 — 관리자(admin) 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자/검사자가 여러 아동의 녹음을 청취해 수기 채점하는 워크플로의 효율·정확성·신뢰성을 높인다(스펙 항목 11~18). 채점용 오디오 플레이어(파형·배속·구간·키보드), 서명 URL 만료 자동 복구, 목록 가상화, 파생값 메모이즈, 신규 제출 반영(수동 새로고침·포커스 갱신), "오늘" 집계의 KST 기준화, 다음/이전 아동 이동, 검색·정렬·필터 UI 정리를 다룬다. 채점 입력·저장(B-1)은 **포함하지 않는다**.

**Architecture:** 순수 로직(KST 일자 키, 확장된 필터·정렬, 인접 세션 id 계산)을 `lib/adminStats.ts`에 모아 vitest(`node`)로 TDD하고, 그 위에서 React 계층을 배선한다. 오디오는 앱 전역 "현재 재생 1개" 컨텍스트(`AudioBus`) + wavesurfer.js v7 기반 `AudioPlayer`로 교체한다. 목록은 `@tanstack/react-table`(headless 컬럼 모델) + `@tanstack/react-virtual`(행 가상화)로 재구성하되, 필터·정렬의 단일 소스는 기존 URL 동기화 로직(`adminStats`)을 그대로 유지한다. 전량 페치·클라이언트 집계(KPI/학교별/옵션)는 유지한다(서버 페이지네이션 미도입 — 사용자 확정). 컴포넌트/DOM/wavesurfer 동작은 `npm run typecheck` + 명시적 수동 브라우저 검증으로 확인한다.

**Tech Stack:** Next.js 16.2, React 19.2, TypeScript 5.9, Tailwind 4, TanStack Query 5, Supabase, Vitest 4 (환경: `node`). **신규 의존성**: `wavesurfer.js`(v7), `@tanstack/react-table`(v8), `@tanstack/react-virtual`(v3).

## Global Constraints

- **신규 의존성 버전 고정·검증**: `wavesurfer.js`, `@tanstack/react-table`, `@tanstack/react-virtual`를 설치한 뒤 `package.json`에 **정확한 설치 버전으로 고정**한다(캐럿 `^` 대신 실제 버전 문자열 권장, 또는 설치 후 `npm ls`로 확인). 구현 중 각 라이브러리의 **실제 설치 버전 API**를 문서/타입 정의(`node_modules/*/dist/*.d.ts`)로 확인한다 — 본 문서의 wavesurfer/react-table/react-virtual 코드는 v7/v8/v3 기준이며, 마이너 차이(메서드명·옵션 키)가 있으면 실제 API에 맞춘다.
- **테스트 환경은 `vitest.config.ts`의 `environment: 'node'`**: 순수 로직(KST 일자 키, 필터·정렬, 인접 id)만 vitest로 TDD한다. React 컴포넌트 / wavesurfer / DOM 동작(IntersectionObserver, 파형 렌더, 가상 스크롤, 키보드)은 **`npm run typecheck`(= `tsc --noEmit`) + 명시적 수동 브라우저 스텝**으로 검증한다. 이 저장소에는 jsdom/testing-library가 없으며 **이번에도 추가하지 않는다**.
- **경로 별칭**: `@/*` → 저장소 루트(`tsconfig.json`, `vitest.config.ts`).
- **색상은 globals.css의 CSS 변수 사용**(`var(--color-blue)` 등). 단, wavesurfer의 파형은 canvas에 그려지므로 canvas fillStyle이 `var()`를 해석하지 못한다 → 파형 색(waveColor/progressColor/cursorColor)만 `getComputedStyle`로 실제 값을 읽어 전달한다(코드에 헬퍼·주석 포함). 그 외 버튼·UI는 기존 Tailwind 클래스/토큰 유지, UI 껍데기 재작성 금지.
- **타입 검증**: 각 컴포넌트 태스크 종료 시 `npm run typecheck` 통과 필수. Next 빌드 타입체크는 꺼져 있으므로 이것으로만 판단.
- **커밋 메시지 말미에** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 포함.
- **작업 브랜치**: 신규 기능 브랜치에서 작업(main 직접 커밋 금지).

---

### Task 1: 신규 의존성 설치 + AudioBus (현재 재생 플레이어 1개만 활성)

여러 `<audio>`/wavesurfer 인스턴스가 동시에 소리 내는 문제(항목 11)를 앱 전역 컨텍스트로 막는다. 새 플레이어가 재생을 시작하면 직전 플레이어를 정지시킨다. Provider 밖에서도 no-op 폴백으로 동작한다.

**Files:**
- Modify: `package.json` (의존성 3종 추가·버전 고정)
- Create: `components/AudioBus.tsx`

**Interfaces:**
- Produces:
  - `AudioBusProvider({ children })` — 현재 재생 중인 정지 콜백을 ref로 보관.
  - `useAudioBus(): { play(stop): void; clear(stop): void }` — Provider 없으면 no-op.

- [ ] **Step 1: 의존성 설치 + 버전 고정**

```bash
npm install wavesurfer.js @tanstack/react-table @tanstack/react-virtual
npm ls wavesurfer.js @tanstack/react-table @tanstack/react-virtual
```
설치 후 `package.json`의 세 의존성 버전을 실제 설치된 값(예 `"wavesurfer.js": "7.x.y"`, `"@tanstack/react-table": "8.x.y"`, `"@tanstack/react-virtual": "3.x.y"`)으로 확인·고정한다. 이후 코드 작성 전에 `node_modules/wavesurfer.js/dist/wavesurfer.d.ts`(및 react-table/virtual 타입)를 열어 본 문서에서 쓰는 메서드·옵션명이 실제 버전과 일치하는지 대조한다.

- [ ] **Step 2: AudioBus 구현**

```tsx
// components/AudioBus.tsx — 앱 전역 "현재 재생 중인 플레이어 1개" 조정.
// 새 플레이어가 play를 시작하면 직전 플레이어의 stop 콜백을 호출해 동시 재생을 막는다.
'use client'
import { createContext, useCallback, useContext, useMemo, useRef } from 'react'

type StopFn = () => void

interface AudioBusValue {
  /** 새 플레이어가 재생을 시작할 때 호출 — 직전에 재생 중이던 플레이어를 정지시킨다. */
  play(stop: StopFn): void
  /** 플레이어가 스스로 정지/종료/언마운트될 때 등록 해제 */
  clear(stop: StopFn): void
}

const NOOP: AudioBusValue = { play: () => {}, clear: () => {} }
const AudioBusContext = createContext<AudioBusValue | null>(null)

export function AudioBusProvider({ children }: { children: React.ReactNode }) {
  const currentRef = useRef<StopFn | null>(null)
  const play = useCallback((stop: StopFn) => {
    if (currentRef.current && currentRef.current !== stop) currentRef.current()
    currentRef.current = stop
  }, [])
  const clear = useCallback((stop: StopFn) => {
    if (currentRef.current === stop) currentRef.current = null
  }, [])
  const value = useMemo<AudioBusValue>(() => ({ play, clear }), [play, clear])
  return <AudioBusContext.Provider value={value}>{children}</AudioBusContext.Provider>
}

/** Provider 밖(플레이어 단독 사용)에서는 no-op으로 안전하게 동작한다. */
export function useAudioBus(): AudioBusValue {
  return useContext(AudioBusContext) ?? NOOP
}
```

- [ ] **Step 3: 타입체크**

Run: `npm run typecheck`
Expected: PASS (에러 없음). — 컨텍스트 자체는 DOM 의존이 없으나, 실제 동작은 Task 2·6의 수동 검증에서 확인한다.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json components/AudioBus.tsx
git commit -m "feat(audio-bus): wavesurfer/react-table/react-virtual 추가 + 동시재생 방지 컨텍스트

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: AudioPlayer를 wavesurfer.js v7로 재작성 (파형·배속·−5초·키보드·동시재생 방지·onError)

`AudioPlayer`를 wavesurfer 기반으로 교체한다. props는 기존 `{ src }`에 `onError?`(URL 만료 복구용, 항목 12)를 확장한다. 화면에 들어온 행만 인스턴스를 생성(IntersectionObserver 지연 로드)해 결과지당 최대 ~26개 동시 생성을 막는다.

**Files:**
- Modify: `components/AudioPlayer.tsx` (전체 재작성)

**Interfaces:**
- Consumes: `useAudioBus`(Task 1), `wavesurfer.js`.
- Produces: `AudioPlayer({ src, onError? })`
  - `src: string` — 서명 오디오 URL.
  - `onError?: () => void` — wavesurfer 로드/디코드 에러 시 1회 호출(부모가 상세 재페치로 새 서명 URL 발급).

- [ ] **Step 1: 재작성**

```tsx
// components/AudioPlayer.tsx — 채점용 오디오 플레이어(wavesurfer.js v7).
// 파형 클릭/드래그 시크 · 배속(0.75~1.5×) · −5초 · 키보드(Space/←/→) · 동시재생 1개 · onError 복구.
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { useAudioBus } from '@/components/AudioBus'

const RATES = [0.75, 1, 1.25, 1.5] as const

/** canvas fillStyle은 CSS var()를 해석하지 못하므로, globals.css 변수를 실제 값으로 읽어 온다. */
function cssVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioPlayer({ src, onError }: { src: string; onError?: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const bus = useAudioBus()

  const [visible, setVisible] = useState(false)   // 화면 진입 전에는 인스턴스 미생성(지연 로드)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)

  // 1) 화면에 들어온 행만 wavesurfer 인스턴스를 만든다(결과지당 최대 ~26개 동시 생성 방지).
  useEffect(() => {
    const el = rootRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  // 2) visible + src 확정 시 인스턴스 생성/정리.
  useEffect(() => {
    if (!visible || !waveRef.current) return
    const ws = WaveSurfer.create({
      container: waveRef.current,
      url: src,
      height: 32,
      waveColor: cssVar('--color-line') || '#E3E8F3',
      progressColor: cssVar('--color-blue') || '#2F6BFF',
      cursorColor: cssVar('--color-blue-deep') || '#1E4FCC',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
    })
    wsRef.current = ws
    const stop = () => { ws.pause() }
    ws.on('ready', () => { setReady(true); setDur(ws.getDuration()); ws.setPlaybackRate(rate) })
    ws.on('play', () => { setPlaying(true); bus.play(stop) })
    ws.on('pause', () => { setPlaying(false); bus.clear(stop) })
    ws.on('finish', () => { setPlaying(false); bus.clear(stop) })
    ws.on('timeupdate', (t: number) => setCur(t))
    ws.on('error', () => { onErrorRef.current?.() })
    return () => {
      bus.clear(stop)
      ws.destroy()
      wsRef.current = null
      setReady(false); setPlaying(false); setCur(0); setDur(0)
    }
    // rate는 ready 이후 setPlaybackRate로만 반영(재생성 방지) → 의존성 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, src, bus])

  const toggle = useCallback(() => { wsRef.current?.playPause() }, [])
  const back5 = useCallback(() => { wsRef.current?.skip(-5) }, [])
  const cycleRate = useCallback(() => {
    setRate(prev => {
      const next = RATES[(RATES.indexOf(prev as typeof RATES[number]) + 1) % RATES.length]
      wsRef.current?.setPlaybackRate(next)
      return next
    })
  }, [])

  // 3) 플레이어 포커스 시 키보드: Space 재생/정지, ←/→ 5초 이동.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); wsRef.current?.playPause() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); wsRef.current?.skip(-5) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); wsRef.current?.skip(5) }
  }, [])

  return (
    <div ref={rootRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="녹음 재생기"
      className="flex w-full max-w-[280px] items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue/40">
      <button type="button" onClick={toggle} disabled={!ready} aria-label={playing ? '일시정지' : '재생'}
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-white disabled:opacity-40">
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
      <button type="button" onClick={back5} disabled={!ready} aria-label="5초 뒤로"
        className="flex-none rounded-md bg-well px-2 py-1 text-[11px] font-bold text-ink-soft transition disabled:opacity-40">
        −5초
      </button>
      <div ref={waveRef} className="h-8 min-w-0 flex-1" aria-hidden="true" />
      <span className="flex-none font-read text-[11px] tabular-nums text-ink-mute">{fmt(cur)}/{fmt(dur)}</span>
      <button type="button" onClick={cycleRate} disabled={!ready} aria-label={`재생 속도 ${rate}배`}
        className="flex-none rounded-md bg-well px-2 py-1 text-[11px] font-bold text-blue transition disabled:opacity-40">
        {rate}×
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `npm run typecheck`
Expected: PASS. — wavesurfer 이벤트 콜백 시그니처(`timeupdate`의 인자 타입 등)가 실제 설치 버전과 다르면 타입 에러가 날 수 있으니, `node_modules/wavesurfer.js` 타입에 맞춰 콜백 인자 타입을 조정한다. (AdminDetailView의 `onError` 배선은 Task 6.)

- [ ] **Step 3: 수동 검증 (브라우저)** — Task 6 배선 이후 함께 확인해도 무방하나, 단독 확인이 필요하면 임시 페이지에서:

`npm run dev` → 관리자 로그인 → 결과지(`/admin/{id}`) 진입(현재는 아직 AudioBus/onError 미배선 상태이므로 재생·파형·배속·−5초·키보드만 확인):
1. 파형이 그려지고 클릭/드래그로 위치 이동.
2. 재생/일시정지, `−5초`, `1×→0.75→1.25→1.5→...` 배속 순환.
3. 플레이어에 포커스(Tab) 후 Space/←/→ 동작.

- [ ] **Step 4: Commit**

```bash
git add components/AudioPlayer.tsx
git commit -m "feat(audio-player): wavesurfer v7 파형·배속·−5초·키보드·지연로드·onError

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: KST 일자 키 헬퍼 + "오늘" 집계 KST 기준화 (항목 16)

`computeKpis`·`filterSessions`가 로컬 타임존 `toDateString()`으로 일자를 비교해 자정 무렵 KST와 불일치하는 문제를 고친다. KST(UTC+9) 일자 키를 명시 계산하는 순수 헬퍼를 추가하고 두 함수를 이 헬퍼로 배선한다.

**Files:**
- Modify: `lib/adminStats.ts` (`kstDateKey` 추가 + `computeKpis`/`filterSessions` 배선)
- Modify: `tests/adminStats.test.ts` (KST 경계 테스트 추가·기존 문구 갱신)

**Interfaces:**
- Produces: `kstDateKey(d: Date): string` — 해당 시각의 KST 기준 `YYYY-MM-DD`.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/adminStats.test.ts` — import에 `kstDateKey` 추가, 새 describe 추가, 기존 KST 문구 테스트 교체)

`import` 라인을 아래로 확장:
```ts
import {
  sessionProgress, computeKpis, computeSchoolStats, schoolOptions, gradeOptions, filterSessions, sortSessions,
  parseFilters, filtersToQuery, kstDateKey, adjacentSessionIds, DEFAULT_FILTERS, DEFAULT_SORT,
} from '@/lib/adminStats'
```
(주의: `adjacentSessionIds`는 Task 5에서 구현되므로, Task 3 시점에는 import 목록에 아직 넣지 않는다 — Task 5 테스트 작성 시 추가한다. Task 3에서는 `kstDateKey`만 추가한다.)

새 describe 블록 추가:
```ts
describe('kstDateKey', () => {
  it('UTC 시각을 KST(+9) 일자 키로 변환', () => {
    // 2026-07-13T15:00:00Z == 2026-07-14 00:00 KST
    expect(kstDateKey(new Date('2026-07-13T15:00:00.000Z'))).toBe('2026-07-14')
    // 2026-07-13T14:59:00Z == 2026-07-13 23:59 KST
    expect(kstDateKey(new Date('2026-07-13T14:59:00.000Z'))).toBe('2026-07-13')
  })
})

describe('computeKpis (KST 오늘)', () => {
  it('오늘 판정은 KST 일자 경계 기준', () => {
    // now = 2026-07-14 00:30 KST
    const now = new Date('2026-07-13T15:30:00.000Z')
    const sameKstDay = mkSession({ started_at: '2026-07-13T15:10:00.000Z' }) // 2026-07-14 00:10 KST → 오늘
    const prevKstDay = mkSession({ started_at: '2026-07-13T14:50:00.000Z' }) // 2026-07-13 23:50 KST → 어제
    expect(computeKpis([sameKstDay, prevKstDay], now).today).toBe(1)
  })
})
```

기존 `computeKpis` describe 안의 `it('오늘 판정은 로컬 타임존 toDateString 기준', ...)` 테스트는 KST 기준으로 의미가 바뀌므로 아래로 **교체**한다:
```ts
  it('KST 전날(UTC 오후)은 오늘로 세지 않는다', () => {
    const now = new Date('2026-07-14T05:00:00.000Z') // 2026-07-14 14:00 KST
    const other = mkSession({ started_at: '2026-07-13T01:00:00.000Z' }) // 2026-07-13 10:00 KST
    expect(computeKpis([other], now).today).toBe(0)
  })
```
(나머지 `computeKpis`/`filterSessions` 기존 케이스는 사용 시각이 KST로도 같은 일자에 속하므로 그대로 통과한다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: FAIL — `kstDateKey` is not a function (신규 describe에서).

- [ ] **Step 3: 구현** (`lib/adminStats.ts`)

`import` 아래, "집계" 섹션 위(예: 타입 정의 다음)에 헬퍼 추가:
```ts
// ---------- 날짜(KST) ----------

/** 해당 시각을 KST(UTC+9) 기준 일자 키 'YYYY-MM-DD'로 변환한다.
 * 자정 무렵 로컬 타임존과 KST가 어긋나 "오늘"이 밀리는 문제(항목 16)를 막는다. */
export function kstDateKey(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60_000)
  return kst.toISOString().slice(0, 10)
}
```

`computeKpis`의 일자 비교를 교체:
```ts
export function computeKpis(sessions: SessionListRow[], now: Date): Kpis {
  const todayKey = kstDateKey(now)
  let submitted = 0, today = 0
  for (const s of sessions) {
    if (s.submitted_at) submitted++
    if (kstDateKey(new Date(s.started_at)) === todayKey) today++
  }
  return { total: sessions.length, submitted, inProgress: sessions.length - submitted, today }
}
```

`filterSessions`의 `today` 비교를 교체(키워드 확장은 Task 4에서):
```ts
export function filterSessions(sessions: SessionListRow[], f: Filters, now: Date): SessionListRow[] {
  const keyword = f.q.trim()
  const todayKey = kstDateKey(now)
  return sessions.filter(s => {
    if (f.status === 'submitted' && !s.submitted_at) return false
    if (f.status === 'inProgress' && s.submitted_at) return false
    if (f.school !== null && s.school_name !== f.school) return false
    if (f.grade !== null && s.grade !== f.grade) return false
    if (f.today && kstDateKey(new Date(s.started_at)) !== todayKey) return false
    if (keyword && !s.child_name.includes(keyword) && !s.school_name.includes(keyword)) return false
    return true
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: PASS (전체 스위트 그린).

- [ ] **Step 5: Commit**

```bash
git add lib/adminStats.ts tests/adminStats.test.ts
git commit -m "fix(admin-stats): '오늘' 집계를 KST 일자 경계 기준으로(kstDateKey)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 검색·정렬 확장 (담임/반 검색 + 학년·반/제출일 정렬 + 안정 2차 정렬) (항목 18)

`filterSessions`의 키워드 매칭에 담임교사명·반을 추가하고, `SortKey`에 학년/반(`grade`)·제출일(`submitted`)을 더한다. 동일 정렬 키 내에서는 이름 오름차순으로 2차 정렬해 흔들림(참여일이 날짜만 표시되는 문제)을 완화한다. URL 파서(`SORT_KEY_SET`)도 갱신한다.

**Files:**
- Modify: `lib/adminStats.ts` (`SortKey`, `filterSessions`, `sortSessions`, `SORT_KEY_SET`)
- Modify: `tests/adminStats.test.ts`

**Interfaces:**
- Produces:
  - `SortKey = 'name' | 'school' | 'grade' | 'started' | 'submitted' | 'progress'`
  - `filterSessions` 키워드가 `child_name`·`school_name`·`teacher_name`·`class_no`(문자열) 부분일치.
  - `sortSessions`에 `grade`(학년→반), `submitted`(제출일, 미제출은 최하위) 추가 + 이름 2차 정렬.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/adminStats.test.ts`)

`filterSessions` describe에 케이스 추가:
```ts
  it('검색어는 담임교사명·반도 부분일치', () => {
    const rows = [
      mkSession({ child_name: '김하나', teacher_name: '이담임', class_no: 2 }),
      mkSession({ child_name: '박둘', teacher_name: '최선생', class_no: 5 }),
    ]
    expect(filterSessions(rows, f({ q: '이담임' }), now)).toHaveLength(1)
    expect(filterSessions(rows, f({ q: '최선생' }), now)).toHaveLength(1)
    expect(filterSessions(rows, f({ q: '5' }), now)).toHaveLength(1) // 반 번호
  })
```

`sortSessions` describe에 케이스 추가(상단 `a`,`b` 픽스처 활용 + 신규 픽스처):
```ts
  it('grade는 학년→반 순, 동일 학년·반은 이름 2차 정렬', () => {
    const g1c2n = mkSession({ child_name: '나', grade: 1, class_no: 2 })
    const g1c2a = mkSession({ child_name: '가', grade: 1, class_no: 2 })
    const g2c1 = mkSession({ child_name: '다', grade: 2, class_no: 1 })
    const sorted = sortSessions([g2c1, g1c2n, g1c2a], { key: 'grade', dir: 'asc' }, TOTALS2)
    expect(sorted.map(s => s.child_name)).toEqual(['가', '나', '다'])
  })
  it('submitted는 제출일 기준, 미제출은 최하위(asc/desc 공통으로 뒤로)', () => {
    const late = mkSession({ child_name: '나', submitted_at: '2026-07-14T05:00:00.000Z' })
    const early = mkSession({ child_name: '가', submitted_at: '2026-07-14T01:00:00.000Z' })
    const none = mkSession({ child_name: '다', submitted_at: null })
    const asc = sortSessions([none, late, early], { key: 'submitted', dir: 'asc' }, TOTALS2)
    expect(asc.map(s => s.child_name)).toEqual(['가', '나', '다'])
    const desc = sortSessions([none, early, late], { key: 'submitted', dir: 'desc' }, TOTALS2)
    expect(desc.map(s => s.child_name)).toEqual(['나', '가', '다'])
  })
```

`URL 직렬화` describe에 케이스 추가:
```ts
  it('parseFilters — 신규 sort 키(grade/submitted) 허용', () => {
    expect(parseFilters(new URLSearchParams('sort=grade&dir=asc')).sort).toEqual({ key: 'grade', dir: 'asc' })
    expect(parseFilters(new URLSearchParams('sort=submitted&dir=desc')).sort).toEqual({ key: 'submitted', dir: 'desc' })
  })
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: FAIL — 담임/반 미검색, `grade`/`submitted` 정렬 미구현, 파서 폴백으로 assertion 실패.

- [ ] **Step 3: 구현** (`lib/adminStats.ts`)

`SortKey` 타입 확장:
```ts
export type SortKey = 'name' | 'school' | 'grade' | 'started' | 'submitted' | 'progress'
```

`filterSessions` 키워드 매칭 라인 교체(다른 조건은 Task 3 결과 유지):
```ts
    if (keyword
      && !s.child_name.includes(keyword)
      && !s.school_name.includes(keyword)
      && !s.teacher_name.includes(keyword)
      && !String(s.class_no).includes(keyword)) return false
```

`sortSessions` 전체 교체(안정 2차 정렬 포함):
```ts
export function sortSessions(rows: SessionListRow[], sort: Sort, totals: Totals): SessionListRow[] {
  const denom = totals.rec + totals.write
  // 미제출(제출일 없음)은 방향과 무관하게 항상 목록 끝으로 보내기 위한 sentinel.
  const NO_SUBMIT = { asc: Number.POSITIVE_INFINITY, desc: Number.NEGATIVE_INFINITY }
  const value = (s: SessionListRow): string | number => {
    switch (sort.key) {
      case 'name': return s.child_name
      case 'school': return s.school_name
      case 'grade': return s.grade * 100 + s.class_no
      case 'started': return new Date(s.started_at).getTime()
      case 'submitted': return s.submitted_at ? new Date(s.submitted_at).getTime() : NO_SUBMIT[sort.dir]
      case 'progress': {
        const p = sessionProgress(s, totals)
        return denom === 0 ? 0 : (p.recorded + p.written) / denom
      }
    }
  }
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = value(a), vb = value(b)
    const primary = typeof va === 'string' ? va.localeCompare(vb as string, 'ko') : va - (vb as number)
    if (primary !== 0) return primary * sign
    // 동일 정렬 키 값 → 이름 오름차순 2차 정렬(방향 무관하게 일관된 순서로 흔들림 방지)
    return a.child_name.localeCompare(b.child_name, 'ko')
  })
}
```
(주의: `submitted`의 `NO_SUBMIT` sentinel에 `sign`이 곱해지면 방향이 반대로 뒤집히므로, 미제출은 `sign` 적용 전 값 자체를 `dir`에 맞춰 넣어 `primary * sign` 이후에도 항상 뒤로 가도록 했다. 즉 asc면 +∞(작은 값이 앞이니 +∞는 뒤), desc면 −∞에 `sign=-1`이 곱해져 다시 뒤로 간다.)

`SORT_KEY_SET` 갱신:
```ts
const SORT_KEY_SET = new Set<SortKey>(['name', 'school', 'grade', 'started', 'submitted', 'progress'])
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/adminStats.ts tests/adminStats.test.ts
git commit -m "feat(admin-stats): 담임/반 검색 + 학년·반/제출일 정렬 + 이름 2차 정렬

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 인접 세션 id 계산 헬퍼 (다음/이전 아동) (항목 17)

결과지에서 "이전/다음 아동"으로 이동하기 위해, 이미 필터·정렬된 행 배열에서 현재 id의 앞/뒤 세션 id를 구하는 순수 함수를 추가한다. 실제 필터·정렬 재구성(캐시 목록 + `parseFilters(back)`)은 Task 6에서 이 헬퍼를 호출해 조립한다.

**Files:**
- Modify: `lib/adminStats.ts` (`adjacentSessionIds` 추가)
- Modify: `tests/adminStats.test.ts`

**Interfaces:**
- Produces: `adjacentSessionIds(rows: SessionListRow[], currentId: string): { prev: string | null; next: string | null }`
  - `rows`는 **이미 필터·정렬 적용된** 배열. 현재 id가 없으면 `{prev:null,next:null}`.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/adminStats.test.ts` — import에 `adjacentSessionIds` 추가)

```ts
describe('adjacentSessionIds', () => {
  const rows = [
    mkSession({ id: 'a' }), mkSession({ id: 'b' }), mkSession({ id: 'c' }),
  ]
  it('가운데 항목은 앞/뒤 모두 반환', () => {
    expect(adjacentSessionIds(rows, 'b')).toEqual({ prev: 'a', next: 'c' })
  })
  it('처음/끝 경계는 해당 방향 null', () => {
    expect(adjacentSessionIds(rows, 'a')).toEqual({ prev: null, next: 'b' })
    expect(adjacentSessionIds(rows, 'c')).toEqual({ prev: 'b', next: null })
  })
  it('목록에 없으면 둘 다 null', () => {
    expect(adjacentSessionIds(rows, 'zzz')).toEqual({ prev: null, next: null })
  })
  it('빈 목록도 안전', () => {
    expect(adjacentSessionIds([], 'a')).toEqual({ prev: null, next: null })
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: FAIL — `adjacentSessionIds` is not a function.

- [ ] **Step 3: 구현** (`lib/adminStats.ts`, `sortSessions` 아래·URL 섹션 위에 추가)

```ts
// ---------- 결과지 내 이동 (이전/다음 아동) ----------

/** 이미 필터·정렬된 rows에서 currentId의 앞/뒤 세션 id를 구한다.
 * 결과지의 「◀ 이전 아동 / 다음 아동 ▶」이 목록과 같은 순서로 이동하도록 한다(항목 17). */
export function adjacentSessionIds(
  rows: SessionListRow[], currentId: string,
): { prev: string | null; next: string | null } {
  const idx = rows.findIndex(r => r.id === currentId)
  if (idx === -1) return { prev: null, next: null }
  return {
    prev: idx > 0 ? rows[idx - 1].id : null,
    next: idx < rows.length - 1 ? rows[idx + 1].id : null,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/adminStats.test.ts`
Expected: PASS (전체 스위트 그린).

- [ ] **Step 5: Commit**

```bash
git add lib/adminStats.ts tests/adminStats.test.ts
git commit -m "feat(admin-stats): 인접 세션 id 계산(adjacentSessionIds) 헬퍼

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: AdminDetailView — 녹음 길이 표시 + 이전/다음 아동 이동 + 서명 URL 만료 자동 복구 (항목 11·12·17)

결과지에 (a) 각 녹음 행의 `duration_sec`를 `mm:ss`로 표시하고 `item.maxSec` 초과 시 amber 플래그, (b) 헤더에 「◀ 이전 아동 / 다음 아동 ▶」 이동(캐시 목록 + `parseFilters(back)` 기반, `back` 보존), (c) wavesurfer `onError` → 상세 재페치로 만료된 서명 URL 자동 복구를 배선한다. 재생기들은 `AudioBusProvider`로 감싼다.

**Files:**
- Modify: `components/admin/AdminDetailView.tsx`

**Interfaces:**
- Consumes: `useSessionsQuery`(캐시 목록), `useQueryClient`, `parseFilters`/`filterSessions`/`sortSessions`/`adjacentSessionIds`(adminStats), `RECORDING_ITEMS`/`WRITING_ITEMS`(items), `AudioBusProvider`(Task 1), `AudioPlayer`의 `onError`(Task 2).

- [ ] **Step 1: 재작성**

```tsx
// components/admin/AdminDetailView.tsx
'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ITEMS, KIND_LABEL, RECORDING_ITEMS, SECTION_LABEL, WRITING_ITEMS, areaLabel } from '@/lib/items'
import { adjacentSessionIds, filterSessions, parseFilters, sortSessions } from '@/lib/adminStats'
import { useSessionDetailQuery, useSessionsQuery } from '@/hooks/useAdminQueries'
import { AudioBusProvider } from '@/components/AudioBus'
import { AudioPlayer } from '@/components/AudioPlayer'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'

// 결과지에서도 목록과 동일한 totals(문항 수)로 정렬·진행률을 재구성한다.
const TOTALS = { rec: RECORDING_ITEMS.length, write: WRITING_ITEMS.length }

/** 초 → m:ss (미상이면 '—') */
function fmtDur(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AdminDetailView() {
  const id = String(useParams().id)
  const router = useRouter()
  const back = useSearchParams().get('back')
  const listHref = back ? `/admin?${back}` : '/admin'
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useSessionDetailQuery(id)

  // 이전/다음 아동: 캐시된 목록에 back의 필터·정렬을 재적용해 현재 id의 앞/뒤를 구한다.
  const { data: sessions } = useSessionsQuery()
  const nav = useMemo(() => {
    if (!sessions) return { prev: null, next: null }
    const { filters, sort } = parseFilters(new URLSearchParams(back ?? ''))
    const rows = sortSessions(filterSessions(sessions, filters, new Date()), sort, TOTALS)
    return adjacentSessionIds(rows, id)
  }, [sessions, back, id])

  const goHref = (target: string) => back ? `/admin/${target}?back=${encodeURIComponent(back)}` : `/admin/${target}`

  const recItems = useMemo(() => ITEMS.filter(i => i.maxSec > 0), [])
  const writeItems = useMemo(() => ITEMS.filter(i => i.section === 'word_writing'), [])

  const byItem = useMemo(() => {
    const m = new Map<string, { attempt_no: number; url: string; duration_sec: number | null }[]>()
    for (const r of data?.recordings ?? []) {
      const list = m.get(r.item_code) ?? []
      list.push({ attempt_no: r.attempt_no, url: r.url, duration_sec: r.duration_sec })
      m.set(r.item_code, list)
    }
    return m
  }, [data])

  if (isLoading) return <LoadingOverlay show />
  if (isError || !data) return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href={listHref} className="text-sm text-ink-mute underline">← 목록</Link>
      <p className="mt-6 text-sm text-ink-soft">결과지를 불러오지 못했어요. {(error as Error | undefined)?.message ?? ''}</p>
    </main>
  )

  const { session: s, writing } = data
  const writingByCode = new Map(writing.map(w => [w.item_code, w.can_write]))
  const recordedCount = recItems.filter(i => byItem.has(i.code)).length
  const missingCount = (recItems.length - recordedCount) + (writeItems.length - writing.length)

  return (
    <AudioBusProvider>
      <main className="mx-auto max-w-4xl p-6">
        <div className="flex items-center justify-between gap-2">
          <Link href={listHref} className="text-sm text-ink-mute underline">← 목록</Link>
          {/* 이전/다음 아동: 캐시 목록이 없거나 경계면 비활성. 필터(back) 보존 */}
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={!nav.prev}
              onClick={() => nav.prev && router.push(goHref(nav.prev))}
              className="rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition disabled:opacity-40">
              ◀ 이전 아동
            </button>
            <button type="button" disabled={!nav.next}
              onClick={() => nav.next && router.push(goHref(nav.next))}
              className="rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition disabled:opacity-40">
              다음 아동 ▶
            </button>
          </div>
        </div>
        <div className="mt-3 overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
          <div className="border-b border-line px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <Blip variant="logo" className="h-8 w-8" />
              <div>
                <p className="text-[15px] font-bold">
                  결과지 — {s.child_name} ({s.school_name} {s.grade}-{s.class_no}, {s.gender})
                </p>
                <p className="text-[11px] text-ink-mute">
                  생년월일 {s.birth_ymd} · 담임 {s.teacher_name} ({s.teacher_contact}) ·{' '}
                  {new Date(s.started_at).toLocaleString('ko-KR')} · {s.submitted_at ? '제출 완료' : '진행 중'}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="kpi">녹음 <b>{recordedCount} / {recItems.length}</b></span>
                <span className="kpi">낱말쓰기 <b>{writing.length} / {writeItems.length}</b></span>
                {missingCount > 0 && (
                  <span className="rounded-full bg-rec/10 px-3 py-1.5 text-xs font-bold text-rec-deep">
                    미완료 {missingCount}건
                  </span>
                )}
              </div>
            </div>
            {s.checklist.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-ink-soft">확인 필요 영역:</span>
                {s.checklist.map(c => (
                  <span key={c} className="rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">{areaLabel(c)}</span>
                ))}
              </div>
            )}
          </div>

          <h2 className="px-5 pt-4 text-[13px] font-bold text-ink-soft">녹음 문항 (낱말 해독 · 문장 읽기유창성)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-mute">
                <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
                <th scope="col" className="w-24 px-3 font-medium">구분</th>
                <th scope="col" className="px-3 font-medium">제시어</th>
                <th scope="col" className="w-14 px-3 font-medium">시도</th>
                <th scope="col" className="w-20 px-3 font-medium">길이</th>
                <th scope="col" className="w-72 px-3 pr-5 font-medium">듣기</th>
              </tr>
            </thead>
            <tbody>
              {recItems.flatMap(item => {
                const label = item.section === 'word_reading'
                  ? `낱말 (${KIND_LABEL[item.kind!]})` : '문장'
                const views = byItem.get(item.code) ?? []
                if (views.length === 0) return [(
                  <tr key={item.code} className="border-t border-line/60 bg-rec/5">
                    <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                    <td className="px-3 text-xs text-ink-mute">{label}</td>
                    <td className="px-3 font-read whitespace-pre-line">{item.text}</td>
                    <td className="px-3">—</td>
                    <td className="px-3 text-ink-mute">—</td>
                    <td className="px-3 pr-5">
                      <span className="rounded-full bg-rec/10 px-3 py-1 text-xs font-bold text-rec-deep">미녹음</span>
                    </td>
                  </tr>
                )]
                return views.map((v, i) => {
                  const over = v.duration_sec != null && v.duration_sec > item.maxSec
                  return (
                    <tr key={`${item.code}-${v.attempt_no}`} className={i === 0 ? 'border-t border-line/60' : ''}>
                      <td className="px-5 py-3 text-ink-mute">{i === 0 ? item.orderNo : ''}</td>
                      <td className="px-3 text-xs text-ink-mute">{i === 0 ? label : ''}</td>
                      <td className="px-3 font-read whitespace-pre-line">{i === 0 ? item.text : ''}</td>
                      <td className="px-3 text-ink-mute">{views.length > 1 ? `#${v.attempt_no}` : ''}</td>
                      <td className={`px-3 font-read text-[12px] tabular-nums ${over ? 'font-bold text-amber' : 'text-ink-soft'}`}
                        title={over ? `제한(${item.maxSec}초) 초과` : undefined}>
                        {fmtDur(v.duration_sec)}{over && ' !'}
                      </td>
                      <td className="px-3 py-2 pr-5">
                        <AudioPlayer src={v.url}
                          onError={() => queryClient.invalidateQueries({ queryKey: ['admin', 'session', id] })} />
                      </td>
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>

          <h2 className="border-t border-line px-5 pt-4 text-[13px] font-bold text-ink-soft">낱말 쓰기 (예/아니오)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-mute">
                <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
                <th scope="col" className="w-24 px-3 font-medium">구분</th>
                <th scope="col" className="px-3 font-medium">낱말</th>
                <th scope="col" className="w-28 px-3 pr-5 font-medium">답</th>
              </tr>
            </thead>
            <tbody>
              {writeItems.map(item => {
                const v = writingByCode.get(item.code)
                return (
                  <tr key={item.code} className={`border-t border-line/60 ${v === undefined ? 'bg-rec/5' : ''}`}>
                    <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                    <td className="px-3 text-xs text-ink-mute">{KIND_LABEL[item.kind!]}</td>
                    <td className="px-3 font-read">{item.text}</td>
                    <td className="px-3 pr-5">
                      {v === undefined
                        ? <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-bold text-ink-mute">미선택</span>
                        : v
                          ? <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">예</span>
                          : <span className="rounded-full bg-rec/10 px-3 py-1 text-xs font-bold text-rec-deep">아니오</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <h2 className="border-t border-line px-5 pt-4 text-[13px] font-bold text-ink-soft">{SECTION_LABEL.checklist}</h2>
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {s.checklist.length === 0
              ? <span className="text-sm text-ink-mute">선택 없음</span>
              : s.checklist.map(c => (
                <span key={c} className="rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">{areaLabel(c)}</span>
              ))}
          </div>

          <p className="border-t border-line bg-well px-5 py-3 text-[11.5px] text-ink-mute">
            채점 기준(PDF): 낱말 해독은 30초, 문장 읽기유창성은 40초 내 정확 반응 수. 모든 시도(재녹음 포함)가 순서대로 저장됩니다.
          </p>
        </div>
      </main>
    </AudioBusProvider>
  )
}
```

- [ ] **Step 2: 타입체크 + 회귀 테스트**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 3: 수동 검증 (브라우저)**

`npm run dev` → 관리자 로그인 → `/admin`에서 필터·정렬 몇 개 적용 후 한 행 클릭해 결과지 진입:
1. 각 녹음 행에 `m:ss` 길이가 표시되고, 30/40초 초과 시 amber + `!`.
2. 헤더의 「◀ 이전 아동 / 다음 아동 ▶」이 **목록과 같은 순서**로 이동하며, 경계(처음/끝)에서 해당 버튼 비활성. 이동 후 URL에 `back` 유지.
3. 한 재생기를 재생 중 다른 재생기 재생 시 이전 것 자동 정지(AudioBus).
4. (만료 복구) 결과지를 1시간 이상 열어둔 뒤 재생 → 무음 대신 자동으로 상세가 재페치되어 재생 가능(수동 확인이 어려우면 브라우저 콘솔에서 `['admin','session',id]` invalidate 로그/네트워크 재요청으로 확인).

- [ ] **Step 4: Commit**

```bash
git add components/admin/AdminDetailView.tsx
git commit -m "feat(admin-detail): 녹음 길이 표시·이전/다음 아동·서명URL 만료 자동복구

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: AdminDashboard — 파생값 useMemo + now 상태 갱신 + 수동 새로고침 + 포커스 재페치 (항목 14·15·16)

`AdminDashboard`의 파생 배열(kpis/schoolStats/filtered/sorted)을 `useMemo`로 감싸 키 입력마다의 전체 재계산을 없앤다. `now`를 상태로 두고 포커스/1분 주기로 갱신해 KST "오늘" 롤오버를 반영한다. 헤더에 수동 새로고침 버튼(목록 invalidate)을 추가하고, 목록 쿼리에 한해 `refetchOnWindowFocus`를 켠다.

**Files:**
- Modify: `hooks/useAdminQueries.ts` (`useSessionsQuery`에 `refetchOnWindowFocus: true`)
- Modify: `components/admin/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `useMemo`/`useState`/`useEffect`, `useQueryClient`, `useSessionsQuery`(isFetching).

- [ ] **Step 1: useSessionsQuery에 포커스 재페치 개별 오버라이드** (`hooks/useAdminQueries.ts`)

```ts
/** 관리자 목록 세션. 신규 제출 반영을 위해 목록에 한해 포커스 시 재페치를 켠다(전역 기본은 유지). */
export function useSessionsQuery() {
  return useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => fetchJson<{ sessions: SessionListRow[] }>('/api/admin/sessions').then(d => d.sessions),
    refetchOnWindowFocus: true,
  })
}
```
(`useSessionDetailQuery`는 그대로 — 결과지 캐시 안정성 유지.)

- [ ] **Step 2: AdminDashboard 재작성** (모든 훅을 조건부 return 위로, 파생값 메모이즈)

```tsx
// components/admin/AdminDashboard.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_FILTERS, DEFAULT_SORT, computeKpis, computeSchoolStats, filterSessions, filtersToQuery,
  gradeOptions, parseFilters, schoolOptions, sortSessions,
  type Filters, type Sort, type SortKey, type Totals,
} from '@/lib/adminStats'
import { useSessionsQuery } from '@/hooks/useAdminQueries'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { StatsCards, type KpiKind } from '@/components/admin/StatsCards'
import { SchoolBreakdown } from '@/components/admin/SchoolBreakdown'
import { SessionTable } from '@/components/admin/SessionTable'

/** /admin 대시보드 — 세션은 react-query로 캐싱, 필터·정렬 상태의 단일 소스는 URL searchParams */
export function AdminDashboard({ totals }: { totals: Totals }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const queryClient = useQueryClient()
  const { data: sessions, isLoading, isError, isFetching, error } = useSessionsQuery()

  // URL 문자열이 바뀔 때만 필터·정렬을 재파싱 → 파생값 useMemo가 안정적으로 캐시된다.
  const spString = sp.toString()
  const { filters, sort } = useMemo(() => parseFilters(new URLSearchParams(spString)), [spString])

  // "오늘" 경계(KST) 롤오버 반영: 포커스 시 + 1분 주기로 now 갱신.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const iv = setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(iv); window.removeEventListener('focus', tick) }
  }, [])

  const list = sessions ?? []
  const kpis = useMemo(() => computeKpis(list, now), [list, now])
  const schoolStats = useMemo(() => computeSchoolStats(list), [list])
  const schools = useMemo(() => schoolOptions(list), [list])
  const grades = useMemo(() => gradeOptions(list), [list])
  const rows = useMemo(
    () => sortSessions(filterSessions(list, filters, now), sort, totals),
    [list, filters, sort, totals, now],
  )

  const apply = (f: Filters, s: Sort) => {
    const qs = filtersToQuery(f, s)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const patchFilters = (patch: Partial<Filters>) => apply({ ...filters, ...patch }, sort)

  const onKpi = (kind: KpiKind) => {
    if (kind === 'total') apply(DEFAULT_FILTERS, sort)
    else if (kind === 'submitted') patchFilters({ status: filters.status === 'submitted' ? 'all' : 'submitted' })
    else if (kind === 'inProgress') patchFilters({ status: filters.status === 'inProgress' ? 'all' : 'inProgress' })
    else patchFilters({ today: !filters.today })
  }
  const onSort = (key: SortKey) =>
    apply(filters, sort.key === key
      ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'started' || key === 'submitted' ? 'desc' : 'asc' })

  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['admin', 'sessions'] }) }

  if (isLoading) return <LoadingOverlay show />
  if (isError || !sessions) return (
    <div className="rounded-[20px] border border-line bg-white p-10 text-center text-sm text-ink-soft shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      데이터를 불러오지 못했어요. {(error as Error | undefined)?.message ?? ''}
    </div>
  )

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <Blip variant="logo" className="h-8 w-8" />
        <div>
          <p className="text-[15px] font-bold">KODYS-G1 읽기 검사 · 관리자</p>
          <p className="text-[11px] text-ink-mute">행을 누르면 결과지가 열립니다 · 카드와 학교를 누르면 목록이 필터링됩니다</p>
        </div>
        <button type="button" onClick={refresh} disabled={isFetching}
          className="ml-auto flex items-center gap-1.5 rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-50">
          <svg className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
          {isFetching ? '갱신 중' : '새로고침'}
        </button>
      </div>
      <StatsCards kpis={kpis} activeStatus={filters.status} activeToday={filters.today} onSelect={onKpi} />
      <SchoolBreakdown stats={schoolStats} activeSchool={filters.school}
        onSelect={school => patchFilters({ school: filters.school === school ? null : school })} />
      <SessionTable rows={rows} total={sessions.length} totals={totals} filters={filters} sort={sort}
        schools={schools} grades={grades}
        onFilters={patchFilters} onSort={onSort} onReset={() => apply(DEFAULT_FILTERS, DEFAULT_SORT)} />
    </div>
  )
}
```

- [ ] **Step 3: 타입체크 + 회귀 테스트**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. (SessionTable props 시그니처는 이번 태스크에서 바뀌지 않는다 — 새로고침 버튼은 대시보드 헤더에 두어 SessionTable을 건드리지 않음. 가상화·Chip 정리는 Task 8.)

- [ ] **Step 4: 수동 검증 (브라우저)**

`npm run dev` → `/admin`:
1. 검색어를 빠르게 타이핑해도 렌더가 매끄러움(파생값 메모이즈).
2. 다른 탭에 다녀오면(포커스 복귀) 목록이 자동 재페치되어 신규 제출 반영. 헤더 "새로고침" 클릭 시 아이콘 스핀 + 목록 갱신.
3. (선택) 시스템 시각을 KST 자정 직후로 바꾸거나 1분 대기 후 "오늘" KPI가 롤오버되는지 확인.

- [ ] **Step 5: Commit**

```bash
git add hooks/useAdminQueries.ts components/admin/AdminDashboard.tsx
git commit -m "perf(admin-dashboard): 파생값 useMemo + now 갱신 + 새로고침/포커스 재페치

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: SessionTable — react-table 컬럼 + react-virtual 행 가상화 + 필터 UI 정리 (항목 13·18)

`SessionTable`을 `@tanstack/react-table`(headless 컬럼 모델) + `@tanstack/react-virtual`(행 가상화)로 재구성한다. 현재 Tailwind 셀 스타일·정렬 헤더·상태 배지·진행률 셀 디자인은 보존한다. 필터·정렬의 단일 소스는 기존 `adminStats`/URL 동기화 로직을 그대로 유지하고, react-table은 컬럼/가상 렌더 골격으로만 쓴다(내장 정렬·필터 모델 미사용). 학교·학년의 중복 표시(Select + Chip)는 Select만 남기고 Chip을 제거한다(today Chip은 유지). 학년/반·제출일 정렬 헤더를 추가한다.

**Files:**
- Modify: `components/admin/SessionTable.tsx` (전체 재작성)

**Interfaces:**
- Consumes: `@tanstack/react-table`, `@tanstack/react-virtual`, 기존 `filtersToQuery`/`sessionProgress`/타입(adminStats), `Select`.
- Produces: 시그니처 불변 — `SessionTable({ rows, total, totals, filters, sort, schools, grades, onFilters, onSort, onReset })`.

- [ ] **Step 1: 재작성**

```tsx
// components/admin/SessionTable.tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createColumnHelper, flexRender, getCoreRowModel, useReactTable, type RowData,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionListRow } from '@/lib/db'
import { filtersToQuery, sessionProgress, type Filters, type Sort, type SortKey, type StatusFilter, type Totals } from '@/lib/adminStats'
import { Select } from '@/components/Select'

// 컬럼별 정렬 키·셀 클래스를 meta로 실어 헤더/셀 렌더에서 사용한다.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    sortKey?: SortKey
    thClassName?: string
    tdClassName?: string
  }
}

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'submitted', label: '제출' },
  { key: 'inProgress', label: '진행 중' },
]

const ROW_HEIGHT = 56  // 진행률 트랙 2개 기준 예상 행 높이(measureElement로 실측 보정)

/** 관리자 세션 목록 — 필터/정렬 상태는 부모(AdminDashboard)가 보유, 여기는 표시와 콜백만.
 * react-table은 컬럼/가상 렌더 골격으로만 쓰고, 정렬·필터는 기존 URL 동기화 로직을 그대로 사용한다. */
export function SessionTable({ rows, total, totals, filters, sort, schools, grades, onFilters, onSort, onReset }: {
  rows: SessionListRow[]           // 필터·정렬 적용 완료본
  total: number                    // 전체 세션 수 (빈 상태 문구 분기용)
  totals: Totals
  filters: Filters
  sort: Sort
  schools: string[]
  grades: number[]
  onFilters: (patch: Partial<Filters>) => void
  onSort: (key: SortKey) => void
  onReset: () => void
}) {
  const router = useRouter()
  // 검색 입력은 로컬 상태 + 250ms 디바운스로 URL에 반영
  const [qLocal, setQLocal] = useState(filters.q)
  useEffect(() => { setQLocal(filters.q) }, [filters.q])
  useEffect(() => {
    const t = setTimeout(() => { if (qLocal !== filters.q) onFilters({ q: qLocal }) }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal])

  const hasFilter = filters.q !== '' || filters.status !== 'all'
    || filters.school !== null || filters.grade !== null || filters.today

  // 결과지로 이동했다가 "← 목록"으로 돌아올 때 현재 필터·정렬을 유지하기 위해 back 파라미터로 전달
  const backQuery = filtersToQuery(filters, sort)
  const detailHref = (id: string) => backQuery ? `/admin/${id}?back=${encodeURIComponent(backQuery)}` : `/admin/${id}`

  // ---- react-table 컬럼 정의 (셀 마크업은 기존 디자인 보존) ----
  const columns = useMemo(() => {
    const col = createColumnHelper<SessionListRow>()
    return [
      col.accessor('child_name', {
        id: 'name', header: '이름',
        meta: { sortKey: 'name', thClassName: 'whitespace-nowrap px-5 py-3', tdClassName: 'whitespace-nowrap px-5 py-2.5' },
        cell: ({ row }) => (
          <Link href={detailHref(row.original.id)} onClick={e => e.stopPropagation()} className="font-bold text-blue">
            {row.original.child_name}
          </Link>
        ),
      }),
      col.accessor('school_name', {
        id: 'school', header: '학교',
        meta: { sortKey: 'school', thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4' },
        cell: ({ row }) => row.original.school_name,
      }),
      col.display({
        id: 'gradeClass', header: '학년/반',
        meta: { sortKey: 'grade', thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4' },
        cell: ({ row }) => `${row.original.grade}-${row.original.class_no}`,
      }),
      col.accessor('birth_ymd', {
        id: 'birth', header: '생년월일',
        meta: { thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4 text-ink-soft' },
        cell: ({ row }) => row.original.birth_ymd,
      }),
      col.display({
        id: 'started', header: '참여일',
        meta: { sortKey: 'started', thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4 text-ink-soft' },
        cell: ({ row }) => new Date(row.original.started_at).toLocaleDateString('ko-KR'),
      }),
      col.display({
        id: 'submitted', header: '제출일',
        meta: { sortKey: 'submitted', thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4 text-ink-soft' },
        cell: ({ row }) => row.original.submitted_at ? new Date(row.original.submitted_at).toLocaleDateString('ko-KR') : '—',
      }),
      col.display({
        id: 'progress', header: '진행률',
        meta: { sortKey: 'progress', thClassName: 'whitespace-nowrap px-4', tdClassName: 'px-4' },
        cell: ({ row }) => {
          const p = sessionProgress(row.original, totals)
          return <ProgressCell recorded={p.recorded} written={p.written} totals={totals} />
        },
      }),
      col.display({
        id: 'checklist', header: '검사자 체크리스트',
        meta: { thClassName: 'whitespace-nowrap px-4', tdClassName: 'whitespace-nowrap px-4' },
        cell: ({ row }) => row.original.checklist.length > 0
          ? <span className="rounded-full bg-amber/10 px-2.5 py-0.5 text-xs font-bold text-amber">{row.original.checklist.length}개 영역</span>
          : <span className="text-xs text-ink-mute">—</span>,
      }),
      col.display({
        id: 'status', header: '상태',
        meta: { thClassName: 'whitespace-nowrap px-4 pr-5', tdClassName: 'whitespace-nowrap px-4 pr-5' },
        cell: ({ row }) => {
          const p = sessionProgress(row.original, totals)
          return <StatusBadge submitted={!!row.original.submitted_at} incomplete={p.incomplete} />
        },
      }),
    ]
    // detailHref는 filters/sort에 의존하므로 backQuery를 deps에 포함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals, backQuery])

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  // ---- 행 가상화 ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const modelRows = table.getRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0
  const colCount = table.getAllLeafColumns().length

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <input value={qLocal} onChange={e => setQLocal(e.target.value)} placeholder="이름·학교·담임·반 검색"
          className="h-10 w-52 rounded-xl border-[1.5px] border-line bg-well px-3.5 text-sm outline-none transition focus:border-blue" />
        <div className="flex gap-1.5">
          {STATUS_TABS.map(t => (
            <button key={t.key} type="button" onClick={() => onFilters({ status: t.key })} aria-pressed={filters.status === t.key}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                filters.status === t.key ? 'bg-blue text-white' : 'bg-well text-ink-soft'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <Select size="sm" ariaLabel="학교 필터" placeholder="학교 전체" className="w-44"
          value={filters.school ?? ''} onChange={v => onFilters({ school: v || null })}
          options={[{ value: '', label: '학교 전체' }, ...schools.map(s => ({ value: s, label: s }))]} />
        <Select size="sm" ariaLabel="학년 필터" placeholder="학년 전체" className="w-28"
          value={filters.grade !== null ? String(filters.grade) : ''}
          onChange={v => onFilters({ grade: v ? Number(v) : null })}
          options={[{ value: '', label: '학년 전체' }, ...grades.map(g => ({ value: String(g), label: `${g}학년` }))]} />
        {/* 학교·학년은 Select가 현재 값을 나타내므로 중복 Chip 제거. Select가 없는 'today'만 Chip 유지. */}
        {filters.today && <Chip label="오늘 참여" onRemove={() => onFilters({ today: false })} />}
        <div className="ml-auto flex items-center gap-2">
          {hasFilter && (
            <>
              <span className="text-xs text-ink-mute">{rows.length}건 표시</span>
              <button type="button" onClick={onReset} className="text-xs font-bold text-blue underline">초기화</button>
            </>
          )}
        </div>
      </div>
      {/* 세로 가상화를 위한 스크롤 컨테이너. 긴 학교명 등은 셀 nowrap + 가로 스크롤로 처리. */}
      <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="text-left text-xs text-ink-mute">
                {hg.headers.map(h => {
                  const meta = h.column.columnDef.meta
                  const label = flexRender(h.column.columnDef.header, h.getContext())
                  const sortKey = meta?.sortKey
                  const on = sortKey !== undefined && sort.key === sortKey
                  return (
                    <th key={h.id} scope="col"
                      aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={`font-medium ${meta?.thClassName ?? 'px-4'}`}>
                      {sortKey !== undefined ? (
                        <button type="button" onClick={() => onSort(sortKey)}
                          className={`inline-flex items-center gap-0.5 ${on ? 'font-bold text-ink' : ''}`}>
                          {label}{on && <span aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                        </button>
                      ) : label}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && <tr><td colSpan={colCount} style={{ height: paddingTop }} /></tr>}
            {virtualRows.map(vr => {
              const row = modelRows[vr.index]
              return (
                <tr key={row.id} data-index={vr.index} ref={rowVirtualizer.measureElement}
                  onClick={() => router.push(detailHref(row.original.id))}
                  className="cursor-pointer border-t border-line/60 hover:bg-well">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className={cell.column.columnDef.meta?.tdClassName ?? 'px-4'}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              )
            })}
            {paddingBottom > 0 && <tr><td colSpan={colCount} style={{ height: paddingBottom }} /></tr>}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <p className="p-8 text-center text-sm text-ink-mute">
          {total === 0 ? '아직 참여한 세션이 없습니다.' : '조건에 맞는 세션이 없습니다.'}
        </p>
      )}
    </>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-blue/10 px-2.5 py-1 text-xs font-bold text-blue">
      {label}
      <button type="button" onClick={onRemove} aria-label={`${label} 필터 제거`} className="leading-none">×</button>
    </span>
  )
}

/** 상태 배지 3단계: 제출 완료(mint) / 제출·미완료 있음(amber) / 진행 중(회색) */
function StatusBadge({ submitted, incomplete }: { submitted: boolean; incomplete: boolean }) {
  if (!submitted)
    return <span className="whitespace-nowrap rounded-full bg-ink/5 px-3 py-1 text-xs font-bold text-ink-mute">진행 중</span>
  if (incomplete)
    return <span className="whitespace-nowrap rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">제출 · 미완료 있음</span>
  return <span className="whitespace-nowrap rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">제출 완료</span>
}

function ProgressCell({ recorded, written, totals }: { recorded: number; written: number; totals: Totals }) {
  return (
    <div className="flex min-w-[140px] flex-col gap-1 py-1.5">
      <Track label="녹음" value={recorded} max={totals.rec} />
      <Track label="쓰기" value={written} max={totals.write} />
    </div>
  )
}

function Track({ label, value, max }: { label: string; value: number; max: number }) {
  const full = value >= max
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-7 text-[10px] text-ink-mute">{label}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-ink/10">
        <span className={`block h-full rounded-full ${full ? 'bg-mint' : 'bg-rec'}`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-read text-[11px] ${full ? 'text-ink-soft' : 'font-bold text-rec-deep'}`}>{value}/{max}</span>
    </div>
  )
}
```

- [ ] **Step 2: 타입체크 + 회귀 테스트**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. — `ColumnMeta` module augmentation과 `flexRender`/`useReactTable`/`useVirtualizer`의 실제 설치 버전 시그니처가 다르면(예 v3 virtual의 `measureElement` 유무, `getVirtualItems` 반환 형태) 타입에 맞춰 조정한다. 특히 `col.accessor`의 제네릭이 엄격하면 `col.display`로 대체하거나 `accessorFn`을 명시한다.

- [ ] **Step 3: 수동 검증 (브라우저)**

`npm run dev` → `/admin`:
1. 목록이 세로 스크롤 컨테이너 안에서 가상화되어 대량(수천 행 목업 시)에서도 스크롤이 매끄러움. 헤더가 sticky로 고정.
2. 정렬 헤더(이름/학교/학년-반/참여일/제출일/진행률) 클릭 시 방향 토글, `aria-sort` 반영.
3. 행 클릭 시 결과지 이동, 이름 링크는 새 탭/전파 차단 유지.
4. 학교·학년 Select 아래 중복 Chip이 **사라졌고**(today Chip만 남음), "N건 표시"·초기화 동작 유지.
5. 상태 배지·진행률 트랙 디자인이 기존과 동일.

- [ ] **Step 4: Commit**

```bash
git add components/admin/SessionTable.tsx
git commit -m "feat(session-table): react-table 컬럼+react-virtual 가상화, 학교/학년 Chip 정리

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (작성자 점검 결과)

**Spec coverage (Phase 2 항목 11~18):**
- 11 wavesurfer 채점용 플레이어 → Task 1(AudioBus 동시재생 방지) + Task 2(파형·배속·−5초·키보드·지연로드) + Task 6(길이 표시·AudioBusProvider 배선). ✅
- 12 서명 URL 만료 무음 실패 → Task 2(`onError` prop) + Task 6(`onError`→`invalidateQueries(['admin','session',id])` 자동 복구). ✅ (TTL 상향은 Phase 3 몫으로 스펙이 명시 — 본 단계는 자동 복구가 1차 방어선.)
- 13 목록 가상화(페이지네이션 조율안) → Task 8(react-table 컬럼 + react-virtual, 클라이언트 전량 페치·집계 유지). ✅
- 14 파생값 매 렌더 재계산 → Task 7(kpis/schoolStats/schools/grades/rows useMemo + spString 기반 filters/sort 안정화). ✅
- 15 신규 제출 미반영 → Task 7(헤더 새로고침 버튼 invalidate + `useSessionsQuery` refetchOnWindowFocus). ✅
- 16 "오늘" KST 기준 → Task 3(kstDateKey + computeKpis/filterSessions 배선) + Task 7(now 상태 포커스/1분 갱신). ✅
- 17 다음/이전 아동 → Task 5(adjacentSessionIds 순수 함수) + Task 6(캐시 목록 + parseFilters(back) 재구성, back 보존, 경계 비활성). ✅
- 18 검색·정렬·필터 UI 정리 → Task 4(담임/반 검색 + 학년·반/제출일 정렬 + 이름 2차 정렬 + SORT_KEY_SET) + Task 8(제출일 헤더, 학교·학년 Chip 제거·today Chip 유지). ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, "TBD/적절히 처리/유사하게" 없음. 컴포넌트·wavesurfer·가상화·DOM 동작은 node 테스트 불가로 `typecheck` + 명시적 수동 브라우저 스텝으로 대체(저장소 방침과 일치). 순수 로직(kstDateKey/필터·정렬/adjacentSessionIds)만 TDD. ✅

**Type consistency (태스크 간):**
- `SortKey`(Task 4에서 `'grade'|'submitted'` 추가)가 Task 7 `onSort`(started/submitted → desc 기본), Task 8 컬럼 meta `sortKey`, `SORT_KEY_SET`(Task 4), `parseFilters`(기존)에서 일관 소비. ✅
- `AudioBusValue { play(stop), clear(stop) }`(Task 1)가 Task 2 AudioPlayer에서 동일 시그니처로 소비. `useAudioBus` no-op 폴백으로 Provider 밖 사용도 타입 안전. ✅
- `AudioPlayer({ src, onError? })`(Task 2)의 `onError`가 Task 6에서 `() => void`로 전달(인자 없음 일치). ✅
- `adjacentSessionIds(rows, currentId) => {prev,next}`(Task 5)가 Task 6에서 `SessionListRow[]` + `string` 인자로 소비, 반환 `string|null`을 버튼 disabled/`goHref`에서 사용. ✅
- `SessionTable` props 시그니처는 Task 8에서 **불변**(Task 7이 넘기는 props와 동일) — 새로고침 버튼은 대시보드 헤더로 분리해 SessionTable 계약을 건드리지 않음. ✅
- `TOTALS`(Task 6, `RECORDING_ITEMS.length`/`WRITING_ITEMS.length`)가 `app/admin/page.tsx`의 `totals` 계산식과 동일 → 결과지와 목록의 정렬·진행률 기준 일치. ✅
- `useSessionsQuery` 반환에 `isFetching` 사용(Task 7) — TanStack Query 5 표준 필드로 타입 존재. ✅

**구현자 주의:**
- **wavesurfer canvas 색상**: `var()`는 canvas에서 해석되지 않으므로 Task 2의 `cssVar()`로 실제 값을 읽어 전달한다. globals.css 변수를 단일 소스로 유지하면서 canvas 제약을 우회하는 의도적 처리(폴백 hex 포함).
- **버전 API 대조**: Task 1 Step 1에서 세 라이브러리 설치 버전을 고정하고, Task 2/8 작성 전 실제 타입 정의로 메서드·옵션명을 확인한다(`WaveSurfer.create` 옵션, `skip/setPlaybackRate/getDuration`, `timeupdate` 콜백 인자; react-table `createColumnHelper/flexRender/getCoreRowModel`, `ColumnMeta` 제네릭; react-virtual `useVirtualizer`/`measureElement`/`getVirtualItems`).
- **가상화 정렬**: `sortSessions`가 이미 정렬한 `rows`를 react-table엔 `getCoreRowModel`로만 넘겨(내장 정렬 미사용) 이중 정렬을 피한다. 헤더 클릭은 부모 `onSort`(URL) 경로로만 흐른다.
