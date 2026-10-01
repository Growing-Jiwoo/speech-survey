-- ════════════════════════════════════════════════════════════════════
-- 006: 쓰기 검사 「스캔본으로 올리기」 — 쓰기 방식 + 기록지 스캔본
--
-- 왜: 쓰기를 아이마다 두 방식 중 하나로 고른다(담당자 확정 2026-09-30 — 두 방식 중 고르는 과정만, 회신은 사용자 전달).
--   · screen  지금처럼 선생님이 검사 중 화면에서 예/아니오(G2는 0·1·2)를 고른다
--   · scan    아이가 기록지에 쓰고, 반 전체 검사가 끝난 뒤 선생님이 스캔본을 올리면
--             담당자(관리자)가 스캔본을 보고 채점한다
-- 방식은 검사 중 쓰기 단계에서 고르고 **제출할 때 확정**한다(sessions.writing_mode).
--
-- writing_scans는 세션당 한 장이다(session_id가 기본 키). 선생님이 담당자 채점 전에 다시 올리면
-- 그 행을 교체한다 — 스토리지 파일은 올릴 때마다 새 이름이라(`<sessionId>/<시각>.jpg`) 서명 URL
-- 캐시가 옛 그림을 보여 주지 않는다. 교체된 옛 파일은 저장 라우트가 지운다.
-- 스캔본은 **아이 필적 이미지**다 — 녹음과 같은 비공개 버킷 규칙(관리자에게만 서명 URL)을 따르고,
-- 세션 삭제 시 스토리지 파일을 먼저 지운다(lib/db.ts deleteSession). 행은 cascade로 사라진다.
--
-- ⚠️ 적용 순서: **이 SQL을 코드 배포보다 먼저 실행할 것.** 새 코드는 제출·결과지·관리자 화면에서
-- writing_mode와 writing_scans를 읽고 쓴다. 컬럼만 먼저 있는 것은 무해하다 — 기본값 'screen'이
-- 지금까지의 검사(전부 화면 입력)와 같은 뜻이다.
-- 재실행 안전: 이미 있으면 건너뛴다.
-- ════════════════════════════════════════════════════════════════════

alter table sessions add column if not exists writing_mode text not null default 'screen';

do $$ begin
  alter table sessions add constraint sessions_writing_mode_check check (writing_mode in ('screen', 'scan'));
exception when duplicate_object then null; end $$;

create table if not exists writing_scans (
  session_id   uuid primary key references sessions(id) on delete cascade,
  path         text not null,          -- storage(writing-scans): <sessionId>/<epochMs>-<무작위 8자>.jpg|png
  content_type text not null check (content_type in ('image/jpeg', 'image/png')),
  bytes        int  not null check (bytes > 0),
  uploaded_at  timestamptz not null default now()
);

alter table writing_scans enable row level security;  -- 정책 없음 = anon 전면 차단(001 관례)

-- 스캔본 스토리지 버킷(비공개 — 관리자에게만 서명 URL, 선생님은 올리기만 한다).
-- 크기·형식 상한을 스토리지에도 건다(라우트의 4MB·매직바이트 검사와 같은 값 — 라우트를 거치지 않는 올리기에 대한 이중 방어).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('writing-scans', 'writing-scans', false, 4194304, array['image/jpeg', 'image/png'])
-- 상한 없이 먼저 만든 버킷(이 파일의 앞 판)에도 걸리게 — do nothing이면 다시 돌려도 상한이 빠진 채 남는다
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- PostgREST가 새 표·관계(sessions ↔ writing_scans)를 바로 알게 한다. 없으면 스키마 캐시가 갱신될 때까지(수 분)
-- 목록·결과지가 「Could not find a relationship between 'sessions' and 'writing_scans'」 500을 낸다(2026-10-01 운영에서 확인).
notify pgrst, 'reload schema';
