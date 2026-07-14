# KODYS-G1 선별검사 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영어 문장 STT 설문 사이트를 KODYS-G1 선별검사(녹음 18문항 + 낱말쓰기 10문항 + 검사자 체크리스트 + 결과 검토 페이지)로 전환한다.

**Architecture:** 문항은 코드 상수(`lib/items.ts`), 학교 목록은 빌드 스크립트가 생성한 정적 JSON(`public/schools/`), 녹음은 문항마다 즉시 업로드, 낱말쓰기·체크리스트는 sessionStorage에 두었다가 최종 제출 시 DB 일괄 저장. STT(Azure)·자동비교·ffmpeg는 완전 제거.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (service role only), Tailwind 4, vitest, TypeScript 7.0.2(tsgo — **다운그레이드 금지**, 타입검증은 `npm run typecheck`).

**스펙:** `docs/superpowers/specs/2026-07-14-kodys-g1-redesign-design.md`
**브랜치:** `feat/kodys-g1-redesign`

**⚠️ 실행 전 주의**
- 마이그레이션(`003_kodys_redesign.sql`)은 기존 `questions`/`responses`/`attempts`/`sessions`를 **drop**한다. 코드 작성은 진행하되, **Supabase SQL Editor 적용은 사용자가 직접** 한다(Task 10의 체크포인트에서 요청). 적용 전까지 실 DB 경로는 동작하지 않는다.
- Task 5 완료 후 Task 8 완료 전까지 앱은 런타임상 과도기(구 화면이 신 API를 모름)다. 각 태스크는 typecheck·test는 항상 green을 유지한다.

---

## 파일 구조 맵

| 파일 | 역할 | 작업 |
|---|---|---|
| `lib/items.ts` | KODYS-G1 29문항 상수 + 체크리스트 영역 + 섹션 라벨 | 신규 (T1) |
| `lib/validate.ts` | 생년월일·학년·반·성별·연락처 검증 추가 | 수정 (T2, T6에서 validAge 제거) |
| `lib/schools.ts` | 17개 지역(slug/이름/축약) 상수 + School 타입 | 신규 (T3) |
| `scripts/build-schools.ts` | 원본 JSON → `public/schools/*.json` 생성 | 신규 (T3) |
| `public/schools/*.json` | 지역 목록 + 지역별 학교 목록 (커밋) | 생성물 (T3) |
| `supabase/migrations/003_kodys_redesign.sql` | 스키마 전환 | 신규 (T4) |
| `lib/db.ts` | 세션/녹음/제출 함수 재작성, 관리자 조회 재작성 | 수정 (T5, T9) |
| `lib/audio-ext.ts` | mime→확장자 (ffmpeg 대체 소형 유틸) | 신규 (T5) |
| `app/api/sessions/route.ts` | 새 참여자 필드로 세션 생성 | 재작성 (T5) |
| `app/api/recordings/route.ts` | 녹음 업로드+기록 (STT 없음) | 신규 (T5) |
| `app/api/sessions/submit/route.ts` | 낱말쓰기+체크리스트+submitted_at 저장 | 신규 (T5) |
| `app/api/transcribe/`, `app/api/responses/`, `app/api/sessions/complete/` | 삭제 | 삭제 (T5) |
| `lib/azure-stt.ts`, `lib/audio-convert.ts`, `scripts/smoke-azure.ts`, `scripts/seed.ts`, `supabase/seed/questions.ts` | 삭제 | 삭제 (T5) |
| `lib/compare.ts` | 삭제 (관리자가 마지막 소비처) | 삭제 (T9) |
| `lib/survey-state.ts` | sessionStorage 진행 상태 헬퍼 | 신규 (T6) |
| `components/SchoolPicker.tsx` | 지역 선택 → 학교 실시간 검색 콤보박스 | 신규 (T6) |
| `app/page.tsx` | 참여자 정보 입력 폼 | 재작성 (T6) |
| `components/survey/MicCheck.tsx` | 마이크 확인 화면 (기존 로직 분리) | 신규 (T7) |
| `components/survey/RecordingItem.tsx` | 녹음 문항 뷰 (타이머 30/40초) | 신규 (T7) |
| `app/survey/page.tsx` | 29문항 이전/다음 내비게이션 + 문항 렌더링 | 재작성 (T7) |
| `app/review/page.tsx` | 결과(검토) 페이지 + 제출 모달 | 신규 (T8) |
| `app/done/page.tsx` | 종료 문구 갱신 | 수정 (T8) |
| `app/admin/page.tsx`, `app/admin/[id]/page.tsx`, `app/api/admin/export/route.ts` | 새 데이터 구조로 개편 | 재작성 (T9) |
| `tests/*` | 신규 모듈 테스트, 구 모듈 테스트 삭제 | T1~T9 |

---

### Task 1: KODYS-G1 문항 상수 (`lib/items.ts`)

**Files:**
- Create: `lib/items.ts`
- Test: `tests/items.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/items.test.ts
import { describe, it, expect } from 'vitest'
import { ITEMS, RECORDING_ITEMS, WRITING_ITEMS, CHECKLIST_AREAS, itemByCode } from '@/lib/items'

describe('ITEMS (KODYS-G1)', () => {
  it('총 29문항, orderNo 1~29 연속', () => {
    expect(ITEMS).toHaveLength(29)
    ITEMS.forEach((item, i) => expect(item.orderNo).toBe(i + 1))
  })
  it('code 중복 없음', () => {
    expect(new Set(ITEMS.map(i => i.code)).size).toBe(29)
  })
  it('섹션별 문항 수: 낱말해독 14, 문장 4, 쓰기 10, 체크리스트 1', () => {
    const count = (s: string) => ITEMS.filter(i => i.section === s).length
    expect(count('word_reading')).toBe(14)
    expect(count('sentence_reading')).toBe(4)
    expect(count('word_writing')).toBe(10)
    expect(count('checklist')).toBe(1)
  })
  it('녹음 제한시간: 낱말 30초, 문장 40초, 그 외 0', () => {
    ITEMS.forEach(i => {
      if (i.section === 'word_reading') expect(i.maxSec).toBe(30)
      else if (i.section === 'sentence_reading') expect(i.maxSec).toBe(40)
      else expect(i.maxSec).toBe(0)
    })
  })
  it('PDF 문구 대조 (표본)', () => {
    expect(itemByCode.get('rw01')!.text).toBe('어디')
    expect(itemByCode.get('rw08')!.text).toBe('아로')
    expect(itemByCode.get('rw14')!.text).toBe('봉밥')
    expect(itemByCode.get('rs01')!.text).toBe('아이가 아빠와 우유 사러 가서 고기도 사요.')
    expect(itemByCode.get('rs04')!.text).toContain('사과를 했어요')
    expect(itemByCode.get('ww01')!.text).toBe('우비')
    expect(itemByCode.get('ww06')!.text).toBe('오거')
  })
  it('의미/무의미 구분', () => {
    expect(itemByCode.get('rw07')!.kind).toBe('meaning')
    expect(itemByCode.get('rw08')!.kind).toBe('nonsense')
    expect(itemByCode.get('ww05')!.kind).toBe('meaning')
    expect(itemByCode.get('ww10')!.kind).toBe('nonsense')
  })
  it('파생 목록: 녹음 18, 쓰기 10', () => {
    expect(RECORDING_ITEMS).toHaveLength(18)
    expect(WRITING_ITEMS).toHaveLength(10)
  })
  it('체크리스트 영역 5개 (PDF 순서)', () => {
    expect(CHECKLIST_AREAS.map(a => a.label)).toEqual(
      ['특이사항 없음', '인지', '언어 (이해/표현)', '말 (조음/유창성)', '주의력'])
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/items.test.ts` / Expected: FAIL (`Cannot find module '@/lib/items'`)

- [ ] **Step 3: 구현**

```ts
// lib/items.ts — KODYS-G1 초등 1학년 선별검사지 문항 (출처: [최종] 초등 1학년 선별검사지.pdf)
export type Section = 'word_reading' | 'sentence_reading' | 'word_writing' | 'checklist'
export type WordKind = 'meaning' | 'nonsense' | null

export interface SurveyItem {
  code: string      // rw01~rw14 / rs01~rs04 / ww01~ww10 / cl
  orderNo: number   // 1~29 (화면 문항 번호)
  section: Section
  kind: WordKind    // 낱말 의미/무의미 구분 (아이 화면 비노출, 관리자·CSV 전용)
  text: string      // 제시 낱말·문장 (체크리스트는 '')
  maxSec: number    // 녹음 제한(초). 비녹음 문항은 0
}

const READ_MEANING = ['어디', '바지', '양보', '그늘', '설탕', '장갑', '방법']
const READ_NONSENSE = ['아로', '부림', '영추', '주곡', '구말', '솔텅', '봉밥']
const SENTENCES = [
  '아이가 아빠와 우유 사러 가서 고기도 사요.',
  '스라소니가 피리 가져오고 개구리가 해바라기 가지고 와요.',
  '다람쥐가 두꺼비를 보고 도망가요 그래서 부엉이가 다람쥐를 숨겨줘요.',
  '쉬는시간에 친구가 나에게 장난을 계속 쳐서 다투었어요.\n학교가 끝난 후에 친구가 다가와서 사과를 했어요.',
]
const WRITE_MEANING = ['우비', '까치', '수박', '동상', '생각']
const WRITE_NONSENSE = ['오거', '끼추', '소벅', '당송', '갈먹']

const pad = (n: number) => String(n).padStart(2, '0')

export const ITEMS: SurveyItem[] = [
  ...READ_MEANING.map((text, i) => ({
    code: `rw${pad(i + 1)}`, orderNo: i + 1,
    section: 'word_reading' as const, kind: 'meaning' as const, text, maxSec: 30,
  })),
  ...READ_NONSENSE.map((text, i) => ({
    code: `rw${pad(i + 8)}`, orderNo: i + 8,
    section: 'word_reading' as const, kind: 'nonsense' as const, text, maxSec: 30,
  })),
  ...SENTENCES.map((text, i) => ({
    code: `rs${pad(i + 1)}`, orderNo: i + 15,
    section: 'sentence_reading' as const, kind: null, text, maxSec: 40,
  })),
  ...WRITE_MEANING.map((text, i) => ({
    code: `ww${pad(i + 1)}`, orderNo: i + 19,
    section: 'word_writing' as const, kind: 'meaning' as const, text, maxSec: 0,
  })),
  ...WRITE_NONSENSE.map((text, i) => ({
    code: `ww${pad(i + 6)}`, orderNo: i + 24,
    section: 'word_writing' as const, kind: 'nonsense' as const, text, maxSec: 0,
  })),
  { code: 'cl', orderNo: 29, section: 'checklist', kind: null, text: '', maxSec: 0 },
]

export const RECORDING_ITEMS = ITEMS.filter(i => i.maxSec > 0)
export const WRITING_ITEMS = ITEMS.filter(i => i.section === 'word_writing')
export const itemByCode = new Map(ITEMS.map(i => [i.code, i]))

export const CHECKLIST_AREAS = [
  { code: 'none', label: '특이사항 없음', hint: '' },
  { code: 'cognition', label: '인지', hint: '또래보다 전반적인 발달이나 이해도가 늦음' },
  { code: 'language', label: '언어 (이해/표현)', hint: '문장 표현이 서툴거나 대화 상황에 맞지 않는 말을 함' },
  { code: 'speech', label: '말 (조음/유창성)', hint: '발음이 부정확하거나 말을 심하게 더듬음' },
  { code: 'attention', label: '주의력', hint: '수업에 집중하지 못하고 과제를 끝내기 어려워함' },
] as const

export const AREA_CODES: string[] = CHECKLIST_AREAS.map(a => a.code)
export const areaLabel = (code: string) =>
  CHECKLIST_AREAS.find(a => a.code === code)?.label ?? code

export const SECTION_LABEL: Record<Section, string> = {
  word_reading: '낱말 해독',
  sentence_reading: '문장 읽기유창성',
  word_writing: '낱말 쓰기',
  checklist: '검사자 체크리스트',
}
export const KIND_LABEL: Record<'meaning' | 'nonsense', string> = { meaning: '의미', nonsense: '무의미' }
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/items.test.ts` / Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/items.ts tests/items.test.ts
git commit -m "feat: KODYS-G1 29문항 상수 (낱말해독14·문장4·쓰기10·체크리스트)"
```

---

### Task 2: 참여자 정보 검증 함수 (`lib/validate.ts`)

**Files:**
- Modify: `lib/validate.ts` (validName·validAge 유지, 신규 함수 추가 — validAge는 T6에서 제거)
- Test: `tests/validate.test.ts` (validAge 테스트 삭제, 신규 함수 테스트 추가)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/validate.test.ts`의 `validAge` describe 블록을 삭제하고(임포트에서도 제거) 아래를 추가:

