# supabase/ — DB 마이그레이션

Supabase CLI를 쓰지 않는다 — **SQL Editor에서 번호 순서대로 직접 실행**한다(적용 순서와
각 파일의 주의사항은 루트 README의 셋업 절 참고). 실행 이력이 DB에 남지 않으므로 각 파일은
재실행 안전(idempotent)하게 작성하거나 파일 상단에 파괴 여부를 명시한다.

| 파일 | 내용 |
|---|---|
| `001_init.sql` | 초기 스키마 |
| `002_widen_child_age.sql` | ⚠️ **레거시 — 실행 금지.** 003 이전 스키마 전용(파일 상단 주석 참고) |
| `003_kodys_redesign.sql` | 읽기 선별검사 스키마로 재설계 — ⚠️ 기존 테이블·데이터 폐기 |
| `004_login_attempts.sql` | 관리자 로그인 브루트포스 방어 테이블 |
| `005_cascade_and_indexes.sql` | FK ON DELETE CASCADE(세션 삭제 시 자동 정리)·조회 인덱스·`record_login_failure` RPC(원자적 실패 기록) |
| `006_login_lockout_decay.sql` | 잠금 만료 후 실패 카운트 리셋(잠금 무한 연장 DoS 완화) |
| `007_harden_rpc.sql` | RPC EXECUTE 권한 회수·search_path 고정(방어 심층) |
| `008_guardian_consent.sql` | 법정대리인 동의 확인 시각(`guardian_consented_at`) — 제22조의2 확인 의무의 감사 증적 |
| `009_reading_marks.sql` | 낱말 해독 의미 낱말 O/X 테이블 — 원래 검사자 현장 채점(중단 규칙 판정 근거)이었으나, 현장 채점 폐기(담당자 확정 2026-08-13) 이후 관리자 최종 채점 저장소로 쓰인다 |
| `010_class_and_contact.sql` | 단일학급(반 0) 허용·담임 연락처 전화/이메일 분리 |
| `011_scoring.sql` | 어절 수 점수 테이블(`sentence_scores`)·검사자 구분(`examiner_type`) |
| `012_discontinued.sql` | 중단 규칙 ① 적용 시각(`discontinued_at`)을 추가 — 진행률 분모 판정에 썼다(014에서 컬럼 제거됨) |
| `013_discontinued_comment.sql` | 위 컬럼 주석만 갱신(스키마 변경 없음) — 규칙 ①의 미실시 범위가 문장·쓰기에서 무의미·문장으로 바뀜(담당자 확정 2026-08-11) |
| `014_drop_discontinued.sql` | `discontinued_at` 컬럼 제거(중단 규칙 폐기 — 담당자 확정 2026-08-13) |

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
