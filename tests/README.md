# tests/ — vitest 테스트 (node 환경)

`npm test`. jsdom·@testing-library 없이 **node 환경만** 쓴다 — 화면 로직은 lib/로 추출해
순수 함수로 테스트하는 것이 이 저장소의 관례다(컴포넌트 렌더 테스트는 의도적으로 없음).

## 배치·네이밍

- lib 모듈: `<모듈명>.test.ts` / API 라우트: `<세그먼트>-route.test.ts`
  (여러 관리자 라우트 묶음은 `admin-routes.test.ts`)
- import는 항상 `@/` 별칭. `it()` 설명은 한국어, 회귀 방지 핀은 `[REGRESSION]` 접두.

## 모킹 관례

- **모듈 경계에서 모킹**: 라우트 테스트는 `vi.mock('@/lib/db', …)`를 라우트 import보다 앞에
  선언(호이스팅). `beforeEach`에서 `vi.clearAllMocks()` 후 기본 resolved 값 재주입.
- **db.ts 자체를 테스트할 때만** supabase를 스텁: `db.test.ts`의 체이너블(thenable) 프록시
  참고 — from(테이블)별 응답 큐를 소비한다.
- **인증은 실물 사용**: 토큰은 모킹하지 않고 실제 `createToken`/`createSessionToken`으로
  발급해 서명 검증까지 실행한다(env 모킹 값과 시크릿을 맞출 것).
- localStorage는 Map 기반 스텁(survey-state.test.ts), fetch는 `vi.stubGlobal`,
  환경변수는 `vi.stubEnv`.

## 단언 스타일

상태코드 + 호출 인자 + **"호출되지 않았음"으로 가드 순서 검증** + 에러 응답에 내부 오류
원문이 새지 않는지(`expect(json.error).not.toMatch(/내부문구/)`).