```ts
import { validName, validBirthYmd, validGrade, validClassNo, validGender, validContact } from '@/lib/validate'

describe('validBirthYmd', () => {
  it('YYMMDD 6자리 허용', () => {
    expect(validBirthYmd('190101')).toBe(true)
    expect(validBirthYmd('191231')).toBe(true)
  })
  it('2월 29일 허용 (YY만으로 윤년 판단 불가)', () => expect(validBirthYmd('200229')).toBe(true))
  it('존재하지 않는 월·일 거부', () => {
    expect(validBirthYmd('191301')).toBe(false) // 13월
    expect(validBirthYmd('190001')).toBe(false) // 0월
    expect(validBirthYmd('190132')).toBe(false) // 32일
    expect(validBirthYmd('190100')).toBe(false) // 0일
    expect(validBirthYmd('190230')).toBe(false) // 2월 30일
    expect(validBirthYmd('190431')).toBe(false) // 4월 31일
  })
  it('자릿수·형식 오류 거부', () => {
    expect(validBirthYmd('19010')).toBe(false)
    expect(validBirthYmd('1901011')).toBe(false)
    expect(validBirthYmd('19-01-01')).toBe(false)
    expect(validBirthYmd(190101 as unknown)).toBe(false)
  })
})

describe('validGrade / validClassNo', () => {
  it('학년 1~6 정수만', () => {
    expect(validGrade(1)).toBe(true)
    expect(validGrade(6)).toBe(true)
    expect(validGrade(0)).toBe(false)
    expect(validGrade(7)).toBe(false)
    expect(validGrade(1.5)).toBe(false)
    expect(validGrade('1' as unknown)).toBe(false)
  })
  it('반 1~99 정수만', () => {
    expect(validClassNo(1)).toBe(true)
    expect(validClassNo(99)).toBe(true)
    expect(validClassNo(0)).toBe(false)
    expect(validClassNo(100)).toBe(false)
  })
})

describe('validGender', () => {
  it("'남'/'여'만 허용", () => {
    expect(validGender('남')).toBe(true)
    expect(validGender('여')).toBe(true)
    expect(validGender('male')).toBe(false)
    expect(validGender('')).toBe(false)
  })
})

describe('validContact (전화 또는 이메일)', () => {
  it('휴대폰·유선 허용 (하이픈 유무 모두)', () => {
    expect(validContact('010-1234-5678')).toBe(true)
    expect(validContact('01012345678')).toBe(true)
    expect(validContact('02-123-4567')).toBe(true)
    expect(validContact('031-1234-5678')).toBe(true)
  })
  it('이메일 허용', () => {
    expect(validContact('teacher@school.kr')).toBe(true)
    expect(validContact('a.b+c@ed.go.kr')).toBe(true)
  })
  it('형식 오류 거부', () => {
    expect(validContact('1234')).toBe(false)
    expect(validContact('연락처없음')).toBe(false)
    expect(validContact('teacher@')).toBe(false)
    expect(validContact('@school.kr')).toBe(false)
    expect(validContact('')).toBe(false)
    expect(validContact('a'.repeat(61))).toBe(false)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/validate.test.ts` / Expected: FAIL (`validBirthYmd is not a function` 등)

- [ ] **Step 3: 구현** — `lib/validate.ts` 하단에 추가 (validName·NAME_RE·validAge는 그대로 둠):

```ts
/** 생년월일: YYMMDD 6자리. YY만으로 윤년 판단이 불가하므로 2월은 29일까지 허용. */
export function validBirthYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{6}$/.test(v)) return false
  const mm = Number(v.slice(2, 4))
  const dd = Number(v.slice(4, 6))
  if (mm < 1 || mm > 12) return false
  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1]
  return dd >= 1 && dd <= maxDay
}

export function validGrade(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 6
}

export function validClassNo(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99
}

export function validGender(v: unknown): v is '남' | '여' {
  return v === '남' || v === '여'
}

const PHONE_RE = /^0\d{1,2}-?\d{3,4}-?\d{4}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 담임 연락처: 전화번호(하이픈 선택) 또는 이메일. 최대 60자. */
export function validContact(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 60
    && (PHONE_RE.test(v) || EMAIL_RE.test(v))
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/validate.test.ts` / Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/validate.ts tests/validate.test.ts
git commit -m "feat: 참여자 정보 검증 (생년월일·학년·반·성별·연락처)"
```

---

### Task 3: 학교 데이터 파이프라인

**Files:**
- Create: `lib/schools.ts`, `scripts/build-schools.ts`
- Create(생성물): `public/schools/index.json`, `public/schools/<slug>.json` × 17
- Test: `tests/schools.test.ts`
- Modify: `package.json` (`build:schools` 스크립트 추가)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/schools.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { REGIONS } from '@/lib/schools'

describe('REGIONS', () => {
  it('17개 교육청, slug·이름 중복 없음', () => {
    expect(REGIONS).toHaveLength(17)
    expect(new Set(REGIONS.map(r => r.slug)).size).toBe(17)
    expect(new Set(REGIONS.map(r => r.name)).size).toBe(17)
  })
  it('slug는 URL-safe 소문자', () => {
    REGIONS.forEach(r => expect(r.slug).toMatch(/^[a-z]+$/))
  })
})

describe('생성된 학교 데이터 (public/schools)', () => {
  it('index.json: 지역 17개 + count > 0', () => {
    expect(existsSync('public/schools/index.json')).toBe(true)
    const index = JSON.parse(readFileSync('public/schools/index.json', 'utf8'))
    expect(index).toHaveLength(17)
    for (const r of index) {
      expect(r).toMatchObject({ slug: expect.any(String), name: expect.any(String), short: expect.any(String), count: expect.any(Number) })
      expect(r.count).toBeGreaterThan(0)
    }
  })
  it('지역 파일: {id, name, addr} 형태, 이름순 정렬', () => {
    const seoul = JSON.parse(readFileSync('public/schools/seoul.json', 'utf8'))
    expect(seoul.length).toBeGreaterThan(500)
    expect(seoul[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), addr: expect.any(String) })
    const names = seoul.map((s: { name: string }) => s.name)
    expect([...names].sort((a, b) => a.localeCompare(b, 'ko'))).toEqual(names)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/schools.test.ts` / Expected: FAIL (`Cannot find module '@/lib/schools'`)

- [ ] **Step 3: `lib/schools.ts` 구현**

```ts
// lib/schools.ts — 지역(시도교육청) 상수와 학교 타입. 학교 목록 자체는 public/schools/<slug>.json (build:schools 생성물).
export interface RegionInfo { slug: string; name: string; short: string }

export const REGIONS: RegionInfo[] = [
  { slug: 'seoul', name: '서울특별시교육청', short: '서울' },
  { slug: 'busan', name: '부산광역시교육청', short: '부산' },
  { slug: 'daegu', name: '대구광역시교육청', short: '대구' },
  { slug: 'incheon', name: '인천광역시교육청', short: '인천' },
  { slug: 'gwangju', name: '광주광역시교육청', short: '광주' },
  { slug: 'daejeon', name: '대전광역시교육청', short: '대전' },
  { slug: 'ulsan', name: '울산광역시교육청', short: '울산' },
  { slug: 'sejong', name: '세종특별자치시교육청', short: '세종' },
  { slug: 'gyeonggi', name: '경기도교육청', short: '경기' },
  { slug: 'gangwon', name: '강원특별자치도교육청', short: '강원' },
  { slug: 'chungbuk', name: '충청북도교육청', short: '충북' },
  { slug: 'chungnam', name: '충청남도교육청', short: '충남' },
  { slug: 'jeonbuk', name: '전북특별자치도교육청', short: '전북' },
  { slug: 'jeonnam', name: '전라남도교육청', short: '전남' },
  { slug: 'gyeongbuk', name: '경상북도교육청', short: '경북' },
  { slug: 'gyeongnam', name: '경상남도교육청', short: '경남' },
  { slug: 'jeju', name: '제주특별자치도교육청', short: '제주' },
]

export const REGION_NAMES: string[] = REGIONS.map(r => r.name)

/** 지역별 학교 파일(public/schools/<slug>.json)의 원소 */
export interface School { id: string; name: string; addr: string }
```

- [ ] **Step 4: `scripts/build-schools.ts` 구현**

