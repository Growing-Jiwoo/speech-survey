# app/admin/ — 관리자 화면 라우트

채점자(교사·연구자)가 쓰는 화면의 라우트 껍데기. 목록(`/admin`)과 결과지(`/admin/[id]`)가
여기 있고, 학급 코드 발급([codes/](codes/README.md))·로그인([login/](login/README.md))은
각자 README를 둔다.

## 인증은 여기 없다

`middleware.ts`가 `/admin`·`/api/admin/*` 전체를 가로채 관리자 쿠키를 검증한다. 미인증 요청은
`/admin/login`으로 리다이렉트되므로, **이 폴더의 페이지에는 인증 코드가 한 줄도 없다.**
새 관리자 화면을 추가할 때 인증 검사를 직접 넣지 말 것 — 경로만 `/admin` 아래면 보호된다.
예외는 `middleware.ts`가 명시적으로 통과시키는 `/admin/login` 하나뿐이다.

## 파일

| 파일 | 역할 |
|---|---|
| `page.tsx` | `/admin` 목록. `AdminDashboard`를 Suspense로 감싼 껍데기 |
| `[id]/page.tsx` | `/admin/[id]` 결과지. `AdminDetailView`를 Suspense로 감싼 껍데기 |

## 설계 의도

- **페이지가 데이터를 가져오지 않는다.** 세션 목록·결과지 모두 하위 클라이언트 컴포넌트가
  react-query로 로드·캐싱한다(`hooks/useAdminQueries.ts`). 그래서 이 폴더의 파일은
  서버 컴포넌트지만 하는 일이 레이아웃 지정과 Suspense 경계뿐이다.
- **Suspense는 장식이 아니다.** 두 화면 모두 `useSearchParams`를 쓰므로(필터·정렬 상태의 단일
  소스가 URL) Suspense가 없으면 빌드가 페이지 전체를 CSR로 바일아웃한다. 껍데기를 지우거나
  Suspense를 걷어내지 말 것.
- 레이아웃 폭이 두 화면에서 다르다: `/admin`은 목록 표가 넓어 좌우 여백만 두고 창을 꽉 채우고
  (`w-full px-4 …`), `/admin/[id]`는 폭 지정 자체를 `AdminDetailView`에 맡긴다.
- 채점 로직·필터 상태를 여기 두지 말 것 — 채점 계산은 `lib/scoring.ts`, 필터/정렬 파생은
  `lib/adminStats.ts`, 화면 조립은 `components/admin/`이다.

## PII

두 화면 모두 아동 실명·생년월일·학교·반·번호와 담임 연락처를 표시하고, 결과지는 녹음까지
재생한다. 로그아웃 시 react-query 캐시를 통째로 비우는 규칙(`components/admin/README.md`)은
여기에 화면을 추가해도 그대로 지킬 것.
