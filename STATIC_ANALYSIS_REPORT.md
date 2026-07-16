# 정적 분석 리포트 — kids-speech-survey

- 분석일: 2026-07-16
- 분석 방식: 읽기 전용(read-only) 수동 심층 분석 + 자동 검증(tsc, vitest, npm audit)
- 리포트 언어: 한국어 (기술 용어 영문 병기)

---

## 1. Executive Summary

**전체 코드 건강도: 우수(Good~Very Good).** 소규모(소스 ~3,600줄) Next.js 16 + Supabase 앱으로, 이전 보안 강화 작업(세션 토큰, 레이트리밋, 매직바이트 검증, 보안 헤더, IP 위조 방어 등)의 흔적이 뚜렷하고 테스트(148개)·타입체크·의존성 감사가 모두 클린하다. Critical/High 결함은 발견되지 않았으며, 남은 이슈는 **가용성 트레이드오프, 세션 토큰 수명, 아동 PII 운영 정책, 문서-기능 불일치** 수준이다.

| 심각도 | 개수 |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 4 |
| Low | 7 |
| Info | 3 |

영역별 분포: 보안 4 · 정합성/버그 4 · 유지보수성 3 · 성능 1 · UX/접근성 2

**가장 중요한 이슈 Top 5**

1. **[F-01]** README가 "CSV 다운로드 지원"을 명시하나 CSV 내보내기 코드가 저장소 어디에도 없음 — 문서-기능 불일치(또는 미구현 기능)
2. **[F-02]** 로그인 글로벌 실패 버킷(50회)으로 공격자가 관리자 로그인을 10분 단위로 무한 잠글 수 있음 — 가용성 DoS
3. **[F-03]** 참여자 세션 토큰이 무만료 + 제출 완료 후에도 재제출·녹음 덮어쓰기 가능 — 데이터 무결성 약화
4. **[F-04]** 아동 PII(이름·생년월일·음성)의 보존 기한·삭제 수단(관리자 UI) 부재 — PIPA 관점 운영 리스크
5. **[F-05]** 앱 메타데이터가 구 서비스 문구("말하기 설문 / 영어 문장…")로 남아 실제 검사 내용과 불일치

---

## 2. 분석 범위 & 대상

- **기술 스택**: Next.js 16 (App Router) · React 19 · TypeScript 5.9 · Tailwind 4 · Supabase(service role, RLS 전면 차단) · @node-rs/argon2 · TanStack Query/Table/Virtual · wavesurfer.js · Zod 4 · Vitest 4
- **도메인**: 초등 저학년 읽기 선별검사 — 아동 이름·생년월일·성별·학교·담임 연락처 + **음성 녹음**을 수집 (아동 PII → PIPA 관점 집중 점검)
- **분석 대상**: `app/`, `lib/`, `components/`, `hooks/`, `middleware.ts`, `next.config.ts`, `supabase/migrations/`, `scripts/`, `tests/`(존재 확인 수준)
- **제외**: `node_modules/`, `.next/`, `public/schools/*.json`(생성물), `docs/`(설계 문서)
- **핵심 데이터 흐름**:
  - 아동 흐름: `/`(PII 입력) → `POST /api/sessions`(Zod 검증 + HMAC 세션 토큰 발급) → `/survey`(녹음 → `POST /api/recordings`, 즉시 업로드) → `/review` → `POST /api/sessions/submit`
  - 관리자 흐름: `/admin/login`(argon2 + DB 레이트리밋) → HMAC 쿠키 → `middleware.ts`가 `/admin/*`·`/api/admin/*` 보호 → 목록/결과지(서명 URL로 녹음 청취)
  - 신뢰 경계: 모든 DB/스토리지 접근은 서버 라우트의 service role 경유(RLS로 anon 전면 차단) — 구조 건전

## 3. 분석 방법론

- Phase 1 정찰: 전체 트리·README·설정·마이그레이션 정독
- Phase 2 자동 도구: `tsc --noEmit` ✅ 에러 0 · `vitest run` ✅ 148/148 통과 · `npm audit` ✅ 취약점 0. (ESLint·semgrep은 프로젝트에 미설정 — 수동 분석으로 대체)
- Phase 3 수동 심층: 전 소스 파일 직접 정독. 인증/인가·업로드 경로는 source→sink 추적
- Phase 4 의존성/공급망: package.json 고정 버전·lockfile 확인
- Phase 5 본 리포트