```ts
// scripts/build-schools.ts — 전국초등학교 원본 JSON을 지역별 경량 JSON으로 변환.
// 사용: npm run build:schools [-- <원본디렉터리>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { REGIONS } from '../lib/schools'

const SRC = process.argv[2] ?? '/Users/kimjiwoo/Desktop/전국초등학교_지역별'
const OUT = 'public/schools'

interface RawSchool {
  학교ID: string; 학교명: string; 학교급구분: string; 운영상태: string; 소재지지번주소: string
}

mkdirSync(OUT, { recursive: true })
const index: { slug: string; name: string; short: string; count: number }[] = []

for (const region of REGIONS) {
  const raw: RawSchool[] = JSON.parse(readFileSync(join(SRC, `${region.name}.json`), 'utf8'))
  const schools = raw
    .filter(s => s.운영상태 === '운영' && s.학교급구분 === '초등학교')
    .map(s => ({
      id: s.학교ID,
      name: s.학교명,
      addr: (s.소재지지번주소 ?? '').split(' ')[1] ?? '', // 시·군·구 (동명교 구분용)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  writeFileSync(join(OUT, `${region.slug}.json`), JSON.stringify(schools), 'utf8')
  index.push({ ...region, count: schools.length })
  console.log(`${region.short}: ${schools.length}개교`)
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index), 'utf8')
console.log(`총 ${index.reduce((a, r) => a + r.count, 0)}개교 → ${OUT}/`)
```

`package.json`의 `scripts`에 추가:

```json
"build:schools": "tsx scripts/build-schools.ts"
```

- [ ] **Step 5: 실행 및 통과 확인**

Run: `npm run build:schools`
Expected: 지역별 개수 출력, `총 6303개교` 근처 값 (원본이 전부 초등학교·운영이므로 동일), `public/schools/`에 18개 파일 생성.
Run: `npx vitest run tests/schools.test.ts` / Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/schools.ts scripts/build-schools.ts public/schools tests/schools.test.ts package.json
git commit -m "feat: 학교 데이터 파이프라인 (17개 지역 정적 JSON, 6,303개교)"
```

---

### Task 4: DB 마이그레이션 003

**Files:**
- Create: `supabase/migrations/003_kodys_redesign.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- 003_kodys_redesign.sql — KODYS-G1 전환.
-- ⚠️ 기존 questions/responses/attempts/sessions와 데이터를 폐기한다 (기존 수집분은 테스트 데이터).
-- Supabase SQL Editor에서 직접 실행할 것.

drop table if exists attempts;
drop table if exists responses;
drop table if exists questions;
drop table if exists sessions cascade;

create table sessions (
  id              uuid primary key default gen_random_uuid(),
  school_region   text not null,
  school_id       text not null,
  school_name     text not null,
  birth_ymd       char(6) not null check (birth_ymd ~ '^[0-9]{6}$'),
  grade           int  not null check (grade between 1 and 6),
  class_no        int  not null check (class_no between 1 and 99),
  gender          text not null check (gender in ('남','여')),
  child_name      text not null,
  teacher_name    text not null,
  teacher_contact text not null,
  checklist       text[] not null default '{}',  -- 최종 제출 시 저장 (검사자 체크리스트 영역 코드)
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz                     -- null = 미제출
);

-- 녹음 메타: 문항마다 즉시 기록. 재녹음 시 attempt_no 증가(모든 시도 보존).
create table recordings (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id),
  item_code    text not null,   -- rw01~rw14, rs01~rs04 (lib/items.ts)
  attempt_no   int  not null,
  audio_path   text not null,   -- storage: <sessionId>/<itemCode>_<attemptNo>.<ext>
  duration_sec numeric(5,2),
  created_at   timestamptz not null default now(),
  unique (session_id, item_code, attempt_no)
);

-- 낱말쓰기 예/아니오: 최종 제출 시 일괄 저장.
create table writing_answers (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id),
  item_code  text not null,     -- ww01~ww10
  can_write  boolean not null,
  unique (session_id, item_code)
);

alter table sessions        enable row level security;
alter table recordings      enable row level security;
alter table writing_answers enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근 (001과 동일 방침).
-- storage 버킷 'recordings'는 001에서 생성됨 — 그대로 사용.
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/003_kodys_redesign.sql
git commit -m "feat: 003 마이그레이션 — KODYS 스키마 (sessions 확장, recordings, writing_answers)"
```

> **참고:** 이 시점에 SQL을 Supabase에 적용하지 않아도 이후 태스크(테스트는 전부 mock) 진행에 지장 없다. 적용 요청은 Task 10에서 한다.

---

### Task 5: 서버 계층 교체 (db + API 라우트, STT 제거)

**Files:**
- Modify: `lib/db.ts` (세션/녹음/제출 함수 재작성 — 관리자 조회 4개 함수 `listQuestions`/`listSessions`/`sessionDetail`/`exportRows`와 그 인터페이스는 **T9까지 유지**)
- Create: `lib/audio-ext.ts`, `app/api/recordings/route.ts`, `app/api/sessions/submit/route.ts`
- Rewrite: `app/api/sessions/route.ts`
- Delete: `app/api/transcribe/route.ts`, `app/api/responses/skip/route.ts`, `app/api/sessions/complete/route.ts`, `lib/azure-stt.ts`, `lib/audio-convert.ts`, `scripts/smoke-azure.ts`, `scripts/seed.ts`, `supabase/seed/questions.ts`
- Delete: `tests/azure-stt.test.ts`, `tests/audio-convert.test.ts`, `tests/transcribe-route.test.ts`, `tests/questions.test.ts`
- Test: `tests/sessions-route.test.ts` (재작성), `tests/recordings-route.test.ts` (신규), `tests/submit-route.test.ts` (신규)
- Modify: `package.json` (`seed`·`smoke:azure` 스크립트, `ffmpeg-static` 의존성 제거)

- [ ] **Step 1: 실패하는 테스트 작성 — sessions 라우트 재작성**

`tests/sessions-route.test.ts` 전체 교체:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  createSession: vi.fn().mockResolvedValue('sess-1'),
}))

import { POST } from '@/app/api/sessions/route'
import * as db from '@/lib/db'

const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
  name: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
}

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/sessions', () => {
  it('유효한 참여자 정보로 세션 생성', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sessionId: 'sess-1' })
    expect(db.createSession).toHaveBeenCalledWith({
      schoolRegion: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
      birthYmd: '190101', grade: 1, classNo: 3, gender: '남',
      childName: '김도연', teacherName: '박선생', teacherContact: '010-1234-5678',
    })
  })
  it('이름 연속 공백은 서버가 정규화', async () => {
    await POST(makeReq({ ...VALID, name: '  Mary   Jane ' }))
    expect(db.createSession).toHaveBeenCalledWith(expect.objectContaining({ childName: 'Mary Jane' }))
  })
  it('미등록 지역 400', async () =>
    expect((await POST(makeReq({ ...VALID, region: '화성교육청' }))).status).toBe(400))
  it('학교 누락 400', async () => {
    expect((await POST(makeReq({ ...VALID, schoolId: '' }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, schoolName: '' }))).status).toBe(400)
  })
  it('생년월일 형식 오류 400', async () =>
    expect((await POST(makeReq({ ...VALID, birthYmd: '191301' }))).status).toBe(400))
  it('학년·반 범위 밖 400', async () => {
    expect((await POST(makeReq({ ...VALID, grade: 7 }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, classNo: 0 }))).status).toBe(400)
  })
  it('성별·연락처 형식 오류 400', async () => {
    expect((await POST(makeReq({ ...VALID, gender: 'M' }))).status).toBe(400)
    expect((await POST(makeReq({ ...VALID, teacherContact: '1234' }))).status).toBe(400)
  })
  it('담임교사명 특수문자 400', async () =>
    expect((await POST(makeReq({ ...VALID, teacherName: '박선생1' }))).status).toBe(400))
  it('본문 없음 400', async () =>
    expect((await POST(new Request('http://x', { method: 'POST', body: 'not json' }))).status).toBe(400))
})
```

- [ ] **Step 2: 실패하는 테스트 작성 — recordings 라우트**

```ts
// tests/recordings-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  uploadRecording: vi.fn().mockResolvedValue(undefined),
  insertRecording: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/recordings/route'
import * as db from '@/lib/db'

function makeReq(over: Record<string, string | Blob> = {}) {
  const fd = new FormData()
  fd.set('audio', new Blob([new Uint8Array(8)], { type: 'audio/webm' }), 'audio')
  fd.set('sessionId', 'sess-1')
  fd.set('itemCode', 'rw01')
  fd.set('attemptNo', '1')
  fd.set('durationSec', '3.20')
  for (const [k, v] of Object.entries(over)) fd.set(k, v)
  return new Request('http://x/api/recordings', { method: 'POST', body: fd })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/recordings', () => {
  it('업로드 + 녹음 기록', async () => {
    const res = await POST(makeReq())
    expect(res.status).toBe(200)
    expect(db.uploadRecording).toHaveBeenCalledWith('sess-1/rw01_1.webm', expect.any(Buffer), 'audio/webm')
    expect(db.insertRecording).toHaveBeenCalledWith({
      sessionId: 'sess-1', itemCode: 'rw01', attemptNo: 1, audioPath: 'sess-1/rw01_1.webm', durationSec: 3.2,
    })
  })
  it('녹음 문항이 아닌 코드 400 (ww01, cl, 미지 코드)', async () => {
    expect((await POST(makeReq({ itemCode: 'ww01' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'cl' }))).status).toBe(400)
    expect((await POST(makeReq({ itemCode: 'zz99' }))).status).toBe(400)
  })
  it('오디오·세션 누락 400', async () => {
    const noAudio = new FormData()
    noAudio.set('sessionId', 'sess-1'); noAudio.set('itemCode', 'rw01'); noAudio.set('attemptNo', '1')
    expect((await POST(new Request('http://x', { method: 'POST', body: noAudio }))).status).toBe(400)
    expect((await POST(makeReq({ sessionId: '' }))).status).toBe(400)
  })
  it('attemptNo 0 이하 400', async () =>
    expect((await POST(makeReq({ attemptNo: '0' }))).status).toBe(400))
  it('업로드 실패 시 502, 기록 저장 안 함', async () => {
    vi.mocked(db.uploadRecording).mockRejectedValueOnce(new Error('storage down'))
    expect((await POST(makeReq())).status).toBe(502)
    expect(db.insertRecording).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: 실패하는 테스트 작성 — submit 라우트**

```ts
// tests/submit-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  submitSession: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/sessions/submit/route'
import * as db from '@/lib/db'

