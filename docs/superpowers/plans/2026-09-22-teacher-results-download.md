# 교사 결과지 다운로드 + 사용성 5건 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 관리자 개입 없이 시작 화면의 [결과지 받기] → 등록된 메일의 링크 → 결과 페이지에서 본인 학급 결과지 PDF(전체/선택)를 내려받는다. 함께 확정된 사용성 5건과 이메일 안전망 3건, 문서 정리를 같은 브랜치에서 끝낸다.

**Architecture:** 학급 코드 조회 뒤 보이는 버튼이 `class_codes.teacher_email`로 **학급 스코프 HMAC 토큰**(14일) 링크를 보낸다(매직링크 — 코드를 아는 것과 결과를 보는 것을 분리). 토큰은 권한만 담고 데이터는 매 요청 DB에서 읽는다. 결과 목록·PDF는 관리자 결과지와 **같은 채점 함수 사슬**(`scoreInputFrom → withUnrecordedDefaults → scoreSession → sheetPdfGate`)을 쓰고, PDF는 기존 `stampSheet`를 세션마다 돌려 `pdf-lib`로 병합한다. 마이그레이션 0건.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase(service role) · Zod · pdf-lib · Resend(fetch) · Vitest(node 환경)

**Spec:** `docs/superpowers/specs/2026-09-22-teacher-results-download-design.md`

**작업 규칙(CLAUDE.md):** 임상·절차 주석에는 출처(`담당자 확정(날짜)` / `사용자 확정(날짜)`)를 적는다. 코드를 고치면 그 폴더 README·주석을 같은 커밋에서 고친다. 커밋 전 `npm run typecheck && npm run lint && npm test && npm run build` 전부 통과. `next-env.d.ts`가 바뀌면 커밋하지 말고 `git checkout next-env.d.ts`.

**브랜치:** `feat/teacher-results` (main에서 이미 딴 상태, 스펙 커밋 `f4ce6cb` 하나 있음). 시작 전 `git log origin/main..main`이 비어 있는지 확인 — 푸시 안 된 로컬 커밋이 있으면 squash에 딸려 들어간다(PR #67 사고).

---

## 파일 구조

| 파일 | 책임 | 상태 |
|---|---|---|
| `lib/auth.ts` | `createResultsToken`/`verifyResultsToken` — 학급 스코프 토큰 | 수정 |
| `lib/results.ts` | 결과 표의 **순수 로직**: 이메일 마스킹, 세션 상태·점수·판정, 명단∪세션 합치기, 정렬, 요약, 파일명 | 신규 |
| `lib/db.ts` | `findClassCodeById` · `classResults` · `updateClassCodeEmail` | 수정 |
| `lib/schema.ts` | 발급 이메일 필수 · `classCodeEmailSchema` · `resultsRequestSchema` | 수정 |
| `lib/format.ts` | `RESULTS_GUIDE_LINES`(승인 안내 3채널 공유 문구) · `approvalNoticeText`에 결과지 절 | 수정 |
| `lib/mail.ts` | `resultsLinkMail` · `approvedMail`에 결과지 절 · 문의처 TODO 닫기 | 수정 |
| `lib/survey-state.ts` | `saveMicOk`/`recentMicOk`(기기 키) | 수정 |
| `app/api/results/request/route.ts` | 코드 → 메일 발송. 코드당 60초 · IP 레이트리밋 | 신규 |
| `app/api/results/[token]/route.ts` | 결과 목록 JSON | 신규 |
| `app/api/results/[token]/sheets.pdf/route.ts` | 병합 PDF | 신규 |
| `app/api/admin/codes/[id]/route.ts` | `PATCH` 이메일 수정 추가 | 수정 |
| `app/results/page.tsx` | 토큰 없음 → `/` | 신규 |
| `app/results/[token]/page.tsx` | 서버 셸(noindex·no-referrer) → `ResultsView` | 신규 |
| `components/results/ResultsView.tsx` | 결과 페이지 클라이언트 UI | 신규 |
| `components/results/README.md` | 폴더 README | 신규 |
| `app/page.tsx` | 배너에 `검사 완료 N명` + [결과지 받기 →] + 카운트다운 | 수정 |
| `components/survey/MicCheck.tsx` | 10분 내 통과 시 건너뛰기 버튼 | 수정 |
| `components/admin/CodeIssuer.tsx` | 이메일 필수 · 목록 행 인라인 이메일 수정 | 수정 |
| `app/apply/page.tsx` | 이메일 확인칸 | 수정 |
| `tests/results.test.ts` | `lib/results.ts` | 신규 |
| `tests/results-route.test.ts` | 세 라우트 | 신규 |
| `tests/auth.test.ts` · `schema.test.ts` · `mail.test.ts` · `admin-codes-route.test.ts` · `survey-state.test.ts` | 갱신 | 수정 |
| README 6곳 + `docs/consent/` 삭제 | 문서 | 수정 |

---

### Task 0: 문서 정리 — 가정통신문 삭제 · 문의처 TODO 닫기

**Files:**
- Delete: `docs/consent/guardian-consent-form.md`
- Modify: `docs/README.md`, `README.md`, `app/apply/README.md`, `lib/consent.ts`, `lib/mail.ts`

- [ ] **Step 1: 파일 삭제**

```bash
cd /Users/kimjiwoo/dev/kids-speech-survey
git rm docs/consent/guardian-consent-form.md
rmdir docs/consent 2>/dev/null || true
```

- [ ] **Step 2: `docs/README.md` — `consent/` 항목 제거**

`docs/README.md`에서 아래 두 줄을 찾아 고친다.

원문:
```
설계 문서가 아닌 것도 둘 있다. 이 둘은 **스냅샷이 아니라 현행 문서**라 코드가 바뀌면 함께 고친다.

- `manuals/` — 사용 설명서 3종(관리자·검사 진행자·아동)과 그 원본. [manuals/README.md](manuals/README.md)
- `consent/` — 보호자 서면 동의서(가정통신문) 양식
```
수정:
```
설계 문서가 아닌 것도 하나 있다. 이것은 **스냅샷이 아니라 현행 문서**라 코드가 바뀌면 함께 고친다.

- `manuals/` — 사용 설명서 3종(관리자·검사 진행자·아동)과 그 원본. [manuals/README.md](manuals/README.md)

(보호자 동의서 양식 `consent/`는 2026-09-22에 삭제했다 — 담당자 확정(2026-09-21)대로 보호자 동의
수단은 학교의 개인정보 처리 절차에 맡기고 앱은 양식을 제공하지 않는다. 앱은 「법정대리인 동의를
받은 학생만 명단에 등록했다」는 교사 확인만 기록한다.)
```

- [ ] **Step 3: `README.md` — 동의 절차 ①과 보존 기한 TODO**

원문(동의 절차):
```
- **동의 절차(구현됨)**: ① 검사 전 가정통신문 서면 동의서
  ([docs/consent/guardian-consent-form.md](docs/consent/guardian-consent-form.md)) 배부·회수(시행령 제17조의2 ①4호)
  → ② 시작 화면에서 4대 고지사항(제15조②) 표시 + 검사자가 "서면 동의 확인" 필수 체크
```
수정:
```
- **동의 절차(구현됨)**: ① 검사 전 **학교의 개인정보 처리 방침·절차에 따라** 법정대리인 동의 회수
  (수단은 학교가 정한다 — 담당자 확정 2026-09-21. 앱이 양식을 제공하지 않으며 서면 동의서 양식
  `docs/consent/`는 2026-09-22에 삭제했다)
  → ② 시작 화면에서 4대 고지사항(제15조②) 표시 + 검사자가 "법정대리인 동의 확인" 필수 체크
```

원문(보존 기한 TODO):
```
  6개월)을 확정하면 → `lib/consent.ts`의 `RETENTION_LABEL`·가정통신문 양식을 함께 교체하고,
```
수정:
```
  6개월)을 확정하면 → `lib/consent.ts`의 `RETENTION_LABEL`을 교체하고,
```

- [ ] **Step 4: `app/apply/README.md` — 두 문단**

원문:
```
선택적 `note`)가 문구의 단일 소스다. **화면이 아니라 lib에 있다** — 가정통신문 서면 양식과
갈리면 안 되고(`RETENTION_LABEL` 공유), node 환경 테스트가 문구 존재를 핀할 수 있어야 한다
```
수정:
```
선택적 `note`)가 문구의 단일 소스다. **화면이 아니라 lib에 있다** — 시작 화면 고지 카드와
같은 값(`RETENTION_LABEL`)을 써야 하고, node 환경 테스트가 문구 존재를 핀할 수 있어야 한다
```

원문:
```
**아동 개인정보·연구 활용 동의는 여기서 받지 않는다** — 교사는 보호자의 대리인이 아니며,
그 동의는 가정통신문(서면)의 몫이다. 체크 3번의 `note`가 그 사실을 교사에게 알린다.
```
수정:
```
**아동 개인정보·연구 활용 동의는 여기서 받지 않는다** — 교사는 보호자의 대리인이 아니며,
그 동의는 학교의 개인정보 처리 절차(담당자 확정 2026-09-21)의 몫이다. 체크 3번의 `note`가
그 사실을 교사에게 알린다.
```

- [ ] **Step 5: `lib/consent.ts` — 주석 5곳**

원문(2행):
```
// 시작 화면 고지 카드와 가정통신문 동의서(docs/consent/)가 같은 내용을 쓰도록 한 곳에 정의한다.
```
수정:
```
// 시작 화면 고지 카드와 신청 화면 동의 문구가 같은 내용을 쓰도록 한 곳에 정의한다.
```

원문(11행):
```
//   서명날인 후 제출받는 방법(= 학교 가정통신문 동의서)이 인정된다.
```
수정:
```
//   서명날인 후 제출받는 방법 등이 인정된다 — 어느 수단을 쓸지는 학교의 개인정보 처리 절차가
//   정한다(담당자 확정 2026-09-21). 앱은 양식을 제공하지 않고 교사의 「받았다」 확인만 기록한다.
```

원문(RETENTION TODO 18행):
```
 *   2) 가정통신문(docs/consent/guardian-consent-form.md)의 같은 항목을 함께 갱신하고
 *   3) README '운영 · 개인정보' 절의 일괄 파기 쿼리를 pg_cron으로 자동화한다.
 * 문구를 바꾸면 이미 회수한 서면 동의서와 어긋나지 않도록, 변경 시점 이후 수집분부터 적용할 것.
```
수정:
```
 *   2) README '운영 · 개인정보' 절의 일괄 파기 쿼리를 pg_cron으로 자동화한다.
 * 문구를 바꾸면 이미 고지한 학급과 어긋나지 않도록, 변경 시점 이후 수집분부터 적용할 것.
```

원문(SURVEY_NOTICE 주석 56행):
```
 * 고지 문구의 단일 소스이기 때문이다 — 가정통신문 서면 양식과 갈리면 안 되고(RETENTION_LABEL
 * 공유), node 환경 테스트가 문구 존재를 핀할 수 있어야 한다(화면 렌더 테스트는 두지 않는 관례).
```
수정:
```
 * 고지 문구의 단일 소스이기 때문이다 — 시작 화면 고지 카드와 같은 값(RETENTION_LABEL)을 써야
 * 하고, node 환경 테스트가 문구 존재를 핀할 수 있어야 한다(화면 렌더 테스트는 두지 않는 관례).
```

원문(67행):
```
 * 아니다. 그것은 가정통신문(서면)의 몫이다(스펙 "동의" 절).
```
수정:
```
 * 아니다. 그것은 학교의 개인정보 처리 절차의 몫이다(담당자 확정 2026-09-21).
```

원문(69~72행):
```
 *   · 약 5분 이내 …… 담당자 확정(2026-09-21). 이전 값은 15~20분이었고 가정통신문
 *     (docs/consent/guardian-consent-form.md)이 같은 값을 쓰므로 **함께 고쳤다.**
 *     ⚠️ 담당자 확인 대기 — 15~20분으로 인쇄된 동의서가 이미 배부됐다면 그 학급에는
 *     고지값이 다르게 나간 것이다. 배부 이력을 확인할 것.
```
수정:
```
 *   · 약 5분 이내 …… 담당자 확정(2026-09-21). 이전 값은 15~20분(2026-08-22 사용자 확정).
```

원문(APPLY_CHECKS 3번 주석 105~106행):
```
    // 담당자 확정(2026-09-21) — 회수 수단을 「가정통신문」으로 못 박지 않는다. 학교마다
    // 개인정보 동의 절차가 달라(알림앱·전자동의 등) 가정통신문만 유효한 것처럼 읽혔다.
```
수정:
```
    // 담당자 확정(2026-09-21) — 회수 수단을 특정하지 않는다. 학교마다 개인정보 동의 절차가
    // 달라(서면·알림앱·전자동의 등) 한 수단만 유효한 것처럼 읽히면 안 된다. 그래서 앱은
    // 동의서 양식도 제공하지 않는다(docs/consent/ 삭제, 2026-09-22).
```

- [ ] **Step 6: `lib/mail.ts` — 문의처 TODO 닫기**

원문(135~141행):
```
 *  ⚠️ TODO(문의처 — 나중에 넣기로 함, 2026-08-22): 본문이 "담당자에게 문의하셔야 합니다"라고만
 *  말하고 **어디로 문의할지는 적혀 있지 않다.** 메일을 지운 교사가 갈 곳이 없다.
 *  운영 주체가 창구(메일 또는 전화)를 정하면 **세 곳을 함께** 채울 것 — 값이 갈리면
 *  채널마다 다른 곳으로 안내한다:
 *    1) 이 함수의 보관 안내 문단
 *    2) lib/format.ts의 approvalNoticeText(관리자가 카톡·문자로 붙이는 평문)
 *    3) docs/consent/guardian-consent-form.md의 `[담당자 소속·성명·연락처]`(보호자용) */
```
수정:
```
 *  문의처는 「담당자에게 문의」까지만 적는다(사용자 확정 2026-09-22) — 연락처 값을 앱에 두지
 *  않는다. 교사는 코드를 전달받은 경로(담당자)를 이미 알고 있다. 이 방침은 approvalNoticeText
 *  (lib/format.ts)·결과 링크 메일(resultsLinkMail)·결과 페이지 만료 화면이 함께 따른다. */
```

- [ ] **Step 7: 검증 · 커밋**

```bash
npm run typecheck && npm run lint && npm test
grep -rn "guardian-consent-form\|가정통신문" --include="*.ts" --include="*.tsx" --include="*.md" lib/ app/ components/ README.md docs/README.md
```
Expected: 테스트 672 통과. grep 결과 0줄(`STATIC_ANALYSIS_*`·`docs/2026-07-16-*`·`docs/superpowers/`는 검색 범위 밖 — 스냅샷이라 두 된다).

```bash
git add -A
git commit -m "docs: 가정통신문 양식 삭제 · 문의처는 「담당자에게 문의」로 확정

담당자 확정(2026-09-21)대로 보호자 동의 수단은 학교의 개인정보 처리 절차에 맡긴다 — 앱이
양식을 제공하지 않고 교사의 「받았다」 확인만 기록한다. 그에 따라 docs/consent/를 지우고
README·lib/consent.ts·app/apply/README.md의 참조를 정리했다.

문의처는 「담당자에게 문의」까지만 적기로 확정(사용자 2026-09-22) — 연락처 값·상수를 앱에
두지 않는다. lib/mail.ts의 문의처 TODO(2026-08-22)를 닫는다.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: 학급 스코프 토큰 (`lib/auth.ts`)

**Files:**
- Modify: `lib/auth.ts` (파일 끝, `ADMIN_COOKIE` 앞)
- Test: `tests/auth.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`tests/auth.test.ts` import 줄을 바꾸고 describe를 추가한다.

```ts
import { createToken, verifyToken, sha256Hex, createSessionToken, verifySessionToken,
  createResultsToken, verifyResultsToken, RESULTS_TTL_MS } from '@/lib/auth'
```

파일 끝에:

```ts
describe('학급 스코프 토큰(결과지 링크)', () => {
  const CID = '755316e7-fe7c-43f9-a5c5-5c2d39da59d7'
  it('발급한 토큰은 검증 통과하고 classCodeId를 돌려준다', async () => {
    const t = await createResultsToken(CID, SECRET)
    expect(await verifyResultsToken(t, SECRET)).toBe(CID)
  })
  it('기본 만료는 14일이다 — 채점 대기 기간을 감안한 값(사용자 확정 2026-09-22)', () => {
    expect(RESULTS_TTL_MS).toBe(14 * 24 * 3600_000)
  })
  it('만료된 토큰은 null', async () => {
    const t = await createResultsToken(CID, SECRET, -1)
    expect(await verifyResultsToken(t, SECRET)).toBeNull()
  })
  it('다른 시크릿이면 null', async () => {
    const t = await createResultsToken(CID, SECRET)
    expect(await verifyResultsToken(t, 'other')).toBeNull()
  })
  it('[REGRESSION] 주체(classCodeId)를 바꾸면 서명이 어긋나 null — 토큰 하나로 다른 학급을 열 수 없다', async () => {
    const t = await createResultsToken(CID, SECRET)
    const [, exp, sig] = t.split('.')
    expect(await verifyResultsToken(`99999999-9999-4999-8999-999999999999.${exp}.${sig}`, SECRET)).toBeNull()
  })
  it('만료(exp) 필드를 늘려도 null', async () => {
    const t = await createResultsToken(CID, SECRET, 60_000)
    const [cid, , sig] = t.split('.')
    expect(await verifyResultsToken(`${cid}.9999999999999.${sig}`, SECRET)).toBeNull()
  })
  it('형식이 아니면 null — 빈 문자열·점 개수 불일치·비UUID 주체', async () => {
    expect(await verifyResultsToken('', SECRET)).toBeNull()
    expect(await verifyResultsToken('a.b', SECRET)).toBeNull()
    expect(await verifyResultsToken('not-a-uuid.123.abc', SECRET)).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — `createResultsToken is not a function` 류.

- [ ] **Step 3: 구현**

`lib/auth.ts`의 `export const ADMIN_COOKIE = 'admin_token'` **바로 위**에 추가:

```ts
/** 결과지 링크 토큰의 수명. 채점이 며칠 걸릴 수 있어 7일은 짧다 — 교사가 링크 하나를 북마크해
 *  두고 새로고침만으로 채점 진행을 따라가게 하려면 2주는 필요하다(사용자 확정 2026-09-22). */
export const RESULTS_TTL_MS = 14 * 24 * 3600_000

/** UUID v4 모양 — 주체 자리에 임의 문자열이 오는 것을 형식에서 거른다(서명 검증 전 1차 방어). */
const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 학급 스코프 토큰 `${classCodeId}.${만료ms}.${HMAC(classCodeId.만료ms)}` — 교사 결과지 링크용.
 * 세션 토큰과 달리 **주체를 토큰 안에 담는다** — URL 하나로 자립해야 메일 링크가 된다.
 * 권한만 담고 데이터는 담지 않으므로, 같은 링크를 새로고침하면 그 시점 DB가 보인다.
 * 폐기 수단은 관리자 토큰과 같다(SESSION_SECRET 회전).
 */
export async function createResultsToken(classCodeId: string, secret: string, ttlMs = RESULTS_TTL_MS): Promise<string> {
  const exp = String(Date.now() + ttlMs)
  return `${classCodeId}.${exp}.${await hmacHex(`${classCodeId}.${exp}`, secret)}`
}

/** 검증 통과 시 classCodeId, 아니면 null. 만료·변조·형식 오류를 구분하지 않는다 — 호출부가
 *  사유를 나눠 보여주면 그 자체가 정보다(verify-code가 pending을 404로 뭉뚱그리는 것과 같은 방침). */
export async function verifyResultsToken(token: string, secret: string): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [cid, exp, sig] = parts
  if (!UUID_LIKE.test(cid) || !exp || !sig) return null
  if (!(Number(exp) >= Date.now())) return null // NaN 포함 거부
  return timingSafeEqualHex(await hmacHex(`${cid}.${exp}`, secret), sig) ? cid : null
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS (기존 + 7)

- [ ] **Step 5: 커밋**

```bash
git add lib/auth.ts tests/auth.test.ts
git commit -m "feat(auth): 학급 스코프 토큰 — 교사 결과지 링크용(14일, 주체 내장)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: 결과 표 순수 로직 (`lib/results.ts`)

**Files:**
- Create: `lib/results.ts`
- Test: `tests/results.test.ts`

이 모듈은 DB를 모른다 — 행 모양만 받는다. 라우트 두 개(목록·PDF)와 테스트가 공유한다.

- [ ] **Step 1: 실패하는 테스트**

`tests/results.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  maskEmail, evaluateSession, scoreInputFor, buildChildren, latestSession, childVerdict,
  summarize, sheetsFileName, type ResultsSessionRow,
} from '@/lib/results'

