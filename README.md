# 아동 읽기 선별검사 웹

아이가 낱말·문장을 소리 내어 읽으면 녹음 파일을 저장하고, 낱말 쓰기(예/아니오)와 검사자
체크리스트를 받는 읽기 선별검사 도구.

- **STT(음성 인식)는 사용하지 않는다** — 녹음의 완료 여부만 추적한다.
- 참여자는 자기 녹음을 다시 듣지 않는다. 채점은 관리자 결과지(`/admin`)에서 녹음을 직접 청취해 수행한다.

## 화면 흐름

| 경로 | 대상 | 내용 |
|---|---|---|
| `/` | 아동(교사 보조) | 학교 선택 + 인적사항 입력 → 세션 생성 |
| `/survey` | 아동 | 마이크 확인 → 문항 진행(녹음은 문항마다 즉시 업로드) |
| `/review` | 아동 | 문항별 완료 여부 검토 → 최종 제출 |
| `/admin` | 관리자 | 로그인 → 세션 목록(검색·필터·정렬) → 결과지(녹음 청취·채점·세션 삭제) |

진행 상태는 localStorage에 저장돼 새로고침·탭 닫힘 후에도 같은 문항에서 재개된다.

## 문항 구성 (총 29문항)

- 낱말 해독 14문항(의미 7 + 무의미 7) — 녹음, 문항당 30초
- 문장 읽기유창성 4문항 — 녹음, 문항당 40초
- 낱말 쓰기 10문항(의미 5 + 무의미 5) — 예/아니오 체크(필수)
- 검사자 체크리스트 1문항 — 발달 영역 다중 선택(선택)

문항 정의는 코드 상수 `lib/items.ts`에 있다(DB 시드 아님).

## 기술 구조

- **Next.js 16 (App Router) + React 19 + Tailwind 4** — 프런트·API 라우트 단일 앱
- **Supabase** — Postgres(RLS로 anon 전면 차단, 서버 라우트의 service role만 접근) + Storage(`recordings` 비공개 버킷, 관리자에게만 1시간 서명 URL 발급)
- **인증**: 관리자는 argon2id 비밀번호 + HMAC 쿠키(8시간), 참여자는 세션 생성 시 발급되는 HMAC 세션 토큰(24시간, 해당 세션에만 쓰기 가능)
- **제출 후 잠금**: 최종 제출된 세션은 녹음 업로드·재제출이 차단된다(검사 증적 사후 변조 방지)

## 폴더 구조

각 폴더의 목적·파일 설명·관례는 폴더별 README에 있다:
[app/](app/README.md) (화면·흐름) · [app/api/](app/api/README.md) (서버 라우트·방어) ·
[components/](components/README.md) (+ [survey/](components/survey/README.md), [admin/](components/admin/README.md)) ·
[hooks/](hooks/README.md) · [lib/](lib/README.md) (로직·서버 유틸) · [tests/](tests/README.md) (테스트 관례) ·
[supabase/](supabase/README.md) (마이그레이션) · [scripts/](scripts/README.md) · [public/schools/](public/schools/README.md) (생성물) ·
[docs/](docs/README.md) (설계 문서)

## 셋업

1. `npm install`
2. Supabase 프로젝트(리전: 서울/ap-northeast-2) 생성 → SQL Editor에서 순서대로 실행:
   `001_init.sql` → `003_kodys_redesign.sql` → `004_login_attempts.sql` → `005_cascade_and_indexes.sql` → `006_login_lockout_decay.sql` → `007_harden_rpc.sql` → `008_guardian_consent.sql`
   - ⚠️ `003`은 기존 `questions`/`responses`/`attempts`/`sessions` 테이블과 데이터를 폐기한다.
     (`002`는 003 이전 스키마 전용 레거시 — 실행하지 말 것, 파일 상단 주석 참고)
   - `004`는 관리자 로그인 무차별 대입 방어용 `login_attempts` 테이블을 만든다.
   - `005`는 FK에 `ON DELETE CASCADE`를 추가하고(세션 삭제 시 녹음·낱말쓰기 자동 정리), 조회 인덱스와
     로그인 실패 원자적 증가 함수(`record_login_failure`)를 만든다.
   - `006`은 잠금 만료 후 실패 카운트를 리셋해, 오답 1회로 잠금이 무한 연장되는 것을 막는다(관리자 로그인 DoS 완화).
   - `007`은 `record_login_failure`의 EXECUTE 권한 회수·search_path 고정(방어 심층).
   - `008`은 법정대리인 동의 확인 시각 컬럼(`guardian_consented_at`) 추가.
   - `005`~`008`은 비파괴적이며 재실행해도 안전하다.
