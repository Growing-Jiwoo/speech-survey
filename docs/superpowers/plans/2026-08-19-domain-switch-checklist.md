# 도메인 전환 체크리스트

**전환 완료(2026-10-12) — 정식 도메인 `lidislab.com`.** 아래는 실제로 밟은 순서다. 다음에 도메인을
옮기거나 Resend·Vercel 계정을 넘길 때 같은 순서로 하면 된다.

| 무엇 | 어디 |
|---|---|
| 도메인 | Vercel 팀 `kids-survey`에서 구매(연 $11.25, 자동 갱신). DNS도 Vercel이 관리한다 |
| 앱 | 프로젝트 `speech-survey` → Domains에 `lidislab.com`(Production). 예전 `speech-survey.vercel.app`도 계속 열린다 |
| 메일 | Resend 도메인 `lidislab.com`, 리전 Tokyo(`ap-northeast-1`), 추적(클릭·열람) 끔 |

⚠️ 결제 수단에 청구지 주소가 비어 있으면 Vercel이 「Action Required」를 띄운다 — 비워 두면 1년 뒤
자동 갱신 결제가 실패할 수 있다. 갱신 안내 메일은 Vercel 계정 주소로만 간다.

## ① 도메인을 앱에 연결 (Vercel)

구매 직후 화면의 **Connect an existing project** → `speech-survey`. Vercel에서 산 도메인이라 DNS와
HTTPS 인증서가 자동으로 붙는다. 프로젝트 Domains에서 **Valid Configuration**이 되면 끝.
같은 화면의 「Set up email」은 받는 메일함(Google Workspace 등) 설정이라 이 앱과 관계없다.

## ② 도메인 인증 (Resend)

Resend → Domains → Add Domain → `lidislab.com`, Advanced options에서 Region **Tokyo**,
Custom Return-Path `send`(기본값), Tracking Subdomain **비움**(클릭 추적을 켜면 메일 속 검사 주소·결과지
링크가 추적 주소로 바뀌어 학교 메일 필터에 걸리기 쉽다). **Auto configure**(Vercel 로고)로 Vercel 팀
`kids-survey`에 권한을 주면 아래 3개가 자동으로 들어간다.

| 타입 | 이름 | 값 |
|---|---|---|
| CNAME | `send` | `send.forge.rmta.net` (반송 처리 · SPF — 예전 MX+TXT 두 개를 대신한다) |
| CNAME | `rsend` | `rsend-apne1.forge.rmta.net` (`apne1` = Tokyo 리전) |
| TXT | `resend._domainkey` | `p=…` (DKIM) |

DMARC는 자동으로 안 들어가므로 Vercel 팀 → Domains → `lidislab.com` → DNS Records에서 직접 넣었다 —
TXT `_dmarc` = `v=DMARC1; p=none;`. 확인: `dig +short TXT _dmarc.lidislab.com @1.1.1.1`.
Resend 검증은 몇 분 만에 끝났다(최대 72시간).

## ③ Vercel 환경변수 — Production과 Preview를 나눈다

| 변수 | Production | Preview |
|---|---|---|
| `MAIL_TO_OVERRIDE` | **없음(변수 자체를 지운다)** | 개발자 개인 메일 |
| `ADMIN_NOTIFY_EMAIL` | 담당자(관리자) 메일 | 개발자 개인 메일 |
| `MAIL_FROM` | `읽기검사 <noreply@lidislab.com>` | (같음) |
| `APP_URL` | `https://lidislab.com` | 비움 — 메일 링크가 그 Preview 주소로 만들어진다 |

`RESEND_API_KEY`·`SUPABASE_*`·`ADMIN_PASSWORD_HASH`·`SESSION_SECRET`은 두 환경 공통으로 그대로.

> **Production에 `MAIL_TO_OVERRIDE`가 남아 있으면** 교사에게 갈 승인 메일이 **전부 그 주소로 가고**,
> 교사는 코드를 받지 못한다. 화면은 "메일을 보냈어요"라고 말하므로 관리자도 알아채지 못한다.
> 제목의 `[테스트]`와 본문의 노란 띠가 유일한 단서다.

