# public/schools/ — 학교 목록 데이터 (생성물)

`scripts/build-schools.ts`가 만드는 **생성물이며 직접 편집하지 않는다**. 갱신은
`npm run build:schools`로 재생성해 커밋한다.

- `index.json` — 지역(시도교육청) 목록 + 지역별 학교 수. 시작 화면의 지역 Select가 로드
- `<지역slug>.json` — 해당 지역 초등학교 배열 `{ id, name, addr }`. 지역 선택 시 로드

정적 파일로 서빙해(API 불필요) 시작 화면의 학교 검색이 서버 왕복 없이 동작한다.
지역 slug·이름의 단일 소스는 `lib/schools.ts`의 `REGIONS`.
