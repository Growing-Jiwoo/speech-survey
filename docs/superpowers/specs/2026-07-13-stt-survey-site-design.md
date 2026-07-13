# 아동 STT 발화 설문조사 사이트 — 디자인 스펙

- 작성일: 2026-07-13
- 상태: 사용자 승인 대기
- 대상 규모: 월 100여 명, 1인당 30회 발화(문항당 1회 이상), 발화 길이 10초 내외

## 1. 개요

아동이 화면에 표시된 영어 문장을 소리 내어 읽으면, 녹음본을 서버로 보내 Azure STT로
텍스트 변환하고, 변환 결과를 목표 문장 아래에 표시하는 설문조사 웹사이트.
모든 녹음 파일과 변환 텍스트는 Supabase에 저장되며, 주최측은 비밀번호로 보호된
관리자 페이지에서 결과를 조회·청취·CSV 다운로드할 수 있다.

## 2. 확정 요구사항

| # | 요구사항 | 결정 |
|---|---|---|
| R1 | 설문 결과를 주최측이 열람 | Supabase 저장 + 전용 관리자 페이지(`/admin`, 비밀번호) |
| R2 | 문항마다 말해야 하는 문장 표시 (음원 재생 불필요) | 영어 30문항, 쉬움→어려움, 시드 데이터로 제공 |
| R3 | 아동이 문장을 STT로 발화 | 녹음 후 서버 변환 방식 (방식 A) |
| R4 | STT 텍스트를 문장 아래 표시 + 본인 녹음 재생 | 문항 화면에서 즉시 표시/재생, 녹음본 Supabase Storage 저장 |
| R5 | 재시도 기능 | "다시 말하기" — 시도 이력 전부 보존, 문항별 재시도 횟수 기록 |
| R6 | 프레임워크/라이브러리 탐색 | 아래 §4 기술 스택 |
| R7 | 역제안 기능 | 포함: 마이크 테스트, 볼륨 레벨 표시, 진행률 표기(애니메이션 없음), 건너뛰기, CSV 내보내기 |

### 스코프 제외 (명시적으로 하지 않음)

- 발음 평가 점수 (Azure Pronunciation Assessment) — STT 텍스트만 저장
- 목표 문장 대비 자동 일치율 계산 — 주최측이 CSV/관리자 화면에서 수동 판단
- 이어하기(중도 이탈 재개) — 미완료 세션은 관리자 화면에서 미완료로 표시될 뿐, 새로 시작
- 칭찬 애니메이션/이모지 피드백 — 진행률 숫자 표기만
- 문항 편집 관리자 UI — 문항은 시드 파일 수정으로 교체
- 배포 — 로컬 개발(`npm run dev`)까지만. 추후 Vercel 배포 가능한 구조 유지
- 인증 체계 — 아동은 이름+나이 입력만, 관리자는 단일 비밀번호

## 3. 아키텍처

```
[브라우저]                          [Next.js (localhost:3000)]            [외부 서비스]
아동 설문 화면 (/)                   API Routes (서버 전용)
 ├ MediaRecorder 녹음                ├ POST /api/sessions      ─────────→ Supabase Postgres
 ├ 오디오 blob 전송      ──────────→ ├ POST /api/transcribe    ─┬───────→ Azure STT (Short Audio REST)
 └ 결과 표시/재생/재시도              │                          └───────→ Supabase Storage (비공개 버킷)
관리자 화면 (/admin)     ──────────→ ├ /api/admin/* (조회·CSV·서명URL)──→ Supabase
```

원칙:
- **모든 외부 키는 서버에만 존재.** 클라이언트는 Next.js API Route만 호출한다.
  Azure 키, Supabase service role 키 모두 `.env.local` 보관, 브라우저 노출 금지.
- **녹음본 = STT 입력 동일 보장.** 서버가 받은 오디오 파일 그대로를 Storage에 저장하고,
  같은 파일(필요시 포맷 변환만)을 Azure에 보낸다.
- 클라이언트 → Supabase 직접 접근 없음 (anon 키 미사용).

## 4. 기술 스택 (2026-07-13 기준 최신 안정 버전)

