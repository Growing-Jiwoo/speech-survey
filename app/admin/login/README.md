# app/admin/login/ — 관리자 로그인 화면

`page.tsx` 한 파일. 비밀번호 한 칸을 받아 `POST /api/admin/login`에 넘기고, 성공하면
(서버가 HttpOnly 쿠키를 심은 뒤) `/admin`으로 이동한다. 비밀번호 검증은 전부 서버에 있다 —
이 화면은 해시도, 정책도, 잠금 상태도 알지 못한다.

**이 저장소에서 `/admin` 아래 유일하게 인증이 걸리지 않은 경로다.** `middleware.ts`가
`/admin/login`·`/api/admin/login`·`/api/admin/logout`을 명시적으로 통과시킨다(로그인 화면까지
보호하면 리다이렉트가 자기 자신으로 돌아 무한 루프가 된다). 이 폴더에 다른 화면을 만들면
그 화면도 인증 없이 열리므로, 로그인 이외의 것을 여기 두지 말 것.

## 설계 의도

- **`<form>` + `type="submit"`을 쓴다.** 버튼 `onClick`만으로도 동작은 하지만, 그러면 Enter 제출과
  브라우저·비밀번호 관리자의 `autocomplete="current-password"` 연동이 죽는다(코드 주석의 근거).
- 에러 문구는 서버 응답을 그대로 보여준다. 오답(401)과 잠금(429)은 서버가 문구로 구분해 주고,
  화면은 두 경우를 구별하지 않는다 — 로그인 실패 사유를 화면 로직으로 추론하지 말 것.
- 제출 중에는 입력·버튼을 잠그고 `LoadingOverlay`를 띄운다(연타로 실패 횟수를 스스로 소모하지
  않도록 — 실패는 IP당 5회에서 10분 잠금이다).

로그인 정책(잠금 횟수·시간·글로벌 백오프)을 고치려면 여기가 아니라
[../../api/admin/login/README.md](../../api/admin/login/README.md)와 `lib/login-policy.ts`를 볼 것.
