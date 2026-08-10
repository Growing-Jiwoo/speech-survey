# 공식 검사지 PDF 출력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채점 완료된 세션을 담당자가 배포한 **원본 검사지 PDF 그 자체**에 점수만 얹어 내려받게 한다. 선생님이 아동 한 명당 한 장 인쇄하면 공식 검사지가 그대로 나온다.

**Architecture:** 원본 PDF를 배경으로 두고 `pdf-lib`으로 점수·O/X·체크만 좌표에 그린다(스탬핑). 좌표는 손으로 재지 않고 `pdfjs-dist`로 셀 사각형을 추출해 만든 **레이아웃 데이터**(`lib/forms/g1-layout.ts`)에 담는다. 생성은 서버 라우트에서 하고 브라우저는 파일만 받는다. 새 학년 = PDF + 레이아웃 + 문항 3개 파일 추가, **레이아웃 코드 0줄.**

**Tech Stack:** Next.js 16 (App Router), TypeScript, `pdf-lib`, `@pdf-lib/fontkit`, NanumGothic(OFL), Vitest

---

## 왜 이 방식인가 (사전 검증 완료)

"선생님이 아이 한명한명마다 검사 결과를 인쇄한다" → 인쇄물이 **공식 검사지여야 한다.** HTML을 아무리 검사지처럼 다듬어도 폰트·괘선·자간이 근사치라 원본 옆에 놓으면 다른 문서다. 배경이 원본 PDF면 일치 여부를 논할 필요가 없다.

**계획 작성 전에 프로토타입으로 전 구간을 검증했다:**

| 검증 항목 | 결과 |
|---|---|
| 원본 PDF 텍스트 레이어 | 있음 (스캔본 아님). 텍스트 아이템 539개 |
| 페이지 크기 | **540 × 780 pt** (A4 아님 — `@page A4`로 인쇄하면 축소됨) |
| 셀 사각형 추출 | 가능. 낱말 셀이 **정확히 56 × 25.5pt** 격자 |
| 스탬핑 | `pdf-lib`으로 O/X·점수·체크 그리기 성공 |
| 한글 임베딩 | NanumGothic TTF 임베딩 성공. **원본 PDF와 같은 서체**라 스탬프가 이질감 없음 |
| 출력 크기 | 101KB (원본 105KB) |

프로토타입에서 드러난 문제 2가지는 이 계획에 이미 반영했다:
1. 표시를 셀 정중앙에 찍으면 **낱말 본문과 겹쳐 판독 불가** → 셀 **우상단**에 배치
2. 머리글 값이 열 폭을 넘침(`경기초등학교`) → **열 폭에 맞춰 자동 축소 + 가운데 정렬**

### 부수 효과 — 임상 안전

종이 검사지에는 Pass/Fail 칸이 **없다.** 따라서 공식 인쇄물에는 점수만 남고, 임시 기준(9/23/6)으로 나온 판정이 학교로 전달될 물리적 경로가 사라진다. Pass/Fail·총평 밴드는 채점 화면(작업대)에만 둔다.

### 역할 분담

```
화면 ResultSheet (HTML)   = 채점 작업대: 듣기 · O/X · 어절 수 입력 · 총평 · Pass/Fail
[검사지 PDF 다운로드]      = 공식 인쇄물: 원본 PDF + 점수 스탬핑
```

---

## File Structure

**신규**

| 파일 | 책임 |
|---|---|
| `assets/forms/kodys-g1.pdf` | 담당자 배포 원본 검사지 (스탬핑 배경) |
| `assets/fonts/NanumGothic.ttf` | 스탬프용 한글 폰트 (OFL, 원본 PDF와 동일 서체) |
| `assets/fonts/OFL.txt` | 폰트 라이선스 전문 |
| `scripts/extract-form-layout.mjs` | 검사지 PDF → 좌표 추출(개발 도구). 양식 개정 시 재실행 |
| `lib/forms/layout.ts` | `SheetLayout` 타입 — 학년 공통 좌표 스키마 |
| `lib/forms/g1-layout.ts` | G1 좌표 (추출 결과) |
| `lib/pdf/stamp-sheet.ts` | 채점 데이터 + 레이아웃 → 스탬핑된 PDF bytes |
| `app/api/admin/sessions/[id]/sheet.pdf/route.ts` | 다운로드 라우트 |
| `tests/sheet-layout.test.ts` | 레이아웃 정합 검증 |
| `tests/stamp-sheet.test.ts` | 스탬핑 순수 로직 검증 |

**수정**

| 파일 | 변경 |
|---|---|
| `package.json` | `pdf-lib`, `@pdf-lib/fontkit` 추가 |
| `next.config.ts` | `outputFileTracingIncludes` — 라우트 번들에 assets 포함 |
| `lib/forms/index.ts` | `SurveyForm`에 `layout` 연결 |
| `components/admin/ResultSheet.tsx` | `결과지 PDF · 인쇄` → `검사지 PDF 다운로드` |

---

## Task 1: 자산과 의존성

**Files:**
- Create: `assets/forms/kodys-g1.pdf`, `assets/fonts/NanumGothic.ttf`, `assets/fonts/OFL.txt`, `assets/README.md`
- Modify: `package.json`, `next.config.ts`

**배경:** 스탬핑은 원본 PDF와 한글 폰트를 **런타임에 파일로 읽는다.** Vercel 서버리스는 함수 번들에 포함된 파일만 읽을 수 있으므로 `outputFileTracingIncludes` 설정이 반드시 필요하다 — 빠뜨리면 로컬은 되고 배포만 500이 난다.

폰트는 원본 PDF가 쓰는 **NanumGothic**을 그대로 쓴다(서체 일치). OFL이라 재배포 가능하다. `@fontsource/nanum-gothic`은 woff2만 배포하는데 `pdf-lib`은 TTF/OTF가 필요하므로, `wawoff2`로 한 번 변환해 TTF를 저장소에 커밋한다. **런타임 변환은 하지 않는다**(콜드스타트 비용).

