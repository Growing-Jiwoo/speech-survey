# 아동 STT 발화 설문 사이트

화면의 영어 문장을 아이가 소리 내어 읽으면 Azure STT로 변환해 보여주고,
모든 녹음/텍스트를 Supabase에 저장한다. 관리자는 `/admin`에서 조회·청취·CSV 다운로드.

## 셋업

1. `npm install`
2. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/migrations/001_init.sql` 실행
3. `cp .env.local.example .env.local` 후 값 채우기
   - `ADMIN_PASSWORD_HASH`: `npm run hash-password -- '원하는비밀번호'` 출력값
   - `SESSION_SECRET`: `openssl rand -hex 32`
4. `npm run seed` (30문항 주입)
5. `npm run smoke:azure` (Azure 연결 확인)
6. `npm run dev` → http://localhost:3000 (아동) / http://localhost:3000/admin (관리자)

## 테스트

- `npm test` — 단위 + 라우트 테스트
- `npm run typecheck` — 타입체크 (tsgo 7.0.2. Next 빌드 타입체크는 꺼져 있으니 반드시 별도 실행)
- 수동 E2E 체크리스트 (릴리스 전 실기기):
  - [ ] Chrome(PC): 시작→마이크테스트→녹음→변환표시→재생→재시도→건너뛰기→완료
  - [ ] Safari(iPhone): 동일 흐름 (mp4 녹음 경로 — wav 트랜스코딩 확인)
  - [ ] Chrome(Android): 동일 흐름
  - [ ] 마이크 권한 거부 → 안내 화면 → 허용 후 복구
  - [ ] 관리자: 로그인(틀린 비번 5회 잠금)→목록→상세(오디오 재생)→CSV 열기(엑셀 한글 정상)
  - [ ] 무음 녹음 → "잘 안 들렸어요" + [다음] 비활성 유지

## 주의

- TypeScript는 7.0.2(native tsgo)를 사용한다. Next.js 빌드 내장 타입체크는 tsgo와 호환되지 않아
  `next.config.ts`에서 꺼두었다(`typescript.ignoreBuildErrors`). 타입 안전성은 `npm run typecheck`
  (`tsc --noEmit` → tsgo)로 별도 검증하므로, 빌드 성공만으로 타입 에러가 없다고 판단하지 말 것.
- 마이크는 HTTPS 또는 localhost에서만 동작한다. 같은 네트워크의 폰으로 테스트하려면
  `npx next dev --experimental-https` 또는 터널(예: `cloudflared tunnel --url localhost:3000`) 사용.
- Supabase Storage 무료 1GB — 수개월 운영 시 오래된 녹음 정리 필요.