| 구성 | 선택 | 버전 | 비고 |
|---|---|---|---|
| 프레임워크 | Next.js (App Router) | 16.2.10 | 프론트+API 단일 프로젝트 |
| UI | React | 19.2.7 | Next 16 동봉 |
| 언어 | TypeScript | 7.0.2 | 네이티브(tsgo) 세대. Next 16의 빌드 내장 타입체크는 클래식 TS API 의존이라 TS7과 비호환 → `next.config.ts`에서 `typescript.ignoreBuildErrors=true`로 Next 타입체크를 끄고, 타입 안전성은 `npm run typecheck`(=`tsc --noEmit`, tsgo)로 분리 보장 |
| 스타일 | Tailwind CSS | 4.3.2 | 반응형 (태블릿/폰/PC) |
| 저장소 SDK | @supabase/supabase-js | 2.110.2 | 서버 전용 사용 |
| 오디오 변환 | ffmpeg-static | 5.3.0 | Safari mp4/aac → wav 트랜스코딩용, OS 무관 바이너리 동봉 |
| 테스트 | Vitest | 4.1.10 | 단위 + API 테스트 |
| 런타임 | Node.js | 22 LTS (로컬 v22.17.0 확인) | |
| STT | Azure Speech-to-Text, Short Audio REST API | en-US | $0.66/오디오시간, 무료 5h/월. 예상 비용 월 $2~5 |
| 녹음 | MediaRecorder API (브라우저 내장) | — | Chrome/Android: webm(opus), Safari/iOS: mp4(aac) |

사전 준비물(사용자 제공 필요):
1. Azure Speech 리소스 키 + 리전 (F0 무료 티어 가능)
2. Supabase 프로젝트 URL + service role 키
3. 관리자 비밀번호 (해시로 저장)

## 5. 데이터 모델 (Supabase Postgres)

마이그레이션 SQL은 저장소 `supabase/migrations/`에 포함하고, Supabase SQL Editor에서 1회 실행한다.

```sql
create table questions (
  id          serial primary key,
  order_no    int  not null unique,          -- 1..30 표시 순서
  text        text not null,                 -- 목표 문장
  difficulty  text not null check (difficulty in ('easy','medium','hard'))
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  child_name   text not null,
  child_age    int  not null check (child_age between 3 and 19),
  started_at   timestamptz not null default now(),
  completed_at timestamptz                    -- null = 미완료
);

create table responses (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(id),
  question_id      int  not null references questions(id),
  status           text not null check (status in ('in_progress','completed','skipped')),
  -- in_progress: 시도는 있으나 성공(비어있지 않은 STT)이 아직 없는 상태
  retry_count      int  not null default 0,   -- 총 시도 횟수 (1 = 재시도 없음)
  final_attempt_id uuid,                      -- attempts.id, skipped면 null
  unique (session_id, question_id)
);

create table attempts (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references responses(id),
  attempt_no   int  not null,                 -- 1, 2, 3...
  stt_text     text not null default '',      -- 빈 문자열 = 무음/인식실패
  audio_path   text not null,                 -- Storage 경로
  duration_sec numeric(5,2),
  created_at   timestamptz not null default now(),
  unique (response_id, attempt_no)
);
```

- Storage 버킷: `recordings` (비공개). 경로: `{session_id}/{order_no}_{attempt_no}.{webm|mp4}`
- 재시도·건너뛰기는 **문항별** 수집: `responses.retry_count`, `responses.status`,
  개별 시도는 `attempts`에 전부 보존.
- RLS: 모든 테이블 RLS 활성화 + 정책 없음(전면 차단). service role 키만 접근하므로 안전.

## 6. API 설계 (Next.js Route Handlers)

### 아동용

| 메서드/경로 | 입력 | 동작 | 출력 |
|---|---|---|---|
| `POST /api/sessions` | `{name, age}` | 세션 생성 | `{sessionId, questions[30]}` |
| `POST /api/transcribe` | multipart: `audio`(blob), `sessionId`, `questionId`, `attemptNo`, `durationSec` | ① Storage 업로드 → ② 포맷 변환(필요시) → ③ Azure STT → ④ response(없으면 생성)+attempt 저장, retry_count 갱신 | `{sttText, attemptId}` |
| `POST /api/responses/skip` | `{sessionId, questionId}` | status='skipped' 기록 | `{ok}` |
| `POST /api/sessions/complete` | `{sessionId}` | `completed_at` 기록 | `{ok}` |

### 관리자용 (세션 쿠키 필수, 미들웨어로 보호)