- [ ] **Step 1: 원본 검사지를 저장소에 넣는다**

```bash
mkdir -p assets/forms assets/fonts
cp "/Users/kimjiwoo/Downloads/[최종] 초등 1학년 선별검사지.pdf" assets/forms/kodys-g1.pdf
```

파일명을 ASCII로 바꾸는 이유: 대괄호·공백·한글이 섞인 경로는 도구마다 처리가 갈린다(실제로 `pdftotext`가 이 파일명에서 크래시했다).

- [ ] **Step 2: 폰트를 TTF로 만들어 커밋한다**

```bash
npm i -D @fontsource/nanum-gothic wawoff2
node -e "
const w=require('wawoff2'), fs=require('fs');
const src='node_modules/@fontsource/nanum-gothic/files/nanum-gothic-korean-400-normal.woff2';
w.decompress(fs.readFileSync(src)).then(t=>{fs.writeFileSync('assets/fonts/NanumGothic.ttf',Buffer.from(t));console.log('bytes',t.length)});
"
```

기대: `bytes 1961752` 내외. 그 뒤 변환 도구는 제거한다 — 산출물(TTF)만 저장소에 남기고 재현 절차는 `assets/README.md`에 적는다.

```bash
npm rm @fontsource/nanum-gothic wawoff2
```

OFL 라이선스 전문을 `assets/fonts/OFL.txt`로 저장한다(SIL Open Font License 1.1 원문). 없으면 재배포 조건 위반이다.

`assets/README.md`:

```markdown
# assets

## forms/kodys-g1.pdf
담당자 배포 원본 검사지(초등 1학년). 결과지 PDF의 배경으로 그대로 쓴다.
**직접 편집하지 말 것** — 개정본을 받으면 이 파일을 교체하고
`node scripts/extract-form-layout.mjs`를 다시 돌려 좌표를 재생성한다.

## fonts/NanumGothic.ttf
스탬프(점수·O/X·이름)용 한글 폰트. 원본 검사지와 같은 서체라 얹은 글자가 이질감이 없다.
SIL Open Font License 1.1 (OFL.txt). 아래 절차로 만들었다:

    npm i -D @fontsource/nanum-gothic wawoff2
    node -e "const w=require('wawoff2'),fs=require('fs');\
    w.decompress(fs.readFileSync('node_modules/@fontsource/nanum-gothic/files/nanum-gothic-korean-400-normal.woff2'))\
    .then(t=>fs.writeFileSync('assets/fonts/NanumGothic.ttf',Buffer.from(t)))"
    npm rm @fontsource/nanum-gothic wawoff2
```

- [ ] **Step 3: 런타임 의존성을 추가한다**

```bash
npm i pdf-lib @pdf-lib/fontkit
```

둘 다 순수 JS라 서버리스에서 네이티브 바이너리 문제가 없다.

- [ ] **Step 4: 번들에 자산을 포함시킨다**

`next.config.ts`의 config 객체에 추가한다(기존 설정은 유지):

```ts
  // 결과지 PDF 라우트가 런타임에 원본 검사지·폰트를 파일로 읽는다.
  // 서버리스 번들에 명시적으로 포함시키지 않으면 로컬만 되고 배포에서 ENOENT가 난다.
  outputFileTracingIncludes: {
    '/api/admin/sessions/[id]/sheet.pdf': ['./assets/**'],
  },
```

- [ ] **Step 5: 확인**

Run: `npx tsc --noEmit && npm run build`
Expected: 오류 0, 빌드 성공

- [ ] **Step 6: Commit**

```bash
git add assets next.config.ts package.json package-lock.json
git commit -m "chore(pdf): 검사지 원본·폰트 자산과 pdf-lib 의존성 추가"
```

---

## Task 2: 좌표 추출 스크립트와 G1 레이아웃

**Files:**
- Create: `scripts/extract-form-layout.mjs`, `lib/forms/layout.ts`, `lib/forms/g1-layout.ts`, `tests/sheet-layout.test.ts`
- Modify: `lib/forms/index.ts`

**배경:** 좌표를 손으로 재면 양식이 개정될 때마다 다시 재야 하고, 잘못 재도 아무도 모른다. `pdfjs-dist`로 셀 사각형을 뽑는 스크립트를 두면 개정본이 와도 재실행 한 번으로 끝난다.

**아래 좌표는 이미 추출·검증된 실측값이다.** 스크립트는 이 값을 재생성할 수 있어야 한다(테스트가 그것을 검증한다).

- [ ] **Step 1: 레이아웃 타입을 정의한다**

`lib/forms/layout.ts`:

