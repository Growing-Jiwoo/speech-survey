# app/api/admin/codes/ — 학급 코드 발급 · 목록 · 삭제

관리자가 학급 하나에 대해 6자리 코드를 만들고, 그 코드로 검사 현장이 세션을 연다.
학교·학년·반·담임·연락처가 **처음이자 마지막으로 입력되는 지점**이라, 여기서 만든 행이
이후 모든 세션의 학급 정보 원본이 된다(`POST /api/sessions`가 코드를 다시 조회해 복사).

인증 코드는 없다 — `middleware.ts`가 `/api/admin/*` 전체에 관리자 쿠키 검증을 건다.

| 파일 | 역할 |
|---|---|
| `route.ts` | `POST` 발급(zod `classCodeCreateSchema` 검증 → `generateClassCode()` → insert), `GET` 목록 |
| `[id]/route.ts` | `DELETE` 삭제. UUID 형식 검증 후 `deleteClassCode` |

## 설계 의도 · 제약

- **코드 문자열을 여기서 만들지 않는다.** 생성은 `lib/class-code.ts`(`node:crypto`의 `randomInt`),
  알파벳·길이는 `lib/schema.ts`가 단일 소스다 — 발급과 입력 검증이 어긋나면 발급된 코드를
  시작 화면이 거부한다.
- **unique 충돌은 재시도로 흡수한다.** `POST`는 코드를 새로 뽑아 최대 5회 다시 넣어 보고,
  그래도 실패하면 502를 낸다. 31^6 공간에서 5연속 충돌은 확률이 아니라 장애 신호라 조용히
  더 돌리지 않고 로그를 남기며 끊는다.
- **응답 모양을 DB 모양과 분리한다.** `GET`은 조인해 온 `sessions` 배열을 `session_count`
  하나로 펴서 내려준다 — 목록 화면이 필요한 것은 "이 코드로 검사한 건수"뿐이고, 세션 원본 키를
  관리자 화면 밖으로 흘릴 이유가 없다.
- **삭제 거부는 두 겹이다.** 화면은 `session_count === 0`인 코드에만 삭제 버튼을 보이고,
  라우트는 `deleteClassCode`가 `'in_use'`를 돌려주면 409를 낸다. 최종 방어는 DB의
  `sessions.class_code_id … on delete restrict`다 — 이 셋 중 하나만 고쳐서 삭제를 허용하지 말 것.
  코드가 지워지면 그 코드로 만든 세션의 학급 출처가 사라진다.
- `dynamic = 'force-dynamic'` — 발급 직후 목록이 최신이어야 하므로 라우트 응답을 캐시하지 않는다.

## PII

발급 요청 본문과 목록 응답에 **담임 성명·전화·이메일**이 들어 있다. 전화번호는 zod 스키마가
하이픈을 제거한 형태로 정규화해 저장한다(DB 주석의 저장 규약). 이 데이터는 세션과 달리
`class_codes`에 영구 보관되므로 파기 절차의 대상이다 — 루트 README "운영 · 개인정보" 절 참고.

테스트: `tests/admin-codes-route.test.ts`.
