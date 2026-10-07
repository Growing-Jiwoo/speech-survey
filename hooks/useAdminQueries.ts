// hooks/useAdminQueries.ts — 관리자 데이터 로딩(react-query) 훅과 쿼리 키의 단일 소스.
'use client'
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '@/lib/http'
import type { MarkRow, RosterRow, SentenceScoreRow, SentenceTimeRow, SessionListRow, SessionRow, WritingRow } from '@/lib/db'
import type { SurveyForm } from '@/lib/forms'

/** 관리자 쿼리 키 — 무효화/제거 호출부가 리터럴을 복사하다 어긋나지 않도록 한 곳에 정의. */
export const adminKeys = {
  sessions: ['admin', 'sessions'] as const,
  session: (id: string) => ['admin', 'session', id] as const,
  codes: ['admin', 'codes'] as const,
  roster: (id: string) => ['admin', 'roster', id] as const,
}

/** 학급 코드 목록 항목 — 발급 화면(CodeIssuer)이 쓴다. */
export interface ClassCodeItem {
  id: string; code: string
  school_region: string; school_id: string; school_name: string
  grade: number; class_no: number
  teacher_name: string; teacher_phone: string | null; teacher_email: string | null
  created_at: string
  /** 'pending' = 교사 신청 접수만 된 상태 — 승인 대기 목록에, 'active'는 발급 목록에 놓인다 */
  status: 'pending' | 'active'
  /** 신청 접수 시각. 관리자 직접 발급분은 null */
  applied_at: string | null
  /** 이 코드로 만들어진 세션 수 — 0일 때만 삭제 버튼을 낸다(pending은 예외, 아직 검사 전이다) */
  session_count: number
  /** 신청 명단 인원 수. **실명은 목록에 실리지 않는다** — 수만 센다(PII) */
  roster_count: number
}

/** 결과지 녹음 항목(서명 URL 포함) — API가 audio_path를 서명 URL로 변환해 내려준다. */
export interface DetailRecording {
  item_code: string
  attempt_no: number
  /** 서명 URL(1시간). 서명이 실패한 녹음은 null — 결과지 전체를 막지 않으려고 그 녹음만 비운다 */
  url: string | null
  duration_sec: number | null
}

export interface SessionDetailData {
  session: SessionRow
  recordings: DetailRecording[]
  writing: WritingRow[]
  /** 관리자 결과지가 저장한 낱말 해독 O/X(의미·무의미 14개). 검사자 현장 채점은 폐기됐다 — 담당자 확정(2026-08-13) */
  marks: MarkRow[]
  /** 문장 읽기유창성 채점(어절 수) */
  sentences: SentenceScoreRow[]
  /** 문장 읽기유창성의 읽은 시간(초) — 채점자가 넣은 값만. 미녹음 기본값은 화면이 파생한다 */
  times: SentenceTimeRow[]
  /** 쓰기 기록지 스캔본(스캔본 방식이고 선생님이 올렸을 때만) — 서명 URL(1시간). 스토리지 경로는 싣지 않는다.
   *  서명에 실패하면 url이 null — 파일이 없으면(정리가 중간에 끊긴 행) `missing`이고 화면이 연결 해제를 권한다.
   *  일시 오류면 다시 열어 보라고만 한다 */
  scan: { url: string | null; missing: boolean; uploadedAt: string } | null
  /** 세션 학년의 검사지 — 서버가 싣는다(문항을 공개 JS에 넣지 않으려고, API 라우트 주석 참고) */
  form: SurveyForm
}

/** 관리자 목록 세션. staleTime 동안 재방문/필터 변경 시 재요청 없이 캐시 사용.
 * 신규 제출 반영을 위해 목록에 한해 포커스 시 재페치를 켠다(전역 기본은 유지). */
export function useSessionsQuery() {
  return useQuery({
    queryKey: adminKeys.sessions,
    queryFn: () => fetchJson<{ sessions: SessionListRow[] }>('/api/admin/sessions').then(d => d.sessions),
    refetchOnWindowFocus: true,
  })
}

/** 관리자 결과지 상세. 목록↔결과지를 오갈 때 캐시로 즉시 표시(스피너 반복 제거). */
export function useSessionDetailQuery(id: string) {
  return useQuery({
    queryKey: adminKeys.session(id),
    queryFn: () => fetchJson<SessionDetailData>(`/api/admin/sessions/${id}`),
    enabled: !!id,
  })
}

/** 학급 코드 목록 — 발급 화면이 쓴다. */
export function useClassCodesQuery() {
  return useQuery({
    queryKey: adminKeys.codes,
    queryFn: () => fetchJson<{ codes: ClassCodeItem[] }>('/api/admin/codes').then(d => d.codes),
  })
}

/** 신청 명단 — 승인 검토용. 관리자가 [명단 보기]를 누른 학급만 요청한다(⚠️ 아동 실명 PII).
 *  캐시에 남는 것도 실명이므로, 로그아웃 시 지워지는 `adminKeys` 트리 안에 둔다. */
export function useRosterQuery(id: string | null) {
  return useQuery({
    queryKey: adminKeys.roster(id ?? ''),
    queryFn: () => fetchJson<{ roster: RosterRow[] }>(`/api/admin/codes/${id}/roster`).then(d => d.roster),
    enabled: !!id,
  })
}