```ts
// lib/forms/layout.ts — 검사지 PDF 위에 점수를 얹기 위한 좌표 스키마.
// PDF 사용자 공간(pt) 기준이며 원점은 페이지 좌하단이다(CSS와 y 방향이 반대).
// 학년마다 검사지가 다르므로 좌표도 양식별 데이터로 둔다 — 레이아웃 코드를 늘리지 않기 위함.

/** 낱말 격자 — 셀이 등간격이라 시작점·간격·크기만으로 전 셀을 만든다 */
export interface WordGridLayout {
  /** 첫 칸 왼쪽 x */
  x0: number
  /** 칸 간격 */
  dx: number
  /** 칸 너비·높이 */
  w: number
  h: number
  /** 행 아래쪽 y — [의미 낱말 행, 무의미 낱말 행] */
  rows: [number, number]
  /** 한 행의 칸 수 */
  perRow: number
}

/** 점수 빈칸 — '/' 왼쪽에 오른쪽 정렬로 찍는다 */
export interface ScoreSlot {
  /** '/' 글리프의 x */
  slashX: number
  /** 숫자 베이스라인 y */
  baselineY: number
}

/** 머리글 인적사항 칸 — 열 경계 안에서 가운데 정렬 */
export interface HeaderCol {
  lo: number
  hi: number
}

export interface SheetLayout {
  /** 스탬핑 배경이 되는 원본 PDF (assets 기준 상대 경로) */
  pdf: string
  /** 원본 페이지 크기(pt) — 추출값과 실제가 다르면 좌표가 전부 어긋나므로 런타임에 검증한다 */
  pageWidth: number
  pageHeight: number

  header: {
    baselineY: number
    school: HeaderCol
    grade: HeaderCol
    childName: HeaderCol
    birth: HeaderCol
    testedAt: HeaderCol
    /** 검사자 구분: 해당 낱말에 타원을 그린다 */
    examiner: { teacher: { cx: number; rx: number }; expert: { cx: number; rx: number }; cy: number }
  }

  wordReading: WordGridLayout
  wordWriting: WordGridLayout

  /** 낱말 해독 소계 — 의미/무의미/총점 */
  readScores: { meaning: ScoreSlot; nonsense: ScoreSlot; total: ScoreSlot }
  /** 낱말 쓰기 소계 */
  writeScores: { meaning: ScoreSlot; nonsense: ScoreSlot; total: ScoreSlot }
  /** 문장 4개 점수 + 총점 */
  sentenceScores: ScoreSlot[]
  sentenceTotal: ScoreSlot

  /** 체크리스트 — 영역 코드 → 확인란 행의 아래쪽 y. 체크는 checkX를 중심으로 그린다 */
  checklist: { checkX: number; rows: Record<string, number> }
}
```

- [ ] **Step 2: G1 좌표를 작성한다**

`lib/forms/g1-layout.ts` — **아래 숫자는 추출·검증된 실측값이다. 임의로 바꾸지 말 것:**

```ts
// lib/forms/g1-layout.ts — KODYS-G1 검사지 좌표.
// scripts/extract-form-layout.mjs 가 assets/forms/kodys-g1.pdf 에서 뽑은 값이다.
// 검사지가 개정되면 손으로 고치지 말고 스크립트를 다시 돌려 통째로 교체한다.
import type { SheetLayout } from './layout'

export const G1_LAYOUT: SheetLayout = {
  pdf: 'forms/kodys-g1.pdf',
  pageWidth: 540,
  pageHeight: 780,

  header: {
    baselineY: 712.5,
    school:    { lo: 165, hi: 216 },
    grade:     { lo: 216, hi: 266 },
    childName: { lo: 266, hi: 320 },
    birth:     { lo: 320, hi: 379 },
    testedAt:  { lo: 379, hi: 445 },
    examiner: {
      teacher: { cx: 461.4, rx: 15.5 },
      expert:  { cx: 496.0, rx: 17.5 },
      cy: 715.2,
    },
  },

  // 낱말 해독: 의미 7 + 무의미 7, 셀 56 × 25.5 등간격
  wordReading: { x0: 126, dx: 56, w: 56, h: 25.5, rows: [616.2, 590.7], perRow: 7 },
  // 낱말 쓰기: 의미 5 + 무의미 5, 셀 78.1 × 25.5
  wordWriting: { x0: 127.5, dx: 78.1, w: 78.1, h: 25.5, rows: [256.6, 231.1], perRow: 5 },

  readScores: {
    meaning:  { slashX: 155.9, baselineY: 577.6 },
    nonsense: { slashX: 322.7, baselineY: 577.6 },
    total:    { slashX: 486.5, baselineY: 577.6 },
  },
  writeScores: {
    meaning:  { slashX: 151.8, baselineY: 217.8 },
    nonsense: { slashX: 318.6, baselineY: 217.8 },
    total:    { slashX: 482.4, baselineY: 217.8 },
  },
  sentenceScores: [
    { slashX: 487.3, baselineY: 487.4 },
    { slashX: 487.3, baselineY: 453.4 },
    { slashX: 487.3, baselineY: 419.3 },
    { slashX: 484.3, baselineY: 372.6 },
  ],
  sentenceTotal: { slashX: 482.8, baselineY: 332.9 },

  checklist: {
    checkX: 171.5,
    // CHECKLIST_AREAS의 code와 같은 키를 쓴다 — 화면과 인쇄물이 같은 영역 코드를 공유한다.
    rows: { none: 106.9, cognition: 84.8, language: 62.7, speech: 40.6, attention: 18.5 },
  },
}
```

- [ ] **Step 3: 양식에 레이아웃을 연결한다**

`lib/forms/layout.ts`의 타입을 `lib/forms/index.ts`의 `SurveyForm`에 붙인다:

```ts
import type { SheetLayout } from './layout'
```

`SurveyForm` 인터페이스에 추가:

```ts
  /** 공식 검사지 PDF 출력용 좌표. 없으면 그 학년은 PDF 출력을 제공하지 않는다. */
  layout: SheetLayout
```

`lib/forms/g1.ts`에 import와 필드를 추가한다:

```ts
import { G1_LAYOUT } from './g1-layout'
```
G1 객체 끝에 `layout: G1_LAYOUT,` 추가.

- [ ] **Step 4: 추출 스크립트를 작성한다**

`scripts/extract-form-layout.mjs` — 개발 도구. 검사지 PDF에서 셀 사각형과 텍스트 앵커를 뽑아 콘솔에 레이아웃 후보를 출력한다:

