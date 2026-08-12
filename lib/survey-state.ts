// lib/survey-state.ts — 설문 진행 상태 (localStorage, 세션별 키).
// 저장 시점: 녹음=즉시(서버), 낱말쓰기·체크리스트=최종 제출(서버). 로컬은 진행 위치·답 캐시.
// ※ 아동 이름은 "누구의 검사가 진행 중인지"를 진행 화면·이어하기 안내에 보여주기 위해 저장한다.
//    공용 기기에 흔적이 남지 않도록 제출 완료·새 검사 시작·종료 화면에서 반드시 파기한다(clearState).

/** 저장 스키마 버전. 필드 구조가 바뀌면 올린다 — 구버전 상태는 로드하지 않고 새로 시작하게
 *  하여(배포 직후 진행 중이던 세션 한정) 미정의 동작을 막는다. */
const SCHEMA_V = 6

export interface SurveyState {
  v: typeof SCHEMA_V
  sessionId: string
  sessionToken: string               // /api/sessions가 발급 — 녹음/제출 요청에 동봉
  childName: string                  // 진행 화면·이어하기 안내 표시용(서버 세션 행이 원본)
  /** 학년 — 어떤 검사지(양식)로 진행할지 고르는 값. 서버 세션 행이 원본이며 여기 사본을 둔다.
   *  formForGrade(grade)가 문항·페이지·중단 규칙을 전부 결정한다. */
  grade: number
  micDone: boolean
  /** 연습 낱말을 실시하는지 — 마이크 확인 뒤 검사자가 고른다(같은 아동의 반복 검사에서
   *  매번 연습을 강요하지 않기 위함). false면 연습 페이지가 진행 목록에서 빠진다. */
  practice: boolean
  pageIdx: number                    // 현재 페이지 인덱스(0-based, visiblePages 기준)
  /** 마이크 확인 → 연습 실시 여부 선택 → 페이지 진행 */
  phase: 'mic' | 'practiceAsk' | 'page'
  recorded: Record<string, number>   // pageCode → 저장된 시도 수
  marks: Record<string, boolean>     // 낱말 해독 의미 낱말 itemCode → 정반응 여부(검사자 현장 채점)
  /** 쓰기 과제 itemCode → 정확히 쓴 어절 수. 낱말 쓰기(G1)는 문항 만점이 1이라 0/1,
   *  문장 쓰기(G2)는 0~2다 — 두 과제의 채점 규칙이 "어절당 1점"으로 같아 한 모양으로 담는다. */
  writing: Record<string, number>
  checklist: string[]                // 선택된 영역 코드
  introsSeen: string[]               // 진입 안내를 이미 본 섹션 코드(새로고침·왕복에도 재노출 방지)
}

const PREFIX = 'kodys-survey:'
const LAST_KEY = 'kodys-survey:last'
const keyOf = (sessionId: string) => `${PREFIX}${sessionId}`

export function newState(
  sessionId: string, childName: string, sessionToken: string, grade: number,
): SurveyState {
  return {
    v: SCHEMA_V, sessionId, sessionToken, childName, grade,
    // practice의 기본값은 true다 — 선택 화면에서 검사자가 바꾸기 전까지는 연습을 실시한다.
    micDone: false, practice: true, pageIdx: 0, phase: 'mic',
    recorded: {}, marks: {}, writing: {}, checklist: [], introsSeen: [],
  }
}

export function loadState(): SurveyState | null {
  try {
    const last = localStorage.getItem(LAST_KEY)
    if (!last) return null
    const raw = localStorage.getItem(keyOf(last))
    if (!raw) return null
    const s = JSON.parse(raw)
    if (s?.v !== SCHEMA_V) return null // 구버전/손상 스키마 → 새로 시작
    return typeof s.sessionId === 'string' && s.sessionId ? s as SurveyState : null
  } catch { return null }
}

export function saveState(s: SurveyState): void {
  try {
    localStorage.setItem(keyOf(s.sessionId), JSON.stringify(s))
    localStorage.setItem(LAST_KEY, s.sessionId)
  } catch { /* 프라이빗 모드 등 저장 실패 시 메모리 상태로만 진행 */ }
}

/** 진행 상태 파기. 최종 제출 성공 시·새 검사 시작 직전에 호출해
 *  공용 기기에 이전 아동의 세션 흔적(id·토큰·진행 답)이 남지 않게 한다. */
export function clearState(): void {
  try {
    const last = localStorage.getItem(LAST_KEY)
    if (last) localStorage.removeItem(keyOf(last))
    localStorage.removeItem(LAST_KEY)
  } catch { /* noop */ }
}