---

## 4. Findings 요약 표

| ID | 제목 | 심각도 | 신뢰도 | 분류 | 위치 |
|---|---|---|---|---|---|
| F-01 | CSV 다운로드: 문서에만 존재, 구현 없음 | Medium | High | 문서-기능 불일치 | README.md:6 |
| F-02 | 글로벌 로그인 잠금으로 관리자 로그인 DoS 가능 | Medium | High | 보안(가용성) | app/api/admin/login/route.ts:11-12 |
| F-03 | 세션 토큰 무만료 + 제출 후 쓰기 허용 | Medium | High | 보안/무결성 | lib/auth.ts:54, lib/db.ts:40-52 |
| F-04 | 아동 PII 보존정책·삭제 UI 부재 | Medium | Medium | 민감정보(PIPA) | supabase/migrations/003, lib/db.ts:69 |
| F-05 | 스테일 메타데이터("말하기 설문/영어 문장") | Low | High | 정합성/UX | app/layout.tsx:9, app/admin/login/page.tsx:30 |
| F-06 | 관리자 API 오류 메시지 원문 노출 + id 미검증 | Low | High | 정보 노출 | app/api/admin/sessions/[id]/route.ts:19 |
| F-07 | 로그인 페이지 네트워크 오류 미처리(catch 누락) | Low | High | 정합성 | app/admin/login/page.tsx:13-23 |
| F-08 | 세션 생성 레이트리밋 Map 무한 성장 | Low | High | 성능/메모리 | app/api/sessions/route.ts:13 |
| F-09 | deleteSession 데드 코드(라우트 미연결) | Low | High | 유지보수성 | lib/db.ts:69-78 |
| F-10 | 관리자 로그아웃 수단 부재 | Low | High | 보안 하이진 | components/admin/AdminDashboard.tsx |
| F-11 | login_attempts 테이블 행 무한 누적 | Low | Medium | 유지보수성 | supabase/migrations/004 |
| F-12 | 녹음 상한 검사 TOCTOU(경합 시 소폭 초과) | Info | High | 동시성 | app/api/recordings/route.ts:47 |
| F-13 | CSP가 frame-ancestors만 통제 | Info | High | 방어 심층 | next.config.ts:6 |
| F-14 | 제출 확인 모달에 미완료 수 미표시 | Info | High | UX | app/review/page.tsx:121-126 |

---

## 5. 상세 Findings

### [F-01] CSV 다운로드: 문서에만 존재, 구현 없음
- 심각도: Medium / 신뢰도: High / 분류: 문서-기능 불일치 (정합성)
- 위치: `README.md:6`
- 설명: README 개요가 "CSV 다운로드 지원."을 명시하지만, `app/`·`components/`·`lib/` 전체를 검색해도 CSV 생성·다운로드 코드가 없다 (`grep -rni csv` 결과는 `lib/items.ts:9`의 주석 "관리자·CSV 전용" 1건뿐 — 이 주석 역시 존재하지 않는 기능을 참조).
- 코드 증거: `README.md:6` — "수행한다. CSV 다운로드 지원."
- 영향: 운영자가 문서를 믿고 데이터 내보내기를 계획하면 릴리스 직전에 기능 부재를 발견하게 된다. 채점 결과의 외부 집계(교육청 보고 등)가 요구사항이라면 실질적 기능 공백.
- 권고: 관리자 목록에 CSV 내보내기 버튼 + `GET /api/admin/export.csv`(middleware 보호 하) 구현, 또는 계획이 없다면 README와 `lib/items.ts:9` 주석에서 문구 제거. 구현 시 아동 PII 포함 여부(이름 vs 익명 ID)를 명시적으로 결정할 것.

### [F-02] 글로벌 로그인 잠금으로 관리자 로그인 DoS 가능
- 심각도: Medium / 신뢰도: High / 분류: 보안 — 가용성 (CWE-645 과도한 계정 잠금, OWASP A07)
- 위치: `app/api/admin/login/route.ts:11-12, 26, 36-37`
- 설명: IP 로테이션 공격 완화용 `__global__` 버킷은 모든 실패를 합산해 50회 도달 시 **모든 IP의 로그인**을 10분 잠근다(`LOCK_MS`). 실패할 때마다 `locked_until`이 연장되므로(마이그레이션 005의 `record_login_failure`가 매 호출 `now()+lock_ms`로 갱신), 공격자가 10분마다 오답 1회만 보내도 잠금이 사실상 무기한 연장된다. 데이터 유출은 없지만 정당한 관리자가 채점 업무를 못 하게 된다.
- 코드 증거:
  ```ts
  const GLOBAL_KEY = '__global__'   // IP 무관 누적 실패 버킷(IP 로테이션 공격 완화)
  const GLOBAL_MAX_FAILS = 50
  ```
  ```sql
  on conflict (ip) do update set fail_count = login_attempts.fail_count + 1,
      locked_until = now() + (p_lock_ms::text || ' milliseconds')::interval
  ```
