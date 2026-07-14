# 사용성 개선 Phase 3 — 백엔드·보안·데이터 정합성 설계

날짜: 2026-07-14
상태: 승인됨 (사용자 검토 대기)
관련: Phase 1(아동 흐름), Phase 2(관리자 개선)와 함께 진행되는 3단계 사용성 개선의 3단계

## 배경·목표

공개(무인증) 엔드포인트가 아동 PII·음성을 수집하고, 관리자 인증이 취약하며, 업로드·저장
경로에 정합성 결함이 있다. 서비스 가용성(스토리지 고갈)·보안(저장형 XSS, 브루트포스 우회)·
데이터 정합성(고아 파일, 허위 성공)을 강화한다.

대상: 사용자가 선택한 항목 19(공개 엔드포인트), 20(MIME/XSS), 21(관리자 인증), 22(데이터
정합성 전부).

## 신규 의존성

- `@node-rs/argon2` — 관리자 비밀번호 해싱(argon2id). Node 런타임(로그인 라우트)에서만 사용.
- `zod` — 요청 바디 검증 스키마. 클라이언트(시작 폼)·서버(`/api/sessions`) 공유(공통 사항).

## 스코프 제외 (YAGNI)

- **PIPA 보호자 동의·보존정책·접근 로그(C-1)** — 이번 배치 목록에 없음. 별도 논의 필요
  (법적 검토 동반). 본 스펙은 기술적 하드닝에 한정.
- per-admin 개별 계정 — 세션 토큰에 nonce(폐기 가능)까지만. 다계정 체계는 제외.
- 자동 마이그레이션 러너 도입 — 스키마 변경(FK cascade)은 신규 마이그레이션 SQL로 추가하되
  실행은 기존 수동 방식 유지(도구 도입은 별도).

## 공통 — zod 검증 스키마 공유

`lib/schema.ts` 신설. `zod`로 시작 폼/세션 생성 입력 스키마를 정의하고:
- 클라이언트(`app/page.tsx`): 제출 전 검증(기존 `validate.ts` 개별 함수 호출 대체 가능하나,
  회귀 최소화를 위해 **`validate.ts`를 zod 스키마 기반으로 재구현**하고 기존 함수 시그니처
  (`validName` 등)는 얇은 래퍼로 유지 → 호출부 무변경).
- 서버(`/api/sessions`): 동일 스키마로 `safeParse` → 단일 진실원. 개별 `if (!validX)` 나열
  (`sessions/route.ts:15-23`)을 스키마 검증으로 축약.
검증 규칙(이름 정규식, 생년월일 YYMMDD, 연락처 등)은 현행 `validate.ts` 규칙을 그대로 옮긴다.

---

## 항목별 설계

### 19. 공개 엔드포인트 인증·검증 (C-2) 🔴

**현상**: `/api/sessions`·`/api/sessions/submit`·`/api/recordings`가 무인증
(middleware matcher는 `/admin`·`/api/admin`만). `submitSession`(`lib/db.ts:42`)이 존재하지
않는 세션ID에도 0행 업데이트 후 성공 반환(`submit/route.ts:23`이 `{ok:true}`). UUID만 알면
임의 세션 덮어쓰기 가능. 세션당·전역 업로드 총량 상한 없음 → 1GB 무료 티어 고갈 가능.

**설계**:
- **세션 스코프 토큰**: `POST /api/sessions`가 세션 생성 후 `sessionToken = HMAC(sessionId, SECRET)`
  (또는 `${sessionId}.${HMAC}`)을 함께 반환. 클라이언트는 이를 `survey-state`에 저장하고
  이후 `/api/recordings`·`/submit` 요청에 동봉(헤더 `x-session-token` 또는 body 필드).
- **검증**: 두 후속 라우트에서 `sessionToken`이 `sessionId`에 대해 유효한지 HMAC 검증.
  불일치 시 401. 이로써 임의 세션 UUID 대상 쓰기 차단.
- **세션 존재 확인**: `submitSession`이 업데이트된 행 수를 확인(`.select()` 반환 활용)해
  0행이면 404 반환. 허위 성공 제거. `/api/recordings`도 업로드 전 세션 존재를 (토큰 검증으로
  사실상) 보장.
- **업로드 총량 상한**: 세션당 총 녹음 건수 상한(예 문항수 × MAX_ATTEMPTS = 18 × 10 = 180
  이내, 그리고 총 바이트 상한)을 `insertRecording` 전에 검사. 초과 시 429/413.