3. `cp .env.local.example .env.local` 후 값 채우기
   - `ADMIN_PASSWORD_HASH`: `npm run hash-password -- '원하는비밀번호'` 실행 → **".env.local용" 라벨이 붙은 줄**을 그대로 복사해 붙여넣는다.
     - ⚠️ argon2id 해시(`$argon2id$v=19$...`)는 `$`를 필드 구분자로 쓰는데, Next.js는 `.env*` 파일의 `$VAR`를
       다른 환경변수 참조로 확장하려 시도한다. 이스케이프 없이 원본 해시를 그대로 넣으면 `$argon2id`, `$v` 등이
       존재하지 않는 변수로 오인되어 값이 사라지고 해시가 깨져(로그인 시 `Invalid hashed password: password hash string missing field`
       에러) **어떤 비밀번호를 입력해도 로그인이 실패한다.** `hash-password` 스크립트가 출력하는 두 줄 중
       `.env.local용`(이스케이프된 `\$argon2id\$v=19\$...`)을 반드시 사용할 것 — 원본 해시는 Vercel 등 대시보드
       전용(아래 배포 절 참고).
   - `SESSION_SECRET`: `openssl rand -hex 32`
4. `npm run build:schools` — 전국 초등학교 원본 JSON을 지역별 경량 JSON(`public/schools/`)으로 생성.
   원본 폴더 경로가 다르면 `npm run build:schools -- <원본디렉터리>`로 지정.
   (생성물은 저장소에 이미 커밋돼 있으므로, 학교 데이터를 갱신할 때만 재실행하면 된다.)
5. `npm run dev` → http://localhost:3000 (아동) / http://localhost:3000/admin (관리자)

## 개발 · 테스트

- `npm test` — 단위 + 라우트 테스트 (vitest)
- `npm run lint` — ESLint(eslint-config-next). react-hooks 규칙 포함 — PR 전 필수.
- `npm run typecheck` — 타입체크. **빌드 성공만으로 타입 에러가 없다고 판단하지 말 것** — 빌드 속도를 위해
  Next 빌드 내장 타입체크를 꺼두었다(`next.config.ts`의 `typescript.ignoreBuildErrors`).
  (참고: 초기엔 TypeScript 7 tsgo를 썼으나 Next 16 빌드 워커와 호환 문제로 크래시가 나 5.9로 되돌렸다.)
- 마이크는 HTTPS 또는 localhost에서만 동작한다. 같은 네트워크의 폰으로 테스트하려면
  `npx next dev --experimental-https` 또는 터널(예: `cloudflared tunnel --url localhost:3000`) 사용.
  ⚠️ 터널은 로컬 서버를 인터넷에 공개로 노출한다 — 로컬 관리자 비번이 약하다면 터널을 쓰는
  동안만이라도 강한 비번으로 바꿔서 테스트할 것.

### 수동 E2E 체크리스트 (릴리스 전 실기기)