- 영향: 관리자 로그인 영구 봉쇄(공격 비용: 10분당 요청 1건). 검사 기간 중 채점 중단.
- 권고: (1) 글로벌 잠금 중에도 실패 카운트를 더 올리지 않도록 잠금 상태에서 `recordLoginFailure(GLOBAL_KEY, …)`를 건너뛰거나, (2) `locked_until`을 연장하지 않고 최초 잠금 시각 기준 고정 창으로 바꾸거나, (3) 글로벌 버킷은 잠금 대신 지연(점증 백오프)만 적용. 기존 세션 쿠키(8h)는 잠금과 무관하게 유효하므로 완전 봉쇄는 아니라는 점은 완화 요인.

### [F-03] 세션 토큰 무만료 + 제출 후 쓰기 허용
- 심각도: Medium / 신뢰도: High / 분류: 보안/데이터 무결성 (CWE-613 불충분한 세션 만료)
- 위치: `lib/auth.ts:54-56`, `lib/db.ts:40-52`, `app/api/sessions/submit/route.ts`, `app/api/recordings/route.ts`
- 설명: 참여자 토큰은 `HMAC(sessionId)`로 **만료(exp)가 없어** 한 번 발급되면 영구 유효하다(관리자 토큰은 exp 포함 — 비대칭). 또한 `submitSession`은 `submitted_at is null` 조건 없이 업데이트하므로 **이미 제출된 세션의 checklist·submitted_at·writing_answers를 재제출로 덮어쓸 수 있고**, `/api/recordings`도 제출 여부와 무관하게 upsert(동일 attempt_no 덮어쓰기 포함)를 허용한다. 학교 공용 PC 환경에서 localStorage에 남았던 토큰이나 네트워크 로그에 남은 토큰으로, 채점 완료 후에도 원본 녹음·응답을 조작할 수 있다.
- 코드 증거:
  ```ts
  export async function createSessionToken(sessionId: string, secret: string) {
    return `${sessionId}.${await hmacHex(sessionId, secret)}` }        // exp 없음
  ```
  ```ts
  .update({ checklist, submitted_at: new Date().toISOString() })
  .eq('id', sessionId)                                                 // submitted_at 조건 없음
  ```
- 영향: 검사 데이터(증적)의 사후 변조 가능성. 정상 흐름에서는 `clearState()`가 토큰을 지우므로 발현 확률은 낮지만, 검사 결과의 신뢰성이 요구되는 도메인 특성상 방어할 가치가 있음.
- 권고: (1) 세션 토큰에 `exp`를 포함(예: 발급 후 24h — 관리자 토큰과 같은 `exp.jti.sig` 형식 재사용), (2) `submitSession`의 update에 `.is('submitted_at', null)` 추가로 재제출 차단, (3) `/api/recordings`에서 제출된 세션이면 409 반환. 세 가지 모두 소규모 변경.

### [F-04] 아동 PII 보존정책·삭제 수단 부재
- 심각도: Medium / 신뢰도: Medium / 분류: 민감정보 처리 (PIPA — 아동 개인정보, OWASP A04 데이터 최소화 관점)
- 위치: `supabase/migrations/003_kodys_redesign.sql`(sessions 테이블), `lib/db.ts:69`(deleteSession — 미사용), `app/page.tsx:158`
- 설명: 아동 실명·생년월일·성별·학교·반 + 담임 연락처 + **음성 녹음**을 수집·무기한 보존한다. (a) 보존 기한/파기 절차가 코드·문서 어디에도 없고, (b) 관리자 UI에 세션 삭제 기능이 없어(F-09의 `deleteSession`은 라우트 미연결) 삭제 요청 시 DB 콘솔 수작업이 필요하며, (c) 참여 화면의 고지는 "녹음된 목소리는 검사 확인 용도로만 사용돼요" 한 줄로, 수집 항목·보유 기간 고지가 없다. 만 14세 미만 아동의 개인정보라 법정대리인 동의 등 절차적 요건이 특히 엄격한 영역이다.
- 영향: 법적/운영 리스크. 유출 사고 시 피해가 아동에게 귀속되고, 삭제 요청 대응이 느려짐.
- 권고: (1) 검사 종료 후 보존 기한을 정하고(예: 결과 통보 후 N개월) 만료 세션 일괄 파기 절차(SQL 스크립트 또는 cron) 마련, (2) 기존 `deleteSession`을 `DELETE /api/admin/sessions/[id]` + 목록 UI 삭제 버튼으로 연결(확인 모달 필수), (3) 시작 화면 고지 문구에 수집 항목·목적·보유 기간을 명시(운영 주체의 개인정보처리방침 링크 권장). — 실제 요건은 운영 주체의 법무 판단 필요 `[검증 필요]`.

