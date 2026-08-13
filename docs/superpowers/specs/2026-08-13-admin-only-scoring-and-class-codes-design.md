# 관리자 전담 채점 전환 + 학급 코드 발급 (Design)

**결정**: 2026-08-13 담당자(해림) 회신과 사용자(지우) 추가 협의로 두 가지가 확정됐다.

1. **검사 중에는 아무도 판정하지 않는다** — 검사자 현장 채점과 중단 기능(즉시 중단·사후
   판정 포함)을 전부 제거하고, 채점은 관리자 결과지에서만 한다.
2. **시작 폼을 학급 코드 방식으로 교체한다** — 관리자가 학급 정보를 미리 입력해 코드를
   발급하고, 검사 현장에서는 코드 + 아동 정보만 입력한다.

구현은 PR 2개로 나눈다(건드는 파일이 거의 겹치지 않는다): **PR A** 중단·현장채점 제거,
**PR B** 학급 코드 + 전화번호 정규화. 스펙은 이 문서 하나다.

## 확정 경위와 출처

담당자 회신 원문(2026-08-13, 카카오톡):

> "어차피 녹음파일을 받고 관리자가 채점 후 결과서가 나오는 시스템이라면 **검사자가
> 채점하지는 않아도 될 것 같아!**"

> "3개 연속 틀리면 검사 중단하려고 했던게 아동이 힘들지 않았으면~ 이었거든? (…) \[읽다가
> 멈추면 그때까지 녹음이 저장되는 게\] 가능하다면 **3개연속 틀렸을때~~ 이런 가정이
> 필요없을 것 같아!**"

담당자가 "가능하냐"고 물은 동작(읽다가 멈추면 그때까지 녹음 저장)은 이미 구현돼 있다 —
`hooks/useRecorder.ts`의 `stop()`이 제한시간 자동 종료와 같은 경로로 Blob을 만든다.
새로 만들 것이 없고, 중단 규칙의 존재 이유(아동 보호)가 "아동이 스스로 멈춘다"로 대체된다.

| 결정 | 출처 |
|---|---|
| 검사자 현장 채점(의미 낱말 O/X) 제거 | 담당자 확정(2026-08-13) |
| 즉시 중단 기능 제거 | 담당자 확정(2026-08-13) |
| 규칙 ①을 **채점 규칙으로도 완전 폐기** — 읽은 건 전부 산입 | 담당자 회신("가정이 필요없을 것 같아")이 근거, 폐기 범위(사후 채점 파생까지)는 사용자 확정(2026-08-13) |
| 규칙 ②(쓰기 중단)도 제거 | 사용자 확정(2026-08-13) — ⚠️ 2026-08-11 담당자 확정을 뒤집는다. "즉시 중단 기능 제거"를 문자 그대로 적용한 사용자 판단이며, 담당자에게 별도 재확인하지 않았다. 되돌아볼 일이 생기면 이 지점부터 물을 것 |
| 쓰기 과제의 검사자 입력(예/아니오·0·1·2)은 유지 | 사용자 확정(2026-08-13) — 쓰기는 녹음이 없어 검사자 입력이 유일한 채점 경로 |
| 미녹음 기본채점(X·0점)은 유지 | 기존 규칙 그대로(사용자 확정 2026-08-12) — 중단과 무관한 별개 규칙 |
| 학급 코드 발급 흐름 | 사용자 제안, 담당자 승낙(2026-08-13) |
| 학년·반은 코드 발급 시 입력, 검사자 구분(교사/전문가) 제거, 동의 체크는 검사 페이지 유지 | 사용자 확정(2026-08-13) |
| 전화번호는 하이픈 제거해 저장, placeholder도 하이픈 없이 | 사용자 확정(2026-08-13) |
| 기존 데이터 호환 불필요 — 배포 전 DB 전체 리셋 | 사용자 확정(2026-08-13). 파괴적 마이그레이션 허용 |

**검사지 인쇄 문구와의 거리가 더 벌어진다.** 검사지에는 중단 규칙이 인쇄돼 있으나 이제
아예 적용하지 않는다. 시행 절차는 담당자 회신이 인쇄 문구를 이긴다는 기존 원칙(CLAUDE.md
규칙 2)의 연장이며, README "문항 구성" 절과 CLAUDE.md를 이 스펙과 같은 커밋 흐름에서 개정한다.
결과지를 받는 학교·임상가에게 미적용을 알릴지는 운영 이슈로 담당자에게 위임한다(코드 밖).

