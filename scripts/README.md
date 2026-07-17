# scripts/ — 개발·운영 보조 스크립트 (tsx 실행)

| 스크립트 | 실행 | 역할 |
|---|---|---|
| `hash-password.ts` | `npm run hash-password -- '비밀번호'` | 관리자 비밀번호의 argon2id 해시 생성. **출력 2줄의 용도가 다르다**: "원본 해시"는 Vercel 대시보드용, "`.env.local`용"은 `$`를 `\$`로 이스케이프한 로컬 dotenv용(섞어 쓰면 로그인 불가 — 루트 README 셋업 절 참고) |
| `build-schools.ts` | `npm run build:schools [-- <원본디렉터리>]` | 전국 초등학교 원본 JSON을 지역별 경량 JSON(`public/schools/`)으로 변환. 생성물이 저장소에 커밋돼 있으므로 학교 데이터 갱신 때만 재실행 |