/** G1 세션 행 골격. 채점 행은 테스트마다 채운다. */
function row(over: Partial<ResultsSessionRow> & { id: string; child_no: number }): ResultsSessionRow {
  return {
    child_name: `아이${over.child_no}`, gender: '여', grade: 1, birth_ymd: '190312', checklist: [],
    started_at: '2026-09-22T01:00:00.000Z', submitted_at: '2026-09-22T01:20:00.000Z',
    recordings: [], reading_marks: [], sentence_scores: [], writing_answers: [],
    ...over,
  }
}
/** 낱말 14 O/X + 문장 4 어절 = 읽기 두 과제 채점 완료. 쓰기는 비움. */
const READ_SCORED = {
  reading_marks: Array.from({ length: 14 }, (_, i) => ({ item_code: `rw${String(i + 1).padStart(2, '0')}`, correct: i < 10 })),
  sentence_scores: [{ item_code: 'rs01', words: 7 }, { item_code: 'rs02', words: 7 }, { item_code: 'rs03', words: 8 }, { item_code: 'rs04', words: 14 }],
}
const WRITE_SCORED = {
  writing_answers: Array.from({ length: 10 }, (_, i) => ({ item_code: `ww${String(i + 1).padStart(2, '0')}`, can_write: i < 8 })),
}

describe('maskEmail — 시작 화면에 주소를 통째로 내지 않는다', () => {
  it('로컬 첫 글자 + *** @ 도메인 앞 3글자 + *** . TLD', () => {
    expect(maskEmail('kim@school.kr')).toBe('k***@sch***.kr')
    expect(maskEmail('jiwoo.frontdev@gmail.com')).toBe('j***@gma***.com')
  })
  it('짧은 도메인·다단계 TLD도 깨지지 않는다', () => {
    expect(maskEmail('a@b.co.kr')).toBe('a***@b***.kr')
    expect(maskEmail('x@yz.io')).toBe('x***@yz***.io')
  })
})

describe('evaluateSession — 상태·점수·판정 (관리자 sheetPdfGate와 같은 기준, 사용자 확정 A안)', () => {
  it('미제출은 unsubmitted, 점수·판정 없음', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, submitted_at: null, ...READ_SCORED }))
    expect(r).toEqual({ status: 'unsubmitted', scores: null, verdict: null })
  })
  it('제출됐지만 낱말 채점이 비면 scoring', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, sentence_scores: READ_SCORED.sentence_scores,
      recordings: [{ item_code: 'p_rw_meaning' }, { item_code: 'p_rw_nonsense' }] }))
    expect(r.status).toBe('scoring')
    expect(r.scores).toBeNull()
  })
  it('읽기 두 과제가 채점되면 쓰기가 비어도 scored — 쓰기는 관리자가 채울 수 없어 막으면 영원히 못 받는다', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, ...READ_SCORED }))
    expect(r.status).toBe('scored')
    expect(r.scores).toEqual({ wordReading: 10, sentenceReading: 36, writing: 0 })
  })
  it('[REGRESSION] 녹음 없는 페이지는 X·0점으로 채워져 채점 완료로 본다(사용자 확정 2026-08-12) — 채점 행이 하나도 없어도 녹음이 없으면 scored', () => {
    const r = evaluateSession(row({ id: 's', child_no: 1, recordings: [] }))
    expect(r.status).toBe('scored')
    expect(r.scores).toEqual({ wordReading: 0, sentenceReading: 0, writing: 0 })
    expect(r.verdict).toBe('fail')
  })
  it('판정: 세 과제 모두 pass여야 pass, 하나라도 fail이면 fail (G1 임시 기준 9/23/6)', () => {
    const pass = evaluateSession(row({ id: 's', child_no: 1, ...READ_SCORED, ...WRITE_SCORED }))
    expect(pass.verdict).toBe('pass')
    const failWriting = evaluateSession(row({ id: 's', child_no: 1, ...READ_SCORED,
      writing_answers: WRITE_SCORED.writing_answers.map((w, i) => ({ ...w, can_write: i < 3 })) }))
    expect(failWriting.verdict).toBe('fail')
  })
})

describe('scoreInputFor — PDF가 관리자와 같은 입력을 쓴다', () => {
  it('제출된 세션은 미녹음 기본값이 적용되고 form은 학년 양식', () => {
    const { form, input } = scoreInputFor(row({ id: 's', child_no: 1, recordings: [] }))
    expect(form.id).toBe('KODYS-G1')
    expect(input.marks.rw01).toBe(false)
    expect(input.sentences.rs01).toBe(0)
  })
  it('미제출 세션은 기본값을 적용하지 않는다 — 아직 안 한 것이지 오반응이 아니다', () => {
    const { input } = scoreInputFor(row({ id: 's', child_no: 1, submitted_at: null, recordings: [] }))
    expect(input.marks.rw01).toBeUndefined()
  })
})

describe('buildChildren — 명단 ∪ 세션, 아이당 한 줄', () => {
  const roster = [
    { child_no: 1, child_name: '김가나', gender: '여' as const },
    { child_no: 2, child_name: '김가나', gender: '남' as const },
    { child_no: 5, child_name: '정도윤', gender: '남' as const },
  ]
  it('명단에만 있으면 sessions가 빈 행(미실시)', () => {
    const c = buildChildren(roster, [])
    expect(c.map(x => x.childNo)).toEqual([1, 2, 5])
    expect(c[0].sessions).toEqual([])
    expect(c[0].name).toBe('김가나')
  })
  it('명단에 없는 번호의 세션도 행이 된다(직접 입력 아동) — 이름은 세션 값', () => {
    const c = buildChildren(roster, [row({ id: 's9', child_no: 9, child_name: '전학생' })])
    expect(c.find(x => x.childNo === 9)?.name).toBe('전학생')
  })
  it('명단 없는 학급(관리자 직접 발급)은 세션만으로 표를 만든다', () => {
    const c = buildChildren([], [row({ id: 'a', child_no: 3 }), row({ id: 'b', child_no: 1 })])
    expect(c.map(x => x.childNo)).toEqual([1, 3])
  })
  it('재검사: started_at 오름차순으로 attemptNo 1,2,3… — 이름은 최신 세션 값', () => {
    const c = buildChildren(roster, [
      row({ id: 'late', child_no: 1, child_name: '김가나(수정)', started_at: '2026-09-22T03:00:00.000Z' }),
      row({ id: 'early', child_no: 1, started_at: '2026-09-22T01:00:00.000Z' }),
    ])
    const k = c.find(x => x.childNo === 1)!
    expect(k.sessions.map(s => [s.id, s.attemptNo])).toEqual([['early', 1], ['late', 2]])
    expect(k.name).toBe('김가나(수정)')
  })
  it('정렬: 최신 세션이 Fail인 아이가 먼저, 그 안에서 번호순', () => {
    const c = buildChildren(roster, [
      row({ id: 'p', child_no: 1, ...READ_SCORED, ...WRITE_SCORED }),   // pass
      row({ id: 'f', child_no: 5, recordings: [] }),                     // fail(전부 미녹음)
    ])
    expect(c.map(x => x.childNo)).toEqual([5, 1, 2])
  })
})

describe('latestSession · childVerdict', () => {
  it('세션이 없으면 둘 다 null', () => {
    const [c] = buildChildren([{ child_no: 1, child_name: '가', gender: '여' }], [])
    expect(latestSession(c)).toBeNull()
    expect(childVerdict(c)).toBeNull()
  })
  it('최신 세션이 scored가 아니면 판정 null — 채점 중인 재검사가 옛 판정을 가리지 않는다', () => {
    const [c] = buildChildren([], [
      row({ id: 'old', child_no: 1, recordings: [], started_at: '2026-09-22T01:00:00.000Z' }),
      row({ id: 'new', child_no: 1, submitted_at: null, started_at: '2026-09-22T02:00:00.000Z' }),
    ])
    expect(latestSession(c)?.id).toBe('new')
    expect(childVerdict(c)).toBeNull()
  })
})

describe('summarize — 상단 한 줄', () => {
  it('검사·채점 완료·Fail·채점 중·미제출·미실시를 센다', () => {
    const c = buildChildren(
      [{ child_no: 1, child_name: 'a', gender: '여' }, { child_no: 2, child_name: 'b', gender: '남' }, { child_no: 3, child_name: 'c', gender: '남' }],
      [
        row({ id: 's1', child_no: 1, ...READ_SCORED, ...WRITE_SCORED }),          // scored pass
        row({ id: 's2', child_no: 2, recordings: [] }),                             // scored fail
        row({ id: 's4', child_no: 4, submitted_at: null }),                         // unsubmitted (명단 밖)
        row({ id: 's5', child_no: 5, sentence_scores: READ_SCORED.sentence_scores,  // scoring
          recordings: [{ item_code: 'p_rw_meaning' }] }),
      ])
    expect(summarize(c)).toEqual({ tested: 4, scored: 2, fail: 1, scoring: 1, unsubmitted: 1, untested: 1 })
  })
})