| 메서드/경로 | 동작 |
|---|---|
| `POST /api/admin/login` | 비밀번호 검증 → httpOnly 쿠키 발급 (서명된 토큰, 12시간 유효) |
| `GET /api/admin/sessions` | 세션 목록 (이름·나이·일시·완료여부·건너뜀 수) |
| `GET /api/admin/sessions/[id]` | 세션 상세 (문항별 최종+이력 시도, 각 오디오의 서명 URL 포함) |
| `GET /api/admin/export` | CSV 다운로드 (UTF-8 BOM) |

- 오디오 재생: 서버가 Supabase Storage **서명 URL**(1시간 만료) 생성해 내려줌. 버킷은 비공개 유지.
- CSV 컬럼(1행=1시도): 참여자 이름, 나이, 세션 시작일시, 문항 번호, 난이도, 목표 문장,
  시도 순번, STT 인식 텍스트, 해당 문항 재시도 총횟수, 건너뜀 여부, 발화 길이(초), 녹음 파일 경로

## 7. 화면 플로우

### 아동 (`/`)

```
① 시작:      이름·나이 입력 → [시작하기]
② 마이크 테스트: 권한 요청 → "Hello!" 말해보기 → 볼륨 레벨 감지되면 [설문 시작] 활성화
③ 문항 (×30):
   - 상단: 진행률 "12 / 30" (텍스트+바, 애니메이션 없음)
   - 중앙: 목표 문장 (크게, 가독성 좋은 서체)
   - [🎤 눌러서 말하기] → 녹음 중 레벨 미터 표시, 다시 누르면 종료 (20초 하드컷)
   - 변환 중 스피너 → "들린 말: ..." 표시 (목표 문장 바로 아래)
   - [▶ 내 목소리 듣기]  [🔁 다시 말하기]  [다음 →]
   - 하단 작게: 건너뛰기 (확인 팝업 1회)
   - [다음]은 성공한 시도(STT 텍스트 존재)가 1개 이상일 때 활성화
④ 완료:      "설문이 끝났어요! 수고했어요" → completed_at 기록
```

- 반응형: 모바일 세로 기준 우선 설계, 태블릿/PC는 중앙 정렬 확대. 터치 타깃 최소 48px.
- **UI 톤: 아기자기하게.** 아동 친화적 디자인 — 부드러운 파스텔 톤, 둥근 모서리 카드,
  큼직하고 친근한 서체, 귀여운 아이콘/일러스트 요소(마이크·동물 등). 단, 진행률은
  텍스트+바 표기만(확정사항: 칭찬 애니메이션 없음)이므로 "장식은 아기자기, 피드백은 담백" 기조.
- 새로고침/이탈: 저장된 attempt는 유실 없음. 세션은 미완료로 남고 새로 시작.

### 관리자 (`/admin`)

```
① 로그인: 비밀번호 입력
② 목록:   세션 테이블 (최신순) → 행 클릭
③ 상세:   문항 1~30 순서대로 [목표 문장 | 최종 STT | ▶재생 | 재시도 N회 | (펼침) 이전 시도들]
          건너뜀 문항은 회색 처리. 상단에 [CSV 내보내기] 버튼(전체 데이터).
```

## 8. STT 처리 상세

1. 클라이언트: `MediaRecorder`로 녹음 (`audio/webm;codecs=opus` 우선,
   미지원 시 `audio/mp4` — Safari). blob과 실측 길이(초)를 서버로 전송.
2. 서버(`/api/transcribe`):
   - 원본 그대로 Storage 업로드 (실패 시 1회 재시도, 재실패면 STT 진행하지 않고 에러 반환
     — "녹음 없는 텍스트" 방지)
   - webm(opus) → ogg(opus) 컨테이너 재포장, mp4(aac) → wav 16kHz mono 트랜스코딩
     (`ffmpeg-static`), 둘 다 Azure Short Audio 지원 포맷
   - Azure 호출: `https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US`
     타임아웃 10초
   - `DisplayText`를 `stt_text`로 저장 (빈 결과는 빈 문자열로 저장 — 시도 이력 유지)
3. 응답을 받은 클라이언트가 텍스트 표시 + 재생 버튼 활성화(로컬 blob 재생 — 재다운로드 불필요).

## 9. 에러 처리

