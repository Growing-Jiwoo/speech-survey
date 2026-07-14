// lib/survey-state.ts — 설문 진행 상태 (localStorage, 세션별 키).
// 저장 시점: 녹음=즉시(서버), 낱말쓰기·체크리스트=최종 제출(서버). 로컬은 진행 위치·답 캐시.
export interface SurveyState {
  sessionId: string
  childName: string
  micDone: boolean
  idx: number                        // 현재 문항 인덱스(0-based)
  phase: 'mic' | 'item'              // 마이크 확인 단계 / 문항 단계
  recorded: Record<string, number>   // itemCode → 저장된 시도 수
  writing: Record<string, boolean>   // itemCode → 예(true)/아니오(false)
  checklist: string[]                // 선택된 영역 코드
}

const PREFIX = 'kodys-survey:'
const LAST_KEY = 'kodys-survey:last'
const keyOf = (sessionId: string) => `${PREFIX}${sessionId}`

export function newState(sessionId: string, childName: string): SurveyState {
  return { sessionId, childName, micDone: false, idx: 0, phase: 'mic', recorded: {}, writing: {}, checklist: [] }
}

export function loadState(): SurveyState | null {
  try {
    const last = localStorage.getItem(LAST_KEY)
    if (!last) return null
    const raw = localStorage.getItem(keyOf(last))
    if (!raw) return null
    const s = JSON.parse(raw)
    return typeof s?.sessionId === 'string' && s.sessionId ? s as SurveyState : null
  } catch { return null }
}

export function saveState(s: SurveyState): void {
  try {
    localStorage.setItem(keyOf(s.sessionId), JSON.stringify(s))
    localStorage.setItem(LAST_KEY, s.sessionId)
  } catch { /* 프라이빗 모드 등 저장 실패 시 메모리 상태로만 진행 */ }
}

export function clearState(): void {
  try {
    const last = localStorage.getItem(LAST_KEY)
    if (last) localStorage.removeItem(keyOf(last))
    localStorage.removeItem(LAST_KEY)
  } catch { /* noop */ }
}