```js
// scripts/extract-form-layout.mjs — 검사지 PDF에서 스탬핑 좌표를 뽑는다.
// 양식이 개정되면: assets/forms/*.pdf 교체 → 이 스크립트 실행 → lib/forms/*-layout.ts 갱신.
//   node scripts/extract-form-layout.mjs assets/forms/kodys-g1.pdf
// pdfjs-dist는 이 스크립트에서만 쓰는 개발 의존성이다(런타임 번들에 들어가지 않는다).
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/extract-form-layout.mjs <pdf>'); process.exit(1) }

const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise
const page = await doc.getPage(1)
const vp = page.getViewport({ scale: 1 })
console.log(`pageWidth: ${vp.width}, pageHeight: ${vp.height}`)

// ── 텍스트 앵커 (라벨 위치 확인용) ──
const tc = await page.getTextContent()
const texts = tc.items.filter(i => i.str.trim()).map(i => ({
  s: i.str.replace(/\s+/g, ''), x: +i.transform[4].toFixed(1), y: +i.transform[5].toFixed(1),
  w: +i.width.toFixed(1),
}))

// ── 셀 사각형 ──
const ops = await page.getOperatorList()
const rects = []
for (let i = 0; i < ops.fnArray.length; i++) {
  if (ops.fnArray[i] !== OPS.constructPath) continue
  const [fns, args] = ops.argsArray[i]
  let k = 0
  for (const fn of fns) {
    if (fn === OPS.rectangle) {
      const [x, y, w, h] = args.slice(k, k + 4); k += 4
      if (w > 2 && h > 2) rects.push({ x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) })
    } else if (fn === OPS.moveTo || fn === OPS.lineTo) k += 2
    else if (fn === OPS.curveTo) k += 6
  }
}
const uniq = [...new Map(rects.map(r => [`${r.x},${r.y},${r.w},${r.h}`, r])).values()]

/** 특정 낱말이 들어있는 셀을 찾아 격자 파라미터를 만든다 */
function grid(rowWords) {
  const out = []
  for (const words of rowWords) {
    const first = texts.find(t => t.s === words[0])
    const cell = uniq.find(r => first && first.x >= r.x && first.x <= r.x + r.w
                                && first.y >= r.y && first.y <= r.y + r.h)
    if (!cell) { console.warn(`  ⚠ 셀을 찾지 못함: ${words[0]}`); continue }
    out.push(cell)
  }
  if (out.length < 2) return null
  const row = uniq.filter(r => Math.abs(r.y - out[0].y) < 0.5 && Math.abs(r.w - out[0].w) < 0.5)
    .sort((a, b) => a.x - b.x)
  return { x0: row[0].x, dx: +(row[1].x - row[0].x).toFixed(1), w: out[0].w, h: out[0].h,
           rows: out.map(c => c.y), perRow: row.length }
}

console.log('\n// wordReading'); console.log(JSON.stringify(grid([['어디'], ['아로']])))
console.log('\n// wordWriting'); console.log(JSON.stringify(grid([['우비'], ['오거']])))

/** '/' 글리프 위치 = 점수 빈칸 앵커 */
console.log('\n// 점수 빈칸 후보 (slashX, baselineY)')
for (const t of texts.filter(t => t.s === '/' || /^\/\d+$/.test(t.s))) console.log(`  ${t.x} ${t.y}  ${t.s}`)

console.log('\n// 체크리스트 확인란(□) 위치')
for (const t of texts.filter(t => t.s === '□')) console.log(`  x=${t.x} y=${t.y}`)

console.log('\n// 머리글 라벨 (열 중심 산출용)')
for (const t of texts.filter(t => ['학교','학년','학생명','생년월일','검사일','검사자','교사','전문가'].includes(t.s)))
  console.log(`  ${t.s}: x=${t.x} w=${t.w} y=${t.y}`)
```

`pdfjs-dist`를 개발 의존성으로 추가한다:

```bash
npm i -D pdfjs-dist
```

- [ ] **Step 5: 실패하는 테스트를 쓴다**

`tests/sheet-layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { G1_LAYOUT } from '@/lib/forms/g1-layout'
import { formForGrade } from '@/lib/forms'
import { CHECKLIST_AREAS } from '@/lib/items'
import { TASK_MAX } from '@/lib/scoring'

describe('G1 레이아웃', () => {
  const L = G1_LAYOUT
  it('양식에 연결돼 있다', () => {
    expect(formForGrade(1).layout).toBe(L)
  })
  it('원본 검사지 페이지 크기 (A4가 아니다)', () => {
    expect(L.pageWidth).toBe(540)
    expect(L.pageHeight).toBe(780)
  })
  it('낱말 격자 칸 수가 문항 수와 맞는다', () => {
    expect(L.wordReading.perRow * 2).toBe(TASK_MAX.wordReading)
    expect(L.wordWriting.perRow * 2).toBe(TASK_MAX.wordWriting)
  })
  it('문장 점수 칸이 문항 수만큼 있다', () => {
    expect(L.sentenceScores).toHaveLength(4)
  })
  it('체크리스트 행이 화면의 영역 코드와 정확히 대응한다', () => {
    // 화면에서 고를 수 있는 영역인데 인쇄 좌표가 없으면 그 선택은 종이에서 사라진다.
    expect(Object.keys(L.checklist.rows).sort()).toEqual(CHECKLIST_AREAS.map(a => a.code).sort())
  })
  it('모든 좌표가 페이지 안에 있다', () => {
    const xs = [L.wordReading.x0, L.wordWriting.x0, L.checklist.checkX,
      ...L.sentenceScores.map(s => s.slashX), L.sentenceTotal.slashX]
    const ys = [...L.wordReading.rows, ...L.wordWriting.rows,
      ...Object.values(L.checklist.rows), L.header.baselineY]
    xs.forEach(x => { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(L.pageWidth) })
    ys.forEach(y => { expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(L.pageHeight) })
  })
  it('낱말 격자 마지막 칸이 페이지를 넘지 않는다', () => {
    for (const g of [L.wordReading, L.wordWriting]) {
      expect(g.x0 + g.dx * (g.perRow - 1) + g.w).toBeLessThanOrEqual(L.pageWidth)
    }
  })
})
```