| 상황 | 처리 |
|---|---|
| 마이크 권한 거부 | 안내 화면(브라우저별 허용 방법) + 재요청 버튼. 권한 없으면 설문 진입 불가 |
| STT 빈 결과 (무음·소음) | "잘 안 들렸어요. 다시 한번 말해볼까요?" 표시, attempt는 기록됨, [다음] 비활성 유지 |
| Azure 실패/타임아웃 | "잠깐 문제가 생겼어요" + [다시 시도]. 녹음은 이미 Storage에 있어 유실 없음 |
| Storage 업로드 실패 | 자동 1회 재시도 → 실패 시 에러 안내, STT 미진행 |
| 발화 20초 초과 | 자동 녹음 종료 후 정상 처리 (Short Audio 30초 제한 보호) |
| 관리자 비밀번호 5회 오류 | 10분 잠금 (메모리 기반, 로컬 운영 수준) |

## 10. 테스트 계획

- **단위 (Vitest)**: Azure 응답 파싱, CSV 생성(BOM·이스케이프), 문항 시드 무결성(30개·난이도 분포),
  진행률/버튼 활성화 로직
- **API 통합 (Vitest + Azure 목)**: `/api/transcribe` 성공·빈결과·타임아웃 3경로,
  skip/complete 엔드포인트, 관리자 인증 미들웨어
- **수동 E2E 체크리스트**: Chrome(PC), Safari(iPhone), Chrome(Android) 실기기에서
  녹음→변환→표시→재생→재시도→건너뛰기→완료→관리자 조회→CSV 전 과정
- **스모크**: 실제 Azure 키로 샘플 wav 1건 변환 확인 스크립트 (`scripts/smoke-azure.ts`)

## 11. 설문 문항 (30문항, 시드 데이터)

시드 파일 `supabase/seed/questions.ts`로 관리 — 문장 교체 시 이 파일만 수정.

**Easy (1–10): 3–4단어, 기초 사이트워드**

1. I like apples.
2. The dog is big.
3. She has a cat.
4. We can run fast.
5. It is sunny today.
6. I see a bird.
7. He is my friend.
8. The ball is red.
9. I love my mom.
10. Look at the moon.

**Medium (11–20): 5–7단어, 현재진행형·전치사구**

11. The cat is sleeping on the sofa.
12. I want to play with my friends.
13. My brother is reading a funny book.
14. We are going to the zoo today.
15. She likes to draw pictures at school.
16. The bird is singing in the tree.
17. Can I have some milk, please?
18. My father drives a blue car.
19. We eat breakfast together every morning.
20. The children are playing in the park.

**Hard (21–30): 8–10단어, 복문·과거형**

21. Yesterday I went to the park with my best friend.
22. My sister baked delicious cookies for the whole family.
23. The students are learning how to swim at school.
24. When it rains, we stay inside and play games.
25. My grandmother told me an interesting story last night.
26. The brave firefighter rescued a small kitten from the tree.
27. We visited the museum and saw many old paintings.
28. After dinner, I always brush my teeth before bed.
29. The beautiful butterfly landed softly on the yellow flower.
30. Tomorrow we will travel to the beach with our family.

## 12. 프로젝트 구조

```
kids-speech-survey/
├─ app/
│  ├─ page.tsx                 # 시작 화면
│  ├─ survey/page.tsx          # 마이크 테스트 + 문항 진행 (클라이언트 상태 머신)
│  ├─ done/page.tsx            # 완료 화면
│  ├─ admin/                   # 로그인·목록·상세
│  └─ api/                     # §6의 Route Handlers
├─ lib/                        # azure-stt, supabase(서버 전용), audio-convert, csv, auth
├─ components/                 # Recorder, LevelMeter, ProgressBar, QuestionCard ...
├─ supabase/
│  ├─ migrations/001_init.sql
│  └─ seed/questions.ts
├─ scripts/smoke-azure.ts
├─ docs/superpowers/specs/     # 본 문서
└─ .env.local (git 제외)       # AZURE_SPEECH_KEY, AZURE_SPEECH_REGION,
                               # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
                               # ADMIN_PASSWORD_HASH, SESSION_SECRET
```

## 13. 비용 (참고, 확정 규모 기준)

- 월 100명 × 30발화 × 10초 = 8.33 오디오시간/월
- Azure Short Audio $0.66/h, 무료 5h 차감 → **월 ≈ $2.2**
- Supabase 무료 티어: 오디오 ≈ 월 0.5–1GB(webm/opus 기준) → 무료 1GB 한도 내.
  수개월 누적 시 오래된 녹음 정리 또는 Pro 전환 필요 (운영 노트)