const VALID = {
  sessionId: 'sess-1',
  writing: { ww01: true, ww02: false },
  checklist: ['none'],
}

function makeReq(body: unknown) {
  return new Request('http://x/api/sessions/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/sessions/submit', () => {
  it('낱말쓰기 답 + 체크리스트 저장', async () => {
    const res = await POST(makeReq(VALID))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1',
      [{ itemCode: 'ww01', canWrite: true }, { itemCode: 'ww02', canWrite: false }],
      ['none'])
  })
  it('답이 하나도 없어도 제출 가능 (미완료 제출 허용)', async () => {
    const res = await POST(makeReq({ sessionId: 'sess-1', writing: {}, checklist: [] }))
    expect(res.status).toBe(200)
    expect(db.submitSession).toHaveBeenCalledWith('sess-1', [], [])
  })
  it('미지 낱말쓰기 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID, writing: { rw01: true } }))).status).toBe(400))
  it('불리언 아닌 답 400', async () =>
    expect((await POST(makeReq({ ...VALID, writing: { ww01: '예' } }))).status).toBe(400))
  it('미지 체크리스트 코드 400', async () =>
    expect((await POST(makeReq({ ...VALID, checklist: ['unknown'] }))).status).toBe(400))
  it('sessionId 누락 400', async () =>
    expect((await POST(makeReq({ ...VALID, sessionId: '' }))).status).toBe(400))
  it('본문 없음 400', async () =>
    expect((await POST(new Request('http://x', { method: 'POST', body: 'x' }))).status).toBe(400))
})
```

- [ ] **Step 4: 실패 확인** — Run: `npx vitest run tests/sessions-route.test.ts tests/recordings-route.test.ts tests/submit-route.test.ts` / Expected: FAIL (모듈 없음 / 시그니처 불일치)

- [ ] **Step 5: `lib/db.ts` 수정** — 관리자 조회 4개(`listQuestions`, `listSessions`, `sessionDetail`, `exportRows`)와 `Question`/`SessionRow`/`AttemptRow`/`DetailRow` 인터페이스, `uploadRecording`, `signedAudioUrl`, `fail`은 그대로 두고, `createSession`/`completeSession`/`getOrCreateResponse`/`insertAttempt`/`markSkipped`를 아래로 교체:

```ts
export interface NewSessionInput {
  schoolRegion: string; schoolId: string; schoolName: string
  birthYmd: string; grade: number; classNo: number; gender: '남' | '여'
  childName: string; teacherName: string; teacherContact: string
}

export async function createSession(s: NewSessionInput): Promise<string> {
  const { data, error } = await sb().from('sessions').insert({
    school_region: s.schoolRegion, school_id: s.schoolId, school_name: s.schoolName,
    birth_ymd: s.birthYmd, grade: s.grade, class_no: s.classNo, gender: s.gender,
    child_name: s.childName, teacher_name: s.teacherName, teacher_contact: s.teacherContact,
  }).select('id').single()
  fail(error)
  return data!.id
}

export async function insertRecording(r: {
  sessionId: string; itemCode: string; attemptNo: number; audioPath: string; durationSec: number
}): Promise<void> {
  const { error } = await sb().from('recordings').upsert({
    session_id: r.sessionId, item_code: r.itemCode, attempt_no: r.attemptNo,
    audio_path: r.audioPath, duration_sec: r.durationSec,
  }, { onConflict: 'session_id,item_code,attempt_no' })
  fail(error)
}

export interface WritingAnswer { itemCode: string; canWrite: boolean }

/** 최종 제출: 낱말쓰기 답 upsert + 체크리스트·submitted_at 기록 */
export async function submitSession(
  sessionId: string, writing: WritingAnswer[], checklist: string[],
): Promise<void> {
  if (writing.length > 0) {
    const rows = writing.map(w => ({ session_id: sessionId, item_code: w.itemCode, can_write: w.canWrite }))
    const { error } = await sb().from('writing_answers').upsert(rows, { onConflict: 'session_id,item_code' })
    fail(error)
  }
  const { error } = await sb().from('sessions')
    .update({ checklist, submitted_at: new Date().toISOString() }).eq('id', sessionId)
  fail(error)
}
```

- [ ] **Step 6: `lib/audio-ext.ts` 생성**

```ts
// lib/audio-ext.ts — 저장 파일 확장자 결정 (구 lib/audio-convert.ts의 pickConversion 대체)
export function audioExt(mime: string): string {
  if (mime.startsWith('audio/webm') || mime.startsWith('audio/ogg')) return 'webm'
  if (mime.startsWith('audio/mp4') || mime.startsWith('audio/aac') || mime.startsWith('audio/m4a')) return 'mp4'
  return 'bin'
}
```

- [ ] **Step 7: API 라우트 작성**

`app/api/sessions/route.ts` 전체 교체:

```ts
import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { REGION_NAMES } from '@/lib/schools'
import { validBirthYmd, validClassNo, validContact, validGender, validGrade, validName } from '@/lib/validate'

const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })
const cleanStr = (v: unknown) => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : ''

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  const name = cleanStr(b.name)
  const teacherName = cleanStr(b.teacherName)
  const schoolName = cleanStr(b.schoolName)
  const schoolId = cleanStr(b.schoolId)
  if (!REGION_NAMES.includes(b.region)) return bad('지역을 선택해 주세요.')
  if (!schoolId || !schoolName || schoolName.length > 100) return bad('학교를 목록에서 선택해 주세요.')
  if (!validBirthYmd(b.birthYmd)) return bad('생년월일은 숫자 6자리(예: 190101)로 입력해 주세요.')
  if (!validGrade(b.grade)) return bad('학년은 1~6 사이로 선택해 주세요.')
  if (!validClassNo(b.classNo)) return bad('반은 1~99 사이 숫자로 입력해 주세요.')
  if (!validGender(b.gender)) return bad('성별을 선택해 주세요.')
  if (!validName(name)) return bad('이름은 한글이나 영어로만 쓸 수 있어요.')
  if (!validName(teacherName)) return bad('담임교사명은 한글이나 영어로만 쓸 수 있어요.')
  if (!validContact(b.teacherContact)) return bad('연락처는 전화번호 또는 이메일 형식으로 입력해 주세요.')
  const sessionId = await createSession({
    schoolRegion: b.region, schoolId, schoolName,
    birthYmd: b.birthYmd, grade: b.grade, classNo: b.classNo, gender: b.gender,
    childName: name, teacherName, teacherContact: b.teacherContact,
  })
  return NextResponse.json({ sessionId })
}
```

`app/api/recordings/route.ts` 신규:

```ts
import { NextResponse } from 'next/server'
import { insertRecording, uploadRecording } from '@/lib/db'
import { audioExt } from '@/lib/audio-ext'
import { itemByCode } from '@/lib/items'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const fd = await req.formData().catch(() => null)
  const audio = fd?.get('audio')
  const sessionId = String(fd?.get('sessionId') ?? '')
  const itemCode = String(fd?.get('itemCode') ?? '')
  const attemptNo = Number(fd?.get('attemptNo'))
  const durationSec = Number(fd?.get('durationSec') ?? 0)
  const item = itemByCode.get(itemCode)
  if (!(audio instanceof File) || !sessionId || !item || item.maxSec === 0
    || !Number.isInteger(attemptNo) || attemptNo < 1)
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })

  const bytes = Buffer.from(await audio.arrayBuffer())
  const mime = audio.type || 'application/octet-stream'
  const audioPath = `${sessionId}/${itemCode}_${attemptNo}.${audioExt(mime)}`
  try {
    await uploadRecording(audioPath, bytes, mime)
    await insertRecording({ sessionId, itemCode, attemptNo, audioPath, durationSec })
  } catch (e) {
    return NextResponse.json({ error: `녹음 저장 실패: ${(e as Error).message}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
```

`app/api/sessions/submit/route.ts` 신규:

```ts
import { NextResponse } from 'next/server'
import { submitSession, type WritingAnswer } from '@/lib/db'
import { AREA_CODES, WRITING_ITEMS } from '@/lib/items'

const WRITING_CODES = new Set(WRITING_ITEMS.map(i => i.code))
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  if (typeof b.sessionId !== 'string' || !b.sessionId) return bad('세션 정보가 없습니다.')
  if (typeof b.writing !== 'object' || b.writing === null || Array.isArray(b.writing))
    return bad('낱말쓰기 답 형식 오류')
  const writing: WritingAnswer[] = []
  for (const [itemCode, canWrite] of Object.entries(b.writing)) {
    if (!WRITING_CODES.has(itemCode) || typeof canWrite !== 'boolean')
      return bad('낱말쓰기 답 형식 오류')
    writing.push({ itemCode, canWrite })
  }
  if (!Array.isArray(b.checklist) || b.checklist.some((c: unknown) => typeof c !== 'string' || !AREA_CODES.includes(c)))
    return bad('체크리스트 형식 오류')
  const checklist = [...new Set(b.checklist as string[])]
  await submitSession(b.sessionId, writing, checklist)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 8: 삭제 및 정리**

```bash
git rm app/api/transcribe/route.ts app/api/responses/skip/route.ts app/api/sessions/complete/route.ts
git rm lib/azure-stt.ts lib/audio-convert.ts scripts/smoke-azure.ts scripts/seed.ts supabase/seed/questions.ts
git rm tests/azure-stt.test.ts tests/audio-convert.test.ts tests/transcribe-route.test.ts tests/questions.test.ts
npm uninstall ffmpeg-static
```

`package.json`의 `scripts`에서 `"seed"`, `"smoke:azure"` 항목 삭제.
`.env.local.example`에서 `AZURE_*` 변수 삭제 (SUPABASE·ADMIN 변수는 유지).

- [ ] **Step 9: 통과 확인**

Run: `npx vitest run` / Expected: 전체 PASS (구 모듈 테스트는 삭제됨)
Run: `npm run typecheck` / Expected: 오류 0 (구 관리자 조회 함수는 lib/db.ts에 남아 있어 admin 페이지 컴파일 유지)

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "feat: 서버 계층 KODYS 전환 — STT 제거, recordings/submit API 신설"
```

---

### Task 6: 시작 페이지 (참여자 정보 + 학교 선택)

**Files:**
- Create: `lib/survey-state.ts`, `components/SchoolPicker.tsx`
- Rewrite: `app/page.tsx`
- Modify: `lib/validate.ts` (validAge 제거 — 마지막 소비처가 구 app/page.tsx였음)

- [ ] **Step 1: `lib/survey-state.ts` 생성**

```ts
// lib/survey-state.ts — 설문 진행 상태 (sessionStorage). 서버 저장 시점: 녹음=즉시, 낱말쓰기·체크리스트=최종 제출.
export interface SurveyState {
  sessionId: string
  childName: string
  micDone: boolean
  recorded: Record<string, number>   // itemCode → 저장된 시도 수
  writing: Record<string, boolean>   // itemCode → 예(true)/아니오(false)
  checklist: string[]                // 선택된 영역 코드
}

const KEY = 'kodys-survey'

export function newState(sessionId: string, childName: string): SurveyState {
  return { sessionId, childName, micDone: false, recorded: {}, writing: {}, checklist: [] }
}

export function loadState(): SurveyState | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return typeof s?.sessionId === 'string' && s.sessionId ? s as SurveyState : null
  } catch { return null }
}

export function saveState(s: SurveyState): void {
  sessionStorage.setItem(KEY, JSON.stringify(s))
}

export function clearState(): void {
  sessionStorage.removeItem(KEY)
}
```

- [ ] **Step 2: `components/SchoolPicker.tsx` 생성**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { RegionInfo, School } from '@/lib/schools'

export interface SelectedSchool { region: string; schoolId: string; schoolName: string }

const MAX_SHOWN = 30

/** 지역(교육청) 선택 → 해당 지역 학교를 키 입력마다 필터링해 선택 */
export function SchoolPicker({ value, onSelect }: {
  value: SelectedSchool | null
  onSelect: (s: SelectedSchool | null) => void
}) {
  const [regions, setRegions] = useState<(RegionInfo & { count: number })[]>([])
  const [slug, setSlug] = useState('')
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/schools/index.json').then(r => r.json()).then(setRegions)
      .catch(() => setErr('학교 목록을 불러오지 못했어요. 새로고침해 주세요.'))
  }, [])

  useEffect(() => {
    if (!slug) return
    setLoading(true); setSchools([]); setQ(''); setErr('')
    fetch(`/schools/${slug}.json`).then(r => r.json()).then(setSchools)
      .catch(() => setErr('학교 목록을 불러오지 못했어요. 지역을 다시 선택해 주세요.'))
      .finally(() => setLoading(false))
  }, [slug])

  const region = regions.find(r => r.slug === slug)

  // 선택 완료 상태: 선택된 학교 표시 + 다시 선택
  if (value) return (
    <div className="mt-1.5 flex h-[50px] items-center justify-between rounded-xl border-[1.5px] border-blue bg-blue/5 px-4">
      <span className="text-[15px] font-bold text-blue">{value.schoolName}</span>
      <button type="button" className="text-xs text-ink-mute underline"
        onClick={() => { onSelect(null); setQ('') }}>
        다시 선택
      </button>
    </div>
  )

  const keyword = q.trim()
  const filtered = keyword ? schools.filter(s => s.name.includes(keyword)) : schools
  const shown = filtered.slice(0, MAX_SHOWN)

  return (
    <div className="mt-1.5">
      <select aria-label="지역 선택" value={slug} onChange={e => setSlug(e.target.value)}
        className="h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-3 text-base outline-none focus:border-blue">
        <option value="">지역을 선택해 주세요</option>
        {regions.map(r => <option key={r.slug} value={r.slug}>{r.short} ({r.count}개교)</option>)}
      </select>

      {slug && (
        <div className="mt-2">
          <input aria-label="학교 검색" value={q} onChange={e => setQ(e.target.value)}
            placeholder="학교 이름을 입력해 주세요"
            className="h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none focus:border-blue" />
          {loading && <p className="mt-2 text-xs text-ink-mute">불러오는 중…</p>}
          {!loading && schools.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
              {shown.map(s => (
                <li key={s.id}>
                  <button type="button"
                    onClick={() => region && onSelect({ region: region.name, schoolId: s.id, schoolName: s.name })}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-well">
                    <span className="font-bold">{s.name}</span>
                    <span className="text-xs text-ink-mute">{s.addr}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-4 py-3 text-sm text-ink-mute">검색 결과가 없어요.</li>}
              {filtered.length > MAX_SHOWN &&
                <li className="px-4 py-2 text-xs text-ink-mute">{filtered.length - MAX_SHOWN}개 더 있어요 — 이름을 더 입력해 주세요.</li>}
            </ul>
          )}
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm text-rec-deep">{err}</p>}
    </div>
  )
}
```

- [ ] **Step 3: `app/page.tsx` 재작성**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { SchoolPicker, type SelectedSchool } from '@/components/SchoolPicker'
import { newState, saveState } from '@/lib/survey-state'
import { validBirthYmd, validClassNo, validContact, validGender, validGrade, validName } from '@/lib/validate'

const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

export default function StartPage() {
  const router = useRouter()
  const [school, setSchool] = useState<SelectedSchool | null>(null)
  const [birthYmd, setBirthYmd] = useState('')
  const [grade, setGrade] = useState('1')
  const [classNo, setClassNo] = useState('')
  const [gender, setGender] = useState<'남' | '여' | ''>('')
  const [name, setName] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [contact, setContact] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function begin() {
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const cleanTeacher = teacherName.trim().replace(/\s+/g, ' ')
    const cleanContact = contact.trim()
    if (!school) { setErr('학교를 선택해 주세요.'); return }
    if (!validBirthYmd(birthYmd)) { setErr('생년월일은 숫자 6자리(예: 190101)로 입력해 주세요.'); return }
    if (!validGrade(Number(grade))) { setErr('학년을 선택해 주세요.'); return }
    if (!validClassNo(Number(classNo))) { setErr('반은 1~99 사이 숫자로 입력해 주세요.'); return }
    if (!validGender(gender)) { setErr('성별을 선택해 주세요.'); return }
    if (!validName(cleanName)) { setErr('이름은 한글이나 영어로만 쓸 수 있어요.'); return }
    if (!validName(cleanTeacher)) { setErr('담임교사명은 한글이나 영어로만 쓸 수 있어요.'); return }
    if (!validContact(cleanContact)) { setErr('연락처는 전화번호 또는 이메일 형식으로 입력해 주세요.'); return }
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: school.region, schoolId: school.schoolId, schoolName: school.schoolName,
          birthYmd, grade: Number(grade), classNo: Number(classNo), gender,
          name: cleanName, teacherName: cleanTeacher, teacherContact: cleanContact,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(json.error ?? '문제가 생겼어요. 다시 시도해 주세요.'); return }
      saveState(newState(json.sessionId, cleanName))
      router.push('/survey')
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  const filled = school && birthYmd && classNo && gender && name.trim() && teacherName.trim() && contact.trim()

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-10 text-2xl font-bold">안녕하세요!</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        검사를 시작하기 전에<br />아래 정보를 입력해 주세요.
      </p>
      <div className="card mt-8 w-full p-5">
        <label className="text-[13px] font-bold text-ink-soft">학교명</label>
        <SchoolPicker value={school} onSelect={setSchool} />

        <label className={labelCls} htmlFor="birth">생년월일</label>
        <input id="birth" value={birthYmd} inputMode="numeric" maxLength={6} placeholder="예: 190101"
          onChange={e => setBirthYmd(e.target.value.replace(/\D/g, ''))} className={inputCls} />

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="grade">학년</label>
            <select id="grade" value={grade} onChange={e => setGrade(e.target.value)}
              className={`${inputCls} px-3`}>
              {[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g}>{g}학년</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="classNo">반</label>
            <input id="classNo" value={classNo} inputMode="numeric" maxLength={2}
              onChange={e => setClassNo(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </div>
        </div>

        <span className={labelCls}>성별</span>
        <div className="mt-1.5 flex gap-2.5">
          {(['남', '여'] as const).map(g => (
            <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g}
              className={`h-[50px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
                gender === g ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
              {g}
            </button>
          ))}
        </div>

        <label className={labelCls} htmlFor="name">이름</label>
        <input id="name" value={name} maxLength={30} onChange={e => setName(e.target.value)} className={inputCls} />

        <label className={labelCls} htmlFor="teacher">담임교사명</label>
        <input id="teacher" value={teacherName} maxLength={30}
          onChange={e => setTeacherName(e.target.value)} className={inputCls} />

        <label className={labelCls} htmlFor="contact">담임 연락처</label>
        <input id="contact" value={contact} maxLength={60} placeholder="전화번호 또는 이메일"
          onChange={e => setContact(e.target.value)} className={inputCls} />

        {err && <p role="alert" className="mt-3 text-sm text-rec-deep">{err}</p>}
        <button onClick={begin} disabled={busy || !filled} className="cta mt-5">
          {busy ? '준비 중…' : '시작하기'}
        </button>
      </div>
      <p className="mt-auto pt-6 text-center text-[11px] text-ink-mute">녹음된 목소리는 검사 확인 용도로만 사용돼요.</p>
    </main>
  )
}
```

- [ ] **Step 4: `lib/validate.ts`에서 `validAge` 함수 삭제** (주석 포함 3~9행의 validAge 블록). 소비처 없음 확인: `grep -rn "validAge" app lib tests` → 결과 없어야 함.

- [ ] **Step 5: 확인** — Run: `npm run typecheck && npx vitest run` / Expected: PASS. `npm run dev` 후 브라우저에서 `/` 접속: 지역 선택 → 학교 검색(키 입력마다 목록 갱신) → 선택 칩 표시, 각 필드 검증 오류 메시지 확인.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat: 시작 페이지 — 참여자 정보 7종 + 지역별 학교 실시간 검색"
```

---

### Task 7: 설문 페이지 (29문항 + 이전/다음 + 타이머 녹음)

**Files:**
- Create: `components/survey/MicCheck.tsx`, `components/survey/RecordingItem.tsx`
- Rewrite: `app/survey/page.tsx`

- [ ] **Step 1: `components/survey/MicCheck.tsx` 생성** (기존 survey 페이지의 mic phase 분리)

```tsx
'use client'
import { useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import { Blip } from '@/components/Blip'

const MAX_SEC = 20
const MIC_OK_PEAK = 0.1

export function MicCheck({ onOk }: { onOk: () => void }) {
  const [micOk, setMicOk] = useState<'none' | 'ok' | 'quiet'>('none')
  const [micDenied, setMicDenied] = useState(false)
  const recorder = useRecorder(MAX_SEC, (r: Recording) => setMicOk(r.peak > MIC_OK_PEAK ? 'ok' : 'quiet'))

  async function start() {
    try { await recorder.start(); setMicDenied(false) } catch { setMicDenied(true) }
  }

  if (micDenied) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h2 className="text-xl font-bold">마이크를 쓸 수 없어요</h2>
      <p className="text-sm leading-relaxed text-ink-soft">
        브라우저 주소창의 자물쇠 아이콘을 눌러<br />마이크를 <b>허용</b>으로 바꾼 뒤 다시 눌러 주세요.
      </p>
      <button onClick={start} className="cta mt-2 max-w-60">다시 시도</button>
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
      <div className="mt-9">
        <RecordButton state={recorder.state} onStart={start} onStop={recorder.stop} maxSec={MAX_SEC} />
      </div>
      <div className="mt-6"><LevelMeter level={recorder.level} /></div>
      <p className="mt-2 text-[11px] text-ink-mute">목소리가 들리면 막대가 움직여요.</p>
      {micOk === 'quiet' && (
        <p className="mt-3 text-sm text-ink-soft">목소리가 잘 안 들려요. 마이크 가까이에서 다시 한번 해 주세요.</p>
      )}
      <div className="mt-auto w-full pb-2">
        {micOk === 'ok' && <button onClick={onOk} className="cta">검사 시작</button>}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: `components/survey/RecordingItem.tsx` 생성**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRecorder, type Recording } from '@/hooks/useRecorder'
import { LevelMeter } from '@/components/LevelMeter'
import { RecordButton } from '@/components/RecordButton'
import type { SurveyItem } from '@/lib/items'

const SILENT_PEAK = 0.01

/** 녹음 문항: 타이머(낱말 30초/문장 40초) 카운트다운, 즉시 업로드, 재생 없음(완료 여부만) */
export function RecordingItem({ item, sessionId, attemptCount, onSaved }: {
  item: SurveyItem; sessionId: string; attemptCount: number; onSaved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lowVolume, setLowVolume] = useState(false)
  const [micDenied, setMicDenied] = useState(false)
  const [lastRec, setLastRec] = useState<Recording | null>(null)
  const [remaining, setRemaining] = useState(item.maxSec)

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
      setLowVolume(rec.peak < SILENT_PEAK)
      onSaved()
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  function handleComplete(rec: Recording) { setLastRec(rec); void upload(rec) }
  const recorder = useRecorder(item.maxSec, handleComplete)
  const recording = recorder.state === 'recording'

  useEffect(() => {
    if (!recording) { setRemaining(item.maxSec); return }
    const t0 = Date.now()
    const id = setInterval(() =>
      setRemaining(Math.max(0, Math.ceil(item.maxSec - (Date.now() - t0) / 1000))), 200)
    return () => clearInterval(id)
  }, [recording, item.maxSec])

  async function startRecording() {
    setErr('')
    try { await recorder.start(); setMicDenied(false) } catch { setMicDenied(true) }
  }

  const saved = attemptCount > 0
  const word = item.section === 'word_reading'

  return (
    <>
      <div className="card mt-3 p-5">
        <p className="text-xs font-bold text-blue">
          {word ? '아래 낱말을 소리 내어 읽어 주세요' : '아래 문장을 소리 내어 읽어 주세요'}
        </p>
        <p className={`font-read mt-2 whitespace-pre-line font-medium leading-snug ${
          word ? 'text-center text-[38px]' : 'text-[22px]'}`}>
          {item.text}
        </p>
      </div>

      {micDenied && (
        <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
          마이크를 쓸 수 없어요. 주소창의 자물쇠 아이콘에서 마이크를 <b>허용</b>으로 바꿔 주세요.
        </p>
      )}

      {recording && (
        <div className="mt-4 flex items-center gap-3">
          <span className="blip-antpulse inline-block h-2 w-2 rounded-full bg-rec" />
          <span className="whitespace-nowrap text-[13px] font-bold text-rec-deep">남은 시간 {remaining}초</span>
          <LevelMeter level={recorder.level} />
        </div>
      )}

      {busy && <p className="mt-4 text-sm text-ink-mute">저장하고 있어요…</p>}

      {saved && !recording && !busy && !err && (
        <div className="mt-4 flex items-center gap-2.5 rounded-[14px] border border-line bg-well px-4 py-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue/10 text-blue">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12l5 5L20 6" />
            </svg>
          </span>
          <p className="text-sm text-ink-soft">
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

      <div className="mt-6 flex flex-col items-center gap-2.5">
        <RecordButton state={recorder.state} onStart={startRecording} onStop={recorder.stop}
          disabled={busy} maxSec={item.maxSec} />
        <p className="text-xs font-bold text-ink-soft">
          {recording ? '다 읽었으면 버튼을 눌러 주세요'
            : saved ? '다시 녹음하려면 버튼을 눌러 주세요' : '버튼을 누르고 읽어 주세요'}
        </p>
      </div>
    </>
  )
}
```

- [ ] **Step 3: `app/survey/page.tsx` 재작성**

```tsx
'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CHECKLIST_AREAS, ITEMS, SECTION_LABEL } from '@/lib/items'
import { loadState, saveState, type SurveyState } from '@/lib/survey-state'
import { ProgressBar } from '@/components/ProgressBar'
import { MicCheck } from '@/components/survey/MicCheck'
import { RecordingItem } from '@/components/survey/RecordingItem'

function SurveyInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [st, setSt] = useState<SurveyState | null>(null)
  const [idx, setIdx] = useState(0)
  const [phase, setPhase] = useState<'mic' | 'item'>('item')
  const fromReview = params.get('from') === 'review'

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    setSt(s)
    const q = Number(params.get('q'))
    if (Number.isInteger(q) && q >= 1 && q <= ITEMS.length) setIdx(q - 1)
    else if (!s.micDone) setPhase('mic')
  }, [router, params])

  if (!st) return null

  function patch(p: Partial<SurveyState>) {
    setSt(prev => {
      const merged = { ...prev!, ...p }
      saveState(merged)
      return merged
    })
  }

  if (phase === 'mic') return <MicCheck onOk={() => { patch({ micDone: true }); setPhase('item') }} />

  const item = ITEMS[idx]
  const isLast = idx === ITEMS.length - 1
  const canNext = item.section !== 'word_writing' || st.writing[item.code] !== undefined

  function goNext() {
    if (isLast) { router.push('/review'); return }
    setIdx(i => i + 1)
    window.scrollTo(0, 0)
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
          onSaved={() => patch({ recorded: { ...st.recorded, [item.code]: (st.recorded[item.code] ?? 0) + 1 } })} />
      )}

      {item.section === 'word_writing' && (
        <div className="card mt-3 p-5">
          <p className="text-sm font-bold">학생이 아래의 낱말을 정확하게 쓸 수 있나요?</p>
          <p className="font-read mt-5 text-center text-[38px] font-bold">{item.text}</p>
          <div className="mt-6 flex gap-2.5">
            {([['예', true], ['아니오', false]] as const).map(([label, v]) => (
              <button key={label} type="button" aria-pressed={st.writing[item.code] === v}
                onClick={() => patch({ writing: { ...st.writing, [item.code]: v } })}
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
                    <input type="checkbox" checked={on} className="mt-0.5 h-4 w-4 accent-[var(--color-blue)]"
                      onChange={() => patch({
                        checklist: on ? st.checklist.filter(c => c !== a.code) : [...st.checklist, a.code],
                      })} />
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
        <button onClick={() => { setIdx(i => i - 1); window.scrollTo(0, 0) }} disabled={idx === 0}
          className="h-[52px] flex-1 rounded-xl border-[1.5px] border-line bg-well text-[15px] font-bold text-ink-soft transition disabled:opacity-40">
          이전
        </button>
        <button onClick={goNext} disabled={!canNext}
          className="h-[52px] flex-[2] rounded-xl bg-blue text-[15px] font-bold text-white shadow-[0_3px_0_var(--color-blue-deep)] transition active:translate-y-[2px] disabled:opacity-40">
          {isLast ? '제출' : '다음'}
        </button>
      </div>
    </main>
  )
}

export default function SurveyPage() {
  return <Suspense fallback={null}><SurveyInner /></Suspense>
}
```

- [ ] **Step 4: 확인** — Run: `npm run typecheck && npx vitest run && npm run build` / Expected: 모두 PASS. 브라우저: 시작 → 마이크 확인 → 문항 1(낱말 '어디', 30초 카운트다운) → 15(문장, 40초) → 19(낱말쓰기: 예/아니오 전 '다음' 비활성) → 29(체크리스트, '제출' 버튼) 확인. 이전/다음 왕복, 새로고침 후 상태 유지 확인.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 설문 페이지 — 29문항 이전/다음, 타이머 녹음, 낱말쓰기, 체크리스트"
```

---

### Task 8: 결과(검토) 페이지 + 제출 모달 + 종료 페이지

**Files:**
- Create: `app/review/page.tsx`
- Modify: `app/done/page.tsx`

- [ ] **Step 1: `app/review/page.tsx` 생성**

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { ITEMS, SECTION_LABEL, areaLabel, type Section } from '@/lib/items'
import { clearState, loadState, type SurveyState } from '@/lib/survey-state'

const SECTIONS: Section[] = ['word_reading', 'sentence_reading', 'word_writing', 'checklist']

function StatusPill({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${
      done ? 'bg-blue/10 text-blue' : 'bg-rec/10 text-rec-deep'}`}>
      {label}
    </span>
  )
}