- **레이트리밋**: `/api/sessions` 생성에 IP+시간 창 기반 간단한 레이트리밋(로그인과 유사한
  `login_attempts` 패턴 재사용 또는 별도 카운터). PII 스팸 완화.

### 20. 업로드 MIME 미검증 → 저장형 XSS (C-3) 🔴

**현상**: `recordings/route.ts:29`가 클라이언트가 준 `audio.type`을 그대로 `contentType`으로
저장(`lib/db.ts:48`). allowlist·매직바이트 검증 없음. `text/html`로 스크립트 업로드 후 관리자가
서명 URL을 열면 스토리지 도메인에서 XSS.

**설계**:
- **MIME allowlist**: 허용 `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/aac`, `audio/m4a`
  접두 외에는 거부(400). `audioExt`가 이미 아는 집합과 일치.
- **매직바이트 검증**: 업로드 바이트 앞부분을 확인 — WebM/Matroska(`0x1A45DFA3`),
  MP4(`ftyp` at offset 4), OGG(`OggS`). 미일치 시 거부. 오디오가 아닌 페이로드 차단.
- **저장 Content-Type 고정**: 클라이언트 MIME을 신뢰하지 않고, 검증된 확장자에 대응하는
  **서버가 정한 안전한 Content-Type**으로 저장. (부가로 다운로드 강제 헤더/`Content-Disposition`
  검토 — Supabase 서명 URL 옵션 범위 내에서.)

### 21. 관리자 인증 강화 (C-4) 🔴

**현상**: 비밀번호가 무염 단일라운드 SHA-256(`lib/auth.ts:12`, `login/route.ts:21`). 브루트포스
IP를 클라이언트 조작 가능한 `x-forwarded-for`로 산출(`login/route.ts:10`) → 헤더 랜덤화로 잠금
우회. 실패 카운트가 read-then-write 경쟁조건(`lib/db.ts:74-80`). 세션 토큰에 신원·nonce 없어
서버 폐기 불가.

**설계**:
- **비밀번호 해싱**: `@node-rs/argon2`의 argon2id로 교체. `scripts/hash-password.ts`를 argon2
  해시 생성으로 갱신, `ADMIN_PASSWORD_HASH`에 argon2 인코딩 해시 저장. `login/route.ts`는
  `argon2.verify(hash, password)` 사용. 상수시간 비교는 argon2.verify가 내장.
- **HMAC 상수시간 비교**: `verifyToken`의 `===`를 `crypto.timingSafeEqual`(또는 동등 길이
  보장 후 바이트 비교)로 교체. 로그인 해시 비교도 argon2.verify로 대체되어 해결.
- **신뢰 IP**: 브루트포스 키를 플랫폼이 주입하는 신뢰 가능한 IP로 한정. Vercel의 경우
  `x-forwarded-for`의 **마지막 신뢰 홉** 또는 `x-vercel-forwarded-for`/플랫폼 제공 값을 사용.
  헤더 부재/로컬은 별도 버킷. 병행: **계정 전역 실패 임계**(IP 무관 누적)와 지수 백오프를 추가해
  IP 로테이션 공격 완화.
- **실패 카운트 원자화**: `recordLoginFailure`를 원자적 증가로. Postgres RPC(함수) 또는
  `increment` 패턴(단일 SQL `update ... set fail_count = fail_count + 1 ... returning`,
  없으면 insert)으로 TOCTOU 제거.
- **세션 토큰 폐기 가능화**: 토큰 payload에 랜덤 `jti`(nonce) 포함(`${exp}.${jti}.${HMAC(exp.jti)}`).
  서버 측 유효 nonce 저장소(작은 테이블 또는 단일 "현재 유효 세대" 값)를 두어 로그아웃/무효화
  시 폐기. 최소 구현: 전역 `token_generation` 값을 두고 토큰에 세대를 실어, 세대 불일치 시 무효
  → "모든 세션 로그아웃"이 가능. (per-admin 세션 목록은 스코프 외.)

### 22. 데이터 정합성·신뢰성 🟠

