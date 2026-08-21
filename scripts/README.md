# scripts/ — 개발·운영 보조 스크립트 (tsx 실행)

| 스크립트 | 실행 | 역할 |
|---|---|---|
| `hash-password.ts` | `npm run hash-password -- '비밀번호'` | 관리자 비밀번호의 argon2id 해시 생성. **출력 2줄의 용도가 다르다**: "원본 해시"는 Vercel 대시보드용, "`.env.local`용"은 `$`를 `\$`로 이스케이프한 로컬 dotenv용(섞어 쓰면 로그인 불가 — 루트 README 셋업 절 참고) |
| `build-schools.ts` | `npm run build:schools [-- <원본디렉터리>]` | 전국 초등학교 원본 JSON을 지역별 경량 JSON(`public/schools/`)으로 변환. 생성물이 저장소에 커밋돼 있으므로 학교 데이터 갱신 때만 재실행 |
| `build-roster-template.ts` | `npm run build:roster-template` | 교사가 `/apply`에서 내려받는 **학급 명단 양식**(`public/roster-template.xlsx`) 생성. 머리글을 `lib/roster`의 `COL_LABEL`에서 가져오므로 그 상수를 고치면 **반드시 다시 돌릴 것** — 어긋남은 `tests/roster.test.ts`가 이 산출물을 실제 파서에 물려 잡는다. 데이터를 덤프한 격자가 아니라 **교사가 손으로 채우는 서식**이라 병합·색·테두리·머리글 고정·성별 드롭다운을 넣는다(빈 서식이 문의를 부른 전례 2026-08-21). ZIP·XML을 손으로 조립하지만 런타임이 아니라 여기 있는 이유는 파일 머리주석 참고 |
| `extract-form-layout.mjs` | `node scripts/extract-form-layout.mjs <pdf> <의미 첫낱말> <무의미 첫낱말> [쓰기 의미] [쓰기 무의미]` | 검사지 PDF에서 스탬핑 좌표를 뽑아 `lib/forms/*-layout.ts`를 만든다. **검사지가 개정되면 좌표를 손으로 고치지 말고 이 스크립트를 다시 돌려 통째로 교체한다** — 손으로 고치면 인쇄물의 점수가 칸을 벗어나도 아무도 모른다. 낱말 쓰기 앵커를 생략하면 낱말 쓰기가 없는 양식(G2)으로 본다 |
| `vendor-fonts.mjs` | `node scripts/vendor-fonts.mjs` | 웹폰트를 구글에서 받아 `public/fonts/**`·`app/fonts.css`로 벤더링. **빌드가 네트워크를 타지 않게 하려는 것**이라 `next/font/google`로 되돌리면 안 된다(빌드마다 폰트를 받아 한 번의 실패로 배포가 죽는다). 생성물이 커밋돼 있으므로 폰트·웨이트를 바꿀 때만 재실행 — 스크립트의 `FAMILIES` 수정 후 실행 |
