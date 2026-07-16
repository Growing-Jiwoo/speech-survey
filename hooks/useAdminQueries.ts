// hooks/useAdminQueries.ts — 관리자 데이터 로딩(react-query) 훅과 쿼리 키의 단일 소스.
'use client'
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '@/lib/http'
import type { SessionListRow, SessionRow, WritingRow } from '@/lib/db'

/** 관리자 쿼리 키 — 무효화/제거 호출부가 리터럴을 복사하다 어긋나지 않도록 한 곳에 정의. */
export const adminKeys = {
  sessions: ['admin', 'sessions'] as const,
  session: (id: string) => ['admin', 'session', id] as const,
}

/** 결과지 녹음 항목(서명 URL 포함) — API가 audio_path를 서명 URL로 변환해 내려준다. */
export interface DetailRecording {
  item_code: string
  attempt_no: number
  url: string
  duration_sec: number | null
}

export interface SessionDetailData {
  session: SessionRow
  recordings: DetailRecording[]
  writing: WritingRow[]
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
