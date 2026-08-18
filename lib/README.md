# lib/ — 순수 로직 · 서버 유틸

프레임워크 의존이 얇은 순수 함수/모듈 계층. **화면(components)·라우트(app/api)에 로직을 두지 않고
여기로 추출해 node 환경 vitest로 테스트한다**는 것이 이 저장소의 핵심 관례다(tests/ 참고).

## 도메인

| 파일 | 역할 |
|---|---|
| `items.ts` | `itemsFor(양식)` — 문항(채점 단위)과 **페이지 모델**(화면·녹음·제한시간 단위), 진행률 분모를 양식에서 만든다. 문항은 학년마다 다르므로 모듈 상수가 아니다 |
| `forms/` | 학년별 검사지 정의(문항·배점·제한시간·임시 Pass 기준)와 PDF 스탬핑 좌표. `formForGrade(학년)`으로 조회 — 새 학년은 `g*.ts` + `g*-layout.ts` + 원본 PDF 추가로 끝난다 |
| `survey-flow.ts` | 페이지 게이팅. 중단 규칙(①·②)과 낱말 해독 현장 채점이 전면 폐기됐다 — **근거가 규칙마다 다르다**: 현장 채점 제거는 담당자 확정(2026-08-13), 규칙 ①은 담당자 회신이 근거, **규칙 ②(쓰기 중단)는 사용자 확정(2026-08-13)이며 담당자 재확인이 없다**(파일 상단 주석 참고). 되돌릴 때 무엇을 다시 물어야 하는지가 여기서 갈린다. 낱말 해독·문장 읽기유창성은 검사 화면이 수집만 하고 판정·채점은 관리자 결과지가 한다. 다만 쓰기(낱말 쓰기·문장 쓰기)는 예외로, 녹음이 없어 검사 중 검사자가 계속 입력한다(사용자 확정 2026-08-13, `WritingPage.tsx`·`SentenceWritingPage.tsx`). `visiblePages`(연습 실시 여부만 반영)·`canAdvance`(문항 완료 여부로 [다음] 활성화 판단) |
| `scoring.ts` | 배점·합산·Pass/Fail과 **과제별 채점 완료 여부**(`complete`). 배점은 전부 **어절 수**에서 유도한다(`itemMaxWords`) — 검사지 숫자를 옮겨 적지 않는다. 저장된 행을 채점 입력으로 바꾸는 `scoreInputFrom`, **미녹음 페이지를 오반응(X·0점)으로 채우는** `withUnrecordedDefaults`(관리자 화면과 검사지 PDF가 공유)도 여기 |
| `schema.ts` | 세션 생성 입력의 zod 스키마 — **검증 규칙의 단일 소스**(서버 라우트가 사용). 학급 코드 알파벳(`CODE_ALPHABET`)·길이(`CODE_LEN`)도 여기가 단일 소스 — 발급(`class-code.ts`)과 입력 검증이 공유. 학급 코드 공통 필드는 `classCodeFields`로 분리해 관리자 직접 발급(`classCodeCreateSchema`)과 교사 신청(`applySchema`)이 공유한다 — `.refine()`이 걸리면 `.extend()`가 안 되기 때문. `applySchema`는 직접 발급과 달리 이메일이 필수다(승인 메일이 유일한 코드 전달 경로) |
| `class-code.ts` | `generateClassCode()` — 학급 코드 생성(서버 전용, `node:crypto`의 `randomInt`). 알파벳·길이는 `schema.ts`를 import — 여기서 다시 적지 않는다 |
| `validate.ts` | `schema.ts`를 감싼 클라이언트 폼용 boolean 타입가드 파사드 |
| `survey-state.ts` | 참여자 진행 상태의 localStorage 저장/복원. 스키마 버전(`v`)으로 구버전 상태를 폐기한다. **아동 이름과 번호를 저장한다**(진행 화면·이어하기 안내용) — 공용 기기에 흔적이 남지 않도록 제출 완료·새 검사 시작·종료 화면에서 반드시 `clearState`로 파기할 것 |
| `adminStats.ts` | 관리자 목록의 KPI·학교별 집계·필터/정렬·URL(searchParams) 직렬화. KST 일자 키(`kstDateKey`) 기준 "오늘" 판정 |

## 서버 전용 (클라이언트 컴포넌트에서 import 금지)

