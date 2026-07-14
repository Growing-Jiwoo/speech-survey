# KODYS-G1 초등 1학년 읽기 선별검사 웹

KODYS-G1(Korean Dyslexia Screening Test) 초등 1학년 선별검사지를 웹으로 옮긴 검사 도구.
아이가 낱말·문장을 소리 내어 읽으면 녹음 파일을 저장하고, 낱말 쓰기(예/아니오)와 검사자
체크리스트를 받는다. **STT(음성 인식)는 사용하지 않으며**, 녹음의 완료 여부만 추적한다.
참여자는 자기 녹음을 다시 듣지 않는다. 채점은 관리자 결과지(`/admin`)에서 녹음을 직접 청취해
수행한다. CSV 다운로드 지원.

## 문항 구성 (총 29문항)

- 낱말 해독 14문항(의미 7 + 무의미 7) — 녹음, 문항당 30초
- 문장 읽기유창성 4문항 — 녹음, 문항당 40초
- 낱말 쓰기 10문항(의미 5 + 무의미 5) — 예/아니오 체크(필수)
- 검사자 체크리스트 1문항 — 발달 영역 다중 선택(선택)

문항 정의는 코드 상수 `lib/items.ts`에 있다(DB 시드 아님).

## 셋업

1. `npm install`
2. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/migrations/001_init.sql` 실행 후
   `supabase/migrations/003_kodys_redesign.sql` 실행
   - ⚠️ `003`은 기존 `questions`/`responses`/`attempts`/`sessions` 테이블과 데이터를 폐기한다.
3. `cp .env.local.example .env.local` 후 값 채우기
   - `ADMIN_PASSWORD_HASH`: `npm run hash-password -- '원하는비밀번호'` 출력값
   - `SESSION_SECRET`: `openssl rand -hex 32`
4. `npm run build:schools` — 전국 초등학교 원본 JSON을 지역별 경량 JSON(`public/schools/`)으로 생성.
   원본 폴더 경로가 다르면 `npm run build:schools -- <원본디렉터리>`로 지정.
   (생성물은 저장소에 이미 커밋돼 있으므로, 학교 데이터를 갱신할 때만 재실행하면 된다.)
5. `npm run dev` → http://localhost:3000 (아동) / http://localhost:3000/admin (관리자)

## 테스트

- `npm test` — 단위 + 라우트 테스트
- `npm run typecheck` — 타입체크 (tsgo 7.0.2. Next 빌드 타입체크는 꺼져 있으니 반드시 별도 실행)
- 수동 E2E 체크리스트 (릴리스 전 실기기):
  - [ ] 시작: 지역 선택 → 학교 검색·선택 / 생년월일·학년·반·성별·이름·담임·연락처 입력·검증 → 시작
  - [ ] 마이크 확인 → 낱말 녹음(30초 카운트다운) → "녹음이 완료됐어요" → 다시 녹음 → 다음
  - [ ] 문장 문항(40초), 낱말 쓰기(예/아니오 선택 전 [다음] 비활성), 체크리스트(선택)
  - [ ] 이전/다음 왕복, 새로고침 후 진행 상태 유지
  - [ ] 검토 페이지: 미완료 표시 → 문항 번호 클릭 시 해당 문항 이동 → 제출 모달(네/아니오)
  - [ ] "네" → 종료 페이지 + DB 저장(sessions.submitted_at, writing_answers)
  - [ ] 관리자: 로그인 → 목록 → 결과지(녹음 청취·낱말쓰기·체크리스트) → CSV 열기(엑셀 한글 정상)

## 주의

- TypeScript는 7.0.2(native tsgo)를 사용한다. Next.js 빌드 내장 타입체크는 tsgo와 호환되지 않아
  `next.config.ts`에서 꺼두었다(`typescript.ignoreBuildErrors`). 타입 안전성은 `npm run typecheck`
  (`tsc --noEmit` → tsgo)로 별도 검증하므로, 빌드 성공만으로 타입 에러가 없다고 판단하지 말 것.
- 마이크는 HTTPS 또는 localhost에서만 동작한다. 같은 네트워크의 폰으로 테스트하려면
  `npx next dev --experimental-https` 또는 터널(예: `cloudflared tunnel --url localhost:3000`) 사용.
- Supabase Storage 무료 1GB — 수개월 운영 시 오래된 녹음 정리 필요.