export default function ReviewPage() {
  const router = useRouter()
  const [st, setSt] = useState<SurveyState | null>(null)
  const [modal, setModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const s = loadState()
    if (!s) { router.replace('/'); return }
    setSt(s)
  }, [router])

  if (!st) return null

  const missing = ITEMS.filter(i =>
    (i.maxSec > 0 && !(st.recorded[i.code] > 0)) ||
    (i.section === 'word_writing' && st.writing[i.code] === undefined)).length

  async function submit() {
    if (!st) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/sessions/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: st.sessionId, writing: st.writing, checklist: st.checklist }),
      })
      if (!res.ok) { setErr('제출에 문제가 생겼어요. 다시 시도해 주세요.'); return }
      clearState()
      router.push('/done')
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col p-6 pt-8">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">검사 검토</span>
      </div>
      <h1 className="mt-6 text-xl font-bold">문항별 완료 여부를 확인해 주세요</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        문항 번호를 누르면 해당 문항으로 이동해요.
        {missing > 0 && <> 아직 <b className="text-rec-deep">{missing}개</b> 문항이 완료되지 않았어요.</>}
      </p>

      {SECTIONS.map(section => (
        <section key={section} className="card mt-4 p-4">
          <h2 className="text-[13px] font-bold text-ink-soft">{SECTION_LABEL[section]}</h2>
          <ul className="mt-2 flex flex-col">
            {ITEMS.filter(i => i.section === section).map(i => {
              let pill: React.ReactNode
              if (i.maxSec > 0) {
                const done = (st.recorded[i.code] ?? 0) > 0
                pill = <StatusPill done={done} label={done ? '녹음 완료' : '미녹음'} />
              } else if (i.section === 'word_writing') {
                const v = st.writing[i.code]
                pill = <StatusPill done={v !== undefined} label={v === true ? '예' : v === false ? '아니오' : '미선택'} />
              } else {
                pill = (
                  <span className="text-right text-xs text-ink-soft">
                    {st.checklist.length > 0 ? st.checklist.map(areaLabel).join(', ') : '선택 없음'}
                  </span>
                )
              }
              return (
                <li key={i.code} className="flex items-center justify-between gap-3 border-t border-line/60 py-2.5 first:border-t-0">
                  <Link href={`/survey?q=${i.orderNo}&from=review`} className="flex min-w-0 items-center gap-2.5">
                    <span className="w-7 flex-none text-sm font-bold text-blue underline">{i.orderNo}</span>
                    <span className="font-read truncate text-sm">{i.text || '검사자 체크리스트'}</span>
                  </Link>
                  {pill}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <div className="mt-6 flex gap-2.5 pb-2">
        <button onClick={() => router.push(`/survey?q=${ITEMS.length}`)}
          className="h-[52px] flex-1 rounded-xl border-[1.5px] border-line bg-well text-[15px] font-bold text-ink-soft">
          이전
        </button>
        <button onClick={() => setModal(true)}
          className="h-[52px] flex-[2] rounded-xl bg-blue text-[15px] font-bold text-white shadow-[0_3px_0_var(--color-blue-deep)] transition active:translate-y-[2px]">
          제출
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6"
          onClick={() => !busy && setModal(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title"
            className="w-full max-w-sm rounded-[20px] bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 id="confirm-title" className="text-center text-lg font-bold leading-relaxed">
              녹음이 잘 되었는지<br />모두 확인하셨습니까?
            </h2>
            <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
              ※ 녹음이 잘 되지 않았을 경우 재검사 요청이 갈 수 있습니다.
            </p>
            {err && <p role="alert" className="mt-3 text-center text-sm text-rec-deep">{err}</p>}
            <div className="mt-5 flex gap-2.5">
              <button onClick={() => setModal(false)} disabled={busy}
                className="h-[50px] flex-1 rounded-xl border-[1.5px] border-line bg-well text-[15px] font-bold text-ink-soft disabled:opacity-40">
                아니오
              </button>
              <button onClick={submit} disabled={busy}
                className="h-[50px] flex-1 rounded-xl bg-blue text-[15px] font-bold text-white disabled:opacity-40">
                {busy ? '저장 중…' : '네'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: `app/done/page.tsx` 문구 갱신** — `<h1>` 텍스트를 `검사가 끝났어요`로, 안내문을 아래로 교체 (구조 유지):

```tsx
<p className="text-sm leading-relaxed text-ink-soft">
  참여해 주셔서 감사합니다.<br />검사 결과가 안전하게 저장되었어요.
</p>
```

- [ ] **Step 3: 확인** — Run: `npm run typecheck && npm run build` / Expected: PASS. 브라우저: 체크리스트 '제출' → 검토 페이지(섹션별 상태, 미완료 개수), 문항 번호 클릭 → 해당 문항 이동 + '검토 화면으로 돌아가기' 링크, '이전' → 29번, '제출' → 모달(제목·설명·네/아니오), '아니오' → 닫힘 확인.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat: 결과 검토 페이지 — 문항별 완료 여부, 바로가기, 제출 확인 모달"
```

---

### Task 9: 관리자 개편

**Files:**
- Modify: `lib/db.ts` (구 관리자 조회 4개 함수·인터페이스를 새 구조로 교체)
- Rewrite: `app/admin/page.tsx`, `app/admin/[id]/page.tsx`, `app/api/admin/export/route.ts`
- Delete: `lib/compare.ts`, `tests/compare.test.ts`
- Test: `tests/export-route.test.ts` (재작성)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/export-route.test.ts` 전체 교체:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  exportRows: vi.fn().mockResolvedValue([{
    id: 'sess-1', school_region: '서울특별시교육청', school_id: 'B1', school_name: '서울신구초등학교',
    birth_ymd: '190101', grade: 1, class_no: 3, gender: '남', child_name: '김도연',
    teacher_name: '박선생', teacher_contact: '010-1234-5678',
    checklist: ['speech'], started_at: '2026-07-14T01:00:00Z', submitted_at: '2026-07-14T01:30:00Z',
    recordings: [
      { item_code: 'rw01', attempt_no: 1, audio_path: 'sess-1/rw01_1.webm', duration_sec: 3.2 },
      { item_code: 'rw01', attempt_no: 2, audio_path: 'sess-1/rw01_2.webm', duration_sec: 2.8 },
    ],
    writing_answers: [{ item_code: 'ww01', can_write: true }],
  }]),
}))

import { GET } from '@/app/api/admin/export/route'

describe('GET /api/admin/export', () => {
  it('세션당 29행 + 헤더, 새 참여자 필드 포함', async () => {
    const res = await GET()
    const csv = await res.text()
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(1 + 29)
    expect(lines[0]).toContain('학교')
    expect(lines[0]).toContain('생년월일')
    // rw01: 시도 2회, 최종 경로는 2번째
    const rw01 = lines.find(l => l.includes('rw01') || (l.includes(',1,') && l.includes('어디')))!
    expect(rw01).toContain('녹음완료')
    expect(rw01).toContain('sess-1/rw01_2.webm')
    // ww01: 예
    expect(lines.some(l => l.includes('우비') && l.includes('예'))).toBe(true)
    // 미녹음 문항 존재 (rw02 등)
    expect(lines.some(l => l.includes('미녹음'))).toBe(true)
    // 체크리스트 라벨
    expect(lines.some(l => l.includes('말 (조음/유창성)'))).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/export-route.test.ts` / Expected: FAIL

- [ ] **Step 3: `lib/db.ts` 관리자 조회 교체** — `listQuestions`, 구 `SessionRow`/`AttemptRow`/`DetailRow` 인터페이스, 구 `listSessions`/`sessionDetail`/`exportRows`를 삭제하고 아래로 교체 (`Question` 인터페이스도 삭제):

```ts
// ---------- 관리자 조회 ----------

export interface SessionRow {
  id: string
  school_region: string; school_id: string; school_name: string
  birth_ymd: string; grade: number; class_no: number; gender: string
  child_name: string; teacher_name: string; teacher_contact: string
  checklist: string[]
  started_at: string; submitted_at: string | null
}

export interface RecordingRow {
  item_code: string; attempt_no: number; audio_path: string
  duration_sec: number | null; created_at: string
}

export interface WritingRow { item_code: string; can_write: boolean }

const SESSION_COLS = 'id, school_region, school_id, school_name, birth_ymd, grade, class_no, gender, child_name, teacher_name, teacher_contact, checklist, started_at, submitted_at'

export async function listSessions(): Promise<(SessionRow & { recordings: { item_code: string }[] })[]> {
  const { data, error } = await sb().from('sessions')
    .select(`${SESSION_COLS}, recordings(item_code)`)
    .order('started_at', { ascending: false })
  fail(error)
  return data as unknown as (SessionRow & { recordings: { item_code: string }[] })[]
}

export async function sessionDetail(sessionId: string): Promise<{
  session: SessionRow; recordings: RecordingRow[]; writing: WritingRow[]
}> {
  const [{ data: s, error: e1 }, { data: recs, error: e2 }, { data: ans, error: e3 }] = await Promise.all([
    sb().from('sessions').select(SESSION_COLS).eq('id', sessionId).single(),
    sb().from('recordings').select('item_code, attempt_no, audio_path, duration_sec, created_at')
      .eq('session_id', sessionId).order('item_code').order('attempt_no'),
    sb().from('writing_answers').select('item_code, can_write').eq('session_id', sessionId),
  ])
  fail(e1); fail(e2); fail(e3)
  return {
    session: s as unknown as SessionRow,
    recordings: (recs ?? []) as RecordingRow[],
    writing: (ans ?? []) as WritingRow[],
  }
}

export type ExportSession = SessionRow & {
  recordings: Omit<RecordingRow, 'created_at'>[]
  writing_answers: WritingRow[]
}

/** CSV용: 세션 기준 전체 조회 (녹음·낱말쓰기 중첩) */
export async function exportRows(): Promise<ExportSession[]> {
  const { data, error } = await sb().from('sessions')
    .select(`${SESSION_COLS}, recordings(item_code, attempt_no, audio_path, duration_sec), writing_answers(item_code, can_write)`)
    .order('started_at', { ascending: true })
  fail(error)
  return data as unknown as ExportSession[]
}
```

- [ ] **Step 4: `app/api/admin/export/route.ts` 재작성**

```ts
import { buildCsv } from '@/lib/csv'
import { exportRows } from '@/lib/db'
import { ITEMS, KIND_LABEL, SECTION_LABEL, areaLabel } from '@/lib/items'

export const dynamic = 'force-dynamic'

const HEADER = ['지역', '학교', '학년', '반', '성별', '이름', '생년월일', '담임교사', '담임연락처',
  '시작시각', '제출시각', '문항번호', '섹션', '구분', '제시어', '응답', '시도수', '최종녹음경로', '최종길이초']

export async function GET() {
  const sessions = await exportRows()
  const cells = sessions.flatMap(s => {
    const base = [s.school_region, s.school_name, s.grade, s.class_no, s.gender, s.child_name,
      s.birth_ymd, s.teacher_name, s.teacher_contact, s.started_at, s.submitted_at ?? '']
    return ITEMS.map(item => {
      const row = [...base, item.orderNo, SECTION_LABEL[item.section],
        item.kind ? KIND_LABEL[item.kind] : '', item.text.replace(/\n/g, ' ')]
      if (item.maxSec > 0) {
        const recs = s.recordings.filter(r => r.item_code === item.code)
          .sort((a, b) => a.attempt_no - b.attempt_no)
        const last = recs[recs.length - 1]
        return [...row, recs.length > 0 ? '녹음완료' : '미녹음', recs.length,
          last?.audio_path ?? '', last?.duration_sec ?? '']
      }
      if (item.section === 'word_writing') {
        const ans = s.writing_answers.find(w => w.item_code === item.code)
        return [...row, ans === undefined ? '미선택' : ans.can_write ? '예' : '아니오', '', '', '']
      }
      // 체크리스트
      return [...row, s.checklist.length > 0 ? s.checklist.map(areaLabel).join('; ') : '선택없음', '', '', '']
    })
  })
  return new Response(buildCsv(HEADER, cells), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kodys-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
```

- [ ] **Step 5: `app/admin/page.tsx` 재작성**

```tsx
import Link from 'next/link'
import { listSessions } from '@/lib/db'
import { RECORDING_ITEMS } from '@/lib/items'
import { Blip } from '@/components/Blip'

export const dynamic = 'force-dynamic'

export default async function AdminList() {
  const sessions = await listSessions()
  const totalRec = RECORDING_ITEMS.length
  const submitted = sessions.filter(s => s.submitted_at).length
  const todayKey = new Date().toDateString()
  const today = sessions.filter(s => new Date(s.started_at).toDateString() === todayKey).length

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <Blip variant="logo" className="h-8 w-8" />
          <div>
            <p className="text-[15px] font-bold">KODYS-G1 읽기 검사 · 관리자</p>
            <p className="text-[11px] text-ink-mute">이름을 누르면 결과지가 열립니다</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="kpi">세션 <b>{sessions.length}</b></span>
            <span className="kpi">제출 <b>{submitted}</b></span>
            <span className="kpi">오늘 <b>{today}</b></span>
            <a href="/api/admin/export" className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white">
              CSV 내보내기
            </a>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th scope="col" className="px-5 py-3 font-medium">이름</th>
              <th scope="col" className="font-medium">학교</th>
              <th scope="col" className="font-medium">학년/반</th>
              <th scope="col" className="font-medium">생년월일</th>
              <th scope="col" className="font-medium">시작</th>
              <th scope="col" className="font-medium">녹음</th>
              <th scope="col" className="pr-5 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => {
              const recorded = new Set(s.recordings.map(r => r.item_code)).size
              return (
                <tr key={s.id} className="border-t border-line/60 hover:bg-well">
                  <td className="px-5 py-3">
                    <Link href={`/admin/${s.id}`} className="font-bold text-blue">{s.child_name}</Link>
                  </td>
                  <td>{s.school_name}</td>
                  <td>{s.grade}-{s.class_no}</td>
                  <td className="text-ink-soft">{s.birth_ymd}</td>
                  <td className="text-ink-soft">{new Date(s.started_at).toLocaleString('ko-KR')}</td>
                  <td className="font-read">{recorded} / {totalRec}</td>
                  <td className="pr-5">
                    {s.submitted_at
                      ? <span className="rounded-full bg-mint/10 px-3 py-1 text-xs font-bold text-mint">제출</span>
                      : <span className="rounded-full bg-amber/10 px-3 py-1 text-xs font-bold text-amber">진행 중</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sessions.length === 0 && <p className="p-8 text-center text-sm text-ink-mute">아직 참여한 세션이 없습니다.</p>}
      </div>
    </main>
  )
}
```

- [ ] **Step 6: `app/admin/[id]/page.tsx` 재작성**

```tsx
import Link from 'next/link'
import { sessionDetail, signedAudioUrl } from '@/lib/db'
import { ITEMS, KIND_LABEL, SECTION_LABEL, areaLabel } from '@/lib/items'
import { AudioPlayer } from '@/components/AudioPlayer'
import { Blip } from '@/components/Blip'

export const dynamic = 'force-dynamic'

export default async function AdminDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session: s, recordings, writing } = await sessionDetail(id)

  const recItems = ITEMS.filter(i => i.maxSec > 0)
  const writeItems = ITEMS.filter(i => i.section === 'word_writing')
  const byItem = new Map<string, { attempt_no: number; url: string; duration_sec: number | null }[]>()
  for (const r of recordings) {
    const url = await signedAudioUrl(r.audio_path)
    const list = byItem.get(r.item_code) ?? []
    list.push({ attempt_no: r.attempt_no, url, duration_sec: r.duration_sec })
    byItem.set(r.item_code, list)
  }
  const writingByCode = new Map(writing.map(w => [w.item_code, w.can_write]))
  const recordedCount = recItems.filter(i => byItem.has(i.code)).length

  return (
    <main className="mx-auto max-w-4xl p-6">
      <Link href="/admin" className="text-sm text-ink-mute underline">← 목록</Link>
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
            <div className="ml-auto flex flex-wrap gap-2">
              <span className="kpi">녹음 <b>{recordedCount} / {recItems.length}</b></span>
              <span className="kpi">낱말쓰기 <b>{writing.length} / {writeItems.length}</b></span>
            </div>
          </div>
        </div>

        <h2 className="px-5 pt-4 text-[13px] font-bold text-ink-soft">녹음 문항 (낱말 해독 · 문장 읽기유창성)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
              <th scope="col" className="w-24 font-medium">구분</th>
              <th scope="col" className="font-medium">제시어</th>
              <th scope="col" className="w-14 font-medium">시도</th>
              <th scope="col" className="w-52 pr-5 font-medium">듣기</th>
            </tr>
          </thead>
          <tbody>
            {recItems.flatMap(item => {
              const label = item.section === 'word_reading'
                ? `낱말 (${KIND_LABEL[item.kind!]})` : '문장'
              const views = byItem.get(item.code) ?? []
              if (views.length === 0) return [(
                <tr key={item.code} className="border-t border-line/60">
                  <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                  <td className="text-xs text-ink-mute">{label}</td>
                  <td className="font-read whitespace-pre-line">{item.text}</td>
                  <td>—</td>
                  <td className="pr-5">
                    <span className="rounded-full bg-rec/10 px-3 py-1 text-xs font-bold text-rec-deep">미녹음</span>
                  </td>
                </tr>
              )]
              return views.map((v, i) => (
                <tr key={`${item.code}-${v.attempt_no}`} className={i === 0 ? 'border-t border-line/60' : ''}>
                  <td className="px-5 py-3 text-ink-mute">{i === 0 ? item.orderNo : ''}</td>
                  <td className="text-xs text-ink-mute">{i === 0 ? label : ''}</td>
                  <td className="font-read whitespace-pre-line">{i === 0 ? item.text : ''}</td>
                  <td className="text-ink-mute">{views.length > 1 ? `#${v.attempt_no}` : ''}</td>
                  <td className="py-2 pr-5"><AudioPlayer src={v.url} /></td>
                </tr>
              ))
            })}
          </tbody>
        </table>

        <h2 className="border-t border-line px-5 pt-4 text-[13px] font-bold text-ink-soft">낱말 쓰기 (예/아니오)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-mute">
              <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
              <th scope="col" className="w-24 font-medium">구분</th>
              <th scope="col" className="font-medium">낱말</th>
              <th scope="col" className="w-28 pr-5 font-medium">답</th>
            </tr>
          </thead>
          <tbody>
            {writeItems.map(item => {
              const v = writingByCode.get(item.code)
              return (
                <tr key={item.code} className="border-t border-line/60">
                  <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                  <td className="text-xs text-ink-mute">{KIND_LABEL[item.kind!]}</td>
                  <td className="font-read">{item.text}</td>
                  <td className="pr-5">
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
  )
}
```

- [ ] **Step 7: 삭제 및 확인**

```bash
git rm lib/compare.ts tests/compare.test.ts
```

Run: `npx vitest run && npm run typecheck && npm run build` / Expected: 전체 PASS

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat: 관리자 개편 — KODYS 결과지(녹음 청취·낱말쓰기·체크리스트), CSV 갱신"
```

---

### Task 10: 최종 정리 · 검증 · E2E

**Files:**
- Modify: `docs/superpowers/specs/2026-07-13-stt-accuracy-improvements-design.md`, `docs/superpowers/plans/2026-07-13-stt-accuracy-improvements.md` (폐기 표기)
- Modify: `README.md`, `.env.local.example` (T5에서 미처리 시)

- [ ] **Step 1: 폐기 문서 표기** — 두 STT 정확도 문서 최상단(제목 아래)에 추가:

```markdown
> **[폐기됨 2026-07-14]** STT 자체가 제거되어 이 문서는 더 이상 유효하지 않다.
> 대체: `docs/superpowers/specs/2026-07-14-kodys-g1-redesign-design.md`
```

- [ ] **Step 2: README 갱신** — 프로젝트 개요를 "KODYS-G1 초등 1학년 읽기 선별검사 웹"으로, STT/Azure 언급 제거, `build:schools` 사용법과 마이그레이션 003 적용 안내 추가. `.env.local.example`에 Azure 변수가 남아 있으면 제거.

- [ ] **Step 3: 전체 검증**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: 테스트 전체 PASS, 타입 오류 0, 빌드 성공.

- [ ] **Step 4: 사용자 체크포인트 — 마이그레이션 적용 요청**

사용자에게 `supabase/migrations/003_kodys_redesign.sql`을 Supabase SQL Editor에서 실행하도록 요청한다 (기존 테이블·데이터 폐기 경고 재고지). 적용 확인 후 다음 단계로.

- [ ] **Step 5: 브라우저 E2E** (dev 서버, 실 Supabase)

1. `/` — 지역→학교 검색 선택, 7개 필드 입력, 시작 → 세션 DB 생성 확인
2. 마이크 확인 → 문항 1 녹음(카운트다운 30초) → Supabase Storage에 `<sessionId>/rw01_1.webm` 업로드 확인
3. 문항 15(40초 타이머), 문항 19(예/아니오 필수), 문항 29(체크리스트) 통과
4. 검토 페이지: 미완료 표시·문항 바로가기 → 제출 모달 → "아니오" 닫힘 → "네" → `/done` + `sessions.submitted_at`·`writing_answers` 저장 확인
5. `/admin` 로그인 → 목록·결과지(녹음 재생)·CSV 다운로드 확인

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "docs: STT 개선 문서 폐기 표기, README KODYS 전환 반영"
```

---

## Self-Review 결과 (계획 작성 시 수행)

- **스펙 커버리지:** 참여자 정보 7종(T6)·학교 검색(T3/T6)·타이머 녹음(T7)·낱말쓰기 필수 체크(T7)·체크리스트 단일 문항(T7)·검토 페이지+모달(T8)·이전/다음(T7)·미완료 제출 허용(T8)·STT 제거(T5)·관리자 개편(T9)·CSV(T9)·마이그레이션(T4)·폐기 문서(T10) — 전부 태스크에 매핑됨.
- **타입 일관성:** `SelectedSchool`(T6) ↔ sessions API body(T5), `SurveyState`(T6) ↔ survey/review(T7/T8), `WritingAnswer`(T5) ↔ submit 라우트(T5), `SessionRow`/`RecordingRow`/`WritingRow`(T9) ↔ admin 페이지(T9) 확인 완료.
- **플레이스홀더:** 없음 (모든 코드 스텝에 전체 코드 포함).
