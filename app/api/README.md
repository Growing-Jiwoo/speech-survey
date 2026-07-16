# app/api/ — 서버 라우트

모든 DB/스토리지 접근은 여기(service role)에서만 일어난다 — 클라이언트에는 Supabase 키가
전혀 노출되지 않고, RLS는 anon 전면 차단이다. 에러 응답은 내부 정보 없는 사용자용 문구만
담는다(`lib/request.jsonError`), 원문은 `console.error`로만 남긴다.

## 공개 라우트 (참여자)

| 라우트 | 역할 · 방어 |
|---|---|
| `POST /api/sessions` | 세션 생성. zod 검증(`lib/schema`) + IP 레이트리밋(인메모리, best-effort) → **세션 스코프 HMAC 토큰**(24h) 발급. 이후 쓰기 요청은 이 토큰 필수 |
| `POST /api/recordings` | 녹음 업로드. 검증 사슬: 형식 → 세션 토큰 → 5MB 상한 → MIME allowlist+매직바이트 → 미제출 세션인지(제출 후 변조 차단) → 세션당 총량 상한. DB 기록 실패 시 방금 올린 객체를 보상 정리(고아 파일 방지) |
| `POST /api/sessions/submit` | 최종 제출. 낱말쓰기/체크리스트 형식 검증 → 토큰 검증 → 미제출 세션만 갱신(재제출 409) |

## 관리자 라우트 (인증: middleware)

| 라우트 | 역할 |
|---|---|
| `POST /api/admin/login` | argon2id 해시 검증 + DB 기반 레이트리밋(IP 5회/글로벌 50회, 10분 잠금·감쇠) → HttpOnly 쿠키(8h) |
| `POST /api/admin/logout` | 쿠키 즉시 만료(만료된 쿠키로도 호출 가능해야 하므로 middleware 예외) |
| `GET /api/admin/sessions` | 목록(최대 5,000행 — 초과 시 서버 페이지네이션 도입 필요, 코드에 경고 로그) |
| `GET /api/admin/sessions/[id]` | 결과지. 녹음은 서명 URL(1h)로 변환해 내려주고 스토리지 내부 경로는 비노출 |
| `DELETE /api/admin/sessions/[id]` | 세션 영구 삭제(PII 파기) — 스토리지 전체 페이지네이션 후 행 삭제(CASCADE) |

## 관례

- 런타임: 업로드·argon2 등은 `runtime='nodejs'` 고정(Edge 불가 의존성).
- IP 판별은 반드시 `lib/request.clientIp` 사용(위조 가능한 `x-forwarded-for` 첫 홉 금지).
- 새 라우트의 에러 응답은 `jsonError(문구, 상태)`로 통일.
