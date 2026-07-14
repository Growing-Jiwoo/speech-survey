// lib/survey-state.ts — 설문 진행 상태 (sessionStorage). 서버 저장 시점: 녹음=즉시, 낱말쓰기·체크리스트=최종 제출.
export interface SurveyState {
  sessionId: string
  childName: string
  micDone: boolean
  recorded: Record<string, number>   // itemCode → 저장된 시도 수
  writing: Record<string, boolean>   // itemCode → 예(true)/아니오(false)
  checklist: string[]                // 선택된 영역 코드
}

const KEY = 'kodys-survey'

export function newState(sessionId: string, childName: string): SurveyState {
  return { sessionId, childName, micDone: false, recorded: {}, writing: {}, checklist: [] }
}

export function loadState(): SurveyState | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    return typeof s?.sessionId === 'string' && s.sessionId ? s as SurveyState : null
  } catch { return null }
}

export function saveState(s: SurveyState): void {
  sessionStorage.setItem(KEY, JSON.stringify(s))
}

export function clearState(): void {
  sessionStorage.removeItem(KEY)
}
