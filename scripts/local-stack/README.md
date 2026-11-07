# scripts/local-stack/ — 운영과 분리된 로컬 시험 스택

이 Mac에서 앱을 처음부터 끝까지 돌려 보기 위한 스택. **운영 Supabase·Resend에 닿지 않는다.**
Docker·Supabase CLI 없이 Homebrew의 Postgres 17 + PostgREST와 Node 게이트웨이 하나로 Supabase 자리를 흉내 낸다
(2026-10-22 출시 전 점검 — `docs/qa/2026-10-22-prelaunch.md` 「어디서 · 어떻게」 — 과 같은 방식을 다시 만든 것).

```
브라우저 ──► 앱(next start, :3100, 저장소 사본 ~/Library/Caches/speech-survey-local-stack/app)
                │  SUPABASE_URL = http://127.0.0.1:54320
                ▼
            게이트웨이(gateway.mjs, :54320)
                ├─ /rest/v1/*      → PostgREST(:54321, db-max-rows 1000) → Postgres 17(:54329)
                ├─ /storage/v1/*   → .data/storage/ (recordings · writing-scans 버킷)
                └─ /resend/emails  → .data/mails.json (보내지 않고 기록만)
```

## 쓰는 법

```bash
cd /Users/kimjiwoo/Desktop/speech-survey
scripts/local-stack/up.sh          # DB·PostgREST·게이트웨이 (처음이면 DB 생성 + 마이그레이션 전부)
scripts/local-stack/seed.sh        # 시험 학급 코드 TEST23 (여러 번 돌려도 안전)
scripts/local-stack/app.sh start   # 사본 동기화 → next build → next start  →  http://localhost:3100
# … 시험 …
scripts/local-stack/down.sh        # 앱까지 전부 내린다(데이터는 남는다)
```

| 명령 | 하는 일 |
|---|---|
| `up.sh` | Postgres(127.0.0.1:54329, 데이터 `.data/pg`) → `bootstrap.sql` → `supabase/migrations/[0-9]*.sql`(번호 순, **고치지 않고**) → PostgREST(:54321) → 게이트웨이(:54320). 모두 백그라운드, pid는 `.data/run/`, 로그는 `.data/logs/`. 이미 떠 있으면 건너뛰고, **지금 체크아웃된 브랜치에 새 마이그레이션 파일이 있으면 그것만 적용**한다(적용 기록은 `local_stack.migrations`) |
| `down.sh` | 앱·게이트웨이·PostgREST·Postgres 중지. 데이터는 그대로 |
| `reset.sh [--seed] [--new-secrets]` | 내리고 DB·Storage 파일·가짜 메일함을 지운 뒤 다시 `up.sh`. `--seed`면 시드까지. `--new-secrets`면 `.env.local-stack`도 새로 만든다(옛 세션 토큰·관리자 쿠키 무효). 브랜치를 바꿔 마이그레이션이 **달라졌을**(앞 번호가 바뀐) 때는 이걸 쓴다 |
| `seed.sh` | 활성 학급 코드 **`TEST23`** — 부산 가남초등학교 1학년 3반, 담임 김시험(teacher@local.test), 명단 3명(1 가나다 · 2 라마바 · 3 사아자, 가상 인물) |
| `app.sh start` | 저장소 → `~/Library/Caches/speech-survey-local-stack/app` 동기화, `next build` 후 `next start -p 3100`(백그라운드, 로그 `.data/logs/app.log`). 운영과 같은 prod 빌드(CSP 엄격). 빌드 약 40초 |
| `app.sh dev` | 같은 사본으로 `next dev -p 3100`(포그라운드, Ctrl+C) |
| `app.sh stop` / `app.sh sync` | 앱만 중지 / 사본 동기화만 |

- 아동 화면: http://localhost:3100 → 코드 `TEST23`
- 관리자: http://localhost:3100/admin — 비밀번호는 **PC마다 처음 실행할 때 무작위로** 만들어 터미널에 보이고 `.env.local-stack`(git 무시)에만 남는다. 다시 볼 때는 `scripts/local-stack/show-password.sh`. 직접 정하려면 처음 실행 때 `LOCAL_ADMIN_PASSWORD=<값> scripts/local-stack/up.sh` — **운영 관리자 비밀번호를 넣지 말 것**
- 가짜 메일함: `.data/mails.json` 또는 `curl -s http://127.0.0.1:54320/__local/mails`
- DB 직접 보기: `/opt/homebrew/opt/postgresql@17/bin/psql -h 127.0.0.1 -p 54329 -U postgres`

앱 코드를 고쳤으면 `app.sh start`를 다시 돌린다(사본을 다시 맞추고 다시 빌드한다). 사본은 **git이 보는 파일**만 옮긴다 —
추적 파일 + 무시되지 않은 새 파일(커밋 안 된 변경 포함). `.gitignore`·`.git/info/exclude`로 무시되는 것(`.env*`·`private/`·
임시 하네스 `app/zz-preview/` 등)은 옮기지 않는다. `node_modules`는 APFS 복제(`cp -c`)로 한 번 만들고
`package-lock.json`이 바뀔 때만 다시 만든다 — 저장소 루트에서 `npm install`을 먼저 해 둘 것.

## 운영에 닿지 않게 한 장치

