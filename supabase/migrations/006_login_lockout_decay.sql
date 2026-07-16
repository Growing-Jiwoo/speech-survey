-- 006_login_lockout_decay.sql — 로그인 잠금 DoS 완화: 잠금 만료 후 첫 실패는 카운트를 1로 리셋.
-- 기존 동작은 잠금이 풀려도 fail_count가 임계값 이상으로 남아, 오답 1회만으로 즉시 재잠금됐다
-- (공격자가 10분당 요청 1건으로 글로벌 잠금을 무기한 유지 가능). 리셋 후에는 재잠금에
-- 임계값만큼의 신규 실패가 다시 필요하다. 재실행 안전(create or replace).
-- Supabase SQL Editor에서 직접 실행할 것.

create or replace function record_login_failure(p_ip text, p_lock_ms bigint)
returns void language sql as $$
  insert into login_attempts (ip, fail_count, locked_until, updated_at)
  values (p_ip, 1, now() + (p_lock_ms::text || ' milliseconds')::interval, now())
  on conflict (ip) do update
    set fail_count   = case
          -- 직전 잠금 창(locked_until)이 이미 지났으면 새 창 시작: 누적 대신 1부터
          when login_attempts.locked_until is not null and login_attempts.locked_until < now() then 1
          else login_attempts.fail_count + 1
        end,
        locked_until = now() + (p_lock_ms::text || ' milliseconds')::interval,
        updated_at   = now();
$$;