**현상 및 설계**:
- **고아 파일** (`recordings/route.ts:31-33`): 스토리지 업로드 → DB insert 순서라 insert
  실패 시 파일이 남음. → **순서 교정**: 가능한 경우 DB insert(또는 사전 예약 행) 후 업로드,
  또는 insert 실패 시 방금 업로드한 객체를 `remove()`로 정리(보상 트랜잭션). 토큰 검증으로
  대부분의 insert 실패(FK 위반)는 사전 차단됨.
- **FK cascade / 삭제 경로**: 신규 마이그레이션 `005_cascade_and_indexes.sql`에서
  `recordings.session_id`·`writing_answers.session_id` FK에 `ON DELETE CASCADE` 추가.
  세션 삭제 시 스토리지 객체도 지우는 관리자 삭제 함수(`deleteSession`)를 lib에 추가(스토리지
  `remove(prefix)` + DB delete). *관리자 삭제 UI 노출 여부는 Phase 2 범위 외 — 함수만 마련.*
- **허위 성공 제거**: 항목 19의 세션 존재 확인으로 처리.
- **원시 에러 메시지 은닉**: `admin/sessions/route.ts`·`admin/sessions/[id]/route.ts`·
  `recordings/route.ts`가 `(e as Error).message`를 그대로 반환하던 것을, 서버 로그로만 남기고
  클라이언트에는 일반 문구 반환.
- **누락 try/catch**: `sessions/route.ts`·`sessions/submit/route.ts`의 DB 호출을 try/catch로
  감싸 미처리 500 → 일관된 502/500 + 일반 문구.
- **`listSessions` 범위**: Phase 2 조율안(클라이언트 가상화)에 따라 서버 페이지네이션은 보류하되,
  **상한(safety cap)**을 두어(예 최근 N건 또는 최대 행수) 무한 성장에 대한 방어선 추가. cap
  초과 시 로그 경고.
- **durationSec 상한**: `numeric(5,2)` 오버플로(999.99 초과) 방지 위해 라우트에서 상한 검증
  (`item.maxSec` + 여유, 예 ≤ 120) 추가.

---

## 데이터 흐름 (변경 요약)

```
POST /api/sessions → zod.safeParse(body) → createSession → { sessionId, sessionToken }
                     (+ IP 레이트리밋)
survey-state: { ..., sessionToken } 저장
POST /api/recordings → sessionToken HMAC 검증 → MIME allowlist + 매직바이트
                       → (총량 상한) → DB insert → 업로드 (실패 시 보상 정리)
                       → 저장 Content-Type = 서버 고정값
POST /api/sessions/submit → sessionToken 검증 → submitSession(행수 확인, 0행 404)
POST /api/admin/login → argon2.verify → 신뢰 IP 레이트리밋(원자적) → 토큰{exp.jti.HMAC}
verifyToken → timingSafeEqual + 세대(nonce) 유효성
마이그레이션 005: FK ON DELETE CASCADE + 인덱스
```

## 오류 처리

- 클라이언트에는 일반 문구, 서버 로그에 상세. 토큰/검증 실패는 401/400. 스토리지 보상 정리
  실패는 로그 경고(사용자 흐름은 이미 실패 응답).

## 마이그레이션 안전성

- `005`는 `ON DELETE CASCADE` 추가(FK 재정의)와 인덱스 생성만 — 파괴적 아님, 재실행 대비
  `IF NOT EXISTS`/`drop constraint if exists` 사용. 기존 003의 파괴적 패턴을 답습하지 않는다.

## 테스트

- 단위(vitest): zod 스키마(유효/무효 케이스, `validate.ts` 래퍼 동등성), `verifyToken`
  (세대 불일치·만료·위조), 세션 토큰 HMAC 검증, MIME allowlist·매직바이트 판별, durationSec 상한.
- 라우트 테스트: `/api/sessions`(토큰 반환), `/api/recordings`(토큰 없음/위조 401, 잘못된 MIME
  400, 총량 초과 429), `/api/sessions/submit`(존재하지 않는 세션 404), `/api/admin/login`
  (argon2 성공/실패, 잠금, 원자적 카운트).
- 회귀: 정상 아동 흐름(세션 생성 → 녹음 → 제출)이 토큰 경유로 끝까지 동작.

## 완료 기준

19~22 반영 + 위 테스트 통과 + `npm run typecheck` 통과 + 마이그레이션 005 적용 후 정상 흐름
E2E 확인. argon2 도입에 따라 README의 `hash-password`·`ADMIN_PASSWORD_HASH` 안내 갱신.