`MAIL_FROM`을 관리자 학교 메일로 할 수는 없다 — Resend는 인증한 도메인에서만 보낸다.

⚠️ `ADMIN_PASSWORD_HASH`는 **이스케이프 없는 원본 해시**를 넣는다(`$argon2id$v=19$…`).
로컬 `.env.local`용 `\$` 버전을 붙이면 어떤 비밀번호로도 로그인이 안 된다 — README 배포 절 참고.

⚠️ **`.env.local` 줄을 통째로 복사하지 말 것.** dotenv는 `주소@x.com  # 설명` 뒤의 주석을 떼지만
**Vercel 대시보드는 안 뗀다** — 값에 주석이 그대로 들어간다. 한글 주석이 섞이면 Resend가
`Invalid \`to\` field. The email address contains non-ASCII characters.`로 거부하고,
신청은 201로 성공하므로 화면에는 아무 표시도 없다. 실제로 밟았다(2026-08-19, `MAIL_TO_OVERRIDE`).
런타임 로그(`npx vercel logs <배포URL> --scope <팀>`)의 `[apply] 관리자 알림 메일 실패`가 유일한 단서다.

⚠️ **환경변수는 기존 배포에 소급 적용되지 않는다.** 값은 배포 시점에 그 배포에 박히므로,
등록·수정한 뒤 **반드시 재배포**해야 돌고 있는 함수가 그 값을 본다. 재배포 전에는
`ADMIN_NOTIFY_EMAIL`이 빈 값이라 알림 메일 블록을 통째로 건너뛰고 **로그에 실패 기록조차 남지 않는다**
(2026-08-19에 이걸로 "메일이 하나도 안 온다"를 한참 쫓았다). 변수를 다 바꾼 **뒤에** 한 번 더 재배포할 것 —
수정 도중 자동으로 만들어진 배포는 일부 값만 들고 있을 수 있다.

## ④ 재배포 후 확인 (2026-10-12)

- [x] `https://lidislab.com/apply`로 시험 신청 → 201 (서울가곡초 1-1, 교사 이메일 = 개발자 Gmail)
- [x] 관리자 알림 메일이 담당자(관리자) 학교 메일 받은편지함에 도착
- [x] ⚠️ 학교 웹메일에서 메일 속 링크를 누르면 「lidislab.com에서 연결을 거부했습니다」 — 웹메일이 링크를 iframe에
      띄워 앱의 프레임 차단에 걸렸다. 메일 링크를 전부 `target="_blank"`로 바꿔 고쳤다(`lib/mail.ts`). 학교 메일로
      받는 교사 승인·결과지 메일도 같은 경로라 함께 고쳐졌다
- [x] 승인 → **교사 주소로** 승인 메일 도착, 제목에 `[테스트]` 없음, 보낸 사람 `읽기검사 <noreply@lidislab.com>`
- [x] 메일의 검사 주소가 `https://lidislab.com` (Host 헤더가 아니라 `APP_URL`)
- [x] Gmail 받은편지함 도착(스팸 아님)
- [ ] 시험 학급 코드 `7DCSUU` 삭제(세션 없음)

## ⑤ 공문·안내에 실을 주소

신청 링크는 `https://lidislab.com/apply`. 설명서 두 권의 주소도 이 도메인으로 바꿨다(`docs/manuals/README.md`).

## 전환 전(샌드박스)에는 어땠나

도메인 인증 전에는 `MAIL_FROM=onboarding@resend.dev`였고, Resend가 **가입 주소로만** 보내 줬다.
그래서 Production에도 `MAIL_TO_OVERRIDE`(관리자 주소)를 걸어 승인 메일을 관리자에게 돌렸고, 교사에게는
관리자가 `/admin/codes`의 **[안내 문구 복사]**로 코드를 직접 전달했다. 로컬 개발을 새 Resend 계정으로
할 때는 지금도 이 상태다(README 셋업 절).