- [ ] **Step 6: 테스트 실행**

Run: `npx vitest run tests/sheet-layout.test.ts && npx tsc --noEmit && npm run lint`
Expected: 전부 PASS

- [ ] **Step 7: 추출 스크립트가 실제로 돌아가는지 확인한다**

Run: `node scripts/extract-form-layout.mjs assets/forms/kodys-g1.pdf`
Expected: `pageWidth: 540, pageHeight: 780` 이 출력되고, `wordReading`이 `{"x0":126,"dx":56,"w":56,"h":25.5,...}`, `wordWriting`이 `{"x0":127.5,"dx":78.1,...}`로 나온다. **`g1-layout.ts`의 값과 일치해야 한다** — 다르면 스크립트나 좌표 중 하나가 틀린 것이므로 진행하지 말고 원인을 밝힌다.

- [ ] **Step 8: Commit**

```bash
git add scripts lib/forms tests/sheet-layout.test.ts package.json package-lock.json
git commit -m "feat(pdf): 검사지 좌표 추출 스크립트와 G1 레이아웃"
```

---

## Task 3: 스탬핑 코어

**Files:**
- Create: `lib/pdf/stamp-sheet.ts`, `tests/stamp-sheet.test.ts`

**배경:** 채점 데이터를 받아 원본 PDF에 얹어 PDF bytes를 돌려주는 함수. 라우트와 분리해 두면 테스트에서 실제 PDF를 만들어 검증할 수 있다.

**표시 규칙 (프로토타입에서 확정):**
- 정반응 `O`(먹), 오반응 `X`(적), **미실시는 아무것도 찍지 않는다** — 중단 규칙으로 실시하지 않은 문항을 오반응으로 오독하면 안 된다
- 표시는 셀 **우상단** — 정중앙에 찍으면 낱말 본문과 겹쳐 판독이 안 된다(프로토타입에서 확인)
- 점수는 `/` 왼쪽에 오른쪽 정렬
- **Pass/Fail은 찍지 않는다** — 검사지에 그런 칸이 없고, 임시 기준 판정이 공식 문서로 나가면 안 된다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/stamp-sheet.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { stampSheet } from '@/lib/pdf/stamp-sheet'
import { formForGrade } from '@/lib/forms'
import { MEANING_READ_CODES } from '@/lib/items'

const form = formForGrade(1)
const session = {
  school_name: '경기초등학교', grade: 1, class_no: 3, child_name: '홍길동',
  birth_ymd: '170310', started_at: '2026-08-07T06:25:08.000Z',
  examiner_type: 'expert' as const, checklist: ['cognition'],
}