---

# PR A — 중단·현장채점 제거

원칙: **검사 화면은 수집만 한다.** 아동이 힘들면 녹음 버튼을 다시 눌러 멈추고(그때까지
읽은 부분이 저장된다 — 기존 동작), 판정·채점·해석은 전부 관리자 결과지에서 한다.

## 지워지는 것

| 계층 | 파일 | 내용 |
|---|---|---|
| 검사 화면 | `components/survey/MarkPage.tsx` | 파일 삭제 (유일한 렌더처는 `app/survey/page.tsx`) |
| | `lib/items.ts` | `p_rw_meaning_mark` 페이지 생성 제거, `'검사자 확인 (의미 낱말 채점)'` 라벨 제거 |
| | `app/survey/page.tsx` | `CEILING_COPY`·중단 모달 2종·`maybeWritingCeiling`·`marks` patch·"모두 아니오" 재판정 안전장치·모달 확인 시 `keepImplementedWriting` 절삭 제거 |
| | `components/survey/WritingPage.tsx` `SentenceWritingPage.tsx` | 중단 후 문항 잠금(disabled) 제거 |
| 흐름 로직 | `lib/survey-flow.ts` | `CEILING_N`·`hitsCeiling`·`readingCeilingHit`·`writingCeilingHit`·`isWritingWrong`·`keepImplementedWriting`·`requiredWritingCodes` 삭제. `visiblePages`는 연습 제외 필터만 남는다. `canAdvance`의 `markDone` 분기 제거, 쓰기 완료 조건은 전 문항 입력 |
| 로컬 상태 | `lib/survey-state.ts` | `marks` 필드 제거 → `SCHEMA_V` 올림(불일치 로드는 기존 관례대로 폐기) |
| 검토 | `app/review/page.tsx` | 채점 배지(`{marked}/{items.length}`)·"문장 읽기유창성이 생략되었습니다" 안내·② 분모 축소 제거. 제출 페이로드에서 `marks` 제거 |
| 서버 | `app/api/sessions/submit/route.ts` | `marks` 검증·저장, `keepImplementedWriting` 절삭, `discontinued` 파생 제거 |
| | `lib/db.ts` | `submitSession`에서 `marks`·`discontinued` 인자 제거(`reading_marks` upsert는 관리자 scores 경로만 남는다). `SessionRow`·`SESSION_COLS`에서 `discontinued_at` 제거 |
| 채점 | `lib/scoring.ts` | `discontinued` 파생(`discReading`/`discWriting`)과 `ScoreResult.discontinued` 삭제 — 저장된 marks·쓰기 답은 전부 산입. `withUnrecordedDefaults`의 중단 분기 제거(제출된 세션의 미녹음 페이지는 의미·무의미·문장 전부 X·0으로 채운다) |
| 관리자 | `components/admin/ResultSheet.tsx` | 사후중단(`retroData`/`retroDisc`) 상태·확인 모달·설명 배너·중단 성립 O/X의 모달 게이트 제거 |
| | `components/admin/sheet/*` | `Subtotal`·`ScoreBand`의 `중단` 배지, `PageAudio`의 `미실시` 분기, `WordScoreRows`·`SentenceRows`의 중단 잠금, `WritingChips`·`SentenceWriteRows`의 미실시 표기, `BadgeLegend`의 중단 항목 제거 |
| | `components/admin/AdminDetailView.tsx` `lib/adminStats.ts` | 진행률 분모의 중단 4조합(`expectedTotalsFor`) 제거 — 분모는 양식 상수(rec 6, write G1 10 / G2 5)로 환원 |
| PDF | `lib/pdf/stamp-sheet.ts` | 소계·총점의 `!discontinued` 조건 제거 — `complete` 하나로 환원 |
| DB | `supabase/migrations/014_drop_discontinued.sql` | `sessions.discontinued_at` drop (데이터 리셋 예정, 재실행 안전하게 `if exists`) |

## 남는 것

- **`reading_marks` 테이블** — 이제 관리자 채점 전용 저장소다. 검사자 쪽 쓰기 경로
  (`submitSession`)만 끊기고, 관리자 scores 라우트의 upsert는 그대로다.
- **쓰기 과제의 검사자 입력 전체** — `WritingPage`/`SentenceWritingPage`와 제출·저장 경로,
  관리자 화면의 읽기 전용 표시 모두 유지.