### [F-05] 스테일 메타데이터 — 구 서비스 문구 잔존
- 심각도: Low / 신뢰도: High / 분류: 정합성/UX
- 위치: `app/layout.tsx:9`, `app/admin/login/page.tsx:30`
- 설명: 브라우저 탭 제목·설명이 이전 서비스("말하기 설문", "영어 문장을 소리 내어 읽는 설문")로 남아 있다. 이 앱은 한국어 읽기 선별검사다. 최근 커밋(578b4d0)에서 KODYS 브랜딩을 제거하면서 이 두 곳이 누락된 것으로 보인다. `lib/survey-state.ts:15`의 localStorage 키 접두사 `kodys-survey:`도 잔존(동작엔 무해).
- 코드 증거: `export const metadata: Metadata = { title: '말하기 설문', description: '영어 문장을 소리 내어 읽는 설문' }`
- 영향: 사용자(교사)에게 다른 서비스로 오인될 수 있고, 검색·공유 시 잘못된 설명 노출.
- 권고: `title: '읽기 검사'`, description을 실제 검사 설명으로 교체. 관리자 로그인 라벨도 "읽기 검사 · 관리자"로(대시보드는 이미 이 문구 사용).

### [F-06] 관리자 API 오류 메시지 원문 노출 + id 미검증
- 심각도: Low / 신뢰도: High / 분류: 정보 노출 (CWE-209)
- 위치: `app/api/admin/sessions/[id]/route.ts:19`, `app/api/admin/sessions/route.ts:12`
- 설명: catch에서 `(e as Error).message`를 그대로 응답에 담는다. Supabase/PostgREST 오류 원문(테이블·제약 이름 등 내부 구조)이 클라이언트로 나간다. `[id]`는 UUID 형식 검증 없이 `.single()`에 전달돼 임의 문자열이 곧장 DB 오류 경로를 탄다. middleware 인증 뒤에 있어 노출 대상이 관리자뿐이라 심각도는 낮다(공개 라우트들은 이미 일반 문구로 잘 처리 중 — 이 두 파일만 관례 불일치).
- 권고: `console.error` 후 일반 문구 반환으로 통일하고, `[id]`에 recordings 라우트의 `UUID_RE`를 재사용해 400 조기 반환.

### [F-07] 로그인 페이지 네트워크 오류 미처리
- 심각도: Low / 신뢰도: High / 분류: 정합성 (에러 처리 누락)
- 위치: `app/admin/login/page.tsx:13-23`
- 설명: `login()`의 `try…finally`에 catch가 없어 `fetch` 실패(오프라인)나 비JSON 응답의 `res.json()` 예외가 unhandled rejection이 된다. busy는 풀리지만 화면에는 아무 오류도 표시되지 않아 사용자는 무반응으로 인식한다.
- 권고: `catch { setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.') }` 추가, `res.json()`에 `.catch(() => ({}))` 적용(다른 페이지들과 동일 패턴).

### [F-08] 세션 생성 레이트리밋 Map 무한 성장
- 심각도: Low / 신뢰도: High / 분류: 성능/메모리
- 위치: `app/api/sessions/route.ts:13, 25-31`
- 설명: `hits` Map은 같은 IP가 재요청할 때만 해당 키의 오래된 타임스탬프를 걸러낸다. 한 번 요청하고 사라진 IP의 엔트리는 영구 잔존해 장수 인스턴스(로컬/컨테이너 배포)에서 메모리가 단조 증가한다. 서버리스에서는 인스턴스 재활용으로 실해가 없지만(주석에 한계 명시됨) 배포 방식 변경 시 잠복 이슈.
- 권고: `rateLimited()` 안에서 주기적으로(예: 요청 100회마다 또는 시간창 경과 시) 만료 키 일괄 삭제, 또는 Map 크기 상한 도입.

