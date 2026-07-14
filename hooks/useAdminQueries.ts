'use client'
import { useQuery } from '@tanstack/react-query'
import type { SessionListRow, SessionRow, WritingRow } from '@/lib/db'

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`)
  return res.json() as Promise<T>
}

/** 관리자 목록 세션. staleTime 동안 재방문/필터 변경 시 재요청 없이 캐시 사용. */
export function useSessionsQuery() {
  return useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => fetchJson<{ sessions: SessionListRow[] }>('/api/admin/sessions').then(d => d.sessions),
  })
}

/** 관리자 결과지 상세. 목록↔결과지를 오갈 때 캐시로 즉시 표시(스피너 반복 제거). */
export function useSessionDetailQuery(id: string) {
  return useQuery({
    queryKey: ['admin', 'session', id],
    queryFn: () => fetchJson<SessionDetailData>(`/api/admin/sessions/${id}`),
    enabled: !!id,
  })
}