| 파일 | 역할 |
|---|---|
| `supabase.ts` | service role 클라이언트 싱글턴. RLS는 전면 차단이므로 모든 DB/스토리지 접근은 이 경유 |
| `db.ts` | DB/스토리지 접근 함수 전부(세션 생성·녹음 기록·제출·삭제·로그인 레이트리밋·관리자 조회·학급 코드 발급/목록/삭제/조회/중복검사 상태). 코드 조회 계열은 `status`(`pending`/`active`)·`applied_at`을 함께 돌려준다 — 승인 전 코드로 검사가 시작되지 않게 호출부가 판단할 근거. 교사 신청 접수는 `insertApplication`(pending 코드 + 명단, `'duplicate'`면 호출부가 새 코드로 재시도) — 부분 삽입을 되돌리는 방식과 그 이유는 함수 docblock이 갖는다. 승인은 `approveClassCode`(pending → active) — `.eq('status','pending')` 한 방으로 멱등을 판정해 `already:true`를 돌려주고, 라우트는 그때 승인 메일을 건너뛴다(더블클릭 재전송 방지). 0건인데 행이 아직 pending이면 던진다 — 승인 안 된 코드를 already로 보고하면 교사가 코드를 못 받는다. 승인 화면이 검토하는 명단은 `listRoster`(번호 순 고정, 읽기 전용) |
| `env.ts` | 필수 환경변수 로더 — 미설정 시 즉시 throw(fail-fast) |
| `request.ts` | 라우트 공용: `clientIp`(위조 불가 헤더 우선 규칙), `UUID_RE`, `jsonError`, `createRateLimiter`(best-effort 인메모리 IP 레이트리미터). 레이트리밋 상한은 라우트마다 위협 모델이 달라 값도 분리했다 — `PUBLIC_RATE_LIMIT`·`PUBLIC_RATE_WINDOW_MS`(`/api/sessions` 전용, 스팸 세션 행 생성 방어)와 `VERIFY_CODE_RATE_LIMIT`·`VERIFY_CODE_RATE_WINDOW_MS`(`/api/sessions/verify-code` 전용, 코드 열거 방어). **다만 둘 다 학교 건물 NAT·다중 PC 동시 검사라는 같은 현장 제약을 받는다** — 한 학급이 컴퓨터실에서 일제히 시작하면 아이 수만큼의 요청이 IP 하나로 몰린다. 상한을 조일 때는 "몇 명이 동시에 시작할 수 있어야 하는가"를 먼저 따질 것(구 값 20이 21번째 아이를 막았다 — 2026-08-15) |
| `auth.ts` | HMAC 토큰(관리자 쿠키·세션 스코프) 발급/검증 + 상수시간 비교. Web Crypto만 사용(Edge middleware·Node 라우트 공용) |
| `audio-validate.ts` | 업로드 오디오 MIME allowlist + 매직바이트 스니핑(저장형 XSS 차단) |
| `audio-ext.ts` | 저장 파일 확장자 결정(표기용 — 재생은 Content-Type 기준) |
| `pdf/` | 공식 검사지 PDF 스탬핑 — 원본 PDF(`assets/forms/`)에 점수만 얹는다 |
| `consent.ts` | 법정대리인 동의 확인 기록(개인정보보호법 제22조의2) |
| `mail.ts` | 메일 발송 단일 창구 + 문구(신청 알림·승인 안내). Resend HTTP API를 `fetch`로 직접 부른다(SDK 미사용). `MAIL_TO_OVERRIDE`가 있으면 수신자를 그 주소로 강제해 실수 발송을 막는다 |
| `login-policy.ts` | 관리자 로그인 실패 누적·잠금 정책 |

## 클라이언트 유틸

| 파일 | 역할 |
|---|---|
| `http.ts` | `requestJson/postJson`(던지지 않는 결과형) + `fetchJson`(react-query용) + 네트워크 오류 카피 단일화 |
| `upload.ts` | 녹음 업로드 요청 조립(FormData) — 정상 업로드와 재시도 배너가 공유 |
| `audio.ts` | 녹음 공유 상수(`MIC_MIN_PEAK`)·남은 시간 계산·녹음 오류 분류(순수 단위) |
| `format.ts` | `fmtDuration`(m:ss)·`pad2`·`gradeClassLabel`·`contactLabel`·`sheetDateLabel`(KST 고정)·`approvalNoticeText`(승인 안내 평문 — `lib/mail.ts`의 `approvedMail`과 **문구를 맞춰 유지할 것**. 필수 정보 누락은 `tests/mail.test.ts`가 두 채널을 대조해 막는다) 등 표시 포맷. 학년/반 드롭다운 선택지(`CLASS_OPTIONS`·`MAX_CLASS_NO`)도 여기가 단일 소스 — 코드 발급 화면과 신청 화면이 공유한다 |
| `birth.ts` | 생년월일 표기 정규화(`2019. 5. 9.`·`19-5-9`·엑셀 날짜 일련번호 → `YYYY-MM-DD`)와 DB 저장형(`YYMMDD`) 변환. 신청 폼이 올린 명단을 이 함수 하나로 모은다 |
| `xlsx.ts` | `.xlsx`에서 표 읽기 — **외부 라이브러리 없이** ZIP(DecompressionStream)+XML 스캐너로. **브라우저에서 파싱해 파일을 서버로 보내지 않는다**(명렬표의 주민등록번호가 서버에 도달하지 않게) |
| `roster.ts` | `parseRosterGrid` — 업로드된 명단 그리드(`xlsx.ts`/붙여넣기)를 **파일 순서 그대로의 고정 4칸 표**(`RosterCells`)로. 열 역할을 짐작하지 않고 **알려진 머리글 이름만 찾으며**, 못 찾으면 거부한다. 못 읽은 칸은 지우지 않고 원문을 남긴다 — 한 칸이 틀렸다고 그 줄의 성별까지 교사가 기억으로 다시 채우게 하지 않기 위함. 줄의 합격 판정은 `badCells`/`toChild`, 번호 중복은 `dupChildNos`이며 화면이 교사의 수정본에도 같은 함수를 쓴다. 주민등록번호는 머리글 이름과 값 모양 양쪽에서 2중으로 걸러 네 칸에 절대 섞이지 않게 한다(`rrnSeen`으로 있었다는 사실만 알림). `cutText`는 탭·콤마 붙여넣기 텍스트를 같은 그리드로 |
| `platform.ts` | 브라우저·플랫폼 판별(녹음 지원 여부 안내용) |
| `schools.ts` | 지역(시도교육청) 상수와 학교 타입 — 학교 목록 데이터는 `public/schools/*.json` |
