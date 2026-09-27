# app/api/sessions/form/ — 진행 중인 세션의 검사지

`route.ts`(`POST`) 한 파일. 바디 `{ sessionId, sessionToken }`을 받아 세션 토큰을 검증하고,
**세션 행의 학년**으로 고른 검사지(`formForGrade`)를 `{ form }`으로 내려준다. 검사 화면(`/survey`)과
검토 화면(`/review`)이 `hooks/useSurveyForm`으로 부른다.

## 왜 있나

검사지 문항을 공개 파일에 두지 않으려는 것이다. 화면이 `lib/forms`를 import하면 문항 전체가
`/_next/static`의 JS 청크에 실리는데, 그 파일은 **인증 없이 누구나** 받을 수 있다. 이 라우트를
거치면 문항은 유효한 세션 토큰(= 학급 코드로 검사를 시작한 기기)에만 간다. `npm run build`의
`scripts/check-client-bundle.ts`가 청크에 문항이 없는지 검사한다.

⚠️ 검사를 시작한 사람은 화면에서 문항을 그대로 보므로 이것은 **열람 제한**이지 비밀 유지가
아니다 — 목표는 "학급 코드 없이 아무나 받을 수 있는 파일"에서 빼는 것까지다.

## 설계 의도 · 제약

- **GET이 아니라 POST다.** 토큰을 쿼리 문자열에 실으면 접근 로그·브라우저 기록에 남는다.
- **학년은 클라이언트가 아니라 세션 행이 정한다**(`sessionState`) — 제출 라우트와 같은 규칙.
- **상태 코드가 화면 동작을 가른다.** 401(토큰 없음·위조·만료 24시간)·404(세션 없음)·
  409(이미 제출)는 재시도해도 같아서 화면이 진행 상태를 지우고 처음으로 보낸다. 502(DB 오류)와
  네트워크 오류는 [다시 시도]를 준다(`components/survey/FormStatus.tsx`).
- 응답은 `Cache-Control: no-store`.
- `runtime = 'nodejs'`.

## PII

요청·응답에 아동 정보가 없다(세션 id·토큰 → 양식).

테스트: `tests/session-form-route.test.ts`.
