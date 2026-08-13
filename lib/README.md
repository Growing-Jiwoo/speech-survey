# lib/ — 순수 로직 · 서버 유틸

프레임워크 의존이 얇은 순수 함수/모듈 계층. **화면(components)·라우트(app/api)에 로직을 두지 않고
여기로 추출해 node 환경 vitest로 테스트한다**는 것이 이 저장소의 핵심 관례다(tests/ 참고).

## 도메인

| 파일 | 역할 |
|---|---|
| `items.ts` | `itemsFor(양식)` — 문항(채점 단위)과 **페이지 모델**(화면·녹음·제한시간 단위), 진행률 분모를 양식에서 만든다. 문항은 학년마다 다르므로 모듈 상수가 아니다 |
| `forms/` | 학년별 검사지 정의(문항·배점·제한시간·임시 Pass 기준)와 PDF 스탬핑 좌표. `formForGrade(학년)`으로 조회 — 새 학년은 `g*.ts` + `g*-layout.ts` + 원본 PDF 추가로 끝난다 |
| `survey-flow.ts` | 페이지 게이팅. 중단 규칙(①·②)과 낱말 해독 현장 채점은 담당자 확정(2026-08-13)으로 전면 폐기됐다 — 낱말 해독·문장 읽기유창성은 검사 화면이 수집만 하고 판정·채점은 관리자 결과지가 한다. 다만 쓰기(낱말 쓰기·문장 쓰기)는 예외로, 녹음이 없어 검사 중 검사자가 계속 입력한다(사용자 확정 2026-08-13, `WritingPage.tsx`·`SentenceWritingPage.tsx`). `visiblePages`(연습 실시 여부만 반영)·`canAdvance`(문항 완료 여부로 [다음] 활성화 판단) |
| `scoring.ts` | 배점·합산·Pass/Fail과 **과제별 채점 완료 여부**(`complete`). 배점은 전부 **어절 수**에서 유도한다(`itemMaxWords`) — 검사지 숫자를 옮겨 적지 않는다. 저장된 행을 채점 입력으로 바꾸는 `scoreInputFrom`, **미녹음 페이지를 오반응(X·0점)으로 채우는** `withUnrecordedDefaults`(관리자 화면과 검사지 PDF가 공유)도 여기 |
| `schema.ts` | 세션 생성 입력의 zod 스키마 — **검증 규칙의 단일 소스**(서버 라우트가 사용). 학급 코드 알파벳(`CODE_ALPHABET`)·길이(`CODE_LEN`)도 여기가 단일 소스 — 발급(`class-code.ts`)과 입력 검증이 공유 |
| `class-code.ts` | `generateClassCode()` — 학급 코드 생성(서버 전용, `node:crypto`의 `randomInt`). 알파벳·길이는 `schema.ts`를 import — 여기서 다시 적지 않는다 |
| `validate.ts` | `schema.ts`를 감싼 클라이언트 폼용 boolean 타입가드 파사드 |
| `survey-state.ts` | 참여자 진행 상태의 localStorage 저장/복원. 스키마 버전(`v`)으로 구버전 상태를 폐기한다. **아동 이름을 저장한다**(진행 화면·이어하기 안내용) — 공용 기기에 흔적이 남지 않도록 제출 완료·새 검사 시작·종료 화면에서 반드시 `clearState`로 파기할 것 |
| `adminStats.ts` | 관리자 목록의 KPI·학교별 집계·필터/정렬·URL(searchParams) 직렬화. KST 일자 키(`kstDateKey`) 기준 "오늘" 판정 |

## 서버 전용 (클라이언트 컴포넌트에서 import 금지)

| 파일 | 역할 |
|---|---|
| `supabase.ts` | service role 클라이언트 싱글턴. RLS는 전면 차단이므로 모든 DB/스토리지 접근은 이 경유 |
| `db.ts` | DB/스토리지 접근 함수 전부(세션 생성·녹음 기록·제출·삭제·로그인 레이트리밋·관리자 조회·학급 코드 발급/목록/삭제/조회/중복검사 상태) |
| `env.ts` | 필수 환경변수 로더 — 미설정 시 즉시 throw(fail-fast) |
| `request.ts` | 라우트 공용: `clientIp`(위조 불가 헤더 우선 규칙), `UUID_RE`, `jsonError`, `createRateLimiter`(best-effort 인메모리 IP 레이트리미터), `PUBLIC_RATE_LIMIT`·`PUBLIC_RATE_WINDOW_MS`(공개 엔드포인트 공통 정책값 — `/api/sessions`·`/api/sessions/verify-code`가 숫자를 공유하되 버킷은 라우트마다 독립) |
| `auth.ts` | HMAC 토큰(관리자 쿠키·세션 스코프) 발급/검증 + 상수시간 비교. Web Crypto만 사용(Edge middleware·Node 라우트 공용) |
| `audio-validate.ts` | 업로드 오디오 MIME allowlist + 매직바이트 스니핑(저장형 XSS 차단) |
| `audio-ext.ts` | 저장 파일 확장자 결정(표기용 — 재생은 Content-Type 기준) |
| `pdf/` | 공식 검사지 PDF 스탬핑 — 원본 PDF(`assets/forms/`)에 점수만 얹는다 |
| `consent.ts` | 법정대리인 동의 확인 기록(개인정보보호법 제22조의2) |
| `login-policy.ts` | 관리자 로그인 실패 누적·잠금 정책 |

## 클라이언트 유틸

| 파일 | 역할 |
|---|---|
| `http.ts` | `requestJson/postJson`(던지지 않는 결과형) + `fetchJson`(react-query용) + 네트워크 오류 카피 단일화 |
| `upload.ts` | 녹음 업로드 요청 조립(FormData) — 정상 업로드와 재시도 배너가 공유 |
| `audio.ts` | 녹음 공유 상수(`MIC_MIN_PEAK`)·남은 시간 계산·녹음 오류 분류(순수 단위) |
| `format.ts` | `fmtDuration`(m:ss)·`pad2`·`gradeClassLabel`·`contactLabel`·`examinerLabel`·`sheetDateLabel`(KST 고정) 등 표시 포맷 |
| `platform.ts` | 브라우저·플랫폼 판별(녹음 지원 여부 안내용) |
| `schools.ts` | 지역(시도교육청) 상수와 학교 타입 — 학교 목록 데이터는 `public/schools/*.json` |