- [ ] 시작: 지역 선택 → 학교 검색·선택 / 생년월일·학년·반·성별·이름·담임·연락처 입력·검증 → 시작
- [ ] 마이크 확인 → 낱말 녹음(30초 카운트다운) → "녹음이 완료됐어요" → 다시 녹음 → 다음
- [ ] 문장 문항(40초), 낱말 쓰기(예/아니오 선택 전 [다음] 비활성), 체크리스트(선택)
- [ ] 이전/다음 왕복, 새로고침 후 진행 상태 유지
- [ ] 검토 페이지: 미완료 표시(모달에도 경고) → 문항 번호 클릭 시 해당 문항 이동 → 제출 모달(제출하기/돌아가기)
- [ ] "네" → 종료 페이지 + DB 저장(sessions.submitted_at, writing_answers) → 재제출·추가 업로드 차단 확인
- [ ] 관리자: 로그인 → 목록(검색·필터) → 결과지(녹음 청취·낱말쓰기·체크리스트) → 세션 삭제(확인 모달) → 로그아웃
- [ ] iOS Safari 실기기: 마이크 확인 통과 후 무음 녹음이 없는지(레벨미터 반응·완료 후 재생 없이 저장)
- [ ] 진행 중 탭 닫기/새로고침 후 재진입 시 같은 문항·단계로 복원
- [ ] 제출 확인 모달: 초기 포커스(돌아가기) · Tab 순환 · Esc 닫기 · 닫은 뒤 포커스 복귀

## 배포 (Vercel)

1. **저장소 병합**: 배포 브랜치(보통 `main`)에 변경을 병합한다. Vercel은 그 브랜치를 프로덕션으로 배포한다.
2. **Vercel 프로젝트 생성**: New Project → 이 GitHub 저장소 import. 프레임워크는 Next.js 자동 감지(빌드 설정 변경 불필요).
3. **환경변수 등록** (Settings → Environment Variables, Production):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase 대시보드 값
   - `SESSION_SECRET` — `openssl rand -hex 32`로 새로 생성 (로컬과 다른 값 권장)
   - `ADMIN_PASSWORD_HASH` — ⚠️ **로컬에서 쓰던 값이나 예시용 약한 비번 금지.** `npm run hash-password -- '강한랜덤비번'` 출력 중
     **"원본 해시"** 줄(이스케이프 없는 `$argon2id$v=19$...`)을 그대로 붙여넣는다. Vercel 대시보드는 셸/dotenv
     파싱을 거치지 않으므로 `$`를 이스케이프하면 안 된다(로컬 `.env.local`용 `\$` 이스케이프 버전과 다름 — 위 셋업 절 참고).
   - (네 변수 모두 서버 전용 — `NEXT_PUBLIC_` 접두사 붙이지 말 것. 붙이면 클라이언트에 노출된다.)
4. **Deploy** → 자동 HTTPS 발급. 마이크 녹음은 HTTPS에서만 동작하므로 배포 후 정상 작동한다.
5. 배포 도메인을 확인하고 `/`(아동)·`/admin`(관리자) 흐름을 실기기로 점검한다.

- 환경변수는 로컬(`.env.local`)과 Vercel이 별개다 — 각자 `npm run hash-password`로 자신만의 로컬 비번을
  생성해 쓰고, Vercel은 그와 다른 별도의 강한 비번을 쓴다. 실제 비밀번호 값은 코드·문서 어디에도 적어두지 말 것.
- 관리자 비밀번호는 argon2id(`@node-rs/argon2`)로 검증한다. 로그인 라우트는 네이티브 바인딩 때문에
  `runtime='nodejs'`로 고정돼 있으며, Vercel 빌드는 플랫폼 프리빌트 바이너리를 자동 설치한다.
- `recordings` 라우트는 `maxDuration=60`(초). Vercel Hobby는 함수 실행시간 상한이 더 짧을 수 있으나,
  5MB 이하 업로드는 수 초 내라 실사용엔 무방하다.
- 세션 토큰(참여자)은 24시간 만료라, 배포로 `SESSION_SECRET`을 교체하면 진행 중이던 검사의
  업로드가 실패한다 — 검사 시간대를 피해서 시크릿을 회전할 것.
  **토큰/저장 형식을 바꾸는 배포도 동일하게 진행 중 세션을 무효화한다**(예: 토큰에 만료 추가,
  localStorage 스키마 버전 변경). 이런 변경이 포함된 릴리스는 반드시 검사 시간대를 피해 배포할 것.