describe('sheetsFileName — 관리자 규약 계승', () => {
  const base = { grade: 1, classNo: 2, date: '2026-09-22' }
  it('전체', () => {
    expect(sheetsFileName({ ...base, all: true, picked: [] })).toBe('1-2_결과지_전체_2026-09-22.pdf')
  })
  it('여럿', () => {
    expect(sheetsFileName({ ...base, all: false, picked: [
      { childNo: 1, name: 'a', attemptNo: 1, attemptCount: 1, startedDate: '2026-09-22' },
      { childNo: 3, name: 'b', attemptNo: 1, attemptCount: 1, startedDate: '2026-09-22' },
    ] })).toBe('1-2_결과지_2명_2026-09-22.pdf')
  })
  it('한 장 — 두 자리 번호_이름_검사일(관리자 규약)', () => {
    expect(sheetsFileName({ ...base, all: false, picked: [
      { childNo: 3, name: '박서준', attemptNo: 1, attemptCount: 1, startedDate: '2026-09-21' },
    ] })).toBe('03_박서준_2026-09-21.pdf')
  })
  it('[REGRESSION] 한 장인데 그 아이에 재검사가 있으면 차수를 붙인다 — 같은 이름으로 덮어써지지 않게', () => {
    expect(sheetsFileName({ ...base, all: false, picked: [
      { childNo: 3, name: '박서준', attemptNo: 2, attemptCount: 3, startedDate: '2026-09-21' },
    ] })).toBe('03_박서준_2차_2026-09-21.pdf')
  })
  it('단일학급(반 0)은 학년만', () => {
    expect(sheetsFileName({ grade: 2, classNo: 0, date: '2026-09-22', all: true, picked: [] })).toBe('2학년_결과지_전체_2026-09-22.pdf')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/results.test.ts`
Expected: FAIL — 모듈 `@/lib/results` 없음.

- [ ] **Step 3: 구현**

`lib/results.ts`:

```ts
// lib/results.ts — 교사 결과지 표의 순수 로직. DB·HTTP를 모른다(행 모양만 받는다).
// 목록 라우트·PDF 라우트·테스트가 공유한다. 채점은 관리자 결과지와 **같은 함수 사슬**을 쓴다 —
// scoreInputFrom → (제출됨이면) withUnrecordedDefaults → scoreSession → sheetPdfGate.
// 여기서 규칙을 새로 만들지 않는다: 관리자와 교사가 다른 점수를 보면 그 자체가 사고다.
import { formForGrade, type SurveyForm } from './forms'
import { itemsFor } from './items'
import { pad2 } from './format'
import {
  scoreInputFrom, scoreSession, sheetPdfGate, withUnrecordedDefaults,
  type ScoreInput, type TaskKey, type Verdict,
} from './scoring'

/** 목록·PDF 라우트가 DB에서 받아 넘기는 세션 한 행(관계 select 포함). */
export interface ResultsSessionRow {
  id: string
  child_no: number
  child_name: string
  gender: string
  grade: number
  started_at: string
  submitted_at: string | null
  /** 결과지 PDF 머리글이 찍는다(stampSheet). **목록 API 응답에는 싣지 않는다** — buildChildren이 옮기지 않는다. */
  birth_ymd: string
  /** 검사자 체크리스트 — 결과지 PDF가 체크 표시를 찍는다(관리자 PDF와 같은 문서여야 한다) */
  checklist: string[]
  recordings: { item_code: string }[]
  reading_marks: { item_code: string; correct: boolean }[]
  sentence_scores: { item_code: string; words: number }[]
  writing_answers: { item_code: string; can_write: boolean }[]
}

/** 명단 한 줄 — `RosterRow`의 부분집합(생년월일은 결과 표에 싣지 않는다). */
export interface ResultsRosterRow { child_no: number; child_name: string; gender: string }

/**
 * 세션 상태. 사용자 확정(2026-09-22):
 *  scored      제출됨 + 관리자 PDF 게이트 통과(읽기 두 과제 채점됨. 쓰기는 비어도 됨 — A안)
 *  scoring     제출됨 + 읽기 채점이 남음
 *  unsubmitted 검사 도중 나감(다시 검사해야 함) — 「채점 중」과 다르다
 */
export type SessionStatus = 'scored' | 'scoring' | 'unsubmitted'

export interface ResultsSession {
  id: string
  /** 같은 아동 안에서 started_at 오름차순 1부터 */
  attemptNo: number
  startedAt: string
  submittedAt: string | null
  status: SessionStatus
  /** scored일 때만 */
  scores: Record<TaskKey, number> | null
  /** scored일 때만. 세 과제 중 하나라도 fail이면 fail */
  verdict: Verdict | null
}

export interface ResultsChild {
  childNo: number
  name: string
  gender: string
  /** started_at 오름차순. 비어 있으면 명단에만 있는 아이(미실시) */
  sessions: ResultsSession[]
}

/** `kim@school.kr` → `k***@sch***.kr`. 어느 메일함인지는 알려주되 주소는 새지 않게. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  const host = dot >= 0 ? domain.slice(0, dot) : domain
  const tld = dot >= 0 ? domain.slice(dot) : ''
  return `${local.slice(0, 1)}***@${host.slice(0, 3)}***${tld}`
}

/**
 * 채점 입력 조립 — 관리자 결과지·PDF 라우트(`app/api/admin/sessions/[id]/sheet.pdf`)와 같다.
 * 제출된 세션만 미녹음 기본값(X·0점)을 적용한다: 진행 중인 검사의 빈 녹음은 "아직 안 한 것".
 */
export function scoreInputFor(r: ResultsSessionRow): { form: SurveyForm; input: ScoreInput } {
  const form = formForGrade(r.grade)
  const f = itemsFor(form)
  const raw = scoreInputFrom(f, { marks: r.reading_marks, sentences: r.sentence_scores, writing: r.writing_answers })
  if (!r.submitted_at) return { form, input: raw }
  const recorded = new Set(r.recordings.map(x => x.item_code))
  return { form, input: withUnrecordedDefaults(f, raw, c => recorded.has(c)) }
}

export function evaluateSession(r: ResultsSessionRow): Pick<ResultsSession, 'status' | 'scores' | 'verdict'> {
  if (!r.submitted_at) return { status: 'unsubmitted', scores: null, verdict: null }
  const { form, input } = scoreInputFor(r)
  const result = scoreSession(form, input)
  // 관리자 PDF와 같은 게이트 — 읽기 두 과제가 남으면 막고, 쓰기만 남으면(overridable) 통과.
  const gate = sheetPdfGate(result, false)
  if (gate !== null && !gate.overridable) return { status: 'scoring', scores: null, verdict: null }
  const verdict: Verdict = (['wordReading', 'sentenceReading', 'writing'] as TaskKey[])
    .every(k => result.verdict[k] === 'pass') ? 'pass' : 'fail'
  return {
    status: 'scored',
    scores: { wordReading: result.wordReading, sentenceReading: result.sentenceReading, writing: result.writing },
    verdict,
  }
}

export function latestSession(c: ResultsChild): ResultsSession | null {
  return c.sessions.length > 0 ? c.sessions[c.sessions.length - 1] : null
}

/** 접힌 행의 판정 = 최신 세션이 scored일 때만 그 판정. 채점 중인 재검사가 옛 판정을 가리지 않는다. */
export function childVerdict(c: ResultsChild): Verdict | null {
  const s = latestSession(c)
  return s?.status === 'scored' ? s.verdict : null
}

/**
 * 명단 ∪ 세션 → 아이당 한 줄. 정렬은 **Fail 먼저, 그 안에서 번호순**(사용자 확정 ④).
 * - 명단에만 있음 → sessions 빈 행(미실시)
 * - 세션만 있음(직접 입력·명단 없는 학급) → 세션의 이름·성별
 * - 둘 다 → 이름·성별은 **최신 세션** 값(임상 기록이 명단보다 우선 — 관리자가 고친 값이 여기 있다)
 */
export function buildChildren(roster: ResultsRosterRow[], rows: ResultsSessionRow[]): ResultsChild[] {
  const byNo = new Map<number, ResultsChild>()
  for (const r of roster) byNo.set(r.child_no, { childNo: r.child_no, name: r.child_name, gender: r.gender, sessions: [] })

  const sorted = [...rows].sort((a, b) => a.started_at.localeCompare(b.started_at))
  for (const r of sorted) {
    const c = byNo.get(r.child_no) ?? { childNo: r.child_no, name: r.child_name, gender: r.gender, sessions: [] }
    c.name = r.child_name
    c.gender = r.gender
    c.sessions.push({
      id: r.id, attemptNo: c.sessions.length + 1, startedAt: r.started_at, submittedAt: r.submitted_at,
      ...evaluateSession(r),
    })
    byNo.set(r.child_no, c)
  }

  const rank = (c: ResultsChild) => (childVerdict(c) === 'fail' ? 0 : 1)
  return [...byNo.values()].sort((a, b) => rank(a) - rank(b) || a.childNo - b.childNo)
}

export interface ResultsSummary {
  /** 세션이 하나라도 있는 아이 */
  tested: number
  /** 최신 세션 기준 */
  scored: number; fail: number; scoring: number; unsubmitted: number
  /** 명단에만 있는 아이 */
  untested: number
}

export function summarize(children: ResultsChild[]): ResultsSummary {
  const s: ResultsSummary = { tested: 0, scored: 0, fail: 0, scoring: 0, unsubmitted: 0, untested: 0 }
  for (const c of children) {
    const l = latestSession(c)
    if (!l) { s.untested++; continue }
    s.tested++
    if (l.status === 'scored') { s.scored++; if (l.verdict === 'fail') s.fail++ }
    else if (l.status === 'scoring') s.scoring++
    else s.unsubmitted++
  }
  return s
}

/** 파일명에 쓰는 학급 표기 — `1-2`, 단일학급은 `2학년`. */
const classTag = (grade: number, classNo: number) => (classNo === 0 ? `${grade}학년` : `${grade}-${classNo}`)

/**
 * 내려받기 파일명. 관리자 규약(`03_이름_날짜.pdf`, 사용자 확정 2026-08-15)을 한 장에 그대로 쓰고,
 * 그 아이에 재검사가 있으면 `_2차`를 붙여 같은 이름으로 덮어써지지 않게 한다.
 */
export function sheetsFileName(a: {
  grade: number; classNo: number
  /** 병합 파일의 날짜(오늘, KST) */
  date: string
  all: boolean
  picked: { childNo: number; name: string; attemptNo: number; attemptCount: number; startedDate: string }[]
}): string {
  const tag = classTag(a.grade, a.classNo)
  if (a.all) return `${tag}_결과지_전체_${a.date}.pdf`
  if (a.picked.length === 1) {
    const p = a.picked[0]
    const nth = p.attemptCount > 1 ? `_${p.attemptNo}차` : ''
    return `${pad2(p.childNo)}_${p.name}${nth}_${p.startedDate}.pdf`
  }
  return `${tag}_결과지_${a.picked.length}명_${a.date}.pdf`
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/results.test.ts`
Expected: PASS (22)

- [ ] **Step 5: 커밋**

```bash
git add lib/results.ts tests/results.test.ts
git commit -m "feat(results): 결과 표 순수 로직 — 상태·판정·명단∪세션·정렬·요약·파일명

채점은 관리자 결과지와 같은 사슬(scoreInputFrom → withUnrecordedDefaults → scoreSession →
sheetPdfGate)을 쓴다. 채점 완료 기준은 관리자 PDF 게이트와 동일 — 읽기 두 과제가 채점되면
완료, 쓰기는 비어도 허용(사용자 확정 2026-09-22 A안). 판정은 Pass/Fail(관리자와 동일).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: DB 조회 (`lib/db.ts`)

**Files:**
- Modify: `lib/db.ts` — `findClassCode` 아래에 세 함수
- Test: `tests/db.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`tests/db.test.ts`의 import 목록(79행 근처)에 `classResults, findClassCodeById, updateClassCodeEmail`를 추가하고, 파일 끝에:

```ts
describe('findClassCodeById · classResults · updateClassCodeEmail (교사 결과지)', () => {
  const CID = '755316e7-fe7c-43f9-a5c5-5c2d39da59d7'
  it('findClassCodeById는 없으면 null(.maybeSingle 관례)', async () => {
    enqueue('class_codes', { data: null, error: null })
    expect(await findClassCodeById(CID)).toBeNull()
  })
  it('classResults는 학급 세션을 관계 select로 한 번에 읽고 started_at 오름차순으로 정렬한다', async () => {
    enqueue('sessions', { data: [{ id: 's1' }], error: null })
    const rows = await classResults(CID)
    expect(rows).toEqual([{ id: 's1' }])
    const sel = (selectCallsByTable.get('sessions') ?? [])[0] as string[]
    expect(sel[0]).toContain('birth_ymd, checklist')   // PDF 머리글·체크리스트를 찍어야 관리자 PDF와 같은 문서다
    expect(sel[0]).toContain('recordings(item_code)')
    expect(sel[0]).toContain('reading_marks(item_code, correct)')
    expect(sel[0]).toContain('sentence_scores(item_code, words)')
    expect(sel[0]).toContain('writing_answers(item_code, can_write)')
    expect(eqCallsByTable.get('sessions')).toEqual([['class_code_id', CID]])
    expect(orderCallsByTable.get('sessions')).toEqual([['started_at']])
  })
  it('updateClassCodeEmail은 teacher_email 한 컬럼만 갱신하고 갱신된 행을 돌려준다', async () => {
    enqueue('class_codes', { data: { id: CID, teacher_email: 'new@school.kr' }, error: null })
    const row = await updateClassCodeEmail(CID, 'new@school.kr')
    expect(row?.teacher_email).toBe('new@school.kr')
    expect(updateCallsByTable.get('class_codes')).toEqual([{ teacher_email: 'new@school.kr' }])
    expect(eqCallsByTable.get('class_codes')).toEqual([['id', CID]])
  })
  it('updateClassCodeEmail은 행이 없으면 null', async () => {
    enqueue('class_codes', { data: null, error: null })
    expect(await updateClassCodeEmail(CID, 'x@y.kr')).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — export 없음.

- [ ] **Step 3: 구현**

`lib/db.ts`의 `findClassCode` 함수 **바로 아래**에:

```ts
/** id로 코드 행 조회 — 결과지 토큰이 담는 주체가 id다. 없으면 null(.maybeSingle 관례). */
export async function findClassCodeById(id: string): Promise<ClassCodeRow | null> {
  const { data, error } = await sb().from('class_codes')
    .select(CLASS_CODE_COLS).eq('id', id).maybeSingle()
  fail(error)
  return (data as unknown as ClassCodeRow) ?? null
}

/** 교사 결과지용 세션 행 — `lib/results.ts`의 `ResultsSessionRow`와 모양을 맞춘다. */
export type ClassResultsRow = Pick<SessionRow,
  'id' | 'child_no' | 'child_name' | 'gender' | 'grade' | 'birth_ymd' | 'checklist' | 'started_at' | 'submitted_at'> & {
  recordings: { item_code: string }[]
  reading_marks: { item_code: string; correct: boolean }[]
  sentence_scores: { item_code: string; words: number }[]
  writing_answers: { item_code: string; can_write: boolean }[]
}

/**
 * 한 학급의 세션 전부 + 채점 행을 관계 select로 **한 번에**. 교사 결과지 목록·PDF가 쓴다.
 * started_at 오름차순 — 재검사 차수(1차·2차…)가 이 순서에서 나온다(lib/results.ts).
 * 세션당 4번 따로 읽으면 25명 반에서 100회가 된다.
 */
export async function classResults(classCodeId: string): Promise<ClassResultsRow[]> {
  const { data, error } = await sb().from('sessions')
    .select('id, child_no, child_name, gender, grade, birth_ymd, checklist, started_at, submitted_at, '
      + 'recordings(item_code), reading_marks(item_code, correct), '
      + 'sentence_scores(item_code, words), writing_answers(item_code, can_write)')
    .eq('class_code_id', classCodeId)
    .order('started_at')
  fail(error)
  return (data ?? []) as unknown as ClassResultsRow[]
}

/** 담임 이메일 수정 — 잘못 등록된 주소를 관리자가 바로잡는 유일한 경로(결과지 링크가 이 주소로만
 *  간다). 이 한 컬럼만 받는다: 학급 정보를 바꾸는 것은 임상 기록(세션에 복사된 값)과 어긋나게 한다. */
export async function updateClassCodeEmail(id: string, teacherEmail: string): Promise<ClassCodeRow | null> {
  const { data, error } = await sb().from('class_codes')
    .update({ teacher_email: teacherEmail }).eq('id', id)
    .select(CLASS_CODE_COLS).maybeSingle()
  fail(error)
  return (data as unknown as ClassCodeRow) ?? null
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/db.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/db.ts tests/db.test.ts
git commit -m "feat(db): findClassCodeById · classResults(관계 select 1회) · updateClassCodeEmail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: 스키마 — 발급 이메일 필수 · 이메일 수정 · 결과 요청

**Files:**
- Modify: `lib/schema.ts:146-151` (`classCodeCreateSchema`), 파일 끝
- Test: `tests/schema.test.ts:85-125`, `tests/admin-codes-route.test.ts:29-32`, `tests/sessions-route.test.ts`(CODE_ROW는 DB 행이라 그대로)

- [ ] **Step 1: 실패하는 테스트**

`tests/schema.test.ts`의 `classCodeCreateSchema` describe를 통째로 교체:

```ts
describe('classCodeCreateSchema — 학급 코드 발급 폼(이메일 필수, 사용자 확정 2026-09-22)', () => {
  const VALID_CODE_FORM = {
    region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
    grade: 1, classNo: 2, teacherName: '김담임',
    teacherPhone: '010-1234-5678', teacherEmail: 't@school.kr',
  }
  it('유효 입력 통과 + 전화 하이픈 제거 + 이메일 trim', () => {
    const d = classCodeCreateSchema.parse({ ...VALID_CODE_FORM, teacherEmail: '  t@school.kr ' })
    expect(d.teacherPhone).toBe('01012345678')
    expect(d.teacherEmail).toBe('t@school.kr')
  })
  it('[REGRESSION] 이메일이 비면 거부 — 결과지 링크가 이 주소로만 가므로 전화만으로는 발급할 수 없다', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherEmail: '' }).success).toBe(false)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherPhone: '', teacherEmail: '' }).success).toBe(false)
  })
  it('전화는 선택 — 비어도 통과', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherPhone: '' }).success).toBe(true)
  })
  it('전화 형식이 틀리면 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherPhone: '12345' }).success).toBe(false)
  })
  it('classNo: 0(단일학급·반 없음)은 통과, 범위 밖은 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, classNo: 0 }).success).toBe(true)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, classNo: -1 }).success).toBe(false)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, classNo: 100 }).success).toBe(false)
  })
  it('grade 경계값 — 1·6은 통과, 0·7은 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, grade: 1 }).success).toBe(true)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, grade: 6 }).success).toBe(true)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, grade: 0 }).success).toBe(false)
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, grade: 7 }).success).toBe(false)
  })
  it('teacherEmail 형식이 틀리면 거부', () => {
    expect(classCodeCreateSchema.safeParse({ ...VALID_CODE_FORM, teacherEmail: 'not-an-email' }).success).toBe(false)
  })
})

describe('classCodeEmailSchema — 관리자 이메일 수정 바디', () => {
  it('이메일 하나만 받고 trim한다', () => {
    expect(classCodeEmailSchema.parse({ teacherEmail: ' a@b.kr ' })).toEqual({ teacherEmail: 'a@b.kr' })
  })
  it('형식이 틀리거나 비면 거부', () => {
    expect(classCodeEmailSchema.safeParse({ teacherEmail: '' }).success).toBe(false)
    expect(classCodeEmailSchema.safeParse({ teacherEmail: 'nope' }).success).toBe(false)
  })
  it('[REGRESSION] 다른 필드는 걷어낸다 — 학급 정보 변경 경로가 되면 안 된다', () => {
    const d = classCodeEmailSchema.parse({ teacherEmail: 'a@b.kr', grade: 6, schoolName: '위조' })
    expect(d).toEqual({ teacherEmail: 'a@b.kr' })
  })
})

describe('resultsRequestSchema — 결과지 링크 요청', () => {
  it('코드만 받고 대문자 정규화', () => {
    expect(resultsRequestSchema.parse({ code: ' test24 ' })).toEqual({ code: 'TEST24' })
  })
  it('형식 밖 코드는 거부', () => {
    expect(resultsRequestSchema.safeParse({ code: 'TEST2' }).success).toBe(false)
  })
})
```

import 줄에 `classCodeEmailSchema, resultsRequestSchema` 추가.

`tests/admin-codes-route.test.ts`의 `VALID`(29~32행)를:

```ts
const VALID = {
  region: '서울특별시교육청', schoolId: 'B000002295', schoolName: '서울신구초등학교',
  grade: 1, classNo: 2, teacherName: '김담임', teacherPhone: '010-1234-5678', teacherEmail: 't@school.kr',
}
```

같은 파일의 `'검증 실패 400 + 내부 문구 비노출'` 테스트 바디를:

```ts
    const res = await POST(req({ ...VALID, teacherEmail: '' }))
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/schema.test.ts tests/admin-codes-route.test.ts`
Expected: FAIL — `classCodeEmailSchema` 없음, 「이메일이 비면 거부」 실패.

- [ ] **Step 3: 구현**

`lib/schema.ts`에서 원문:
```ts
/** POST /api/admin/codes 바디 — 학급 코드 발급 폼. */
export const classCodeCreateSchema = classCodeFields
  .refine(d => d.teacherPhone !== '' || d.teacherEmail !== '',
    { path: ['teacherPhone'], message: '전화번호나 이메일 중 하나는 입력해 주세요.' })
export type ClassCodeCreateInput = z.infer<typeof classCodeCreateSchema>
```
수정:
```ts
/** POST /api/admin/codes 바디 — 학급 코드 발급 폼.
 *  이메일 **필수**(사용자 확정 2026-09-22): 교사 결과지 링크가 `teacher_email`로만 가므로 이메일
 *  없는 학급은 결과를 받을 방법이 없다. 종전 「전화·이메일 둘 중 하나」는 코드를 전화로 불러 주던
 *  시절의 규칙이다. 전화는 여전히 선택. DB 제약(phone or email)은 그대로 둔다 — 앱이 더 엄격하면 된다. */
export const classCodeCreateSchema = classCodeFields.extend({ teacherEmail: requiredEmail })
export type ClassCodeCreateInput = z.infer<typeof classCodeCreateSchema>

/** PATCH /api/admin/codes/[id] 바디 — 담임 이메일 수정. **이 한 필드만** 받는다: 학급 정보를 여기서
 *  바꾸면 세션에 복사된 임상 기록과 어긋난다(sessionEditSchema가 화이트리스트인 것과 같은 이유). */
export const classCodeEmailSchema = z.object({ teacherEmail: requiredEmail })
export type ClassCodeEmailInput = z.infer<typeof classCodeEmailSchema>
```

파일 끝(`verifyCodeSchema` 아래)에:
```ts
/** POST /api/results/request 바디 — 교사 결과지 링크 요청. 코드만 받는다. 이메일은 받지 않는다 —
 *  요청자가 주소를 정할 수 있으면 코드가 곧 결과지 열쇠가 된다(스펙 2026-09-22 「왜 매직링크인가」). */
export const resultsRequestSchema = z.object({ code: classCodeSchema })
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/schema.test.ts tests/admin-codes-route.test.ts && npm run typecheck`
Expected: PASS. typecheck 통과(`d.teacherEmail || null`은 여전히 유효).

- [ ] **Step 5: 커밋**

```bash
git add lib/schema.ts tests/schema.test.ts tests/admin-codes-route.test.ts
git commit -m "feat(schema): 관리자 발급 이메일 필수 · classCodeEmailSchema · resultsRequestSchema

