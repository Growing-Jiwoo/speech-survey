# app/ — Next.js App Router (화면 · API)

페이지는 **흐름 제어와 상태 로드/저장만** 담당하고, 문항 UI·표 등은 `components/`,
로직은 `lib/`에 둔다.

## 참여자(아동) 흐름

```
/            시작 — 아동 정보 입력(주로 교사가 입력) → POST /api/sessions → 세션·토큰 발급
/survey      검사 진행 — 마이크 확인 → 29문항 위저드(녹음 18 · 낱말쓰기 10 · 체크리스트 1)
/review      제출 전 검토 — 문항별 완료 여부 확인, 번호 클릭 시 해당 문항으로 복귀(?q=N&from=review)
/done        종료 — 진행 상태(localStorage) 파기
```

- 진행 상태는 `lib/survey-state.ts`(localStorage)에 저장돼 새로고침·탭 닫힘 후 재개된다.
- 녹음은 각 문항에서 **즉시 업로드**되고, 낱말쓰기·체크리스트는 최종 제출 시 저장된다.

## 관리자 흐름

```
/admin/login 로그인(argon2 검증 → HttpOnly 쿠키)
/admin       대시보드 — KPI·학교별 현황·세션 목록(필터/정렬 상태의 단일 소스는 URL)
/admin/[id]  결과지 — 녹음 청취(서명 URL)·낱말쓰기·체크리스트·세션 삭제(PII 파기)
```

인증은 `middleware.ts`가 `/admin`·`/api/admin/*` 전체를 보호한다(라우트는 인증 코드 없음).

## 파일

| 경로 | 역할 |
|---|---|
| `layout.tsx` | 전역 레이아웃 — 폰트(Noto/Lexend)·메타데이터·라이트 전용 `viewport` |
| `providers.tsx` | react-query 클라이언트(관리자 데이터 캐싱 설정) |
| `globals.css` | 디자인 토큰(@theme)·공용 버튼/카드 클래스·접근성 전역 규칙(포커스 링·터치·모션) |
| `api/` | 서버 라우트 — [api/README.md](api/README.md) 참고 |