## 운영 · 개인정보 (PII)

이 서비스는 **아동 실명·생년월일·성별·학교·반, 담임 이름·연락처, 음성 녹음**을 수집한다.
만 14세 미만 아동의 개인정보이므로 법정대리인 동의가 필수다(개인정보보호법 제22조의2).

- **동의 절차(구현됨)**: ① 검사 전 가정통신문 서면 동의서
  ([docs/consent/guardian-consent-form.md](docs/consent/guardian-consent-form.md)) 배부·회수(시행령 제17조의2 ①4호)
  → ② 시작 화면에서 4대 고지사항(제15조②) 표시 + 검사자가 "서면 동의 확인" 필수 체크
  → ③ 확인 시각이 `sessions.guardian_consented_at`에 기록(감사 증적, 마이그레이션 008)
  → ④ 아동에게는 마이크 확인 화면에서 쉬운 말로 고지(제22조의2 ③).
  서면 동의서 원본은 운영 주체가 별도 보관한다. 고지 문구의 단일 소스는 `lib/consent.ts`.
- ⚠️ **TODO(보존 기한 확정 — 운영 개시 전 반드시 결정)**: 현재 보유 기간 고지는
  "목적 달성 시 지체 없이 파기"(일반 원칙)로 되어 있다. 운영 주체가 구체 기한(예: 결과 통보 후
  6개월)을 확정하면 → `lib/consent.ts`의 `RETENTION_LABEL`·가정통신문 양식을 함께 교체하고,
  아래 일괄 파기 절차를 pg_cron으로 자동화할 것. 상세 절차는 `lib/consent.ts` 상단 TODO 주석 참고.
- **세션 삭제(파기)**: 관리자 결과지의 [세션 삭제] 버튼 — 스토리지 녹음 파일과 DB 행(녹음 메타·낱말쓰기 포함, FK CASCADE)을 영구 삭제한다. 삭제 요청 대응에 사용.
- **일괄 파기(보존 기한 경과분)**: 보존 기한을 정한 뒤(예: 결과 통보 후 6개월) 주기적으로 SQL Editor에서 실행 —
  스토리지 객체는 행 삭제로 지워지지 않으므로, **먼저 관리자 화면에서 대상 세션을 삭제**하거나
  Storage에서 해당 `sessions.id` 프리픽스 폴더를 지운 뒤 행을 삭제할 것.
  ```sql
  -- 예: 제출 후 180일 지난 세션 조회(파기 대상 확인용)
  select id, child_name, submitted_at from sessions
  where submitted_at < now() - interval '180 days';
  ```
- **로그아웃**: 관리자 대시보드 [로그아웃] — 공용 PC에서 자리를 떠날 때 반드시 사용(브라우저 캐시의 세션 목록도 함께 비운다).
- **로그인 방어**: IP당 5회 실패 시 10분 하드 잠금(대상형 429). 전역 실패 누적은 하드 잠금 대신
  점증 지연(백오프, 상한 2초)만 적용해 IP 로테이션 공격에 마찰을 주되 정상 관리자 로그인을
  봉쇄하지 않는다(가용성 우선). `login_attempts`의 IP 기록도 개인정보성 데이터이므로 오래된 행은
  주기적으로 정리 권장:
  ```sql
  delete from login_attempts where updated_at < now() - interval '30 days';
  ```
- **토큰 무효화**: 관리자 쿠키·참여자 세션 토큰은 서버 저장소가 없는 HMAC 서명 방식 —
  전체 즉시 무효화가 필요하면 `SESSION_SECRET`을 회전한다.
- Supabase Storage 무료 1GB — 수개월 운영 시 보존 기한 파기와 함께 용량도 점검할 것.