교사 결과지 링크가 teacher_email로만 가므로 이메일 없는 학급은 결과를 받을 방법이 없다
(사용자 확정 2026-09-22). 전화는 선택 유지. DB 제약은 그대로 — 앱이 더 엄격하면 된다.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: 메일 — 결과 링크 메일 · 승인 안내 3채널에 「결과지 받는 방법」

**Files:**
- Modify: `lib/format.ts` (`approvalNoticeText` 위에 상수, 본문 배열), `lib/mail.ts` (`approvedMail` 본문, 파일 끝)
- Test: `tests/mail.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`tests/mail.test.ts` import에 `resultsLinkMail` 추가(기존 `approvedMail, applyNoticeMail, sendMail, escapeHtml` 줄). `'승인 안내 두 채널'` describe 안 첫 테스트의 `for` 목록에 `'결과지'`를 추가:

```ts
    for (const s of [v.teacherName, v.schoolName, '1-3', v.code, v.surveyUrl, '결과지 받기']) {
```

같은 describe 끝에:

```ts
  it('두 채널 모두 「결과지 받는 방법」을 담는다 — 검사 주소에서 코드 입력 후 [결과지 받기], 이 메일로 링크', () => {
    const v = { teacherName: '김담임', schoolName: '예시초', grade: 1, classNo: 3, code: 'K7M2P9', surveyUrl: 'https://x.test' }
    for (const out of [approvedMail(v).html, approvalNoticeText(v)]) {
      expect(out).toContain('결과지 받는 방법')
      expect(out).toContain('[결과지 받기]')
      expect(out).toContain('이 메일 주소로')
    }
  })
```

파일 끝에 새 describe:

```ts
describe('resultsLinkMail — 교사 결과지 링크', () => {
  const v = { teacherName: '김담임', schoolName: '예시초', grade: 1, classNo: 3, resultsUrl: 'https://x.test/results/abc.123.def' }
  it('제목·본문에 학급이 들어가고 링크가 href와 본문에 있다', () => {
    const m = resultsLinkMail(v)
    expect(m.subject).toContain('예시초 1-3')
    expect(m.subject).toContain('결과지')
    expect(m.html).toContain('김담임')
    expect(m.html).toContain(`href="${v.resultsUrl}"`)
  })
  it('유효기간 14일과 재요청 경로, 「담당자에게 문의」를 말한다', () => {
    const html = resultsLinkMail(v).html
    expect(html).toContain('14일')
    expect(html).toContain('[결과지 받기]')
    expect(html).toContain('담당자에게 문의')
  })
  it('[REGRESSION] resultsUrl에 큰따옴표가 있어도 href 속성을 벗어나지 못한다', () => {
    const html = resultsLinkMail({ ...v, resultsUrl: 'https://x.test/"><script>1</script>' }).html
    expect(html).not.toContain('"><script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })
  it('[REGRESSION] 학교명·교사명을 이스케이프한다', () => {
    const html = resultsLinkMail({ ...v, teacherName: '<b>x</b>', schoolName: '"초"' }).html
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/mail.test.ts`
Expected: FAIL — `resultsLinkMail` 없음, 3채널 「결과지」 미포함.

- [ ] **Step 3: 구현 — `lib/format.ts`**

`approvalNoticeText` 함수 **바로 위**에:

```ts
/**
 * 승인 안내의 「결과지 받는 방법」 — 3채널(approvedMail HTML · approvalNoticeText 평문 · 관리자
 * [안내 문구 복사])이 **이 배열 하나**를 쓴다. 한쪽에만 문구가 살아나면 채널에 따라 안내가 갈리므로
 * `tests/mail.test.ts`가 두 채널 모두 담는지 대조한다. 사용자 확정 2026-09-22.
 */
export const RESULTS_GUIDE_LINES = [
  '검사가 끝나고 채점이 완료되면, 검사 주소에서 학급 코드를 입력한 뒤 [결과지 받기]를 누르세요.',
  '이 메일 주소로 결과지 링크가 옵니다.',
] as const
```

`approvalNoticeText` 배열의 원문:
```ts
    '검사할 학생을 고르고 이름·생년월일을 확인한 뒤 시작해 주세요.',
    '',
    '학급 코드는 이 안내로만 전달되니 보관해 주세요.',
  ].join('\n')
```
수정:
```ts
    '검사할 학생을 고르고 이름·생년월일을 확인한 뒤 시작해 주세요.',
    '',
    '결과지 받는 방법',
    ...RESULTS_GUIDE_LINES.map(l => `- ${l}`),
    '',
    '학급 코드는 이 안내로만 전달되니 보관해 주세요.',
  ].join('\n')
```

- [ ] **Step 4: 구현 — `lib/mail.ts`**

import 줄 `import { gradeClassLabel } from './format'`를 `import { RESULTS_GUIDE_LINES, gradeClassLabel } from './format'`로.

`approvedMail` 본문에서 원문:
```ts
        '이름·생년월일을 확인하고 검사를 시작합니다.',
      ])}


      <p style="margin:24px 0 0;padding:12px 14px;background:${C.well};border:1px solid ${C.line};
```
수정:
```ts
        '이름·생년월일을 확인하고 검사를 시작합니다.',
      ])}

      ${H('결과지 받는 방법')}
      ${UL([...RESULTS_GUIDE_LINES])}

      <p style="margin:24px 0 0;padding:12px 14px;background:${C.well};border:1px solid ${C.line};
```

파일 끝에:

```ts
/** ③ 교사가 [결과지 받기]를 눌렀을 때 — 학급 결과 페이지 링크(14일).
 *  이메일은 `class_codes.teacher_email`로만 간다(호출부가 채운다). 문의처는 「담당자에게 문의」까지
 *  (사용자 확정 2026-09-22). */
