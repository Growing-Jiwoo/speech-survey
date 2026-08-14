-- ════════════════════════════════════════════════════════════════════
-- 아동 읽기 선별검사 — 초기 스키마 (통합본, 사용자 확정 2026-08-14)
--
-- 구 001~015 마이그레이션을 하나로 합쳤다. 상쇄되거나 죽은 것은 제외했다:
--   · 001의 폐기 테이블(003이 drop) — 단 storage 버킷 생성은 살아남는 효과라 보존
--   · 002(003이 지운 child_age를 건드리는 레거시)
--   · 012 + 013 + 014 (discontinued_at 추가·주석·삭제 = 순효과 0)
--   · 005의 구 record_login_failure (006이 create or replace로 덮어씀)
--   · 011의 examiner_type (015가 drop)
-- 구 이력은 git log로 확인할 수 있다.
--
-- Supabase SQL Editor에서 위→아래 순서대로 한 번에 실행한다.
-- 정책 없음 = anon 전면 차단, 서버 라우트의 service role만 접근.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. 학급 코드 (관리자가 발급, sessions가 참조하므로 먼저 만든다) ──
create table class_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,   -- 6자리, 혼동 문자(0·O·1·I·L) 제외 대문자+숫자
  school_region text not null,
  school_id     text not null,
  school_name   text not null,
  grade         int  not null check (grade between 1 and 6),
  class_no      int  not null check (class_no between 0 and 99),  -- 0 = 단일학급(반 없음)
  teacher_name  text not null,
  teacher_phone text,                   -- 저장 규약: 앱(zod)이 하이픈 제거 후 저장
  teacher_email text,
  created_at    timestamptz not null default now(),
  check (teacher_phone is not null or teacher_email is not null)
);

-- ── 2. 검사 세션 ──
-- 학급 정보(school_*·grade·class_no·teacher_*)는 세션 생성 시 코드에서 비정규화 복사한다.
-- 코드를 나중에 고쳐도 이미 만든 세션은 검사 당시 값을 유지한다(임상 기록).
create table sessions (
  id                    uuid primary key default gen_random_uuid(),
  class_code_id         uuid not null references class_codes(id) on delete restrict,
  child_no              int  not null check (child_no between 1 and 99),  -- 학급 내 출석 번호
  school_region         text not null,
  school_id             text not null,
  school_name           text not null,
  birth_ymd             char(6) not null check (birth_ymd ~ '^[0-9]{6}$'),
  grade                 int  not null check (grade between 1 and 6),
  class_no              int  not null check (class_no between 0 and 99),
  gender                text not null check (gender in ('남','여')),
  child_name            text not null,
  teacher_name          text not null,
  teacher_phone         text,
  teacher_email         text,
  checklist             text[] not null default '{}',  -- 검사자 체크리스트 영역 코드
  started_at            timestamptz not null default now(),
  submitted_at          timestamptz,                    -- null = 미제출
  guardian_consented_at timestamptz,                    -- 법정대리인 동의 확인 시각(제22조의2)
  check (teacher_phone is not null or teacher_email is not null)
);

-- ── 3. 녹음 메타 (재녹음 시 attempt_no 증가, 모든 시도 보존) ──
create table recordings (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  item_code    text not null,   -- 페이지 코드: p_rw_meaning, p_rw_nonsense, p_rs01~04
  attempt_no   int  not null,
  audio_path   text not null,   -- storage: <sessionId>/<itemCode>_<attemptNo>.<ext>
  duration_sec numeric(5,2),
  created_at   timestamptz not null default now(),
  unique (session_id, item_code, attempt_no)
);

-- ── 4. 낱말 쓰기 답 (G1, 검사 중 검사자 입력 — 최종 제출 시 일괄 저장) ──
create table writing_answers (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  item_code  text not null,     -- ww01~ww10
  can_write  boolean not null,
  unique (session_id, item_code)
);

-- ── 5. 낱말 해독 O/X (관리자 채점 전용 저장소 — 현장 채점은 2026-08-13 폐기) ──
create table reading_marks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  item_code  text not null,     -- rw01~rw14 (의미 7 + 무의미 7)
  correct    boolean not null,
  unique (session_id, item_code)
);

-- ── 6. 어절 점수 (문장 읽기유창성 rs..= 관리자 채점 / 문장 쓰기 sw..= 검사 중 수집) ──
create table sentence_scores (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  item_code  text not null,     -- rs01~rs04, sw01~sw05
  words      int  not null check (words >= 0),
  unique (session_id, item_code)
);

-- ── 7. 관리자 로그인 무차별 대입 방어 ──
-- 인메모리는 서버리스에서 인스턴스마다 초기화돼 무력하므로 공유 저장소(DB)를 쓴다.
create table login_attempts (
  ip           text primary key,
  fail_count   int  not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- ── 8. 로그인 실패 원자적 기록 (read-then-write 경쟁조건 제거) ──
-- 잠금 만료 후 첫 실패는 카운트를 1로 리셋한다 — 그러지 않으면 오답 1회로 잠금이
-- 무한 연장돼 공격자가 10분당 요청 1건으로 관리자 로그인을 봉쇄할 수 있다.
create or replace function record_login_failure(p_ip text, p_lock_ms bigint)
returns void language sql as $$
  insert into login_attempts (ip, fail_count, locked_until, updated_at)
  values (p_ip, 1, now() + (p_lock_ms::text || ' milliseconds')::interval, now())
  on conflict (ip) do update
    set fail_count   = case
          when login_attempts.locked_until is not null and login_attempts.locked_until < now() then 1
          else login_attempts.fail_count + 1
        end,
        locked_until = now() + (p_lock_ms::text || ' milliseconds')::interval,
        updated_at   = now();
$$;

-- 하드닝: service role 경유 호출만 허용 + search_path 고정(동명 객체 바꿔치기 방지)
revoke execute on function record_login_failure(text, bigint) from public, anon, authenticated;
alter function record_login_failure(text, bigint) set search_path = public;

-- ── 9. RLS (정책을 만들지 않는 것이 곧 anon 전면 차단) ──
alter table class_codes      enable row level security;
alter table sessions         enable row level security;
alter table recordings       enable row level security;
alter table writing_answers  enable row level security;
alter table reading_marks    enable row level security;
alter table sentence_scores  enable row level security;
alter table login_attempts   enable row level security;

-- ── 10. 조회 인덱스 ──
-- FK 참조 측은 Postgres가 인덱스를 자동 생성하지 않으므로 조회 패턴에 맞춰 직접 만든다.
create index recordings_session_id_idx        on recordings(session_id);
create index writing_answers_session_id_idx   on writing_answers(session_id);
create index reading_marks_session_id_idx     on reading_marks(session_id);
create index sentence_scores_session_id_idx   on sentence_scores(session_id);
create index sessions_started_at_idx          on sessions(started_at desc);
-- 복합 하나로 통일: 아동번호 중복 확인(공개 API가 아동마다 호출)이 두 컬럼을 함께 쓰고,
-- 코드별 세션 수 집계·on delete restrict 검사는 선두 컬럼만으로 커버된다.
create index sessions_class_code_id_child_no_idx on sessions(class_code_id, child_no);

-- ── 11. 녹음 스토리지 버킷 (비공개 — 관리자에게만 1시간 서명 URL 발급) ──
insert into storage.buckets (id, name, public) values ('recordings', 'recordings', false)
on conflict (id) do nothing;
