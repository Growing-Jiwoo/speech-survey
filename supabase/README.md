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

## 설계 메모

- **RLS는 전면 차단**(anon 정책 없음) — 모든 접근은 서버 라우트의 service role 경유.
- 녹음 파일은 스토리지 버킷 `recordings`에 `{sessionId}/{itemCode}_{attemptNo}.{ext}`로 저장.
- 스키마를 바꾸면 `lib/db.ts`의 행 타입(SessionRow 등)도 함께 갱신할 것.
