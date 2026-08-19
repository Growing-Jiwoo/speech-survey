# 도메인 전환 체크리스트

도메인을 사기 전(샌드박스)과 산 뒤(실발송)의 Vercel 환경변수가 다르다.
**전환할 때 지우지 않으면 교사가 코드를 영영 못 받는 항목이 하나 있다** — 아래 ②.

## 지금 (도메인 없음 · 샌드박스)

Vercel → Settings → Environment Variables → Production

| 변수 | 값 |
|---|---|
| `RESEND_API_KEY` | `re_…` (Resend → API Keys, Sending access) |
| `MAIL_FROM` | `onboarding@resend.dev` |
| `ADMIN_NOTIFY_EMAIL` | 관리자 주소 (= Resend 가입 주소여야 발송됨) |
| `MAIL_TO_OVERRIDE` | 관리자 주소 — **임시**. 아래 ② 참고 |
| `APP_URL` | `https://<현재-vercel-주소>` |

기존 4개(`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`·`ADMIN_PASSWORD_HASH`·`SESSION_SECRET`)는 그대로 둔다.

⚠️ `ADMIN_PASSWORD_HASH`는 **이스케이프 없는 원본 해시**를 넣는다(`$argon2id$v=19$…`).
로컬 `.env.local`용 `\$` 버전을 붙이면 어떤 비밀번호로도 로그인이 안 된다 — README 배포 절 참고.

### 이 상태에서 실제로 일어나는 일

- 교사가 `/apply`로 신청 → 관리자에게 알림 메일 **옴**
- 관리자가 승인 → 승인 메일이 **관리자에게 옴**(교사가 아니라). 제목에 `[테스트]`,
  본문 머리에 `원래 수신자: …` 띠가 붙는다
- **교사는 코드를 못 받는다** → 관리자가 `/admin/codes`의 **[안내 문구 복사]**로 직접 전달한다

샌드박스는 Resend 가입 주소로만 발송되므로 교사 주소로는 403이 난다. 이건 결함이 아니라
도메인 인증 전의 정상 동작이고, 복사 버튼이 그 전제로 만들어져 있다.

## 도메인을 산 뒤

### ① 도메인 인증 (Resend)

Resend → Domains → Add Domain → 표시되는 DNS 레코드 **3개**를 등록한다.

| 타입 | 이름 | 비고 |
|---|---|---|
| MX | `send` | 우선순위 10 |
| TXT | `send` | SPF |
| TXT | `resend._domainkey` | DKIM |

발송은 서브도메인(`send.도메인`)을 쓰는 것이 권장된다 — 메일 평판이 본 도메인과 분리된다.
검증은 보통 몇 분, 최대 72시간.

### ② Vercel 환경변수 교체 — **`MAIL_TO_OVERRIDE`를 반드시 삭제**

| 변수 | 어떻게 |
|---|---|
| `MAIL_TO_OVERRIDE` | **삭제한다(변수 자체를 지운다)** |
| `MAIL_FROM` | `읽기검사 <noreply@도메인>` |
| `APP_URL` | `https://새-도메인` |
| `RESEND_API_KEY`·`ADMIN_NOTIFY_EMAIL` | 그대로 |

> **`MAIL_TO_OVERRIDE`를 지우지 않으면** 교사에게 갈 승인 메일이 **전부 관리자 주소로 가고**,
> 교사는 코드를 받지 못한다. 화면은 "메일을 보냈어요"라고 말하므로 관리자도 알아채지 못한다.
> 제목의 `[테스트]`와 본문의 노란 띠가 유일한 단서다.

### ③ 재배포 후 확인

- [ ] `/apply`로 시험 신청 → 관리자 알림 메일 도착
- [ ] 승인 → **교사 주소로** 승인 메일 도착 (제목에 `[테스트]`가 **없어야** 한다)
- [ ] 메일의 검사 주소가 **새 도메인**인지 (Host 헤더가 아니라 `APP_URL`을 쓰는지)
- [ ] 메일이 스팸함이 아니라 받은편지함에 도착하는지 — 학교·교육청 메일은 필터가 세다.
      스팸으로 가면 SPF/DKIM 등록을 다시 확인하고, DMARC(`_dmarc` TXT) 추가를 검토한다
- [ ] 시험 신청으로 만든 학급 코드·명단·세션을 정리한다(순서: 세션 → 코드)

### ④ 공문·안내에 실을 주소

신청 링크는 `https://새-도메인/apply`. 공문에 실린 뒤에는 바꿀 수 없으므로 도메인을 먼저 확정한다.