### [F-09] deleteSession 데드 코드
- 심각도: Low / 신뢰도: High / 분류: 유지보수성 (죽은 코드)
- 위치: `lib/db.ts:69-78`
- 설명: 스토리지 정리 + CASCADE 삭제까지 갖춘 `deleteSession`이 어떤 라우트·컴포넌트에서도 호출되지 않는다(마이그레이션 005의 CASCADE 정비도 이 함수를 위한 것). 기능 의도는 명확하므로 삭제보다는 연결이 맞다.
- 권고: F-04의 권고 (2)로 흡수 — `DELETE /api/admin/sessions/[id]` 라우트로 연결. 연결하지 않을 거라면 함수와 관련 테스트를 제거.

### [F-10] 관리자 로그아웃 수단 부재
- 심각도: Low / 신뢰도: High / 분류: 보안 하이진 (세션 관리)
- 위치: `components/admin/AdminDashboard.tsx` (헤더), 라우트 부재
- 설명: 로그아웃 라우트/버튼이 없어 쿠키(8h)가 만료될 때까지 세션이 살아 있다. 학교·기관의 공용 PC에서 채점할 가능성이 높은 도구인데 자리를 떠나도 세션을 끊을 수 없다.
- 권고: `POST /api/admin/logout`(쿠키 maxAge=0 삭제) + 대시보드 헤더에 로그아웃 버튼. 5줄 내외의 변경.

### [F-11] login_attempts 행 무한 누적
- 심각도: Low / 신뢰도: Medium / 분류: 유지보수성
- 위치: `supabase/migrations/004_login_attempts.sql`, `lib/db.ts:112`
- 설명: 실패 기록은 로그인 성공 시 해당 IP만 삭제된다. 성공하지 못한 IP(스캐너, 오타 후 포기)의 행은 영구 잔존한다. 규모가 작아 실질 피해는 낮지만 IP는 그 자체로 개인정보성 데이터라 불필요 보존은 피하는 게 좋다.
- 권고: `updated_at < now() - interval '30 days'` 행을 지우는 정리 쿼리를 운영 절차(또는 pg_cron)에 추가.

### [F-12] 녹음 상한 검사 TOCTOU
- 심각도: Info / 신뢰도: High / 분류: 동시성
- 위치: `app/api/recordings/route.ts:47`
- 설명: `countSessionRecordings` 확인 후 업로드까지 사이에 병렬 요청이 끼면 `MAX_PER_SESSION`(200)을 수 건 초과할 수 있다. 상한 자체가 여유값(문항 18×10+여유)이고 토큰 보유자만 도달 가능하므로 실질 영향 없음 — 인지 목적 기록.
- 권고: 현행 유지 무방. 엄격히 하려면 DB에 세션당 카운트 제약 또는 upsert 전 count를 같은 RPC로 묶기.

### [F-13] CSP가 frame-ancestors만 통제
- 심각도: Info / 신뢰도: High / 분류: 방어 심층 (OWASP A05)
- 위치: `next.config.ts:6`
- 설명: 주석에 명시된 의도적 선택(하이드레이션·인라인 스타일 보호). XSS 벡터가 될 사용자 입력 렌더링이 모두 React 텍스트 바인딩이라(위험한 `dangerouslySetInnerHTML` 없음) 현 구조에서 실위험은 낮다. 다만 `script-src` 부재는 향후 서드파티 스크립트 추가 시 방어선이 없다는 뜻.
- 권고: 여유 있을 때 nonce 기반 `script-src 'self' 'nonce-…'` 도입 검토(Next 15+ 공식 가이드 존재). 급하지 않음.

### [F-14] 제출 확인 모달에 미완료 개수 미표시
- 심각도: Info / 신뢰도: High / 분류: UX
- 위치: `app/review/page.tsx:40-42, 121-126`
- 설명: 검토 페이지 본문은 미완료 개수를 보여주지만, 정작 최종 확인 모달에는 "녹음이 잘 되었는지 모두 확인하셨습니까?"만 있어 미완료가 있는 채로 제출하는 실수를 마지막 관문에서 막지 못한다. `missing` 값이 이미 계산돼 있어 표시 비용이 없다.
- 권고: `missing > 0`일 때 모달에 "아직 N개 문항이 완료되지 않았어요" 경고문(빨간색)을 추가.