export function resultsLinkMail(v: {
  teacherName: string; schoolName: string; grade: number; classNo: number; resultsUrl: string
}): Mail {
  const where = `${v.schoolName} ${gradeClassLabel(v.grade, v.classNo)}`
  return {
    to: '',
    subject: `[읽기 선별검사] ${where} 결과지`,
    html: WRAP(`
      <p style="margin:0 0 6px">${escapeHtml(v.teacherName)} 선생님, 안녕하세요.</p>
      <p style="margin:0 0 20px">${escapeHtml(where)} 학급의 검사 결과지를 받으실 수 있어요.</p>
      <p style="margin:0"><a href="${escapeHtml(v.resultsUrl)}"
        style="background:${C.blue};color:#fff;text-decoration:none;border-radius:9px;padding:12px 20px;
        display:inline-block;font-weight:700;font-size:14px">결과지 보기</a></p>
      <p style="margin:14px 0 0;font-size:13px;color:${C.mute};word-break:break-all">
        버튼이 열리지 않으면 이 주소를 복사해 주세요:<br>
        <a href="${escapeHtml(v.resultsUrl)}" style="color:${C.blue}">${escapeHtml(v.resultsUrl)}</a></p>
      <p style="margin:24px 0 0;padding:12px 14px;background:${C.well};border:1px solid ${C.line};
        border-radius:10px;font-size:13px;color:${C.soft};line-height:1.7">
        이 링크는 <b>14일</b> 동안 유효해요. 지나면 검사 주소에서 [결과지 받기]를 다시 눌러 주세요.<br>
        채점이 진행되면 같은 링크를 새로고침하면 반영돼요.<br>
        링크가 열리지 않으면 담당자에게 문의해 주세요.</p>`),
  }
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run tests/mail.test.ts tests/format.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/format.ts lib/mail.ts tests/mail.test.ts
git commit -m "feat(mail): 결과지 링크 메일 + 승인 안내 3채널에 「결과지 받는 방법」

RESULTS_GUIDE_LINES 하나를 HTML·평문이 공유한다 — 한쪽에만 살아나면 채널에 따라 안내가
갈리므로 테스트가 둘 다 담는지 대조한다.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `POST /api/results/request` — 코드 → 등록 메일로 링크

**Files:**
- Create: `app/api/results/request/route.ts`
- Test: `tests/results-route.test.ts` (신규 — Task 7·8이 같은 파일에 describe를 추가한다)

- [ ] **Step 1: 실패하는 테스트**

`tests/results-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  findClassCode: vi.fn(),
  findClassCodeById: vi.fn(),
  classResults: vi.fn(),
  listRoster: vi.fn(),
}))
vi.mock('@/lib/mail', () => ({
  resultsLinkMail: vi.fn((v: { resultsUrl: string }) => ({ to: '', subject: '결과지', html: `<a href="${v.resultsUrl}">x</a>` })),
  sendMail: vi.fn(),
}))
vi.mock('@/lib/env', () => ({ env: () => 'test-secret' }))

import { POST as REQUEST } from '@/app/api/results/request/route'
import * as db from '@/lib/db'
import * as mail from '@/lib/mail'

const CID = '755316e7-fe7c-43f9-a5c5-5c2d39da59d7'
const CODE_ROW = {
  id: CID, code: 'TEST24',
  school_region: 'daegu', school_id: 'B000002944', school_name: '대구가창초등학교',
  grade: 1, class_no: 2, teacher_name: '김서연',
  teacher_phone: null, teacher_email: 'kim@school.kr',
  created_at: '2026-09-21T00:00:00.000Z', status: 'active' as const, applied_at: null,
}

let ipSeq = 0
const reqFor = (body: unknown, ip = `10.9.0.${++ipSeq}`) => new Request('http://x/api/results/request', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.findClassCode).mockResolvedValue(CODE_ROW)
  vi.mocked(db.classResults).mockResolvedValue([])
  vi.mocked(db.listRoster).mockResolvedValue([])
  vi.mocked(mail.sendMail).mockResolvedValue({ ok: true, id: 'mail-1' })
})

describe('POST /api/results/request', () => {
  // 코드당 쿨다운은 모듈 상태라 테스트마다 다른 코드를 쓴다.
  const codeOf = (n: number) => `RQ${String(n).padStart(4, '0')}`.replace(/0/g, '2').replace(/1/g, '3')
  let n = 0
  const fresh = () => {
    const code = codeOf(++n)
    vi.mocked(db.findClassCode).mockResolvedValue({ ...CODE_ROW, code })
    return code
  }

  it('등록된 이메일로 링크를 보내고 가린 주소·채점 수를 돌려준다', async () => {
    const res = await REQUEST(reqFor({ code: fresh() }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ sent: true, maskedEmail: 'k***@sch***.kr', scoredCount: 0 })
    expect(mail.sendMail).toHaveBeenCalledTimes(1)
    const call = vi.mocked(mail.sendMail).mock.calls[0][0]
    expect(call.to).toBe('kim@school.kr')
    // 링크는 /results/<classCodeId>.<exp>.<sig> — 주체가 코드 id다
    const url = vi.mocked(mail.resultsLinkMail).mock.calls[0][0].resultsUrl
    expect(url).toMatch(new RegExp(`^http://x/results/${CID}\\.\\d+\\.[0-9a-f]{64}$`))
  })
  it('[REGRESSION] 바디의 이메일은 무시한다 — 요청자가 주소를 정하면 코드가 곧 열쇠다', async () => {
    await REQUEST(reqFor({ code: fresh(), email: 'attacker@evil.com', teacherEmail: 'attacker@evil.com' }))
    expect(vi.mocked(mail.sendMail).mock.calls[0][0].to).toBe('kim@school.kr')
  })
  it('APP_URL이 있으면 Host 헤더 대신 그 origin을 쓴다', async () => {
    vi.stubEnv('APP_URL', 'https://survey.example.kr')
    await REQUEST(reqFor({ code: fresh() }))
    expect(vi.mocked(mail.resultsLinkMail).mock.calls[0][0].resultsUrl).toMatch(/^https:\/\/survey\.example\.kr\/results\//)
    vi.unstubAllEnvs()
  })
  it('코드가 없거나 pending이면 404 — 같은 문구(승인 여부를 새지 않게)', async () => {
    vi.mocked(db.findClassCode).mockResolvedValueOnce(null)
    const a = await REQUEST(reqFor({ code: 'NOPE22' }))
    vi.mocked(db.findClassCode).mockResolvedValueOnce({ ...CODE_ROW, status: 'pending' })
    const b = await REQUEST(reqFor({ code: 'PEND22' }))
    expect(a.status).toBe(404); expect(b.status).toBe(404)
    expect((await a.json()).error).toBe((await b.json()).error)
    expect(mail.sendMail).not.toHaveBeenCalled()
  })
  it('형식 밖 코드는 400', async () => {
    expect((await REQUEST(reqFor({ code: 'x' }))).status).toBe(400)
  })
  it('[REGRESSION] 같은 코드 60초 안 재요청은 429 + 남은 초 — IP가 달라도 막힌다(학교=IP 하나, 막을 것은 코드 연타)', async () => {
    const code = fresh()
    expect((await REQUEST(reqFor({ code }, '10.9.1.1'))).status).toBe(200)
    const res = await REQUEST(reqFor({ code }, '10.9.1.2'))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.retryAfterSec).toBeGreaterThan(0)
    expect(json.retryAfterSec).toBeLessThanOrEqual(60)
    expect(mail.sendMail).toHaveBeenCalledTimes(1)
  })
  it('teacher_email이 null이면 400 — 정상 흐름 미도달 방어선(발급 이메일 필수화)', async () => {
    vi.mocked(db.findClassCode).mockResolvedValueOnce({ ...CODE_ROW, code: fresh(), teacher_email: null })
    const res = await REQUEST(reqFor({ code: 'ANY222' }))
    expect(res.status).toBe(400)
    expect(mail.sendMail).not.toHaveBeenCalled()
  })
  it('메일 발송 실패는 502 — "보냈어요"를 거짓으로 말하지 않는다. 쿨다운도 소비하지 않는다', async () => {
    const code = fresh()
    vi.mocked(mail.sendMail).mockResolvedValueOnce({ ok: false, error: 'resend down' })
    const res = await REQUEST(reqFor({ code }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).not.toMatch(/resend down/)
    // 실패 뒤 곧바로 다시 누르면 다시 시도할 수 있어야 한다
    vi.mocked(db.findClassCode).mockResolvedValue({ ...CODE_ROW, code })
    expect((await REQUEST(reqFor({ code }))).status).toBe(200)
  })
  it('채점 완료 수를 함께 돌려준다 — 화면이 「아직 채점된 학생이 없어요」를 낼 근거', async () => {
    vi.mocked(db.classResults).mockResolvedValueOnce([{
      id: 's1', child_no: 1, child_name: '가', gender: '여', grade: 1, birth_ymd: '190312', checklist: [],
      started_at: '2026-09-22T01:00:00.000Z', submitted_at: '2026-09-22T01:20:00.000Z',
      recordings: [], reading_marks: [], sentence_scores: [], writing_answers: [],
    }])
    const json = await (await REQUEST(reqFor({ code: fresh() }))).json()
    expect(json.scoredCount).toBe(1)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/results-route.test.ts`
Expected: FAIL — 라우트 모듈 없음.

- [ ] **Step 3: 구현**

`app/api/results/request/route.ts`:

```ts
// POST /api/results/request — 교사 결과지 링크 요청(공개). 학급 코드만 받아 **등록된 담임 이메일로**
// 학급 스코프 토큰 링크를 보낸다. 이메일은 바디에서 받지 않는다 — 요청자가 주소를 정할 수 있으면
// 코드가 곧 결과지 열쇠가 된다(스펙 2026-09-22 「왜 매직링크인가」).
//
// 이 버튼은 아이 앞 교실 PC의 시작 화면에 있다. 아이가 눌러도 담임 메일함에 링크가 갈 뿐이지만,
// 연타하면 메일함을 채울 수는 있다 → **코드당 60초 1회**. 키가 IP가 아닌 이유: 학교 건물은 IP
// 하나라 IP 제한은 정상 사용을 막고 연타는 못 막는다. 인메모리라 서버리스 인스턴스별(best-effort)
// — 기존 레이트리미터와 같은 한계를 받아들인다.
import { NextResponse } from 'next/server'
import { createResultsToken } from '@/lib/auth'
import { classResults, findClassCode } from '@/lib/db'
import { env } from '@/lib/env'
import { resultsLinkMail, sendMail } from '@/lib/mail'
import { buildChildren, maskEmail, summarize } from '@/lib/results'
import { clientIp, createRateLimiter, jsonError, VERIFY_CODE_RATE_LIMIT, VERIFY_CODE_RATE_WINDOW_MS } from '@/lib/request'
import { resultsRequestSchema } from '@/lib/schema'

export const runtime = 'nodejs'

// 코드 열거 방어 — verify-code와 같은 위협이라 같은 상한을 쓴다.
const ipLimited = createRateLimiter(VERIFY_CODE_RATE_LIMIT, VERIFY_CODE_RATE_WINDOW_MS)

/** 코드당 쿨다운(사용자 확정 2026-09-22: 1분 1회). 발송에 **성공한** 시각만 기록한다 —
 *  실패 뒤 곧바로 다시 누를 수 있어야 한다. */
const COOLDOWN_MS = 60_000
const lastSentAt = new Map<string, number>()

export async function POST(req: Request) {
  if (ipLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)
  const body = await req.json().catch(() => null)
  const parsed = resultsRequestSchema.safeParse(body)
  if (!parsed.success) return jsonError('코드를 확인해 주세요.', 400)
  const code = parsed.data.code

  const waited = Date.now() - (lastSentAt.get(code) ?? 0)
  if (waited < COOLDOWN_MS) {
    const retryAfterSec = Math.ceil((COOLDOWN_MS - waited) / 1000)
    return NextResponse.json(
      { error: '방금 링크를 보냈어요. 메일함을 확인해 주세요.', retryAfterSec },
      { status: 429, headers: { 'retry-after': String(retryAfterSec) } },
    )
  }

  try {
    const row = await findClassCode(code)
    // pending도 미존재와 같은 404 — 승인 여부가 새면 코드 열거에 쓰인다(verify-code 방침).
    if (!row || row.status !== 'active') return jsonError('코드를 확인해 주세요.', 404)
    // 발급 이메일 필수화(2026-09-22) 뒤로는 도달하지 않는 방어선. 안내 UI는 두지 않는다(사용자 확정).
    if (!row.teacher_email) return jsonError('이 학급은 이메일이 등록돼 있지 않습니다. 담당자에게 문의해 주세요.', 400)

    const [token, rows] = await Promise.all([
      createResultsToken(row.id, env('SESSION_SECRET')),
      classResults(row.id),
    ])
    // Host 헤더는 위조 가능 — APP_URL이 있으면 그것을 쓴다(apply·approve 라우트와 같은 규칙).
    const origin = process.env.APP_URL?.trim() || new URL(req.url).origin
    const m = resultsLinkMail({
      teacherName: row.teacher_name, schoolName: row.school_name, grade: row.grade, classNo: row.class_no,
      resultsUrl: `${origin}/results/${token}`,
    })
    const sent = await sendMail({ ...m, to: row.teacher_email })
    if (!sent.ok) {
      console.error('[results/request] 메일 발송 실패', sent.error)
      return jsonError('메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.', 502)
    }
    lastSentAt.set(code, Date.now())

    // 채점 완료 수 — 화면이 「아직 채점된 학생이 없어요」를 낼 근거. 명단은 여기서 필요 없다
    // (세션만으로 센다 — 미실시는 채점 수와 무관).
    const scoredCount = summarize(buildChildren([], rows)).scored
    return NextResponse.json({ sent: true, maskedEmail: maskEmail(row.teacher_email), scoredCount })
  } catch (e) {
    console.error('[results/request] 실패', e)
    return jsonError('문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/results-route.test.ts`
Expected: PASS (9)

- [ ] **Step 5: 커밋**

```bash
git add app/api/results/request/route.ts tests/results-route.test.ts
git commit -m "feat(api): POST /api/results/request — 코드로 등록 메일에 결과지 링크, 코드당 60초

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: `GET /api/results/[token]` — 학급 결과 목록

**Files:**
- Create: `app/api/results/[token]/route.ts`
- Test: `tests/results-route.test.ts` (describe 추가)

- [ ] **Step 1: 실패하는 테스트**

`tests/results-route.test.ts` import에 추가:

```ts
import { GET as LIST } from '@/app/api/results/[token]/route'
import { createResultsToken } from '@/lib/auth'
```

파일 끝에:

```ts
describe('GET /api/results/[token]', () => {
  const listReq = (token: string) => LIST(new Request(`http://x/api/results/${token}`), { params: Promise.resolve({ token }) })
  const SESSION = {
    id: 's1', child_no: 1, child_name: '김가나', gender: '여', grade: 1, birth_ymd: '190312', checklist: [],
    started_at: '2026-09-22T01:00:00.000Z', submitted_at: '2026-09-22T01:20:00.000Z',
    recordings: [], reading_marks: [], sentence_scores: [], writing_answers: [],
  }
  beforeEach(() => {
    vi.mocked(db.findClassCodeById).mockResolvedValue(CODE_ROW)
    vi.mocked(db.listRoster).mockResolvedValue([
      { child_no: 1, child_name: '김가나', gender: '여', birth_ymd: '190312' },
      { child_no: 2, child_name: '김가나', gender: '남', birth_ymd: '190527' },
    ])
    vi.mocked(db.classResults).mockResolvedValue([SESSION])
  })
  it('유효 토큰 → 학급 머리글·만점·아이별 행. 명단만 있는 아이는 sessions 빈 배열', async () => {
    const res = await listReq(await createResultsToken(CID, 'test-secret'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.cls).toEqual({ schoolName: '대구가창초등학교', grade: 1, classNo: 2, teacherName: '김서연' })
    expect(json.taskMax).toEqual({ wordReading: 14, sentenceReading: 36, writing: 10 })
    expect(typeof json.provisional).toBe('boolean')
    expect(json.children).toHaveLength(2)
    const [fail, untested] = json.children  // 전부 미녹음 → fail이 먼저
    expect(fail.childNo).toBe(1)
    expect(fail.sessions[0]).toMatchObject({ id: 's1', attemptNo: 1, status: 'scored', verdict: 'fail',
      scores: { wordReading: 0, sentenceReading: 0, writing: 0 } })
    expect(untested).toMatchObject({ childNo: 2, sessions: [] })
    expect(db.findClassCodeById).toHaveBeenCalledWith(CID)
    expect(db.classResults).toHaveBeenCalledWith(CID)
  })
  it('[REGRESSION] 응답에 생년월일·전화·내부 경로가 실리지 않는다', async () => {
    const text = await (await listReq(await createResultsToken(CID, 'test-secret'))).text()
    expect(text).not.toContain('190312')
    expect(text).not.toContain('birth')
    expect(text).not.toContain('audio_path')
  })
  it('만료·변조·형식 오류는 전부 401 한 가지', async () => {
    expect((await listReq(await createResultsToken(CID, 'test-secret', -1))).status).toBe(401)
    expect((await listReq('garbage')).status).toBe(401)
    expect((await listReq(await createResultsToken(CID, 'other-secret'))).status).toBe(401)
    expect(db.classResults).not.toHaveBeenCalled()
  })
  it('코드 행이 삭제됐으면 404', async () => {
    vi.mocked(db.findClassCodeById).mockResolvedValueOnce(null)
    expect((await listReq(await createResultsToken(CID, 'test-secret'))).status).toBe(404)
  })
  it('DB 장애는 500 + 내부 문구 비노출', async () => {
    vi.mocked(db.classResults).mockRejectedValueOnce(new Error('relation missing'))
    const res = await listReq(await createResultsToken(CID, 'test-secret'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/relation/)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/results-route.test.ts`
Expected: FAIL — 라우트 없음.

- [ ] **Step 3: 구현**

`app/api/results/[token]/route.ts`:

```ts
// GET /api/results/[token] — 교사 결과 페이지 데이터. 인증은 **학급 스코프 토큰**(경로에 실림).
// 토큰은 권한만 담으므로 매 요청 DB를 읽는다 — 같은 링크를 새로고침하면 채점 진행이 보인다.
// 응답에 생년월일·연락처·스토리지 경로를 싣지 않는다 — 교사가 볼 것은 이름·번호·점수·판정·상태다.
import { NextResponse } from 'next/server'
import { verifyResultsToken } from '@/lib/auth'
import { classResults, findClassCodeById, listRoster } from '@/lib/db'
import { env } from '@/lib/env'
import { formForGrade } from '@/lib/forms'
import { buildChildren } from '@/lib/results'
import { jsonError } from '@/lib/request'
import { PROVISIONAL_CRITERIA, scoringFor } from '@/lib/scoring'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // 만료·변조·형식 오류를 구분하지 않는다 — 사유가 새면 그 자체가 정보다.
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않습니다.', 401)
  try {
    const [row, roster, rows] = await Promise.all([
      findClassCodeById(classCodeId), listRoster(classCodeId), classResults(classCodeId),
    ])
    if (!row) return jsonError('학급을 찾을 수 없습니다.', 404)
    const form = formForGrade(row.grade)
    return NextResponse.json({
      cls: { schoolName: row.school_name, grade: row.grade, classNo: row.class_no, teacherName: row.teacher_name },
      provisional: PROVISIONAL_CRITERIA,
      taskMax: scoringFor(form).taskMax,
      children: buildChildren(
        roster.map(r => ({ child_no: r.child_no, child_name: r.child_name, gender: r.gender })),
        rows,
      ),
    })
  } catch (e) {
    console.error('[results/:token] 조회 실패', e)
    return jsonError('결과를 불러오지 못했습니다.', 500)
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/results-route.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add "app/api/results/[token]/route.ts" tests/results-route.test.ts
git commit -m "feat(api): GET /api/results/[token] — 학급 스코프 토큰으로 결과 목록

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `GET /api/results/[token]/sheets.pdf` — 병합 PDF

**Files:**
- Create: `app/api/results/[token]/sheets.pdf/route.ts`
- Test: `tests/results-route.test.ts` (describe 추가)

- [ ] **Step 1: 실패하는 테스트**

`tests/results-route.test.ts` 상단 `vi.mock` 블록들 아래에 추가:

```ts
vi.mock('@/lib/pdf/stamp-sheet', () => ({
  stampSheet: vi.fn(),
}))
vi.mock('pdf-lib', async () => {
  // 실제 병합은 pdf-lib이 하고 여기서는 "세션 수만큼 페이지가 붙었는가"만 본다.
  const pages: unknown[] = []
  const doc = {
    copyPages: vi.fn(async (_src: unknown, idx: number[]) => idx.map(i => ({ i }))),
    addPage: vi.fn((p: unknown) => pages.push(p)),
    getPageIndices: vi.fn(() => [0]),
    save: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, pages.length])),
  }
  return {
    PDFDocument: {
      create: vi.fn(async () => { pages.length = 0; return doc }),
      load: vi.fn(async () => doc),
    },
  }
})
```

import에 `import { GET as SHEETS } from '@/app/api/results/[token]/sheets.pdf/route'` 와 `import * as pdf from '@/lib/pdf/stamp-sheet'` 추가.

파일 끝에:

```ts
describe('GET /api/results/[token]/sheets.pdf', () => {
  const sheetsReq = (token: string, qs = '') =>
    SHEETS(new Request(`http://x/api/results/${token}/sheets.pdf${qs}`), { params: Promise.resolve({ token }) })
  const scored = (id: string, child_no: number, started_at: string) => ({
    id, child_no, child_name: `아이${child_no}`, gender: '여', grade: 1, birth_ymd: '190312', checklist: ['none'],
    started_at, submitted_at: started_at,
    recordings: [], reading_marks: [], sentence_scores: [], writing_answers: [],
  })
  const ROWS = [
    scored('a1', 1, '2026-09-21T01:00:00.000Z'),
    scored('a2', 1, '2026-09-22T01:00:00.000Z'),   // 1번의 재검사(최신)
    scored('b1', 3, '2026-09-22T02:00:00.000Z'),
    { ...scored('c1', 5, '2026-09-22T03:00:00.000Z'), submitted_at: null },   // 미제출
  ]
  beforeEach(() => {
    vi.mocked(db.findClassCodeById).mockResolvedValue(CODE_ROW)
    vi.mocked(db.classResults).mockResolvedValue(ROWS)
    vi.mocked(pdf.stampSheet).mockResolvedValue(new Uint8Array([1]))
  })
  it('ids 없음 → 채점 완료 전부, 아이당 최신 1장, 번호순. 파일명 「1-2_결과지_전체_날짜.pdf」', async () => {
    const res = await sheetsReq(await createResultsToken(CID, 'test-secret'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(decodeURIComponent(res.headers.get('content-disposition') ?? '')).toMatch(/1-2_결과지_전체_\d{4}-\d{2}-\d{2}\.pdf/)
    // a2(1번 최신)·b1(3번) 두 장 — a1(옛 차수)·c1(미제출)은 빠진다
    const stamped = vi.mocked(pdf.stampSheet).mock.calls.map(c => c[0].session.child_name)
    expect(stamped).toEqual(['아이1', '아이3'])
    expect(vi.mocked(pdf.stampSheet).mock.calls[0][0].session).toMatchObject({ started_at: '2026-09-22T01:00:00.000Z' })
  })
  it('ids로 고르면 그 세션만 — 옛 차수도 고를 수 있다. 여럿이면 「N명」', async () => {
    const res = await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=a1,b1')
    expect(res.status).toBe(200)
    expect(vi.mocked(pdf.stampSheet).mock.calls.map(c => c[0].session.started_at))
      .toEqual(['2026-09-21T01:00:00.000Z', '2026-09-22T02:00:00.000Z'])
    expect(decodeURIComponent(res.headers.get('content-disposition') ?? '')).toContain('1-2_결과지_2명_')
  })
  it('한 장이면 관리자 규약 파일명 + 재검사가 있으면 차수', async () => {
    const res = await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=a1')
    expect(decodeURIComponent(res.headers.get('content-disposition') ?? '')).toContain('01_아이1_1차_2026-09-21.pdf')
  })
  it('[REGRESSION] 다른 학급 세션 id를 끼워 넣으면 403 — 토큰 하나로 다른 반을 열 수 없다', async () => {
    const res = await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=a1,zz-other-class')
    expect(res.status).toBe(403)
    expect(pdf.stampSheet).not.toHaveBeenCalled()
  })
  it('채점 완료가 아닌 세션(미제출)을 고르면 400', async () => {
    expect((await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=c1')).status).toBe(400)
  })
  it('채점 완료 세션이 하나도 없으면 400', async () => {
    vi.mocked(db.classResults).mockResolvedValueOnce([ROWS[3]])
    expect((await sheetsReq(await createResultsToken(CID, 'test-secret'))).status).toBe(400)
  })
  it('토큰 불량 401 · 코드 삭제 404', async () => {
    expect((await sheetsReq('bad')).status).toBe(401)
    vi.mocked(db.findClassCodeById).mockResolvedValueOnce(null)
    expect((await sheetsReq(await createResultsToken(CID, 'test-secret'))).status).toBe(404)
  })
  it('stampSheet 입력은 관리자 PDF와 같다 — 제출된 세션은 미녹음 X·0점이 채워진다', async () => {
    await sheetsReq(await createResultsToken(CID, 'test-secret'), '?ids=b1')
    const input = vi.mocked(pdf.stampSheet).mock.calls[0][0]
    expect(input.form.id).toBe('KODYS-G1')
    expect(input.marks.rw01).toBe(false)
    expect(input.sentences.rs01).toBe(0)
    expect(input.session).toMatchObject({ school_name: '대구가창초등학교', grade: 1, class_no: 2, child_name: '아이3',
      birth_ymd: '190312', checklist: ['none'] })   // 관리자 PDF와 같은 문서 — 머리글·체크리스트도 찍힌다
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/results-route.test.ts`
Expected: FAIL — 라우트 없음.

- [ ] **Step 3: 구현**

`app/api/results/[token]/sheets.pdf/route.ts`:

```ts
// GET /api/results/[token]/sheets.pdf?ids=a,b,c — 교사용 병합 결과지.
// 세션마다 관리자와 **같은** `stampSheet`를 돌려 한 문서에 이어 붙인다(pdf-lib copyPages).
//   ids 없음 → 채점 완료 세션 전부, 아이당 최신 1장, 번호순 (25명 반 = 한 파일)
//   ids 있음 → 그 세션들만(옛 차수도 가능). **전부 이 토큰의 학급 소속인지 검증** — 아니면 403.
// 채점 완료(lib/results의 scored)가 아닌 세션은 400 — 빈 결과지가 교사에게 나가면 오해한다.
import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { verifyResultsToken } from '@/lib/auth'
import { classResults, findClassCodeById, type ClassResultsRow } from '@/lib/db'
import { env } from '@/lib/env'
import { kstDateKey } from '@/lib/adminStats'
import { stampSheet } from '@/lib/pdf/stamp-sheet'
import { buildChildren, latestSession, scoreInputFor, sheetsFileName } from '@/lib/results'
import { jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'
// 프로덕션은 Vercel **무료(Hobby) 플랜**이다 — 함수 제한시간 기본 10초. maxDuration 상한이 플랜마다
// 달라 이 값에 기대지 않는다: 아래에서 stampSheet를 **병렬**로 돌려 작업 자체를 짧게 만든다.
// (stampSheet는 매 호출 원본 PDF·폰트를 읽고 임베드해 100~300ms — 순서대로 25장이면 10초에 빠듯하다.)
export const maxDuration = 60

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않습니다.', 401)
  try {
    const [row, rows] = await Promise.all([findClassCodeById(classCodeId), classResults(classCodeId)])
    if (!row) return jsonError('학급을 찾을 수 없습니다.', 404)

    // 상태·차수는 lib/results가 정한다 — 화면과 같은 판정이어야 화면에서 잠긴 것이 여기서 열리지 않는다.
    const children = buildChildren([], rows)
    const byId = new Map(rows.map(r => [r.id, r]))
    const meta = new Map<string, { childNo: number; name: string; attemptNo: number; attemptCount: number; startedDate: string; status: string }>()
    for (const c of children) for (const s of c.sessions)
      meta.set(s.id, { childNo: c.childNo, name: c.name, attemptNo: s.attemptNo, attemptCount: c.sessions.length,
        startedDate: kstDateKey(new Date(s.startedAt)), status: s.status })

    const idsParam = new URL(req.url).searchParams.get('ids')
    const all = !idsParam
    let picked: ClassResultsRow[]
    if (all) {
      picked = children.map(latestSession).filter(s => s?.status === 'scored').map(s => byId.get(s!.id)!)
    } else {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
      // 학급 소속 검증 — 이 토큰이 여는 학급의 세션이 아니면 하나라도 거부한다.
      if (ids.some(id => !byId.has(id))) return jsonError('이 학급의 검사가 아닙니다.', 403)
      if (ids.some(id => meta.get(id)!.status !== 'scored')) return jsonError('채점이 끝나지 않은 검사가 있습니다.', 400)
      picked = ids.map(id => byId.get(id)!)
    }
    if (picked.length === 0) return jsonError('내려받을 수 있는 결과지가 없습니다. 채점이 끝나면 다시 시도해 주세요.', 400)

    // 스탬핑은 **병렬**(I/O 바운드 — 원본 PDF·폰트 읽기), 병합만 순서대로(페이지 순서 = 번호순 보장).
    const stamped = await Promise.all(picked.map(r => {
      const { form, input } = scoreInputFor(r)
      return stampSheet({
        form, ...input,
        // 관리자 PDF와 **같은 문서**여야 한다 — 생년월일·체크리스트도 그대로 찍는다.
        session: { school_name: row.school_name, grade: r.grade, class_no: row.class_no, child_name: r.child_name,
          birth_ymd: r.birth_ymd, started_at: r.started_at, checklist: r.checklist },
      })
    }))
    const merged = await PDFDocument.create()
    for (const bytes of stamped) {
      const one = await PDFDocument.load(bytes)
      for (const p of await merged.copyPages(one, one.getPageIndices())) merged.addPage(p)
    }
    const out = await merged.save()

    const name = sheetsFileName({
      grade: row.grade, classNo: row.class_no, date: kstDateKey(new Date()), all,
      picked: picked.map(r => meta.get(r.id)!),
    })
    return new NextResponse(out as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="sheets.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[results/:token/sheets.pdf] 생성 실패', e)
    return jsonError('결과지를 만들지 못했습니다.', 500)
  }
}
```

- [ ] **Step 4: 통과 확인 + 실측**

Run: `npx vitest run tests/results-route.test.ts && npm run typecheck`
Expected: PASS

로컬에서 시간을 재 둔다(무료 플랜 10초 기준 판단 근거):
```bash
# 데모 학급(TEST24, 8명)의 토큰을 Task 6 라우트로 받은 뒤
time curl -s -o /dev/null "http://localhost:3000/api/results/<token>/sheets.pdf"
```
8장 기준 시간 × 3 ≈ 25장 예상치. **5초를 넘으면** 프로덕션 배포 뒤 Vercel 함수 로그의 Duration을 한 번 더 확인하고, 그래도 빠듯하면 화면에서 [전체 PDF]를 10장 단위로 나눠 받게 하는 후속 작업을 연다(이 PR 범위 밖).

- [ ] **Step 5: 커밋**

```bash
git add "app/api/results/[token]/sheets.pdf/route.ts" tests/results-route.test.ts
git commit -m "feat(api): GET /api/results/[token]/sheets.pdf — 채점 완료 결과지 병합(전체/선택)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: 결과 페이지 `/results/[token]` + `/results` 리다이렉트

**Files:**
- Create: `app/results/page.tsx`, `app/results/[token]/page.tsx`, `components/results/ResultsView.tsx`, `components/results/README.md`
- 화면은 관례대로 렌더 테스트 없음 — Task 14의 E2E 체크리스트가 담당.

- [ ] **Step 1: `app/results/page.tsx`**

```tsx
// /results — 토큰 없이 오면 시작 화면으로. 결과 진입은 시작 화면의 [결과지 받기 →] 하나다(스펙).
import { redirect } from 'next/navigation'

export default function ResultsIndex() {
  redirect('/')
}
```

- [ ] **Step 2: `app/results/[token]/page.tsx`**

```tsx
// /results/[token] — 교사 결과 페이지의 서버 셸. 토큰이 URL에 실리므로 색인·리퍼러를 막는다.
// 데이터·상호작용은 ResultsView(클라이언트)가 맡는다.
import type { Metadata } from 'next'
import { ResultsView } from '@/components/results/ResultsView'

export const metadata: Metadata = {
  title: 'KODYS 결과지',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function ResultsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ResultsView token={token} />
}
```

- [ ] **Step 3: `components/results/ResultsView.tsx`**

```tsx
// components/results/ResultsView.tsx — 교사 결과 페이지(클라이언트).
// GET /api/results/<token>을 읽어 요약·아이별 행·다운로드 버튼을 그린다. 데이터는 토큰이 아니라
// 매 요청 DB에서 오므로 새로고침이 곧 최신 상태다.
// 판정 표기는 관리자 화면과 같은 Pass/Fail(사용자 확정 2026-09-22). 채점 완료(scored)만 체크·다운로드.
'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/Badge'
import { Blip } from '@/components/Blip'
import { Spinner } from '@/components/Spinner'
import { gradeClassLabel } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { latestSession, summarize, type ResultsChild, type ResultsSession } from '@/lib/results'
import type { TaskKey } from '@/lib/scoring'

interface Payload {
  cls: { schoolName: string; grade: number; classNo: number; teacherName: string }
  provisional: boolean
  taskMax: Record<TaskKey, number>
  children: ResultsChild[]
}

const TASKS: { key: TaskKey; label: string }[] = [
  { key: 'wordReading', label: '낱말 해독' },
  { key: 'sentenceReading', label: '문장 읽기' },
  { key: 'writing', label: '쓰기' },
]

const STATUS_LABEL: Record<ResultsSession['status'], string> = {
  scored: '채점 완료', scoring: '채점 중', unsubmitted: '미제출',
}

const kstDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' })

/** Pass/Fail 배지 — 관리자 결과지와 같은 색(pass=mint, fail=rec). */
function VerdictPill({ v }: { v: 'pass' | 'fail' | null }) {
  if (!v) return <span className="text-ink-mute">-</span>
  return <Badge tone={v === 'pass' ? 'mint' : 'rec'} size="sm">{v === 'pass' ? 'Pass' : 'Fail'}</Badge>
}

export function ResultsView({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [err, setErr] = useState<'expired' | 'gone' | 'other' | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [downloading, setDownloading] = useState<'all' | 'picked' | null>(null)
  const [dlErr, setDlErr] = useState('')

  async function load() {
    setErr(null)
    const r = await requestJson<Payload>(`/api/results/${token}`, { method: 'GET' })
    if (!r.ok) { setErr(r.status === 401 ? 'expired' : r.status === 404 ? 'gone' : 'other'); return }
    setData(r.data)
    // 기본 체크 = 채점 완료된 아이의 최신 세션
    setPicked(new Set(r.data.children.map(latestSession).filter(s => s?.status === 'scored').map(s => s!.id)))
  }
  useEffect(() => { void load() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [token])

  const summary = useMemo(() => (data ? summarize(data.children) : null), [data])

  async function download(mode: 'all' | 'picked') {
    setDownloading(mode); setDlErr('')
    const qs = mode === 'picked' ? `?ids=${[...picked].join(',')}` : ''
    try {
      const res = await fetch(`/api/results/${token}/sheets.pdf${qs}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        setDlErr(j.error ?? '결과지를 만들지 못했어요. 다시 시도해 주세요.'); return
      }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') ?? ''
      const name = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? 'results.pdf')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = name; a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      setDlErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally {
      setDownloading(null)
    }
  }

  function toggle(id: string, on: boolean) {
    setPicked(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })
  }

  if (err) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Blip variant="idle" className="h-24 w-[100px]" />
      <h1 className="text-xl font-bold">{err === 'other' ? '결과를 불러오지 못했어요' : '링크가 만료됐어요'}</h1>
      <p className="text-sm leading-relaxed text-ink-soft">
        {err === 'other'
          ? <>잠시 후 다시 시도해 주세요.</>
          : <>검사 주소에서 학급 코드를 입력한 뒤<br />[결과지 받기]를 다시 눌러 주세요.</>}
      </p>
      {err === 'other'
        ? <button type="button" onClick={() => void load()} className="cta mt-2 max-w-60">다시 시도</button>
        : <Link href="/" className="cta mt-2 max-w-60">검사 주소로 가기</Link>}
      <p className="text-[12px] text-ink-mute">링크가 계속 열리지 않으면 담당자에게 문의해 주세요.</p>
    </main>
  )

  if (!data || !summary) return (
    <main className="flex min-h-dvh items-center justify-center"><Spinner className="h-8 w-8 text-blue" /></main>
  )

  const { cls, children, taskMax, provisional } = data
  const pickedCount = picked.size

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col p-6 pt-8">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">KODYS 결과지</span>
      </div>
      <h1 className="mt-5 text-xl font-bold">{cls.schoolName} {gradeClassLabel(cls.grade, cls.classNo)}</h1>
      <p className="mt-1 text-sm text-ink-soft">담임 {cls.teacherName}</p>

      {/* 상단 요약 — 교사가 진짜 알고 싶은 것("누가 걸렸나")을 표를 훑기 전에 준다(사용자 확정 ④) */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-soft">
        <span>검사 <b>{summary.tested}</b>명</span>
        <span>· 채점 완료 <b>{summary.scored}</b>명</span>
        <span>· <b className="text-rec-deep">Fail {summary.fail}</b>명</span>
        {summary.scoring > 0 && <span>· 채점 중 {summary.scoring}명</span>}
        {summary.unsubmitted > 0 && <span>· 미제출 {summary.unsubmitted}명</span>}
        {summary.untested > 0 && <span>· 미실시 {summary.untested}명</span>}
        {provisional && <Badge tone="amber" size="sm">임시 기준 · 확정 전</Badge>}
      </div>

      {summary.tested === 0 ? (
        <p className="card mt-6 p-8 text-center text-sm text-ink-mute">아직 검사한 학생이 없어요.</p>
      ) : (
        <>
          {summary.scored === 0 && (
            <p className="mt-4 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] text-amber">
              아직 채점된 학생이 없어요. 채점이 끝나면 이 페이지를 새로고침해 주세요.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button type="button" onClick={() => void download('all')} disabled={summary.scored === 0 || downloading !== null}
              className="btn-primary h-[46px] flex-1 min-w-[12rem]">
              {downloading === 'all' ? `잠시 걸려요 · ${summary.scored}명` : `전체 PDF (${summary.scored}명)`}
            </button>
            <button type="button" onClick={() => void download('picked')} disabled={pickedCount === 0 || downloading !== null}
              className="btn-ghost h-[46px] flex-1 min-w-[12rem]">
              {downloading === 'picked' ? `잠시 걸려요 · ${pickedCount}장` : `선택한 ${pickedCount}장 PDF`}
            </button>
          </div>
          {dlErr && <p role="alert" className="mt-2 text-sm text-rec-deep">{dlErr}</p>}

          <section className="card mt-4 overflow-x-auto p-2 lg:p-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-mute">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2 font-medium">번호</th>
                  <th className="px-2 py-2 font-medium">이름</th>
                  {TASKS.map(t => <th key={t.key} className="whitespace-nowrap px-2 py-2 font-medium">{t.label}</th>)}
                  <th className="px-2 py-2 font-medium">판정</th>
                  <th className="px-2 py-2 font-medium">상태</th>
                  <th className="px-2 py-2 font-medium">검사일</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {children.map(c => {
                  const latest = latestSession(c)
                  const retests = c.sessions.length > 1
                  const expanded = open.has(c.childNo)
                  const row = (s: ResultsSession | null, label: string | null, key: string) => (
                    <tr key={key} className={`border-t border-line/60 ${label ? 'bg-well/60 text-[13px]' : ''}`}>
                      <td className="px-2 py-2">
                        {s && (
                          <input type="checkbox" aria-label={`${c.childNo}번 ${c.name}${label ? ' ' + label : ''} 선택`}
                            checked={picked.has(s.id)} disabled={s.status !== 'scored'}
                            onChange={e => toggle(s.id, e.target.checked)}
                            className="h-4 w-4 accent-[var(--color-blue)] disabled:opacity-40" />
                        )}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{label ? <span className="text-ink-mute">{label}</span> : c.childNo}</td>
                      <td className="px-2 py-2 font-medium">{label ? '' : `${c.name} (${c.gender})`}</td>
                      {TASKS.map(t => (
                        <td key={t.key} className="whitespace-nowrap px-2 py-2 tabular-nums">
                          {s?.scores ? `${s.scores[t.key]}/${taskMax[t.key]}` : <span className="text-ink-mute">-</span>}
                        </td>
                      ))}
                      <td className="px-2 py-2"><VerdictPill v={s?.status === 'scored' ? s.verdict : null} /></td>
                      <td className="whitespace-nowrap px-2 py-2">
                        {s ? <Badge tone={s.status === 'scored' ? 'blue' : s.status === 'scoring' ? 'amber' : 'rec'} size="sm">{STATUS_LABEL[s.status]}</Badge>
                          : <Badge tone="mute" size="sm">미실시</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-ink-soft">{s ? kstDate(s.startedAt) : ''}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
                        {!label && retests && (
                          <button type="button" aria-expanded={expanded}
                            onClick={() => setOpen(prev => { const n = new Set(prev); if (n.has(c.childNo)) n.delete(c.childNo); else n.add(c.childNo); return n })}
                            className="text-[12px] font-bold text-blue underline underline-offset-2">
                            {expanded ? '▾' : '▸'} 재검사 {c.sessions.length}회
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                  return [
                    row(latest, null, `c${c.childNo}`),
                    ...(expanded ? c.sessions.map(s => row(s, `${s.attemptNo}차`, s.id)) : []),
                  ]
                })}
              </tbody>
            </table>
          </section>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-mute">
            채점 완료된 검사만 내려받을 수 있어요. 재검사가 있으면 ▸를 눌러 차수별로 고를 수 있어요.
            채점이 진행되면 새로고침하면 반영돼요.
          </p>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 4: `components/results/README.md`**

```markdown
# components/results/ — 교사 결과지 화면

`/results/[token]`(학급 스코프 토큰)에서 교사가 본인 학급 결과지를 받는 화면. 스펙:
`docs/superpowers/specs/2026-09-22-teacher-results-download-design.md`.

| 파일 | 역할 |
|---|---|
| `ResultsView.tsx` | `GET /api/results/<token>`을 읽어 요약 한 줄·아이별 행(재검사 펼침·체크박스)·[전체 PDF]/[선택 PDF]를 그린다. 401은 만료 화면(→ `/`), 그 외는 재시도. 다운로드는 `fetch → blob → a[download]`로 받아 로딩 표시를 낸다(앵커 직행은 무반응으로 보여 여러 번 누른다) |

- 표의 계산(상태·판정·정렬·요약)은 전부 `lib/results.ts`가 한다 — 이 파일은 그린다.
- 판정은 관리자 화면과 같은 **Pass/Fail**(사용자 확정 2026-09-22). 채점 완료(`scored`)만 체크 가능.
- 녹음·요약표 CSV·행별 PDF는 **의도적으로 없다**(스펙 「화면에 없는 것」).
```

- [ ] **Step 5: 검증**

```bash
npm run typecheck && npm run lint && npm run build
```
Expected: 통과. `next-env.d.ts` 변경 시 `git checkout next-env.d.ts`.

수동 확인(dev 서버): Task 6 라우트를 curl로 호출해 받은 토큰으로 `http://localhost:3000/results/<token>` 접속 → 표·버튼·펼침 동작, `?ids=`로 선택 다운로드, 만료 토큰(`...`) 접속 시 만료 화면.

- [ ] **Step 6: 커밋**

```bash
git add app/results components/results
git commit -m "feat(results): 교사 결과 페이지 — 요약·아이별 행·재검사 펼침·전체/선택 PDF

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: 시작 화면 — `검사 완료 N명`(①) + [결과지 받기 →] + 카운트다운

**Files:**
- Modify: `app/page.tsx` — 상태 선언(123행 근처), 배너 블록(363~370행), `step === 'direct'` 블록 앞
- 화면은 렌더 테스트 없음 — 수동 확인 + Task 14 E2E.

- [ ] **Step 1: 상태·요청 함수 추가**

`const codeTouched = useRef(false)` **아래**에:

```tsx
  // ── 결과지 받기(교사) — 담임 메일로 학급 결과 링크. 스펙 2026-09-22.
  // 이 버튼은 아이 앞 PC에 있다. 하는 일은 **등록된 메일함으로 링크를 보내는 것**뿐이라 아이가 눌러도
  // 결과는 아이 손에 오지 않는다. 이메일은 입력·수정할 수 없다 — 요청자가 주소를 정하면 코드가 곧 열쇠다.
  const [resultsMsg, setResultsMsg] = useState('')
  const [resultsErr, setResultsErr] = useState('')
  const [resultsBusy, setResultsBusy] = useState(false)
  // 남은 쿨다운(초). 서버가 429로 준 값 또는 성공 뒤 60에서 시작해 1초씩 준다.
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function requestResults() {
    setResultsBusy(true); setResultsErr('')
    try {
      // requestJson은 실패 바디를 버리는데 429의 retryAfterSec가 필요해 여기서만 fetch를 직접 쓴다.
      const res = await fetch('/api/results/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: cleanCode }),
      })
      const j = await res.json().catch(() => ({})) as
        { sent?: boolean; maskedEmail?: string; scoredCount?: number; error?: string; retryAfterSec?: number }
      if (res.status === 429 && typeof j.retryAfterSec === 'number') {
        // 다른 기기에서 방금 요청했거나 연타 — 에러가 아니라 안내다.
        setResultsMsg(`방금 링크를 보냈어요. 메일함을 확인해 주세요.`)
        setCooldown(j.retryAfterSec)
      } else if (!res.ok) {
        setResultsErr(j.error ?? '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      } else {
        setResultsMsg(`${j.maskedEmail} 로 결과지 링크를 보냈어요. 메일함을 확인해 주세요.`
          + (j.scoredCount === 0 ? ' 아직 채점된 학생이 없어요. 채점이 끝나면 링크에서 새로고침해 주세요.' : ''))
        setCooldown(60)
      }
    } catch {
      setResultsErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally {
      setResultsBusy(false)
    }
  }
```

`useEffect`가 이미 import돼 있다. `resultsMsg`·`cooldown`은 코드를 고치면 함께 비운다 — 코드 `onChange`의 `if (step === 'roster') { setStep('code'); ... }` 블록 안 `setConsent(false)` 뒤에 `; setResultsMsg(''); setResultsErr(''); setCooldown(0)` 추가.

- [ ] **Step 2: 배너 교체 (`step === 'roster' && cls` 블록)**

원문:
```tsx
            <p className="mt-4 rounded-xl border border-mint/40 bg-mint/10 px-3.5 py-2.5 text-[13px] font-bold text-mint">
              {cls.schoolName} {gradeClassLabel(cls.grade, cls.classNo)} · 명단 {roster.length}명
            </p>
```
수정:
```tsx
            {/* 「검사 완료 N명」— 드롭다운을 펼쳐 「검사함」 배지를 세지 않아도 몇 명 남았는지 보이게
                (사용자 확정 2026-09-22 ①). 오른쪽 [결과지 받기 →]는 위 requestResults 주석 참고. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-mint/40 bg-mint/10 px-3.5 py-2.5 text-[13px] font-bold text-mint">
              <span>
                {cls.schoolName} {gradeClassLabel(cls.grade, cls.classNo)} · 명단 {roster.length}명 ·
                검사 완료 {roster.filter(r => r.tested === 'submitted').length}명
              </span>
              <ResultsButton />
            </div>
            <ResultsNotice />
```

`step === 'direct'` 블록의 첫 줄(`<div className="flex gap-2.5">` 앞)에 — 직접 입력 모드는 배너가 없으므로 버튼만 한 줄로:

```tsx
            {cls && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line bg-well px-3.5 py-2.5 text-[13px] font-bold text-ink-soft">
                <span>{cls.schoolName} {gradeClassLabel(cls.grade, cls.classNo)}</span>
                <ResultsButton />
              </div>
            )}
            <ResultsNotice />
```

- [ ] **Step 3: 두 인라인 컴포넌트 — `StartPage` 함수 안, `return (` 바로 위에**

```tsx
  /** 배너 오른쪽 텍스트 버튼. 쿨다운 중엔 「보냈어요 · N초 후 다시」로 비활성. */
  function ResultsButton() {
    return (
      <button type="button" onClick={() => void requestResults()} disabled={resultsBusy || cooldown > 0}
        className="whitespace-nowrap text-[12.5px] font-bold text-blue underline underline-offset-2 disabled:no-underline disabled:opacity-60">
        {resultsBusy ? '보내는 중…' : cooldown > 0 ? `보냈어요 · ${cooldown}초 후 다시` : '결과지 받기 →'}
      </button>
    )
  }
  /** 발송 결과 한 줄 — 성공·429는 안내 톤(polite), 그 외 실패만 경고 색. */
  function ResultsNotice() {
    if (!resultsMsg && !resultsErr) return null
    return resultsErr
      ? <p role="alert" className="mt-2 text-[12.5px] leading-relaxed text-rec-deep">{resultsErr}</p>
      : <p aria-live="polite" className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{resultsMsg}</p>
  }
```

- [ ] **Step 4: 파일 머리주석 갱신**

`app/page.tsx` 상단 주석 마지막 문단(`// 학급 코드는 세션 생성 성공 직후 별도 키에 저장돼…`) 아래에:

```
//
// 학급 배너의 [결과지 받기 →]는 교사용이다(스펙 2026-09-22 teacher-results-download). 등록된 담임
// 메일로 학급 결과 링크를 보낼 뿐 이 화면에서 결과가 열리지 않는다 — 아이 앞 공용 PC라 그래야 한다.
```

- [ ] **Step 5: 검증**

```bash
npm run typecheck && npm run lint && npm run build
```
수동: dev 서버에서 `TEST24` 입력 → 배너에 `명단 8명 · 검사 완료 N명` + `결과지 받기 →` → 클릭 → 안내 문구 + 60초 카운트다운 → 60초 안 재클릭 불가 → 코드 한 글자 고치면 문구·카운트다운 사라짐. 직접 입력 모드(`명단에 없는 학생이에요`)에서도 버튼이 보이는지.

- [ ] **Step 6: 커밋**

```bash
git add app/page.tsx
git commit -m "feat(start): 학급 배너에 「검사 완료 N명」 + [결과지 받기 →](담임 메일로 링크, 60초 쿨다운)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: 관리자 — 이메일 수정 PATCH + `CodeIssuer` 필수·인라인 편집

**Files:**
- Modify: `app/api/admin/codes/[id]/route.ts`, `components/admin/CodeIssuer.tsx`
- Test: `tests/admin-codes-route.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`tests/admin-codes-route.test.ts`의 `vi.mock('@/lib/db', …)`에 `updateClassCodeEmail: vi.fn(),` 추가. import 줄 `import { DELETE } from '@/app/api/admin/codes/[id]/route'`를 `import { DELETE, PATCH } from '@/app/api/admin/codes/[id]/route'`로. 파일 끝에:

```ts
describe('PATCH /api/admin/codes/[id] — 담임 이메일 수정', () => {
  const patchReq = (id: string, body: unknown) => PATCH(new Request(`http://x/api/admin/codes/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), delParams(id))
  it('유효한 이메일이면 갱신된 행을 돌려준다(trim 적용)', async () => {
    vi.mocked(db.updateClassCodeEmail).mockResolvedValueOnce({ ...ROW, teacher_email: 'new@school.kr' })
    const res = await patchReq(ROW.id, { teacherEmail: ' new@school.kr ' })
    expect(res.status).toBe(200)
    expect((await res.json()).code.teacher_email).toBe('new@school.kr')
    expect(db.updateClassCodeEmail).toHaveBeenCalledWith(ROW.id, 'new@school.kr')
  })
  it('[REGRESSION] 이메일 외 필드는 무시된다 — 학급 정보 변경 경로가 아니다', async () => {
    vi.mocked(db.updateClassCodeEmail).mockResolvedValueOnce(ROW)
    await patchReq(ROW.id, { teacherEmail: 'a@b.kr', grade: 6, schoolName: '위조' })
    expect(db.updateClassCodeEmail).toHaveBeenCalledWith(ROW.id, 'a@b.kr')
  })
  it('형식 오류 400 · 잘못된 id 400 · 없는 행 404', async () => {
    expect((await patchReq(ROW.id, { teacherEmail: 'nope' })).status).toBe(400)
    expect((await patchReq('not-uuid', { teacherEmail: 'a@b.kr' })).status).toBe(400)
    vi.mocked(db.updateClassCodeEmail).mockResolvedValueOnce(null)
    expect((await patchReq(ROW.id, { teacherEmail: 'a@b.kr' })).status).toBe(404)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/admin-codes-route.test.ts`
Expected: FAIL — `PATCH` export 없음.

- [ ] **Step 3: 라우트 구현**

`app/api/admin/codes/[id]/route.ts` 전체를:

```ts
// /api/admin/codes/[id] — 학급 코드 삭제(DELETE)·담임 이메일 수정(PATCH). 인증은 proxy가 담당.
import { NextResponse } from 'next/server'
import { deleteClassCode, updateClassCodeEmail } from '@/lib/db'
import { UUID_RE, jsonError } from '@/lib/request'
import { classCodeEmailSchema } from '@/lib/schema'

export const dynamic = 'force-dynamic'

const badId = () => jsonError('잘못된 코드 id입니다.', 400)

/** 세션이 참조 중이면 거부(FK restrict가 최종 방어). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badId()
  try {
    const result = await deleteClassCode(id)
    if (result === 'in_use') return jsonError('이미 검사에 사용된 코드는 삭제할 수 없습니다.', 409)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/codes/:id] 삭제 실패', e)
    return jsonError('코드 삭제에 실패했습니다.', 500)
  }
}

/** 담임 이메일 수정 — 결과지 링크(`/api/results/request`)가 이 주소로만 가므로, 잘못 등록된
 *  주소를 바로잡는 유일한 경로다. `classCodeEmailSchema`가 이메일 한 필드만 받는다 —
 *  학급 정보는 세션에 복사된 임상 기록과 어긋나므로 여기서 바꿀 수 없다. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badId()
  let body: unknown
  try { body = await req.json() } catch { return jsonError('요청 형식이 올바르지 않습니다.', 400) }
  const parsed = classCodeEmailSchema.safeParse(body)
  if (!parsed.success) return jsonError('이메일 형식을 확인해 주세요.', 400)
  try {
    const code = await updateClassCodeEmail(id, parsed.data.teacherEmail)
    if (!code) return jsonError('존재하지 않는 코드입니다.', 404)
    console.info(`[admin/codes/:id] 담임 이메일 수정 id=${id}`)
    return NextResponse.json({ code })
  } catch (e) {
    console.error('[admin/codes/:id] 이메일 수정 실패', e)
    return jsonError('수정에 실패했습니다.', 500)
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run tests/admin-codes-route.test.ts`
Expected: PASS

- [ ] **Step 5: `CodeIssuer.tsx` — 발급 폼 이메일 필수**

`issue()` 안 원문:
```ts
    if (!cleanPhone && !cleanEmail) { setErr('전화번호나 이메일 중 하나는 입력해 주세요.'); return }
    if (cleanPhone && !validPhone(cleanPhone)) { setErr('전화번호 형식으로 입력해 주세요. (예: 01012345678)'); return }
    if (cleanEmail && !validEmail(cleanEmail)) { setErr('이메일 형식으로 입력해 주세요.'); return }
```
수정:
```ts
    // 이메일 필수(사용자 확정 2026-09-22) — 승인 안내와 교사 결과지 링크가 이 주소로만 간다.
    if (!validEmail(cleanEmail)) { setErr('담임 이메일을 입력해 주세요. (예: name@school.kr)'); return }
    if (cleanPhone && !validPhone(cleanPhone)) { setErr('전화번호 형식으로 입력해 주세요. (예: 01012345678)'); return }
```

폼 JSX 원문:
```tsx
            <label className={labelCls} htmlFor="cc-phone">담임 전화번호</label>
```
수정:
```tsx
            <label className={labelCls} htmlFor="cc-phone">담임 전화번호 (선택)</label>
```
원문:
```tsx
        <p className="mt-1.5 text-[12px] text-ink-mute">전화번호와 이메일 중 하나만 입력해도 괜찬아요. 하이픈(-)은 저장할 때 자동으로 빠져요.</p>
```
(원문 표기는 `괜찮아요`) 수정:
```tsx
        <p className="mt-1.5 text-[12px] text-ink-mute">
          이메일은 필수예요 — 승인 안내와 결과지 링크가 이 주소로 가요. 전화번호는 선택이고 하이픈(-)은 저장할 때 자동으로 빠져요.
        </p>
```

- [ ] **Step 6: `CodeIssuer.tsx` — 목록 행 인라인 이메일 수정**

상태 선언(`const [delErr, setDelErr] = useState('')` 아래)에:

```ts
  // 담임 이메일 인라인 수정 — 결과지 링크가 이 주소로만 가므로 오타를 고칠 길이 있어야 한다.
  // 오류 복구 경로라 "관리자 개입 없음" 원칙의 예외(스펙 2026-09-22 §이메일 안전망).
  const [editId, setEditId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editErr, setEditErr] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  async function saveEmail(c: ClassCodeItem) {
    const v = editEmail.trim()
    if (!validEmail(v)) { setEditErr('이메일 형식을 확인해 주세요.'); return }
    setEditBusy(true); setEditErr('')
    const r = await requestJson<{ code: ClassCodeItem }>(`/api/admin/codes/${c.id}`,
      { method: 'PATCH', body: { teacherEmail: v } }, '수정에 실패했어요. 다시 시도해 주세요.')
    setEditBusy(false)
    if (!r.ok) { setEditErr(r.error); return }
    setEditId(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }
```

목록 행의 연락처 `<td>` 원문:
```tsx
                  <td className="whitespace-nowrap px-4 text-ink-soft">
                    {[c.teacher_phone, c.teacher_email].filter(Boolean).join(' · ') || '—'}
                  </td>
```
수정:
```tsx
                  <td className="whitespace-nowrap px-4 text-ink-soft">
                    {editId === c.id ? (
                      <span className="flex items-center gap-1.5">
                        <input value={editEmail} onChange={e => setEditEmail(e.target.value)} inputMode="email"
                          aria-label="담임 이메일" aria-invalid={!!editErr}
                          className="h-8 w-56 rounded-lg border-[1.5px] border-line bg-white px-2 text-[13px] outline-none focus:border-blue" />
                        <button type="button" onClick={() => void saveEmail(c)} disabled={editBusy}
                          className="rounded-lg bg-blue px-2.5 py-1 text-xs font-bold text-white disabled:opacity-40">
                          {editBusy ? '저장 중…' : '저장'}
                        </button>
                        <button type="button" onClick={() => setEditId(null)} disabled={editBusy}
                          className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1 text-xs font-bold text-ink-soft">
                          취소
                        </button>
                        {editErr && <span role="alert" className="text-xs text-rec-deep">{editErr}</span>}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span>{[c.teacher_phone, c.teacher_email].filter(Boolean).join(' · ') || '—'}</span>
                        {/* 이메일 없는 옛 코드(필수화 전 발급)도 여기서 채운다 — 채우기 전엔 그 학급이 결과지를 받을 수 없다 */}
                        <button type="button" onClick={() => { setEditId(c.id); setEditEmail(c.teacher_email ?? ''); setEditErr('') }}
                          className="text-[11.5px] font-bold text-blue underline underline-offset-2">
                          {c.teacher_email ? '수정' : '이메일 등록'}
                        </button>
                      </span>
                    )}
                  </td>
```

- [ ] **Step 7: 검증 · 커밋**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
수동: `/admin/codes` → 발급 폼에 이메일 없이 [코드 발급] → 오류 문구 / 목록 행 [수정]·[이메일 등록] → 저장 → 행 갱신.

```bash
git add "app/api/admin/codes/[id]/route.ts" components/admin/CodeIssuer.tsx tests/admin-codes-route.test.ts
git commit -m "feat(admin): 담임 이메일 수정(PATCH) + 발급 폼 이메일 필수

결과지 링크가 teacher_email로만 가므로 잘못 등록된 주소를 바로잡는 경로가 필요하다.
이메일 한 필드만 받는다 — 학급 정보는 세션에 복사된 임상 기록과 어긋난다.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `/apply` 이메일 확인칸

**Files:**
- Modify: `app/apply/page.tsx` — 상태(24행 근처), `filled`(36행), `submit()`(48행), 이메일 input 아래(134행)

- [ ] **Step 1: 상태·조건**

`const [email, setEmail] = useState('')` 아래에:
```ts
  // 이메일 확인칸 — 오타는 승인 메일이 안 와서 코드를 못 받는 시점에 걸리지만, 그때는 이미 담당자 손을
  // 타야 한다. 입력 순간에 잡는 게 싸다(사용자 확정 2026-09-22). 서버 스키마는 그대로(클라이언트만).
  const [emailConfirm, setEmailConfirm] = useState('')
```
`const cleanEmail = email.trim()` 아래에 `const cleanEmailConfirm = emailConfirm.trim()`.

`filled` 원문 `&& cleanEmail !== '' && roster !== null && allChecked` → `&& cleanEmail !== '' && cleanEmailConfirm !== '' && roster !== null && allChecked`.

`submit()`에서 `if (!validEmail(cleanEmail)) …` 줄 **바로 아래**에:
```ts
    if (cleanEmail !== cleanEmailConfirm) { setErr('이메일이 서로 달라요. 다시 확인해 주세요.'); return }
```

- [ ] **Step 2: 입력칸**

이메일 `<input id="ap-email" …/>` 바로 아래(안내 `<p>` 위)에:
```tsx
          <label className={labelCls} htmlFor="ap-email2">이메일 확인</label>
          <input id="ap-email2" value={emailConfirm} maxLength={60} type="email" inputMode="email"
            spellCheck={false} placeholder="같은 주소를 한 번 더"
            aria-invalid={cleanEmailConfirm !== '' && cleanEmailConfirm !== cleanEmail}
            onChange={e => setEmailConfirm(e.target.value)} className={inputCls} />
          {cleanEmailConfirm !== '' && cleanEmailConfirm !== cleanEmail && (
            <p role="alert" className="mt-1.5 text-[12px] text-rec-deep">이메일이 서로 달라요.</p>
          )}
```

- [ ] **Step 3: 검증 · 커밋**

```bash
npm run typecheck && npm run lint && npm run build
```
수동: `/apply`에서 두 칸을 다르게 → 빨간 안내 + [신청하기] 비활성, 같게 → 사라짐.

```bash
git add app/apply/page.tsx
git commit -m "feat(apply): 이메일 확인칸 — 오타를 입력 순간에 잡는다

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: 마이크 확인 건너뛰기(②)

**Files:**
- Modify: `lib/survey-state.ts` (파일 끝), `components/survey/MicCheck.tsx`
- Test: `tests/survey-state.test.ts`

- [ ] **Step 1: 실패하는 테스트**

`tests/survey-state.test.ts` import에 `saveMicOk, recentMicOk` 추가. 파일 끝에:

```ts
describe('마이크 확인 기억 (같은 기기 연속 검사 — 사용자 확정 2026-09-22 ②)', () => {
  it('저장 직후 10분 안이면 true', () => {
    saveMicOk()
    expect(recentMicOk(10 * 60_000)).toBe(true)
  })
  it('기록이 없으면 false', () => {
    expect(recentMicOk(10 * 60_000)).toBe(false)
  })
  it('기한이 지나면 false', () => {
    localStorage.setItem('kodys-survey:micOkAt', String(Date.now() - 11 * 60_000))
    expect(recentMicOk(10 * 60_000)).toBe(false)
  })
  it('손상된 값은 false', () => {
    localStorage.setItem('kodys-survey:micOkAt', 'garbage')
    expect(recentMicOk(10 * 60_000)).toBe(false)
  })
  it('[REGRESSION] clearState는 마이크 기록을 지우지 않는다 — 기기 키(학급 코드와 같은 성격)', () => {
    saveState(newState('sid', '이하늘', 9, 'tok', 1))
    saveMicOk()
    clearState()
    expect(recentMicOk(10 * 60_000)).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run tests/survey-state.test.ts`
Expected: FAIL — export 없음.

- [ ] **Step 3: `lib/survey-state.ts` 구현** — 파일 끝에:

```ts
/** 마이크 확인 통과 시각 — **기기 키**(학급 코드 키와 같은 성격, clearState가 지우지 않는다).
 *  같은 PC·같은 헤드셋으로 25명을 연달아 검사할 때 아이마다 "안녕하세요"를 시키지 않기 위한 것
 *  (사용자 확정 2026-09-22 ②). 안전망은 이미 있다 — 첫 녹음이 작으면 「목소리가 잘 안 담긴 것
 *  같아요」가 뜬다. 마이크 확인은 검사지에 없는 운영 절차라 담당자 확정 없이 바꿀 수 있는 영역으로 본다. */
const MIC_OK_KEY = 'kodys-survey:micOkAt'

export function saveMicOk(): void {
  try { localStorage.setItem(MIC_OK_KEY, String(Date.now())) } catch { /* noop */ }
}

/** maxAgeMs 안에 통과한 기록이 있으면 true. 값이 없거나 손상됐으면 false(= 확인을 시킨다). */
export function recentMicOk(maxAgeMs: number): boolean {
  try {
    const at = Number(localStorage.getItem(MIC_OK_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < maxAgeMs
  } catch { return false }
}
```

- [ ] **Step 4: `MicCheck.tsx`**

import에 `import { recentMicOk, saveMicOk } from '@/lib/survey-state'` 추가. `const MAX_SEC = 20` 아래에:
```ts
/** 이 시간 안에 같은 기기에서 통과했으면 건너뛰기를 제안한다(사용자 확정 2026-09-22). */
const MIC_OK_MAX_AGE_MS = 10 * 60_000
```

컴포넌트 안 원문:
```ts
  const recorder = useRecorder(MAX_SEC, (r: Recording) => setMicOk(r.peak > MIC_MIN_PEAK ? 'ok' : 'quiet'))
```
수정:
```ts
  const recorder = useRecorder(MAX_SEC, (r: Recording) => {
    const ok = r.peak > MIC_MIN_PEAK
    setMicOk(ok ? 'ok' : 'quiet')
    if (ok) saveMicOk()
  })
  // localStorage는 서버 프리렌더에 없으므로 마운트 후 확인(하이드레이션 불일치 방지).
  const [skippable, setSkippable] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSkippable(recentMicOk(MIC_OK_MAX_AGE_MS)) }, [])
```
`import { useState } from 'react'` → `import { useEffect, useState } from 'react'`.

[검사 시작] 버튼 원문:
```tsx
        <button onClick={onOk} disabled={micOk !== 'ok'} className="cta disabled:opacity-40">검사 시작</button>
```
수정:
```tsx
        <button onClick={onOk} disabled={micOk !== 'ok'} className="cta disabled:opacity-40">검사 시작</button>
        {/* 같은 기기에서 10분 안에 통과했으면 건너뛸 수 있다 — 25명 연속 검사에서 아이당 15초.
            보조 동작이라 주 버튼 아래 작은 링크로. 통과 뒤에는 의미가 없어 감춘다. */}
        {skippable && micOk !== 'ok' && (
          <button type="button" onClick={onOk}
            className="mt-3 w-full py-2 text-[13px] font-bold text-blue underline underline-offset-2">
            방금 확인했어요 — 건너뛰기
          </button>
        )}
```

- [ ] **Step 5: 검증 · 커밋**

```bash
npx vitest run tests/survey-state.test.ts && npm run typecheck && npm run lint && npm run build
```
수동: 마이크 확인 통과 → 다음 학생 시작 → 마이크 화면에 「방금 확인했어요 — 건너뛰기」 → 누르면 연습 선택으로.

```bash
git add lib/survey-state.ts components/survey/MicCheck.tsx tests/survey-state.test.ts
git commit -m "feat(survey): 같은 기기 10분 내 통과했으면 마이크 확인 건너뛰기

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: README 6곳 + E2E 체크리스트 + 최종 게이트 + PR

**Files:**
- Modify: `README.md`, `app/README.md`, `app/api/README.md`, `lib/README.md`, `components/README.md`, `components/admin/README.md`, `components/survey/README.md`

- [ ] **Step 1: `README.md` 화면 흐름 표** — `/apply` 행 아래에:

```
| `/results/[token]` | 교사 | 학급 결과지. 시작 화면 배너의 [결과지 받기 →]가 담임 메일로 보낸 링크(학급 스코프 토큰, 14일)로만 진입. 요약 한 줄 · 아이별 행(재검사 펼침) · [전체 PDF]/[선택 PDF]. 판정은 관리자와 같은 Pass/Fail, 채점 완료된 검사만 내려받는다 |
```

`/` 행 끝에 ` · 학급 배너에 「검사 완료 N명」과 교사용 [결과지 받기 →]` 추가.

기술 구조 「인증」 줄:
```
- **인증**: 관리자는 argon2id 비밀번호 + HMAC 쿠키(8시간), 참여자는 세션 생성 시 발급되는 HMAC 세션 토큰(24시간, 해당 세션에만 쓰기 가능), 교사 결과지는 **학급 스코프 HMAC 토큰**(14일, 주체 내장 — 등록된 담임 메일로만 발송)
```

「미녹음의 표기」 절 아래에 새 절:

```markdown
## 교사 결과지 (2026-09-22)

교사는 관리자 개입 없이 본인 학급 결과지를 받는다. 스펙 `docs/superpowers/specs/2026-09-22-teacher-results-download-design.md`.

```
/ 코드 입력 → 배너 [결과지 받기 →] → 등록된 담임 메일로 링크(14일) → /results/<토큰>
  → 요약 · 아이별 행(재검사 ▸ 펼침, 채점 완료만 체크) → [전체 PDF] / [선택 PDF]
```

- **왜 매직링크인가**: 학급 코드는 아이 앞 공용 PC에 자동으로 채워져 있다. 코드만으로 결과가 열리면
  아이가 반 전체 판정을 본다. 버튼은 결과가 아니라 **등록된 메일함**으로 가는 문이다 — 그래서 아이 앞
  화면에 둬도 안전하다. 이메일은 **입력·수정 불가**(요청자가 주소를 정하면 코드가 곧 열쇠).
- **관리자는 채점만** 한다. 채점 완료 기준은 관리자 PDF 게이트(`sheetPdfGate`)와 같다 — 읽기 두 과제가
  채점되면 완료, 쓰기만 비어도 허용(사용자 확정 A안).
- **코드당 1분 1회** 요청(아이의 연타로 메일함이 채워지지 않게). 메일 실패는 502로 알린다.
- **이메일 안전망**: 관리자 직접 발급도 이메일 필수, `/apply` 이메일 확인칸, `/admin/codes` 이메일 수정.
- 문의처는 「담당자에게 문의」까지만(사용자 확정) — 연락처 값을 앱에 두지 않는다.
- 전제: Resend 도메인 인증 + 프로덕션 `MAIL_TO_OVERRIDE` 해제(10월 전). 그 전엔 샌드박스라 교사에게 닿지 않는다.
```

E2E 체크리스트 `- [ ] 관리자: 로그인 → 목록…` 줄 **위**에:

```
- [ ] 시작 화면 배너: 「명단 N명 · 검사 완료 N명」 · [결과지 받기 →] → 클릭 → 「k***@…로 보냈어요」 + 60초 카운트다운 · 60초 안 재클릭 불가 · 코드를 고치면 문구·카운트다운 사라짐 · 직접 입력 모드에도 버튼
- [ ] 결과 메일 링크 → `/results/<토큰>`: 요약 줄(검사·채점 완료·Fail·채점 중) · Fail 행이 위 · 채점 중/미제출/미실시 체크 잠김 · ▸ 재검사 펼침·차수별 체크 · [전체 PDF] 한 파일(아이당 최신) · [선택 PDF] 파일명(`1-2_결과지_3명_…` / 한 장 `03_이름_2차_…`) · 채점 0명이면 안내 + 버튼 비활성 · 만료 토큰 → 만료 화면 → [검사 주소로 가기]
- [ ] 마이크 확인: 통과 뒤 다음 학생에서 「방금 확인했어요 — 건너뛰기」 → 연습 선택으로 · 10분 지나면 사라짐
- [ ] `/apply`: 이메일 두 칸이 다르면 빨간 안내 + [신청하기] 비활성
- [ ] `/admin/codes`: 이메일 없이 발급 시 오류 · 목록 행 [수정]/[이메일 등록] → 저장 → 행 갱신 · 이메일 없던 옛 코드 4개 채우기
```

- [ ] **Step 2: `app/README.md`** — 참여자 흐름 블록의 `/done` 줄 아래에:

```
/results     교사 결과지 — 토큰 없이 오면 /로. /results/[token]은 학급 스코프 토큰(메일 링크)으로만 열린다.
             서버 셸(noindex·no-referrer) → components/results/ResultsView(클라이언트). 데이터는 매 요청 DB.
```

`/` 설명 끝(「명단 모드에서 「명단에 없는 학생이에요」…」 문단 뒤)에:
```
             학급 배너에 「검사 완료 N명」과 교사용 [결과지 받기 →] — 등록된 담임 메일로 결과 링크를 보낸다
             (코드당 1분 1회, 이메일 입력·수정 불가). 이 화면에서 결과가 열리지는 않는다.
```

- [ ] **Step 3: `app/api/README.md`** — 공개 라우트 표(`POST /api/apply` 행 아래)에:

```
| `POST /api/results/request` | 교사 결과지 링크 요청(공개). 코드만 받아 **`class_codes.teacher_email`로만** 학급 스코프 토큰(14일) 링크를 보낸다 — 바디의 이메일은 무시(요청자가 주소를 정하면 코드가 곧 열쇠). **코드당 60초 1회**(키가 IP가 아닌 이유: 학교=IP 하나, 막을 것은 아이의 연타) + IP 레이트리밋(`VERIFY_CODE_RATE_LIMIT`). pending은 미존재와 같은 404. 메일 실패 502(쿨다운 미소비). 응답에 가린 주소·채점 완료 수 |
| `GET /api/results/[token]` | 학급 결과 목록. 토큰 만료·변조·형식 오류는 전부 401 하나. 응답에 생년월일·연락처·스토리지 경로 없음. 상태·판정·정렬은 `lib/results.ts` |
| `GET /api/results/[token]/sheets.pdf?ids=` | 병합 결과지. ids 없음 = 채점 완료 전부(아이당 최신). **ids가 이 토큰의 학급 소속인지 검증**(아니면 403), 채점 미완료 400. `stampSheet` × N → `pdf-lib` 병합. `maxDuration = 60`. `no-store` |
```

관리자 표 `DELETE /api/admin/codes/[id]` 행 아래에:
```
| `PATCH /api/admin/codes/[id]` | 담임 이메일 수정(`classCodeEmailSchema` — 이 한 필드만). 결과지 링크가 이 주소로만 가므로 오타를 바로잡는 유일한 경로 |
```

- [ ] **Step 4: `lib/README.md`** — 표에 행 추가/수정:

`scoring.ts` 행 아래에:
```
| `results.ts` | 교사 결과지 표의 **순수 로직**(DB·HTTP 모름): `maskEmail`, 세션 상태 4갈래(`evaluateSession` — 관리자 `sheetPdfGate`와 같은 기준), 명단∪세션 합치기·재검사 차수·Fail 우선 정렬(`buildChildren`), 요약(`summarize`), 파일명(`sheetsFileName` — 관리자 규약 계승 + 재검사 차수). 목록·PDF 라우트와 테스트가 공유한다 |
```
`auth.ts` 행 끝에 ` + **학급 스코프 토큰**(`createResultsToken`/`verifyResultsToken`, 14일, 주체 내장 — 교사 결과지 링크)` 추가.
`mail.ts` 행 끝에 ` ③ `resultsLinkMail`(교사 결과지 링크). 승인 안내의 「결과지 받는 방법」은 `format.ts`의 `RESULTS_GUIDE_LINES` 하나를 HTML·평문이 공유한다` 추가.
`format.ts` 행에 `RESULTS_GUIDE_LINES` 언급 추가: `…`approvalNoticeText`(승인 안내 평문 …)` 뒤에 ` · `RESULTS_GUIDE_LINES`(결과지 받는 방법 — 3채널 공유)`.
`survey-state.ts` 행 끝에 ` 기기 키: `saveClassCode`/`loadClassCode`(학급 코드), `saveMicOk`/`recentMicOk`(마이크 확인 통과 시각) — 둘 다 `clearState`가 지우지 않는다` 추가.
`db.ts` 행 끝에 ` 교사 결과지: `findClassCodeById` · `classResults`(학급 세션 + 채점 행 관계 select 1회) · `updateClassCodeEmail`` 추가.
`schema.ts` 행의 `applySchema`는 직접 발급과 달리 이메일이 필수다…` 문장을 `발급(`classCodeCreateSchema`)·신청(`applySchema`) **둘 다 이메일 필수**(2026-09-22 — 결과지 링크가 그 주소로만 간다). `classCodeEmailSchema`(이메일 수정, 한 필드만) · `resultsRequestSchema`(결과지 요청, 코드만)`로 교체.

- [ ] **Step 5: `components/README.md`** — 폴더 표(`apply/` 행 아래)에:

```
| `results/` | 교사 결과지 화면(`/results/[token]`) — [results/README.md](results/README.md). `ResultsView.tsx` 하나뿐 |
```

4행의 괄호 `(\`survey/\` 참여자 검사 화면, \`admin/\` 관리자 화면, \`apply/\` 교사 신청 화면)`에 `, \`results/\` 교사 결과지 화면`을 덧붙인다.

- [ ] **Step 6: `components/admin/README.md`** — `CodeIssuer.tsx` 행 끝에:

```
 이메일은 **필수**(2026-09-22)이고, 목록 행에서 [수정]/[이메일 등록]으로 인라인 수정한다(`PATCH /api/admin/codes/[id]`) — 결과지 링크가 이 주소로만 가서 오타를 바로잡을 길이 필요하다
```

- [ ] **Step 7: `components/survey/README.md`** — `MicCheck.tsx` 행:

```
| `MicCheck.tsx` | 검사 시작 전 마이크 확인 — "안녕하세요" 발화의 peak로 판정, 실패 종류별(거부/미지원/실패) 안내. 성공 후 재확인 가능. 같은 기기에서 10분 안에 통과했으면 「방금 확인했어요 — 건너뛰기」(사용자 확정 2026-09-22 — 25명 연속 검사에서 아이당 15초. 안전망은 첫 녹음의 음량 부족 경고) |
```

- [ ] **Step 8: 최종 게이트**

```bash
npm run typecheck && npm run lint && npm test && npm run build
git checkout next-env.d.ts 2>/dev/null
git status --short
```
Expected: 전부 통과. 상태 깨끗.

- [ ] **Step 9: 커밋 · 푸시 · PR**

```bash
git add -A
git commit -m "docs: 교사 결과지 — README 6곳 + E2E 체크리스트

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git log origin/main..main --oneline   # 비어 있어야 한다 — PR #67 사고 재발 방지
git push -u origin feat/teacher-results
gh auth switch --user Growing-Jiwoo
gh pr create --title "feat: 교사 결과지 다운로드(매직링크) + 사용성 5건 + 이메일 안전망" --body-file - <<'MSG'
## 요약
교사가 관리자 개입 없이 시작 화면 [결과지 받기 →] → 등록된 메일의 링크 → 본인 학급 결과지 PDF(전체/선택)를 받는다. 스펙 `docs/superpowers/specs/2026-09-22-teacher-results-download-design.md`, 계획 `docs/superpowers/plans/2026-09-22-teacher-results-download.md`.

## 변경 유형
- [x] 기능 추가 (feat)
- [x] 문서

## 변경 사항
- 매직링크: `POST /api/results/request`(코드만, 등록 메일로만, 코드당 60초) → 학급 스코프 HMAC 토큰(14일) → `GET /api/results/[token]` · `/sheets.pdf?ids=`(학급 소속 검증, `stampSheet`×N 병합)
- `/results/[token]` 페이지: 요약·Fail 우선·재검사 펼침·채점 완료만 체크·[전체 PDF]/[선택 PDF]. 판정 Pass/Fail(관리자 동일), 채점 완료 = `sheetPdfGate`와 동일(A안)
- 시작 화면 배너: 「검사 완료 N명」(①) + [결과지 받기 →] 60초 카운트다운
- 마이크 확인 건너뛰기(②) · `/apply` 이메일 확인칸 · 관리자 발급 이메일 필수 · `PATCH /api/admin/codes/[id]` 이메일 수정
- 승인 메일·평문 「결과지 받는 방법」 3채널 동기 · 결과 링크 메일
- 가정통신문 삭제 · 문의처 「담당자에게 문의」 확정 · 마이그레이션 0건

## 테스트
- [x] `npm test` · `typecheck` · `lint` · `build`
- [x] DB 마이그레이션 없음
- 수동: README E2E 체크리스트 신규 5항목

## 배포 전제
Resend 도메인 인증 + 프로덕션 `MAIL_TO_OVERRIDE` 해제 전에는 결과 링크 메일이 교사에게 닿지 않는다(샌드박스).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
MSG
gh auth switch --user ipf-jiwookim
```

---

## Self-Review 기록

**Spec coverage** — 스펙 절 → Task: 진입 배너(10) · 승인 메일 3채널(5) · 인증 토큰(1) · 요청 API(6) · 결과 링크 메일(5) · 결과 페이지(9)·명단∪세션·재검사·상태 4갈래·판정·점수·정렬·요약·만료 화면(2·7·9) · 목록 API(7) · PDF API(8) · 이메일 안전망 3건(4·11·12) · 사용성 ①(10) ②(13) ④(9) ⑥(1·7) ⑧(6·9·10) · 문서 정리(0) · README(14). 누락 없음.

**Type consistency** — `ResultsSessionRow`(lib/results) ↔ `ClassResultsRow`(lib/db): 필드 동일(`birth_ymd`·`checklist` 포함). `createResultsToken(classCodeId, secret, ttl?)`·`verifyResultsToken(token, secret) → string|null` 전 Task 동일. `sheetsFileName` 인자 `{grade, classNo, date, all, picked[]}` Task 2·8 동일. `resultsLinkMail({teacherName, schoolName, grade, classNo, resultsUrl})` Task 5·6 동일. `classCodeEmailSchema`·`resultsRequestSchema` Task 4·6·11 동일. `saveMicOk()`/`recentMicOk(ms)` Task 13 내부 동일.

**Placeholder scan** — Task 8의 ⚠️ 확인 문단은 `stampSheet`가 `birth_ymd`·`checklist`를 실제로 찍는 것을 확인해 실제 값 전달로 확정하고 제거했다. 나머지 "TBD/TODO/Similar to" 없음.