describe('stampSheet', () => {
  it('원본 검사지 위에 그린 단일 페이지 PDF를 만든다', async () => {
    const bytes = await stampSheet({ form, session, marks: {}, sentences: {}, writing: {} })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(1)
    const { width, height } = out.getPages()[0].getSize()
    // 원본 크기를 그대로 유지해야 한다 — 크기가 변하면 좌표가 전부 어긋난 것이다.
    expect(Math.round(width)).toBe(form.layout.pageWidth)
    expect(Math.round(height)).toBe(form.layout.pageHeight)
  })

  it('한글 이름·학교명이 있어도 실패하지 않는다 (폰트 임베딩)', async () => {
    const bytes = await stampSheet({
      form, session: { ...session, child_name: '김철수', school_name: '서울대치초등학교' },
      marks: {}, sentences: {}, writing: {},
    })
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it('채점 결과가 있으면 원본보다 커진다 (실제로 뭔가 그려진다)', async () => {
    const empty = await stampSheet({ form, session, marks: {}, sentences: {}, writing: {} })
    const marks = Object.fromEntries(MEANING_READ_CODES.map(c => [c, true]))
    const filled = await stampSheet({
      form, session, marks,
      sentences: { rs01: 7, rs02: 5, rs03: 8, rs04: 14 },
      writing: { ww01: true, ww02: true },
    })
    expect(filled.byteLength).toBeGreaterThan(empty.byteLength)
  })

  it('페이지 크기가 레이아웃과 다르면 좌표가 어긋나므로 거부한다', async () => {
    const bad = { ...form, layout: { ...form.layout, pageWidth: 999 } }
    await expect(stampSheet({ form: bad, session, marks: {}, sentences: {}, writing: {} }))
      .rejects.toThrow(/페이지 크기/)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `npx vitest run tests/stamp-sheet.test.ts`
Expected: FAIL — `Cannot find module '@/lib/pdf/stamp-sheet'`

- [ ] **Step 3: 스탬핑 함수를 작성한다**

`lib/pdf/stamp-sheet.ts`:

```ts
// lib/pdf/stamp-sheet.ts — 원본 검사지 PDF에 채점 결과만 얹는다.
// 배경이 담당자가 배포한 PDF 그 자체라, 출력물은 정의상 공식 양식과 일치한다.
// 인쇄는 선생님이 아동 한 명당 한 장 하므로 페이지 크기·여백을 건드리지 않는다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { ITEMS, MEANING_READ_CODES, MEANING_WRITE_CODES, WRITING_ITEMS } from '@/lib/items'
import { scoreSession } from '@/lib/scoring'
import { gradeClassLabel } from '@/lib/format'
import type { SurveyForm } from '@/lib/forms'
import type { ScoreSlot, WordGridLayout } from '@/lib/forms/layout'

const ASSETS = path.join(process.cwd(), 'assets')
const INK = rgb(0.06, 0.09, 0.16)
const ERR = rgb(0.78, 0.13, 0.13)

const READ_CODES = ITEMS.filter(i => i.section === 'word_reading').map(i => i.code)
const SENTENCE_CODES = ITEMS.filter(i => i.section === 'sentence_reading').map(i => i.code)
const WRITE_CODES = WRITING_ITEMS.map(i => i.code)
/** 검사지 배열 순서: 의미 낱말 먼저, 그다음 무의미 낱말 */
const readOrder = [...MEANING_READ_CODES, ...READ_CODES.filter(c => !MEANING_READ_CODES.includes(c))]
const writeOrder = [...MEANING_WRITE_CODES, ...WRITE_CODES.filter(c => !MEANING_WRITE_CODES.includes(c))]

export interface StampInput {
  form: SurveyForm
  session: {
    school_name: string; grade: number; class_no: number; child_name: string
    birth_ymd: string; started_at: string
    examiner_type: 'teacher' | 'expert' | null
    checklist: string[]
  }
  marks: Partial<Record<string, boolean>>
  sentences: Partial<Record<string, number>>
  writing: Partial<Record<string, boolean>>
}

export async function stampSheet(input: StampInput): Promise<Uint8Array> {
  const { form, session } = input
  const L = form.layout

  const [srcPdf, fontBytes] = await Promise.all([
    readFile(path.join(ASSETS, L.pdf)),
    readFile(path.join(ASSETS, 'fonts', 'NanumGothic.ttf')),
  ])
  const doc = await PDFDocument.load(srcPdf)
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fontBytes, { subset: true })
  const page = doc.getPages()[0]

  // 좌표는 이 크기를 전제로 뽑혔다. 개정본을 크기까지 바꿔 넣으면 전부 어긋나므로 먼저 막는다.
  const { width, height } = page.getSize()
  if (Math.round(width) !== L.pageWidth || Math.round(height) !== L.pageHeight) {
    throw new Error(
      `검사지 페이지 크기(${Math.round(width)}×${Math.round(height)})가 레이아웃(${L.pageWidth}×${L.pageHeight})과 다릅니다. ` +
      '검사지가 개정됐다면 scripts/extract-form-layout.mjs로 좌표를 다시 뽑아야 합니다.')
  }

  const r = scoreSession({ marks: input.marks, sentences: input.sentences, writing: input.writing })

  stampHeader(page, font, L, session)
  stampGrid(page, font, L.wordReading, readOrder, input.marks)
  stampGrid(page, font, L.wordWriting, writeOrder, input.writing)
  score(page, font, L.readScores.meaning, r.wordMeaning)
  score(page, font, L.readScores.nonsense, r.wordNonsense)
  score(page, font, L.readScores.total, r.wordReading)
  SENTENCE_CODES.forEach((code, i) => {
    const v = input.sentences[code]
    // 미입력 문항은 0을 찍지 않는다 — 0점과 미채점은 다르다.
    if (v !== undefined && L.sentenceScores[i]) score(page, font, L.sentenceScores[i], v)
  })
  score(page, font, L.sentenceTotal, r.sentenceReading)
  score(page, font, L.writeScores.meaning, r.writeMeaning)
  score(page, font, L.writeScores.nonsense, r.writeNonsense)
  score(page, font, L.writeScores.total, r.wordWriting)
  for (const code of session.checklist) {
    const y = L.checklist.rows[code]
    if (y !== undefined) drawCheck(page, L.checklist.checkX, y)
  }
  // Pass/Fail은 찍지 않는다 — 검사지에 해당 칸이 없고, 임시 기준 판정을 공식 문서에 남기지 않기 위함.
  return doc.save()
}

/** 낱말 격자: 셀 우상단에 O/X. 미실시(undefined)는 비워 둔다. */
function stampGrid(
  page: PDFPage, font: PDFFont, g: WordGridLayout,
  codes: string[], marks: Partial<Record<string, boolean>>,
) {
  codes.forEach((code, i) => {
    const ok = marks[code]
    if (ok === undefined) return
    const col = i % g.perRow
    const y = g.rows[Math.floor(i / g.perRow)]
    if (y === undefined) return
    const s = ok ? 'O' : 'X'
    const size = 11
    const w = font.widthOfTextAtSize(s, size)
    page.drawText(s, {
      x: g.x0 + g.dx * col + g.w - w - 4,
      y: y + g.h - size - 1.5,
      size, font, color: ok ? INK : ERR,
    })
  })
}

/** 점수: '/' 왼쪽에 오른쪽 정렬 */
function score(page: PDFPage, font: PDFFont, slot: ScoreSlot, value: number) {
  const s = String(value)
  const size = 12
  const w = font.widthOfTextAtSize(s, size)
  page.drawText(s, { x: slot.slashX - 7 - w, y: slot.baselineY, size, font, color: INK })
}

function stampHeader(page: PDFPage, font: PDFFont, L: SurveyForm['layout'], s: StampInput['session']) {
  const h = L.header
  const put = (text: string, col: { lo: number; hi: number }) => {
    if (!text) return
    // 열이 좁아 학교명이 넘칠 수 있다 — 칸 안에 들어갈 때까지 줄인다(최소 6pt).
    let size = 9
    while (size > 6 && font.widthOfTextAtSize(text, size) > col.hi - col.lo - 4) size -= 0.5
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (col.lo + col.hi) / 2 - w / 2, y: h.baselineY, size, font, color: INK })
  }
  put(s.school_name, h.school)
  put(gradeClassLabel(s.grade, s.class_no), h.grade)
  put(s.child_name, h.childName)
  put(s.birth_ymd, h.birth)
  put(new Date(s.started_at).toLocaleDateString('ko-KR'), h.testedAt)
  // 검사지 머리글의 "교사 / 전문가" 중 해당 낱말에 동그라미
  const pick = s.examiner_type === 'expert' ? h.examiner.expert
    : s.examiner_type === 'teacher' ? h.examiner.teacher : null
  if (pick) {
    page.drawEllipse({
      x: pick.cx, y: h.examiner.cy, xScale: pick.rx, yScale: 8.5,
      borderColor: INK, borderWidth: 1.1, opacity: 0,
    })
  }
}

/** 확인란(□) 안에 체크 표시 */
function drawCheck(page: PDFPage, cx: number, y: number) {
  page.drawLine({ start: { x: cx - 4, y: y + 10.5 }, end: { x: cx - 1, y: y + 6.5 }, thickness: 1.6, color: INK })
  page.drawLine({ start: { x: cx - 1, y: y + 6.5 }, end: { x: cx + 5, y: y + 15 }, thickness: 1.6, color: INK })
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: 전부 PASS

- [ ] **Step 5: 눈으로 확인한다 (중요)**

임시 스크립트로 실제 PDF를 만들어 렌더링한다:

```bash
cat > /tmp/mk.mjs <<'EOF'
import { stampSheet } from './lib/pdf/stamp-sheet.ts'
EOF
npx tsx -e "
import { stampSheet } from './lib/pdf/stamp-sheet'
import { formForGrade } from './lib/forms'
import { writeFileSync } from 'node:fs'
const form = formForGrade(1)
const marks = { rw01:true,rw02:true,rw03:true,rw04:true,rw05:true,rw06:true,rw07:true,
                rw08:true,rw09:true,rw10:false,rw11:false,rw12:false,rw13:false,rw14:false }
const bytes = await stampSheet({
  form,
  session: { school_name:'경기초등학교', grade:1, class_no:3, child_name:'홍길동',
             birth_ymd:'170310', started_at:'2026-08-07T06:25:08.000Z',
             examiner_type:'expert', checklist:['cognition','speech'] },
  marks, sentences:{ rs01:7, rs02:5, rs03:8, rs04:14 },
  writing:{ ww01:true,ww02:true,ww03:false,ww04:true,ww05:false,ww06:true },
})
writeFileSync('/tmp/sheet.pdf', bytes)
console.log('→ /tmp/sheet.pdf')
"
pdftoppm -r 150 -png -f 1 -l 1 /tmp/sheet.pdf /tmp/sheet
```

`/tmp/sheet-1.png`을 열어 확인한다:

| 확인 | 기대 |
|---|---|
| 배경 | 원본 검사지와 **완전히 동일** (괘선·문구·음영) |
| 낱말 O/X | 셀 **우상단**, 낱말 본문과 **겹치지 않음** |
| 미실시 낱말 | ww07~ww10은 **비어 있음** (X가 아님) |
| 점수 | `/` 왼쪽에 정렬, 7/7 · 2/7 · 9/14 |
| 문장 | 7·5·8·14, 총점 34 |
| 머리글 | 학교명이 열을 **넘지 않음**, 전문가에 동그라미 |
| 체크리스트 | 인지·말 행 □ 안에 체크 |
| Pass/Fail | **어디에도 없음** |

- [ ] **Step 6: Commit**

```bash
git add lib/pdf tests/stamp-sheet.test.ts
git commit -m "feat(pdf): 원본 검사지에 채점 결과를 얹는 스탬핑"
```

---

## Task 4: 다운로드 라우트

**Files:**
- Create: `app/api/admin/sessions/[id]/sheet.pdf/route.ts`
- Test: `tests/admin-routes.test.ts` (기존 파일에 추가)

**배경:** 관리자 인증 뒤에서 세션을 읽어 스탬핑한 PDF를 파일로 내려준다. 파일명에 아동 이름이 들어가므로 인증이 필수다(`middleware.ts`가 `/api/admin/*`를 이미 막고 있음을 확인할 것).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/admin-routes.test.ts`에 추가한다. 상단 import에 라우트를 더한다:

```ts
import { GET as SHEET } from '@/app/api/admin/sessions/[id]/sheet.pdf/route'
```

그리고 describe 블록을 추가한다:

```ts
describe('GET /api/admin/sessions/[id]/sheet.pdf', () => {
  it('PDF를 첨부 파일로 내려준다', async () => {
    vi.mocked(db.sessionDetail).mockResolvedValueOnce({
      session: {
        id: SID, school_name: '경기초등학교', grade: 1, class_no: 3, child_name: '홍길동',
        birth_ymd: '170310', started_at: '2026-08-07T06:25:08.000Z',
        examiner_type: 'expert', checklist: [],
      } as never,
      recordings: [], writing: [{ item_code: 'ww01', can_write: true }],
      marks: [{ item_code: 'rw01', correct: true }], sentences: [{ item_code: 'rs01', words: 7 }],
    })
    const res = await SHEET(req(), ctx(SID))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/attachment/)
    const buf = await res.arrayBuffer()
    // PDF 매직 넘버
    expect(new TextDecoder().decode(buf.slice(0, 4))).toBe('%PDF')
  })
  it('UUID가 아닌 id 400', async () => {
    const res = await SHEET(req(), ctx('not-a-uuid'))
    expect(res.status).toBe(400)
    expect(db.sessionDetail).not.toHaveBeenCalled()
  })
  it('DB 오류 시 500 + 일반화된 메시지', async () => {
    vi.mocked(db.sessionDetail).mockRejectedValueOnce(new Error('relation does not exist'))
    const res = await SHEET(req(), ctx(SID))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/relation/)
  })
})
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `npx vitest run tests/admin-routes.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 라우트를 작성한다**

기존 `app/api/admin/sessions/[id]/route.ts`의 검증·오류 처리 관행을 그대로 따를 것(UUID 검증 헬퍼와 오류 응답 형태를 파일에서 확인해 맞춘다).

`app/api/admin/sessions/[id]/sheet.pdf/route.ts`:

```ts
// app/api/admin/sessions/[id]/sheet.pdf/route.ts — 공식 검사지 PDF 다운로드.
// 담당자 배포 원본 검사지에 채점 결과만 얹어 내려준다(생성은 lib/pdf/stamp-sheet).
// 파일명에 아동 이름이 들어가므로 middleware의 관리자 인증 뒤에서만 접근된다.
import { NextResponse } from 'next/server'
import { sessionDetail } from '@/lib/db'
import { formForGrade } from '@/lib/forms'
import { stampSheet } from '@/lib/pdf/stamp-sheet'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 })

  try {
    const { session, writing, marks, sentences } = await sessionDetail(id)
    const form = formForGrade(session.grade)
    const bytes = await stampSheet({
      form,
      session,
      marks: Object.fromEntries(marks.map(m => [m.item_code, m.correct])),
      sentences: Object.fromEntries(sentences.map(s => [s.item_code, s.words])),
      writing: Object.fromEntries(writing.map(w => [w.item_code, w.can_write])),
    })

    const date = new Date(session.started_at).toISOString().slice(0, 10)
    const name = `${session.child_name}_${date}.pdf`
    return new NextResponse(bytes as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        // 한글 파일명은 RFC 5987로 넘긴다. filename*이 없으면 브라우저가 이름을 깨뜨린다.
        'content-disposition': `attachment; filename="sheet_${date}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // 아동 개인정보가 담긴 문서 — 중간 캐시에 남기지 않는다.
        'cache-control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: '결과지를 만들지 못했어요.' }, { status: 500 })
  }
}
```

- [ ] **Step 4: 확인**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: 전부 통과

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/sessions tests/admin-routes.test.ts
git commit -m "feat(api): 공식 검사지 PDF 다운로드 라우트"
```

---

## Task 5: 화면 버튼 교체

**Files:**
- Modify: `components/admin/ResultSheet.tsx`

**배경:** 지금 `결과지 PDF · 인쇄` 버튼은 화면을 브라우저 인쇄한다. 공식 출력이 두 갈래면 어느 쪽을 학교에 내는지 현장에서 헷갈리므로 **하나로 만든다.** 화면은 채점 작업대로 남고, 공식 문서는 검사지 PDF 하나다.

- [ ] **Step 1: 버튼을 교체한다**

`components/admin/ResultSheet.tsx`의 `window.print()` 버튼을 다음으로 바꾼다:

```tsx
        <a href={`/api/admin/sessions/${sessionId}/sheet.pdf`} download
          className="rounded-lg border-[1.5px] border-line bg-well px-4 py-2 text-sm font-bold text-ink-soft transition hover:border-blue">
          검사지 PDF 다운로드
        </a>
```

- [ ] **Step 2: 저장하지 않은 채점이 PDF에 빠진다는 것을 알린다**

PDF는 **DB에 저장된 점수**로 만들어진다. 화면에서 고치고 저장하지 않은 채 내려받으면 그 수정이 빠진다. 버튼 옆에 안내를 둔다:

```tsx
        <span className="text-[11px] text-ink-mute">저장한 채점 내용으로 만들어집니다</span>
```

- [ ] **Step 3: 확인**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: 전부 통과

- [ ] **Step 4: Commit**

```bash
git add components/admin/ResultSheet.tsx
git commit -m "feat(admin): 결과지 출력을 공식 검사지 PDF 다운로드로 일원화"
```

---

## Task 6: 브라우저 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: 개발 서버에서 실제 세션의 PDF를 받는다**

preview를 띄우고 채점 데이터가 있는 세션 상세로 이동해 `검사지 PDF 다운로드`를 누른다. 네트워크 응답이 `200`, `content-type: application/pdf`인지 확인한다.

- [ ] **Step 2: 받은 PDF를 렌더링해 확인한다**

```bash
pdftoppm -r 150 -png -f 1 -l 1 <내려받은.pdf> /tmp/verify
```

Task 3 Step 5의 확인표를 그대로 다시 검증한다(배경 동일 · O/X 비겹침 · 미실시 공란 · Pass/Fail 없음).

- [ ] **Step 3: 원본과 겹쳐 배경이 훼손되지 않았는지 확인한다**

```bash
pdftoppm -r 150 -png -f 1 -l 1 assets/forms/kodys-g1.pdf /tmp/orig
```
두 이미지를 나란히 놓고 괘선·문구·음영이 동일한지 본다. 배경이 조금이라도 달라졌다면 스탬핑이 원본을 건드린 것이므로 원인을 밝힌다.

- [ ] **Step 4: 회귀 확인**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: 전부 통과

---

## Self-Review 메모

- **좌표는 실측값이다.** `g1-layout.ts`의 숫자는 프로토타입에서 추출·렌더링으로 검증했다. 임의로 조정하지 말고, 어긋나면 추출 스크립트를 다시 돌린다.
- **페이지 크기 검증을 빼지 말 것.** 검사지가 540×780이라 A4(595×842)가 아니다. 개정본이 A4로 오면 모든 좌표가 어긋나는데, `stampSheet`의 크기 검증이 그것을 조용한 오출력 대신 명시적 오류로 바꾼다.
- **미실시와 0점은 다르다.** 중단 규칙으로 실시하지 않은 문항은 비워 둔다. `marks[code] === undefined`를 오반응으로 찍으면 임상적으로 거짓이다.
- **Pass/Fail은 절대 찍지 않는다.** 검사지에 칸이 없고, 기준이 아직 임시값이다.
- **`outputFileTracingIncludes`를 빠뜨리면 로컬만 되고 배포에서 죽는다.** Task 1 Step 4가 그 방지책이다.
- 새 학년: `assets/forms/g2.pdf` + `lib/forms/g2-layout.ts` + `lib/forms/g2.ts` 3개 파일. **레이아웃 코드는 건드리지 않는다.**