---

## 6. 의존성 / 공급망 점검 결과

- **`npm audit`: 취약점 0건.** lockfile(package-lock.json) 존재, 핵심 런타임 의존성은 정확 버전 고정(next 16.2.10, react 19.2.7, zod 4.4.3 등) — 재현 가능한 빌드에 유리.
- 의심(타이포스쿼팅)·유지보수 중단 패키지 없음. `@node-rs/argon2`(네이티브 바인딩)는 활발히 유지되는 정식 패키지.
- `overrides.postcss ^8.5.10`은 과거 취약 버전 회피용으로 보이며 적절.
- 참고: `wavesurfer.js`·TanStack 계열은 캐럿(^) 범위 — 잠재적 minor 자동 승급은 lockfile이 고정하므로 문제 없음.

## 7. 우선순위 개선 로드맵

**Quick wins (반나절 이내, 코드 수 줄)**
- F-05 메타데이터·로그인 라벨 문구 교체
- F-07 로그인 페이지 catch 추가
- F-06 관리자 API 오류 문구 일반화 + `[id]` UUID 검증
- F-14 제출 모달에 미완료 경고 추가

**단기 (1~2일)**
- F-03 세션 토큰 exp 도입 + 제출 후 쓰기 차단(`.is('submitted_at', null)`, recordings 409)
- F-02 글로벌 잠금을 "연장 없는 고정 창" 또는 백오프로 완화
- F-09+F-04(2) `DELETE /api/admin/sessions/[id]` + 목록 삭제 버튼(확인 모달)
- F-10 로그아웃 라우트·버튼
- F-01 CSV 내보내기 구현 여부 결정(구현 또는 README 수정)

**중장기**
- F-04 PII 보존정책 수립·파기 자동화, 참여 화면 고지 보강(법무 확인 병행)
- F-13 nonce 기반 CSP
- 세션 5,000건 초과 시 서버 페이지네이션(코드에 이미 경고 로그로 표시된 알려진 한계)
- ESLint(eslint-config-next) 도입 — 현재 수동 주석으로 존재하는 `eslint-disable`이 실제로는 동작하지 않는 장식임(린터 미설치)

## 8. 부록

**사용 도구**: tsc 5.9 (`--noEmit`, 에러 0) · vitest 4.1.10 (148/148 통과) · npm audit (0건) · ripgrep 수동 탐색. ESLint/semgrep 미설정으로 미사용.

**검토한 주요 파일**: middleware.ts, lib/{auth,db,schema,audio-validate,audio,audio-ext,supabase,env,upload,survey-state,items,schools,validate,adminStats}.ts, app/api/**(전 라우트), app/{page,survey,review,done,layout,providers}.tsx, app/admin/**, components/**(전체), hooks/**(전체), supabase/migrations/**(전체), next.config.ts, package.json, README.md

**잘 설계된 부분 (강점)**
- 신뢰 경계가 명확: RLS 전면 차단 + service role 서버 전용, 서명 URL로만 녹음 노출
- 업로드 경로 방어가 겹겹: MIME allowlist + 매직바이트 스니핑 + 서버 고정 Content-Type + 크기/시도/세션 상한 + HMAC 세션 토큰 + 고아 파일 보상 정리
- 로그인 방어: argon2id + DB 기반 원자적 레이트리밋(RPC) + x-forwarded-for 위조 방어 + 상수시간 비교
- 프런트 품질: 포커스 트랩, aria-live/alert, 행 가상화, IntersectionObserver 지연 로드(wavesurfer), 업로드 실패 재시도 배너, localStorage 진행 복원, KST 날짜 경계 처리
- 테스트가 라우트·검증·상태 로직을 실질적으로 커버(148개)

**분석의 한계 / [검증 필요]**
- 실행 환경(Vercel/Supabase 프로덕션 설정, 환경변수 실값)은 미확인 — `x-real-ip` 신뢰는 Vercel 배포 전제이며, 다른 인프라로 옮기면 위조 가능해짐
- F-04의 법적 요건(법정대리인 동의, 보유 기간)은 운영 주체의 법무 검토 필요
- iOS Safari 실기기 녹음 동작은 정적 분석 범위 밖(README의 수동 E2E 체크리스트 존재)
