-- 005_cascade_and_indexes.sql — FK ON DELETE CASCADE + 조회 인덱스 + 원자적 로그인 실패기록 RPC.
-- 비파괴적·재실행 안전(idempotent). Supabase SQL Editor에서 직접 실행할 것.

-- 1) recordings.session_id FK 재정의 (세션 삭제 시 녹음 메타 자동 삭제)
alter table recordings drop constraint if exists recordings_session_id_fkey;
alter table recordings add constraint recordings_session_id_fkey
  foreign key (session_id) references sessions(id) on delete cascade;

-- 2) writing_answers.session_id FK 재정의
alter table writing_answers drop constraint if exists writing_answers_session_id_fkey;
alter table writing_answers add constraint writing_answers_session_id_fkey
  foreign key (session_id) references sessions(id) on delete cascade;

-- 3) 조회 인덱스 (세션 상세·목록 정렬)
create index if not exists recordings_session_id_idx      on recordings(session_id);
create index if not exists writing_answers_session_id_idx  on writing_answers(session_id);
create index if not exists sessions_started_at_idx         on sessions(started_at desc);

-- 4) 로그인 실패 원자적 증가(read-then-write 경쟁조건 제거). lib/db.recordLoginFailure가 rpc로 호출.
create or replace function record_login_failure(p_ip text, p_lock_ms bigint)
returns void language sql as $$
  insert into login_attempts (ip, fail_count, locked_until, updated_at)
  values (p_ip, 1, now() + (p_lock_ms::text || ' milliseconds')::interval, now())
  on conflict (ip) do update
    set fail_count   = login_attempts.fail_count + 1,
        locked_until = now() + (p_lock_ms::text || ' milliseconds')::interval,
        updated_at   = now();
$$;
