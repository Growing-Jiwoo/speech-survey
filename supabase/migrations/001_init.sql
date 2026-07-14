create table questions (
  id          serial primary key,
  order_no    int  not null unique,
  text        text not null,
  difficulty  text not null check (difficulty in ('easy','medium','hard'))
);

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  child_name   text not null,
  child_age    int  not null check (child_age between 3 and 19),
  started_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table responses (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references sessions(id),
  question_id      int  not null references questions(id),
  status           text not null check (status in ('in_progress','completed','skipped')),
  retry_count      int  not null default 0,
  final_attempt_id uuid,
  unique (session_id, question_id)
);

create table attempts (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references responses(id),
  attempt_no   int  not null,
  stt_text     text not null default '',
  audio_path   text not null,
  duration_sec numeric(5,2),
  created_at   timestamptz not null default now(),
  unique (response_id, attempt_no)
);

alter table questions enable row level security;
alter table sessions  enable row level security;
alter table responses enable row level security;
alter table attempts  enable row level security;
-- 정책 없음 = anon 전면 차단. service role만 접근.

insert into storage.buckets (id, name, public) values ('recordings','recordings', false)
on conflict (id) do nothing;
