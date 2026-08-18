# app/api/sessions/ — 검사 세션 생성

`route.ts`(`POST`) 한 파일. 학급 코드 + 아동 정보를 받아 `sessions` 행을 만들고 **세션 스코프
HMAC 토큰(24시간)** 을 발급한다. 이후 참여자의 모든 쓰기(녹음 업로드·최종 제출)는 이 토큰을
동봉해야 하므로, 참여자 인증 사슬이 시작되는 지점이다.

하위 폴더는 각자 README를 둔다 — [submit/](submit/README.md)(최종 제출),
[verify-code/](verify-code/README.md)(시작 전 학급 코드 확인).

## 설계 의도 · 제약

- **학급 정보를 클라이언트에서 받지 않는다.** 학교·학년·반·담임·연락처는 요청 본문에 없다.
  서버가 `findClassCode(코드)`로 다시 조회해 `createSession`이 세션 행에 복사한다(스펙 2026-08-13).
  화면이 보낸 값을 그대로 저장하면 확인 모달의 표시값을 조작해 아무 학급으로나 기록을 남길 수 있다.
- **아동 식별 두 가지 모드(Task 13, 2026-08-18).** 직접 입력(`name`/`gender`/`birthYmd`를 몸에
  실어 보냄)과 명단 모드(`fromRoster: true` + `code` + `childNo`만)가 `lib/schema.ts`의
  `sessionCreateSchema`(두 스키마의 `z.union`)로 갈린다. 명단 모드는 그 번호를
  `listRoster(classCode.id)`로 찾아 이름·성별·생년월일을 **서버가 복사**한다 — 명단에 있는
  아동을 고른다는 전제에서 이름을 잘못 옮겨 적는 **전사 오류(오타)** 를 없앤다. 신원 위조 자체를
  막는 장치는 아니다 — 위조하려는 클라이언트는 `fromRoster`를 빼고 직접 입력(「명단에 없는
  학생」 폴백) 경로로 보내면 그만이라, 서버 복사는 그 모드를 client가 선택했을 때만 성립하는
  opt-in 보장이다. 명단에 없는 번호는 400. `sessionCreateDirectSchema`가
  `fromRoster: z.undefined().optional()`을 갖고 있어 `fromRoster: true`인 바디는 유니온
  순서와 무관하게 direct 스키마를 절대 통과할 수 없다(코드리뷰 후속, 2026-08-18) — 이 불변식이
  "명단 스키마를 먼저 둔다"는 순서에 기대지 않는다. 그 위에서, `fromRoster: true`에
  `name`/`gender`/`birthYmd`를 함께 실어도(둘 다 자바스크립트 객체라 모르는 키는 조용히
  벗겨진다) 명단 스키마가 통과해 그 필드는 무시된다 — 트랩이 아니라 "명단 모드는 서버 신뢰
  값만 쓴다"는 계약 그대로다.
- **명단 모드도 코드 상태 검사를 함께 받는다.** `classCode.status !== 'active'`(pending)는
  두 모드 모두 미존재 코드와 **같은 404**("코드를 확인해 주세요.")로 처리한다 —
  `verify-code`(Task 12)와 같은 이유로, 승인 여부를 구분해 알려주면 코드 열거에 정보가 샌다.
- **응답의 `grade`가 검사지를 정한다.** 세션의 학년이 곧 양식(`formForGrade`)이고, 양식이
  문항·배점·인쇄 좌표를 전부 결정한다. 클라이언트가 학년을 스스로 고르지 않고 서버 응답을
  쓰는 이유다.
- **법정대리인 동의 확인은 zod 스키마가 게이트다.** `lib/schema.ts`의
  `guardianConsent: z.literal(true)` 때문에 체크하지 않은 요청은 라우트 본문에 닿기 전에 400으로
  떨어진다. 확인 시각(`guardian_consented_at`)은 클라이언트 값이 아니라 `lib/db.ts`가 서버
  시각으로 찍는다 — 감사 증적이므로 요청이 시각을 정하게 두지 않는다.
- **레이트리밋 상한이 `verify-code`보다 빡빡하다.** 여기서 막으려는 것은 스팸 세션 행 생성이고,
  저쪽은 코드 열거다. 위협 모델이 다르니 값도 분리했다(`PUBLIC_RATE_LIMIT` /
  `VERIFY_CODE_RATE_LIMIT`, 근거는 `lib/request.ts` 주석). 인메모리 best-effort라 서버리스
  인스턴스마다 카운터가 따로임을 전제로 한 방어다.
- **`try` 블록이 코드 조회와 세션 생성을 함께 감싼다.** 라벨을 하나로 좁히면 DB 연결 장애를
  "세션 생성 실패"로 오독하게 된다 — 로그 문구를 좁히지 말 것.
- 입력 검증 규칙을 여기 적지 않는다. `lib/schema.ts`의 `sessionCreateSchema`가 단일 소스이고,
  클라이언트 폼도 같은 스키마를 감싼 `lib/validate.ts`를 쓴다.
- `runtime = 'nodejs'`.

## PII

요청 본문에 **아동 실명·생년월일·성별·학급 내 번호**가 들어온다. 응답에는 세션 id·토큰·학년만
담고 아동 정보를 되돌려주지 않는다. 진행 상태(이름·번호 포함)는 화면이 localStorage에 두므로
파기 책임은 `lib/survey-state.ts`와 종료 화면에 있다.

테스트: `tests/sessions-route.test.ts`.
