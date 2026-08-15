# app/api/admin/login/ — 관리자 로그인

`route.ts` 한 파일. 비밀번호를 argon2id 해시(`ADMIN_PASSWORD_HASH`)와 대조하고, 통과하면
HMAC 관리자 토큰을 만들어 HttpOnly 쿠키로 심는다. 이 쿠키가 이후 `middleware.ts`가 검증하는
그 쿠키다 — 관리자 인증 사슬이 시작되는 유일한 지점이다.

**이 라우트 자체는 인증 뒤에 있지 않다.** `middleware.ts`가 `/api/admin/login`을 예외로
통과시킨다(인증을 받으러 오는 요청이므로). 그래서 무차별 대입 방어를 라우트가 직접 진다.

## 방어가 2단인 이유

| 단계 | 대상 | 동작 |
|---|---|---|
| per-IP 하드 잠금 | 한 IP에서 반복 시도 | 실패 `IP_MAX_FAILS`회 → `LOCK_MS` 동안 429 |
| 글로벌 점증 지연 | IP를 갈아 가며 시도 | 전역 실패 누적에 비례한 `sleep`(상한 2초) |

전역에도 하드 잠금을 걸던 시절이 있었으나, 그러면 공격자가 실패를 쌓는 것만으로 **정상
관리자의 로그인까지 봉쇄**할 수 있었다. 지금은 전역은 마찰(지연)만 주고 봉쇄하지 않는다 —
가용성을 택한 의도된 절충이다. 지연에 상한을 둔 것도 이유가 있다: 지연은 서버리스 함수 실행
시간을 그대로 잡아먹어, 상한이 없으면 지연 요청을 대량으로 보내는 것이 곧 자원 소모 공격이 된다.

실패 카운터를 **인메모리가 아니라 DB(`login_attempts`)** 에 두는 이유도 같은 맥락이다 —
서버리스는 인스턴스마다 메모리가 따로라 인메모리 카운터가 사실상 무력하다. 잠금 만료 후 첫
실패가 카운트를 1로 리셋하는 규칙은 SQL 함수(`record_login_failure`) 쪽에 있다.

## 제약

- `runtime = 'nodejs'` 고정 — `@node-rs/argon2`가 네이티브 바인딩이라 Edge에서 돌지 않는다.
  이 줄을 지우면 배포에서 터진다.
- 정책 상수(`IP_MAX_FAILS`·`LOCK_MS`·`GLOBAL_KEY`·`globalBackoffMs`)는 `lib/login-policy.ts`가
  단일 소스다. 여기에 숫자를 다시 적지 말 것 — 테스트가 그 모듈을 본다.
- 쿠키 `maxAge`는 `ADMIN_TTL_MS / 1000`으로 토큰 TTL과 같은 값에서 유도한다. 쿠키만 늘리면
  살아 있는 쿠키로 죽은 토큰을 들고 오는 상태가 생긴다.
- 비밀번호 비교는 argon2 `verify`가 상수시간으로 처리한다 — 직접 문자열 비교를 넣지 말 것.
- 해시 검증 예외는 삼켜서 실패로 처리하고 원문은 `console.error`로만 남긴다(응답에 내부 사정 비노출).

`ADMIN_PASSWORD_HASH`를 `.env.local`에 넣을 때의 `$` 이스케이프 함정은 루트 README 셋업 절 참고.
테스트: `tests/login-route.test.ts`, `tests/login-policy.test.ts`.
