// hooks/useSurveyForm.ts — 진행 중인 세션의 검사지를 서버에서 받는다(POST /api/sessions/form).
// 검사 화면이 lib/forms를 import하면 문항이 공개 JS 청크에 실리므로, 화면은 이 훅으로만 양식을 얻는다.
'use client'
import { useQuery } from '@tanstack/react-query'
import { postJson } from '@/lib/http'
import type { SurveyForm } from '@/lib/forms'
import type { SurveyState } from '@/lib/survey-state'

/** 실패한 요청의 HTTP 상태 — 화면이 "다시 시도"와 "처음부터"를 가른다(0 = 네트워크). */
export class SurveyFormError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

/** 재시도해도 결과가 같은 상태(토큰 만료·세션 없음·이미 제출) */
export const isFatalFormError = (e: unknown) =>
  e instanceof SurveyFormError && [401, 404, 409].includes(e.status)

export function useSurveyForm(st: Pick<SurveyState, 'sessionId' | 'sessionToken'> | null) {
  return useQuery({
    queryKey: ['surveyForm', st?.sessionId] as const,
    queryFn: async () => {
      const r = await postJson<{ form: SurveyForm }>('/api/sessions/form',
        { sessionId: st!.sessionId, sessionToken: st!.sessionToken })
      if (!r.ok) throw new SurveyFormError(r.error, r.status)
      return r.data.form
    },
    enabled: !!st,
    // 세션 안에서 양식은 바뀌지 않는다(학년은 수정 불가) — 한 번 받으면 다시 묻지 않는다.
    staleTime: Infinity,
    retry: (n, e) => !isFatalFormError(e) && n < 1,
  })
}