1. **`.env.local`(운영)을 읽지 않는다.** 이 폴더의 스크립트는 그 파일을 열지도 source하지도 않는다. 앱은 저장소 루트가 아니라
   사본 `~/Library/Caches/speech-survey-local-stack/app`(저장소 밖)에서 도는데, 사본으로 옮길 때 `.env*`를 제외한다(rsync가 그 파일을 열지 않는다). 옮긴 뒤 사본에 `.env*`가
   하나라도 있으면 `app.sh`가 멈춘다. → Next가 작업 폴더에서 자동으로 읽을 `.env.local`이 아예 없다.
2. **앱이 읽는 환경변수를 전부 명시한다**(`.env.local-stack`, 빈 값 포함). 참고로 Next(`@next/env` 16.4.2)는 `process.env`에
   **키가 이미 있으면**(빈 문자열이어도) `.env*` 파일 값으로 덮지 않는다(`typeof processEnv[key] === 'undefined'`일 때만 채운다) —
   1번이 없어도 명시한 키는 운영 값으로 바뀌지 않는다. 1번은 우리가 모르는 키까지 막는 장치다. `VERCEL*`은 지운다.
3. **`fetch-guard.mjs`** — 앱의 모든 Node 프로세스(빌드 작업자 포함)에 `NODE_OPTIONS=--import`로 먼저 실린다.
   localhost 밖으로 가는 `fetch`·`http(s).request`는 **예외를 던져 막고**, `lib/mail.ts`가 코드에 박아 둔
   `https://api.resend.com/emails`만 게이트웨이의 가짜 Resend로 돌린다. 앱 로그 첫 줄에
   `[local-stack fetch-guard] 활성(pid …)`이 보여야 한다. (빌드 중 Next의 `registry.npmjs.org` 버전 확인이 차단됐다고 찍히는 건 정상)
4. `RESEND_API_KEY`는 가짜 값이라, 만에 하나 3번이 빠져도 Resend가 거절한다. `MAIL_TO_OVERRIDE`는 일부러 비워 두었다 —
   운영과 같은 수신자 결정(교사 주소 그대로)을 가짜 메일함에서 확인하려고.
5. `lib.sh`는 `SUPABASE_URL`이 `http://127.0.0.1:54320`이 아니면 멈춘다.

## 파일

| 파일 | 내용 |
|---|---|
| `lib.sh` | 경로·포트(54329/54321/54320/3100)·공통 함수. source 전용 |
| `up.sh` · `down.sh` · `reset.sh` · `seed.sh` · `app.sh` | 위 표 |
| `bootstrap.sql` | 마이그레이션을 그대로 돌리기 위한 최소 Supabase 흉내 — 역할 `anon`·`authenticated`·`service_role`(BYPASSRLS)·`authenticator`, public 기본 권한(Supabase와 같음), `storage.buckets`, `local_stack.migrations` |
| `seed.sql` | `TEST23` 학급 + 명단 3명 |
| `gateway.mjs` | 게이트웨이(의존성 없음). PostgREST 프록시 · Storage 흉내(upload·list·remove·signed URL 발급/받기, 버킷의 크기·형식 상한은 `storage.buckets` 행을 읽어 적용, Range·CORS 지원) · 가짜 Resend |
| `fetch-guard.mjs` | 위 「장치」 3 |
| `gen-env.mjs` | `.env.local-stack`이 없을 때 만든다 — `SESSION_SECRET`(무작위), `ADMIN_PASSWORD_HASH`(`@node-rs/argon2` hash — `scripts/hash-password.ts`와 같은 PHC 포맷), PostgREST JWT 비밀 + 그것으로 서명한 `service_role` 키 |
| `.env.local-stack` | 로컬 전용 비밀값(루트 `.gitignore`의 `.env*`로 무시됨). 셸이 source하므로 `$`를 이스케이프하지 않는다 |
| `.data/` | DB·Storage 파일·메일함·로그·pid(이 폴더의 `.gitignore`로 무시됨) |

## 운영과 다른 점 · 알려진 한계

- Storage는 앱이 쓰는 원시 본문 업로드만 흉내 낸다(멀티파트·이미지 변환·버전 없음). 서명 URL 토큰 형식도 다르다(앱은 URL을 그대로 쓰므로 무관).
- Supabase Auth·Realtime·Edge Functions 없음 — 앱이 쓰지 않는다.
- FORMS_KEY가 없어 **가짜 문항**으로 돈다(검사 화면의 낱말은 실제가 아니다).
- 앱 사본은 일부러 저장소 **밖**(`~/Library/Caches/speech-survey-local-stack/app`, `LOCAL_STACK_APP_DIR`로 바꿀 수 있음)에 둔다. 저장소 안에 두면 루트의
  `npm run lint`(`eslint .`)가 사본과 그 빌드 산출물(`.next`)까지 검사하고, Next가 「multiple lockfiles」 경고와 함께 작업 공간 루트를
  저장소 루트로 잡는다(2026-11-07 확인). 지우려면 `rm -rf ~/Library/Caches/speech-survey-local-stack/app`.
- 학교 건물 NAT를 흉내 내는 레이트리밋은 모든 요청의 IP가 127.0.0.1이라 연속 시험 중 걸릴 수 있다 — 막히면 `app.sh start`로 다시 띄우면 풀린다(메모리 카운터).
- 마이크 녹음은 `http://localhost`에서 된다(브라우저가 localhost를 보안 출처로 본다). 다른 기기에서 접속하려면 HTTPS가 필요하다.
