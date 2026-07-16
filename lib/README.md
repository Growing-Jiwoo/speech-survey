# lib/ — 순수 로직 · 서버 유틸

프레임워크 의존이 얇은 순수 함수/모듈 계층. **화면(components)·라우트(app/api)에 로직을 두지 않고
여기로 추출해 node 환경 vitest로 테스트한다**는 것이 이 저장소의 핵심 관례다(tests/ 참고).

## 도메인

| 파일 | 역할 |
|---|---|
| `items.ts` | 검사 문항 정의의 단일 소스(29문항, 코드 상수 — DB 시드 아님). 섹션 라벨·체크리스트 영역·`ITEM_TOTALS`(진행률 분모)·`isRecordingItem` 술어 포함 |
| `schema.ts` | 세션 생성 입력의 zod 스키마 — **검증 규칙의 단일 소스**(서버 라우트가 사용) |
| `validate.ts` | `schema.ts`를 감싼 클라이언트 폼용 boolean 타입가드 파사드 |
| `survey-state.ts` | 참여자 진행 상태의 localStorage 저장/복원. 스키마 버전(`v`)으로 구버전 상태를 폐기하고, PII(이름 등)는 저장하지 않는다 |
| `adminStats.ts` | 관리자 목록의 KPI·학교별 집계·필터/정렬·URL(searchParams) 직렬화. KST 일자 키(`kstDateKey`) 기준 "오늘" 판정 |

## 서버 전용 (클라이언트 컴포넌트에서 import 금지)

| 파일 | 역할 |
|---|---|
| `supabase.ts` | service role 클라이언트 싱글턴. RLS는 전면 차단이므로 모든 DB/스토리지 접근은 이 경유 |
| `db.ts` | DB/스토리지 접근 함수 전부(세션 생성·녹음 기록·제출·삭제·로그인 레이트리밋·관리자 조회) |
| `env.ts` | 필수 환경변수 로더 — 미설정 시 즉시 throw(fail-fast) |
| `request.ts` | 라우트 공용: `clientIp`(위조 불가 헤더 우선 규칙), `UUID_RE`, `jsonError` |
| `auth.ts` | HMAC 토큰(관리자 쿠키·세션 스코프) 발급/검증 + 상수시간 비교. Web Crypto만 사용(Edge middleware·Node 라우트 공용) |
| `audio-validate.ts` | 업로드 오디오 MIME allowlist + 매직바이트 스니핑(저장형 XSS 차단) |
| `audio-ext.ts` | 저장 파일 확장자 결정(표기용 — 재생은 Content-Type 기준) |

## 클라이언트 유틸

| 파일 | 역할 |
|---|---|
| `http.ts` | `requestJson/postJson`(던지지 않는 결과형) + `fetchJson`(react-query용) + 네트워크 오류 카피 단일화 |
| `upload.ts` | 녹음 업로드 요청 조립(FormData) — 정상 업로드와 재시도 배너가 공유 |
| `audio.ts` | 녹음 공유 상수(`MIC_MIN_PEAK`)·남은 시간 계산·녹음 오류 분류(순수 단위) |
| `format.ts` | `fmtDuration`(m:ss)·`pad2` 등 표시 포맷 |
| `schools.ts` | 지역(시도교육청) 상수와 학교 타입 — 학교 목록 데이터는 `public/schools/*.json` |