- **미녹음 기본채점** — `withUnrecordedDefaults`. 중단과 별개 규칙(검사지 명문 "제한시간 내
  읽지 못한 낱말은 0점").
- **`ScoreResult`의 나머지 전부** — Pass/Fail·`complete`·`overridable`(쓰기 PDF 예외) 등.

## 문구 조정

`components/survey/ReadingPage.tsx`의 녹음 완료 후 안내 "다시 하려면 버튼을 눌러 주세요"는
아동이 중간에 포기하고 멈춘 경우 재시도를 권하는 것처럼 읽힌다. 이제 "스스로 멈추기"가
공식 경로이므로, 완료·포기 어느 쪽에도 어색하지 않게 고친다:
**"다 읽었으면 \[다음\]을, 다시 읽으려면 녹음 버튼을 눌러 주세요"** (구현 시 화면 폭에 맞게 다듬는다).

---

# PR B — 학급 코드 발급 + 전화번호 정규화

원칙: **학급 정보는 관리자가 한 번 입력하고, 검사 현장은 아동 정보만 입력한다.**
아동 번호는 학급 내 출석 번호를 뜻한다.

## 흐름

1. 관리자 `/admin/codes`에서 학교(`SchoolPicker` 재사용) + 학년 + 반 + 담임교사명 +
   연락처(전화/이메일 중 하나)를 입력 → **[코드 발급]** → 코드가 크게 표시(복사 버튼).
2. 검사 페이지 `/`에서 코드 + 아동 번호 + 이름 + 성별 + 생년월일 입력, 보호자 동의 체크
   → **[확인]**.
3. 서버가 코드를 조회해 학교명·학년·반·담임·연락처를 반환 → **확인 모달**에 학급 정보와
   아동 번호·이름을 함께 표시 → "맞아요" / "아니에요". 그 번호가 이미 검사됐으면 모달
   문구가 경고형으로 바뀐다(아래 "중복 검사 경고").
4. "맞아요" → 세션 생성 → 검사 시작(마이크 확인부터 기존 흐름 그대로).
5. 제출 후 `/done`에서 [다음 학생 검사하기] → `/`로 돌아가면 **코드는 채워진 채**, 아동
   정보만 비어 있다(아래 "연속 검사").

학년이 코드에서 오므로 G1/G2 양식 결정(`formForGrade`)도 코드가 정한다.

## DB — `supabase/migrations/015_class_codes.sql`

```sql
create table class_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- 6자리, 아래 알파벳
  school_region text not null,
  school_id text not null,
  school_name text not null,
  grade int not null check (grade between 1 and 6),
  class_no int not null check (class_no between 0 and 99),  -- 0 = 단일학급
  teacher_name text not null,
  teacher_phone text,
  teacher_email text,
  check (teacher_phone is not null or teacher_email is not null),
  created_at timestamptz not null default now()
);
-- RLS 정책 없음 = anon 전면 차단 (기존 관례)

alter table sessions
  add column class_code_id uuid not null references class_codes(id) on delete restrict,
  add column child_no int not null check (child_no between 1 and 99);
alter table sessions drop column if exists examiner_type;
```

- **비정규화 복사**(사용자 확정): 세션 생성 시 코드의 학교·학년·반·담임·연락처를 기존
  `sessions` 컬럼에 그대로 복사한다. 관리자 목록·결과지·PDF·통계 읽기 경로가 거의
  무변경이고, 코드를 나중에 고쳐도 이미 만든 세션은 검사 당시 값을 유지한다(임상 기록 관점).
- `on delete restrict` — 세션이 있는 코드는 지울 수 없다. 관리자 화면도 사용 세션 수 0인
  코드에만 삭제 버튼을 낸다.
- 기존 데이터는 리셋 예정이므로 `not null` 즉시 부여·`examiner_type` drop 등 파괴적 변경을
  그대로 쓴다. README 셋업 절의 마이그레이션 목록에 014·015를 추가한다.

## 코드 형식

6자리, 알파벳 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`(혼동 문자 0·O·1·I·L 제외, 31자) —
31^6 ≈ 8.9억 조합. 서버가 `crypto` 난수로 생성하고 unique 충돌 시 재시도(최대 몇 회 후 500).
만료 없음 — 한 학급이 여러 날에 걸쳐 재사용한다. 대소문자는 입력 시 대문자로 정규화한다.

## API

| 라우트 | 인증 | 동작 |
|---|---|---|
| `POST /api/admin/codes` | middleware(관리자 쿠키) | 학급 정보 검증(`classCodeCreateSchema`) → 코드 생성·저장 → 행 반환 |
| `GET /api/admin/codes` | middleware | 발급 목록 + 코드별 사용 세션 수 |
| `DELETE /api/admin/codes/[id]` | middleware | 사용 세션 0건일 때만 삭제(FK restrict가 최종 방어) |
| `POST /api/sessions/verify-code` | 공개 | `{ code, childNo }` → 학교명·학년·반·담임·연락처 + `alreadyTested`(`'submitted'` / `'inProgress'` / `null`) 반환. **검사한 번호 목록은 반환하지 않는다** — 물어본 그 번호에 대해서만 답한다(아래 "중복 검사 경고"). 기존 세션 생성과 같은 IP 레이트리밋을 적용해 코드 열거를 막는다. 미존재 코드는 404 "코드를 확인해 주세요" |
| `POST /api/sessions` | 공개(레이트리밋 기존 유지) | 입력이 `{ code, childNo, name, gender, birthYmd, guardianConsent }`로 바뀐다. **서버가 코드를 다시 조회해 학급 정보를 복사한다** — 클라이언트가 보낸 학급 정보는 받지 않는다 |

관리자 라우트는 기존 패턴 그대로: 인증 코드 없음(middleware 전담), `jsonError` 통일,
데이터 접근은 `lib/db.ts` 함수 경유(코드 CRUD·코드 조회 함수 추가, `SessionRow`·`SESSION_COLS`에
`class_code_id`·`child_no` 반영), 클라이언트는 `hooks/useAdminQueries.ts`에 쿼리 키 추가.

## 화면

**`/admin/codes`** — 서버 컴포넌트 + `Suspense` + `LoadingOverlay`, 로직은
`components/admin/CodeIssuer.tsx`(`'use client'`) — 기존 `app/admin/page.tsx` 패턴 복제.
발급 폼(위 필드) + 발급 목록 테이블(코드·학교·학년/반·담임·연락처·발급일·세션 수·삭제).
`AdminDashboard`에 진입 링크를 단다. 로그아웃 시 캐시 비우기 원칙 유지.

**`/` (시작 페이지 재작성)** — 필드: 코드(6자, 대문자 자동 변환)·아동 번호(1~99)·이름·성별·
생년월일·보호자 동의 체크. 기존 폼의 학교 선택·학년·반·담임·연락처·검사자 구분은 제거된다.
개인정보 고지 + 동의 체크는 그대로 검사 페이지에 남는다(만 14세 미만, 법정 필수).
[확인] → verify-code → 확인 모달(기존 `ConfirmDialog` 재사용):

```
○○초등학교 1학년 2반 (담임 김□□ · 01012345678)
3번 이△△ 학생의 검사를 시작할까요?
[아니에요]  [맞아요, 시작하기]
```

"맞아요" → `POST /api/sessions` → 기존과 동일하게 localStorage 상태 생성 후 `/survey` 이동.
`lib/consent.ts`의 수집 항목 고지 문구는 수집 주체가 갈라진 것(담임 연락처는 관리자가 입력)을
반영해 필요 시 다듬는다.

## 연속 검사 — 학급 코드 기억

한 학급 25명을 연달아 검사하면 코드는 25명 내내 같은 값인데, 지금 구조로는 **매번 다시
쳐야 한다.** 제출이 끝나면 `clearState()`가 localStorage를 비우기 때문이다(공용 기기에 앞
아이의 세션 흔적을 남기지 않으려는 의도된 동작이며 그대로 둔다).

**학급 코드만 별도 키에 저장한다.** `clearState()`가 지우는 진행 상태(`kodys-survey:<sessionId>`)와
분리해, 제출 후 `/`로 돌아왔을 때 코드 칸이 채워진 채로 시작한다.
`app/done/page.tsx`의 기존 [처음 화면으로] 버튼 문구를 "다음 학생 검사하기"로 바꾼다.

**저장 시점은 세션 생성 성공 직후다** — 코드 하나만 유지하며 새 코드가 이전 것을 덮어쓴다.
입력 중에는 저장하지 않는다(오타·미완성 코드가 남으면 안 된다). 새 코드를 쳤다가 확인
모달에서 [아니에요]를 누르면 검사가 시작되지 않았으므로 **이전 코드가 그대로 남는다.**

**기억하는 것은 코드뿐이다.** 이름·아동 번호·성별·생년월일은 남기지 않는다 — 아동 개인정보가
공용 PC에 잔류하고, 자동으로 채워지면 앞 아이의 값이 다음 아이에게 딸려 들어간다. 코드는
개인정보가 아니라 학급을 가리키는 6자리이고, 다른 학급 코드가 남아 있어도 확인 모달의
학교·학년·반 표시에서 걸러진다.

PC 여러 대로 나눠 검사해도 각 PC가 자기 코드를 기억하므로 그대로 유효하다(PC 3대면 코드
입력이 25번에서 3번으로 준다).

## 전화번호 정규화

- `lib/schema.ts`: 전화 필드에 zod `transform`으로 **하이픈 제거 후 저장**. 입력 검증은
  하이픈 유무 모두 통과(현행 `PHONE_RE` 유지 또는 제거-후-검증으로 단순화).
- placeholder: `010-1234-5678` → **`01012345678`**.
- 입력 지점은 이제 관리자 코드 발급 폼 하나뿐이다. 표시(관리자 목록·결과지·확인 모달)는
  저장값 그대로(하이픈 없음).

## 아동 번호

1~99 정수. **같은 코드에 같은 번호의 중복 생성을 막지 않는다** — 재검사가 실제로 있다.
대신 아래 경고를 띄운다. 관리자 세션 목록과 결과지 헤더에 아동 번호를 표시한다.
검사지 PDF 양식에는 해당 칸이 없어 찍지 않는다.

## 중복 검사 경고

한 학급을 여러 날에 걸쳐, 또는 PC 여러 대로 나눠 검사하면 누가 이미 끝났는지 놓치기 쉽다.
PC 여러 대일 때는 각 PC가 서로를 볼 수 없어 **서버가 유일한 공유 진실**이 된다.

`verify-code`가 물어본 번호에 대해서만 `alreadyTested`를 돌려주고, 값이 있으면 확인 모달의
문구가 바뀐다:

```
3번은 이미 검사했어요.
○○초등학교 1학년 2반 · 3번 이△△
다시 검사할까요?
[아니에요]  [네, 다시 검사할게요]
```

막지 않는다(재검사 허용). 다만 강조를 [아니에요] 쪽에 둬서 무심코 넘어가지 않게 한다.

**번호 목록은 화면에 띄우지 않는다.** 시작 화면은 아동이 앉아 있는 PC이고, 학급 안에서
번호는 사실상 이름이라 "1·2·5번 완료"는 다른 아이의 정보를 노출한다. 검사자는 목록을 보고
다음 아이를 고르는 것이 아니라 — 눈앞의 아이가 몇 번인지 이미 알고 친다 — 필요한 답은
"이 번호, 이미 했나?" 하나뿐이다. 목록을 빼면 공개 API로 학급 명단을 열거하는 경로도 함께
사라진다.

`'inProgress'`(시작했으나 미제출)는 **완벽한 판정이 아니다.** 며칠 전 중간에 끊긴 세션도
계속 진행 중으로 보여, 실제로는 다시 검사해야 할 아이를 "누가 하고 있나 보다" 하고 건너뛸
수 있다. 시간 기준으로 거를 근거가 아직 없으므로 단순하게 두고, 실사용에서 문제가 되면
그때 다듬는다. 두 PC가 같은 순간에 같은 번호를 시작하는 경쟁 조건도 서로를 보지 못한다 —
중복 생성을 막지 않기로 한 이상 감수하는 부분이며, 육안으로 놓치는 대부분의 경우를 잡는
것으로 충분하다.

## 하지 않는 것

- **결과지 "미실시" 라벨 재설계** — 규칙 ① 폐기로 "실시했는데 미실시로 찍히는" 문제
  자체가 소멸했다(검토 문서 4장 a/b/c는 발송 불요).
- **코드 만료·비활성화** — 요구 없음. 필요해지면 컬럼 하나 추가로 끝난다.
- **아동 번호 중복 방지 제약** — 위 참조. 경고만 하고 막지 않는다.
- **아동 번호 자동 증가(직전 번호 +1)** — 검토했으나 **채택하지 않는다.** PC마다 자기가 마지막에
  검사한 번호만 알아서, PC A가 3번을 끝낸 사이 PC B가 4번을 진행 중이면 A가 다시 4번을
  제안한다. 자동으로 채워진 값은 검사자가 자기가 친 값보다 덜 의심하므로, 아동 기록이 다른
  아이 번호로 들어갈 위험을 한 글자 덜 치는 편의와 맞바꿀 수 없다.
- **검사한 번호 목록 표시** — 위 "중복 검사 경고" 참조. 아동 노출·명단 열거 때문에 제외.
- **검사자용 "힘들어하면 멈춰도 된다" 화면 안내** — 중단 규칙 폐기로 아동 보호가 검사자
  재량으로 넘어가므로 화면 안내를 제안했으나, 사용자 확정(2026-08-13)으로 넣지 않는다.
  시행 안내·검사자 교육으로 다룰 영역이다.
- **검사지 PDF 양식 변경** — 아동 번호 칸 추가 등은 하지 않는다. 양식은 검사지가 기준.
- **3~6학년 대응** — 검사지 미수령, G1 폴백 그대로.
- **기존 세션 데이터 마이그레이션** — 배포 전 DB 리셋(사용자 확정).

---

# 테스트

**기대값이 바뀌거나 삭제되는 것** (PR A)

- `tests/survey-flow.test.ts` — 중단 규칙 ①·②·`visiblePages` 게이팅·`keepImplementedWriting`·
  `requiredWritingCodes` 케이스 전부 삭제. 연습 제외 필터와 `canAdvance`(쓰기 전 문항 기준)는 유지·보강
- `tests/scoring.test.ts` — `discontinued` 파생 케이스 삭제. "marks·쓰기 답 전부 산입" 케이스로 교체
- `tests/submit-route.test.ts` — marks 검증·discontinued 저장 케이스 삭제. marks 없는 페이로드가 정상 경로
- `tests/adminStats.test.ts` — 분모 4조합 삭제, 상수 분모 확인
- `tests/survey-state.test.ts` — `SCHEMA_V` 올림·`marks` 제거 반영

**새로 덮는 것** (PR B)

- `classCodeCreateSchema` — 전화 하이픈 제거 transform(하이픈 있는 입력 → 없는 저장값),
  전화/이메일 중 하나 필수, 학년·반 범위
- 코드 생성 — 알파벳·길이·혼동 문자 부재, unique 충돌 재시도
- `POST /api/admin/codes`·`GET`·`DELETE` — 검증 실패 400, 사용 중 코드 삭제 거부,
  내부 문구 비노출(기존 단언 스타일)
- `POST /api/sessions/verify-code` — 정상 조회·미존재 404·레이트리밋 429,
  `alreadyTested`가 제출 세션에 `'submitted'`·미제출 세션에 `'inProgress'`·없으면 `null`,
  **응답에 다른 번호가 새지 않는다**(목록 미반환 회귀 핀)
- `POST /api/sessions` — 코드 미존재 시 실패, 학급 정보가 코드에서 복사됨(클라이언트 값 무시),
  `child_no` 범위 검증, `guardianConsent: true` 리터럴 유지
- 코드 기억 — 제출 후 진행 상태 키는 지워지고 코드 키는 남는다. 아동 정보(이름·번호·성별·
  생년월일)는 **어느 키에도 남지 않는다**(공용 PC 잔류 회귀 핀). `lib/survey-state.ts`의
  순수 함수로 추출해 node 환경에서 검증

테스트 관례 그대로: node 환경 vitest, 화면 로직은 lib 추출, 라우트는 `vi.mock('@/lib/db')`,
인증은 실물 토큰.

# 문서 갱신 (같은 커밋 흐름)

- `README.md` — 화면 흐름 표(시작 페이지 설명), "문항 구성"의 중단 규칙 절 폐기 반영,
  "미실시·미녹음" 절에서 중단 행 제거(미녹음 기본채점 행은 유지), 셋업 마이그레이션 목록에
  014·015 추가, E2E 체크리스트 개정
- `CLAUDE.md` — 규칙 2의 "중단 규칙 예외" 문구를 "시행 절차는 담당자 회신 우선(현재:
  중단 규칙 전체 미적용)"으로 개정
- 폴더 README — `lib/`·`app/`·`app/api/`·`components/survey/`·`components/admin/`·`supabase/`·`tests/`
  중 내용이 남는 곳
- `docs/superpowers/specs/2026-08-11-discontinue-rules-design.md` — 상단에 "2026-08-13
  폐기(superseded), 이 문서 참조" 표기(작성 시점 스냅샷 원칙이라 본문은 남긴다)

# 검증

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
