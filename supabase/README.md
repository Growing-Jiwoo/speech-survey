# supabase/ — DB 마이그레이션

Supabase CLI를 쓰지 않는다 — **SQL Editor에서 직접 실행**한다(적용 방법은 루트 README의 셋업 절
참고). 실행 이력이 DB에 남지 않으므로 파일은 재실행 안전(idempotent)하게 작성하거나 파일 상단에
파괴 여부를 명시한다.

| 파일 | 내용 |
|---|---|
| `001_init.sql` | 초기 스키마 통합본(사용자 확정 2026-08-14) — 구 001~015를 하나로 합쳤다. 상쇄되는 마이그레이션(001의 폐기 테이블, 002, 012+013+014, 011의 `examiner_type`, 005의 구 `record_login_failure`)은 제외했다. **구 이력은 git log로 확인.** |

## 설계 메모

- **RLS는 전면 차단**(anon 정책 없음) — 모든 접근은 서버 라우트의 service role 경유.
- 녹음 파일은 스토리지 버킷 `recordings`에 `{sessionId}/{itemCode}_{attemptNo}.{ext}`로 저장.
- **`sentence_scores`에는 두 종류의 점수가 섞여 있다** — 문장 읽기유창성(`rs..`, 관리자 채점)과
  문장 쓰기(`sw..`, G2에서 검사 중 수집). 모양이 `(item_code, words)`로 같아 테이블을 공유한다.
  관리자 채점 저장(`saveScores`)의 "이번에 안 보낸 행 삭제"는 반드시 `rs..`로 범위를 한정해야 한다
  — 범위를 두지 않으면 채점을 저장할 때마다 아동의 문장 쓰기 점수가 지워진다(테스트로 고정돼 있다).
- 쓰기 답의 저장 위치는 과제 종류에 따라 갈린다: 낱말 쓰기(G1) → `writing_answers.can_write`(boolean),
  문장 쓰기(G2) → `sentence_scores.words`(정수). 읽는 쪽은 `lib/scoring.ts`의 `scoreInputFrom`이 합친다.
- 스키마를 바꾸면 `lib/db.ts`의 행 타입(SessionRow 등)도 함께 갱신할 것.
