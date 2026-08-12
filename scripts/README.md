# scripts/ — 개발·운영 보조 스크립트 (tsx 실행)

| 스크립트 | 실행 | 역할 |
|---|---|---|
| `hash-password.ts` | `npm run hash-password -- '비밀번호'` | 관리자 비밀번호의 argon2id 해시 생성. **출력 2줄의 용도가 다르다**: "원본 해시"는 Vercel 대시보드용, "`.env.local`용"은 `$`를 `\$`로 이스케이프한 로컬 dotenv용(섞어 쓰면 로그인 불가 — 루트 README 셋업 절 참고) |
| `build-schools.ts` | `npm run build:schools [-- <원본디렉터리>]` | 전국 초등학교 원본 JSON을 지역별 경량 JSON(`public/schools/`)으로 변환. 생성물이 저장소에 커밋돼 있으므로 학교 데이터 갱신 때만 재실행 |
| `vendor-fonts.mjs` | `node scripts/vendor-fonts.mjs` | 웹폰트를 구글에서 받아 `public/fonts/**`·`app/fonts.css`로 벤더링. **빌드가 네트워크를 타지 않게 하려는 것**이라 `next/font/google`로 되돌리면 안 된다(빌드마다 폰트를 받아 한 번의 실패로 배포가 죽는다). 생성물이 커밋돼 있으므로 폰트·웨이트를 바꿀 때만 재실행 — 스크립트의 `FAMILIES` 수정 후 실행 |
