# 교사 신청·학급 명단 도입 (Design)

**날짜**: 2026-08-18 · **상태**: 사용자 확정
**전제 스펙**: `2026-08-13-admin-only-scoring-and-class-codes-design.md` (학급 코드·관리자 전담 채점)

지금은 관리자가 학급 코드를 발급해 교사에게 수동 전달하고, 검사 현장에서 교사가 아동마다
이름·성별·생년월일을 타이핑한다. 오타가 그대로 임상 기록이 되고(아동 정보 수정 기능이
생긴 이유), 학급이 늘면 관리자 발급이 병목이 된다.

이 설계는 담당자 제안(2026-08-18, "교사가 신청 링크로 신청 → 알림 → 계정 부여 → 로그인
후 드롭다운으로 아동 선택")을 다음과 같이 조정해 수렴한 것이다:

- **계정 → 학급 코드.** 교사가 얻는 경험(드롭다운 선택)은 동일하고, 인증 시스템·비밀번호
  발급·분실 대응이 전부 사라진다. 교사는 자기 반 결과를 보지 않는 것으로 확정됐으므로
  (담당자 확정 2026-08-18) 계정이 정당해지는 시나리오가 없다.
- **자동 승인 → 승인 버튼 + 자동 발송.** 담당자는 "1명이라도 신청하면 자동 발송"을 원했
  으나, 공개된 신청 링크가 자동 승인과 결합하면 남의 메일로 반복 신청해 우리 도메인을
  스팸 발송기로 만들 수 있다(도메인 평판 훼손 → 진짜 교사 메일이 스팸함행). 발송만
  자동화하고 승인은 관리자가 버튼으로 한다 — 관리자 부담은 신청당 클릭 한 번이다.

## 확정 흐름 (4단계)

```
① 공문·홈페이지에 신청 링크(/apply) 공유
② 교사: 학급 정보 + 명단 파일 업로드 + 동의 체크 → 신청 (pending, 코드 비공개)
③ 관리자: 알림 메일 → /admin/codes [승인] → 교사에게 코드 안내 메일 자동 발송
④ 교사: 검사 시작 화면에서 코드 입력 → 아동 드롭다운 선택 → 정보 확인 → 검사
```

## 데이터 모델

### class_codes 확장 (마이그레이션 003)

```sql
alter table class_codes add column status text not null default 'active'
  check (status in ('pending', 'active'));
alter table class_codes add column applied_at timestamptz;  -- 신청 시각(직접 발급은 null)
```

- `default 'active'` — 기존 행·관리자 직접 발급(CodeIssuer)은 동작이 변하지 않는다.
  직접 발급 경로는 유지한다(신청 없이 전화로 받아 발급하는 경우).
- 신청 경로만 `pending`으로 생성하고, 승인이 `active`로 바꾼다.
- **거절 = 행 삭제**(별도 상태·거절 메일 없음 — 사용자 확정). 스팸에 회신하면 유효 주소를
  확인시켜 역효과이고, 실수 신청은 다시 하면 된다. `sessions.class_code_id`가
  `on delete restrict`이므로 세션이 생긴 코드는 지울 수 없는데, pending은 세션이 생길 수
  없어(verify-code가 거부) 항상 지울 수 있다 — 제약이 자연스러운 안전장치다.

### class_roster 신설

```sql
create table class_roster (
  id            uuid primary key default gen_random_uuid(),
  class_code_id uuid not null references class_codes(id) on delete cascade,
  child_no      int  not null check (child_no between 1 and 99),
  child_name    text not null,
  gender        text not null check (gender in ('남','여')),
  birth_ymd     char(6) not null check (birth_ymd ~ '^[0-9]{6}$'),
  unique (class_code_id, child_no)
);
alter table class_roster enable row level security;  -- 정책 없음 = anon 전면 차단(관례)
```

- 제약은 `sessions`의 같은 컬럼과 동일 규칙 — 명단→세션 복사가 어긋날 수 없다.
- `unique (class_code_id, child_no)` — 파서가 먼저 거르지만 DB가 최종 방어선.
- `on delete cascade` — 거절(삭제) 즉시 아동 실명 명단도 함께 사라진다(PII).
- **sessions는 변경 없음.** 세션 생성 시 roster 값을 복사한다(비정규화 — 코드→세션 복사와
  같은 원칙: 명단을 나중에 고쳐도 이미 검사한 세션은 검사 당시 값을 유지).
- 명단 사후 수정 화면은 만들지 않는다(YAGNI). 잘못 올린 학생은 검사하지 않으면 그만이고,
  빠진 학생은 검사 화면의 직접 입력 경로가 받는다.

### PII 정리 (README 운영 절에 추가 — 자동 실행 아님)

방치된 pending 신청(스팸 포함)에 아동 실명이 남으므로, 기존 세션 파기·login_attempts
정리와 같은 **수동 청소 쿼리** 예시를 운영 문서에 둔다:

```sql
delete from class_codes where status = 'pending' and applied_at < now() - interval '30 days';
```

## 신청: /apply (공개) + POST /api/apply

- 입력: 학교(SchoolPicker)·학년·반·성함·연락처(CodeIssuer와 같은 요소) + 명단 + 동의 체크 3종.
- 명단은 **파일 업로드**(.xlsx/.csv)만 받는다. lib/xlsx로 **브라우저에서 파싱**해 4개
  필드만 서버로 보낸다 — 명렬표에 주민등록번호가 있어도 서버에 도달하지 않는다.
- 업로드 결과는 **고정 4칸 표**(번호·이름·성별·생년월일)로 보여주고 셀 단위 수정 후 제출.
  열 역할 추론은 하지 않는다 — 알려진 머리글 이름만 찾고, 못 찾으면 거부하고 양식을
  안내한다(자유도를 열면 케이스가 폭발한다 — 프로토타입으로 확인).
- 명단 파싱·검증 로직은 `lib/roster.ts`로 추출한다(화면 로직 lib 추출 관례).
  주민번호는 2중 차단: 머리글로 열을 안 읽고, 값 패턴이 보이면 그 칸을 버린다.
- 서버: zod 검증(행 1~99개, 번호 중복 금지) → 코드 생성 → class_codes(pending) +
  class_roster 삽입 → 관리자 알림 메일(applyNoticeMail). **메일 실패해도 신청은 성공**
  (sendMail이 결과형인 이유). 알림 수신 주소는 env `ADMIN_NOTIFY_EMAIL`(없으면 발송 생략).
- 완료 화면은 "승인되면 메일로 학급 코드를 보내드립니다" — **코드는 보여주지 않는다.**
  승인 메일이 유일한 전달 경로여야 승인이 실제 관문이 된다.
- 공개 쓰기 라우트이므로 lib/request.ts에 전용 레이트리밋 상한을 둔다.
- 동의 체크 3종: ① 교사 본인 개인정보 수집 동의 ② 절차 안내 확인 ③ "보호자 서면 동의를
  받은 아동만 등록했습니다". **아동 개인정보·연구 활용 동의는 여기서 받을 수 없다** —
  교사는 보호자의 대리인이 아니다. 그것은 가정통신문(서면)의 몫이다.

## 승인: /admin/codes 확장

- 목록에 pending을 위로 구분 표시 + 명단 펼쳐보기(읽기 전용, 승인 판단용).
- `POST /api/admin/codes/[id]/approve` — active 전환 + approvedMail 발송.
  이미 active면 no-op(멱등). **메일 실패 시 승인은 유지**하고 화면에 실패를 표시,
  [안내 문구 복사] 버튼을 예비 경로로 둔다(코드+주소+안내가 채워진 문구).
- 삭제(거절): 기존 DELETE 라우트의 허용 조건을 "세션 0건"에서 "pending 또는 세션 0건"으로.

## 검사 시작: / 개편 + verify-code·sessions 확장

- verify-code 응답에 roster를 추가: `[{childNo, name, gender, birthYmd, tested}]`.
  `tested`는 기존 childTestState와 같은 판정. **pending 코드는 404와 같은 문구로 거부**
  (코드 존재 여부를 구분해 알려주지 않는다 — 열거 방지 관례).
- 화면: 코드 입력 → "1번 유해림 (여)" 드롭다운(검사한 아이는 표시하되 선택 허용 —
  재검사 경고 유지) → 보호자 동의 체크 → 확인 모달(이름·성별·생년월일) → 시작.
- **「명단에 없는 학생이에요」** → 기존 입력 폼이 그대로 열린다(예비 경로 — 신청과 검사
  사이에 전학생·늦은 동의서가 생긴다. 담당자 확정 2026-08-18).
- POST /api/sessions를 union 스키마로: 명단 모드 `{code, childNo, guardianConsent}` /
  직접 입력 모드(기존 전체 필드). 명단 모드에서는 **서버가 roster에서 찾아 복사**한다 —
  클라이언트가 보낸 이름·생년월일을 믿지 않는다.
- roster가 빈 학급(직접 발급 코드)은 드롭다운 대신 기존 입력 폼을 보여준다 —
  **직접 발급 코드는 지금과 동작이 동일**하므로 회귀가 없다.

## 오류 처리

| 상황 | 처리 |
|---|---|
| 파일이 xlsx/zip 아님 | 거부 + 안내. zip인데 `Index/Document.iwa`가 있으면 **Numbers 파일** — "파일 › 보내기 › Excel로 저장" 안내(실제 겪은 사례) |
| 명단에 오류 행 잔존 | [신청하기] 잠금(행별 오류 표시) |
| /api/apply 행 일부 위반 | 전체 400 — 부분 저장 없음(반쪽 명단이 승인되는 사고 방지) |
| 관리자 알림 메일 실패 | 신청 성공 유지, 로그만(화면 배지가 예비 채널) |
| 승인 메일 실패 | 승인 유지 + 화면 표시 + 안내 문구 복사 예비 경로 |
| pending 코드로 검사 시도 | "코드를 확인해 주세요"(404와 동일 문구) |
| 명단에 없는 childNo로 세션 생성 | 400 → 직접 입력 경로 유도 |

## 테스트 전략 (node 환경 관례)

- `apply-route.test.ts` — 스키마 거부(0행·100행·중복 번호), pending 생성, 메일 실패에도
  성공, 레이트리밋, roster 삽입 실패 시 코드 행 롤백
- `admin-codes-route.test.ts` 확장 — approve 멱등성, pending 삭제 허용
- `verify-code-route.test.ts` 확장 — pending 404, roster 포함, tested 판정
- `sessions-route.test.ts` 확장 — 명단 모드(서버 복사·클라이언트 값 무시), 직접 입력 회귀
- `roster.test.ts` — lib/roster 파싱·검증(fixtures의 실제 xlsx 4종 + 주민번호 차단)

## 구현 분할

| PR | 내용 | 근거 |
|---|---|---|
| A | 마이그레이션 003 + lib/roster + /apply + POST /api/apply | 승인 화면 없이는 코드가 안 나가므로 단독 배포 안전 |
| B | /admin/codes 대기·승인·삭제 + 승인 메일 | A와 합쳐 신청~승인 완결 |
| C | / 드롭다운 + verify-code·sessions 확장 + 예비 경로 | 아동 검사 진입 화면이라 마지막에 단독 |

기반은 이미 있다(feat/apply-foundation): lib/birth(35 tests)·lib/xlsx(8 tests, 실파일
fixtures)·lib/mail(11 tests, 샌드박스 실발송 확인 2026-08-18).

## 미확정 대기 (구현을 막지 않음)

| 항목 | 경로 |
|---|---|
| 동의·안내 문구 3종 | 담당자 예시 → 연구윤리 확정본 순으로 교체(lib/consent.ts 상수) |
| 메일 문구 2종 | 같은 경로(lib/mail.ts의 함수 2개만 교체) |
| 진짜 나이스 내려받기 파일 | tests/fixtures/README.md 참고 — 실물 확보 시 표본 교체·검증 |
| 신청 링크 도메인 | `읽기검사.kr` 등록 가능 확인됨 — 공문 게재 전 구매 필요 |
| 연구 동의(가정통신문 개정) | **별도 트랙** — 녹음이 연구에 필요하므로 보호자 별도 동의 필수, 소급 불가라 첫 검사 전에 완료돼야 함. 이 스펙 범위 밖 |
