// lib/survey-state.ts — 설문 진행 상태 (localStorage, 세션별 키).
// 저장 시점: 녹음=즉시(서버), 낱말쓰기·체크리스트=최종 제출(서버). 로컬은 진행 위치·답 캐시.
// ※ 아동 이름은 "누구의 검사가 진행 중인지"를 진행 화면·이어하기 안내에 보여주기 위해 저장한다.
//    공용 기기에 흔적이 남지 않도록 제출 완료·새 검사 시작·종료 화면에서 반드시 파기한다(clearState).

/** 저장 스키마 버전. 필드 구조가 바뀌면 올린다 — 구버전 상태는 로드하지 않고 새로 시작하게
 *  하여(배포 직후 진행 중이던 세션 한정) 미정의 동작을 막는다.
 *  v7: 현장 채점 `marks` 필드 제거 및 채점 페이지 제거로 `pageIdx` 재조정 — 담당자 확정(2026-08-13)
 *  v8: 이어하기 안내에 아동 번호를 쓰기 위해 `childNo` 추가 — 사용자 확정(2026-08-15)
 *  v9: 「모르겠어요」로 넘긴 페이지를 검토 화면이 미녹음과 구분하도록 `skipped` 추가 —
 *      담당자 확정(2026-09-21) */
const SCHEMA_V = 9

export interface SurveyState {
  v: typeof SCHEMA_V
  sessionId: string
  sessionToken: string               // /api/sessions가 발급 — 녹음/제출 요청에 동봉
  childName: string                  // 진행 화면·이어하기 안내 표시용(서버 세션 행이 원본)
  /** 학급 내 출석 번호 — 이어하기 안내에서 "누구의 검사인지"를 이름과 함께 밝히는 용도.
   *  새 흐름은 아동을 번호로 지목하므로(코드+번호), 이름만 보이면 안내가 화면과 어긋난다.
   *  서버 세션 행이 원본이며 여기 사본을 둔다. */
  childNo: number
  /** 학년 — 어떤 검사지(양식)로 진행할지 고르는 값. 서버 세션 행이 원본이며 여기 사본을 둔다.
   *  formForGrade(grade)가 문항·페이지를 결정한다. */
  grade: number
  micDone: boolean
  /** 연습 낱말을 실시하는지 — 마이크 확인 뒤 검사자가 고른다(같은 아동의 반복 검사에서
   *  매번 연습을 강요하지 않기 위함). false면 연습 페이지가 진행 목록에서 빠진다. */
  practice: boolean
  pageIdx: number                    // 현재 페이지 인덱스(0-based, visiblePages 기준)
  /** 마이크 확인 → 연습 실시 여부 선택 → 페이지 진행 */
  phase: 'mic' | 'practiceAsk' | 'page'
  recorded: Record<string, number>   // pageCode → 저장된 시도 수
  /**
   * 검사자가 [모르겠어요]를 눌러 녹음 없이 넘긴 페이지 코드. 담당자 확정(2026-09-21) —
   * 검토 화면이 「미녹음」과 구분해 보여줘야 한다는 요청이 근거다.
   *
   * **로컬에만 둔다(서버로 보내지 않는다).** 관리자 채점은 녹음 없는 페이지를 오반응으로
   * 기본 채점하므로(`withUnrecordedDefaults`) 모름·미실시의 **점수는 어차피 같다.** 결과지에
   * 둘을 나눠 찍을지는 담당자에게 묻지 않았고, 물어서 "나눠 달라"가 되면 그때 컬럼을 만들면
   * 된다 — 지금 DB로 올리면 아무도 읽지 않는 필드가 임상 기록에 남는다.
   *
   * `recorded`와 상호 배타다: 넘긴 뒤 되돌아와 녹음하면 `markSaved`가 여기서 뺀다.
   */
  skipped: string[]
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
  sessionId: string, childName: string, childNo: number, sessionToken: string, grade: number,
): SurveyState {
  return {
    v: SCHEMA_V, sessionId, sessionToken, childName, childNo, grade,
    // practice의 기본값은 true다 — 선택 화면에서 검사자가 바꾸기 전까지는 연습을 실시한다.
    micDone: false, practice: true, pageIdx: 0, phase: 'mic',
    recorded: {}, skipped: [], writing: {}, checklist: [], introsSeen: [],
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

/** 학급 코드 기억 — 진행 상태와 **별도 키**라 clearState가 지우지 않는다.
 *  한 학급을 연달아 검사할 때 코드 재입력을 덜기 위한 것으로, 세션 생성 성공 직후에만
 *  저장한다(오타·확인 모달 취소가 남지 않게 — 스펙 "연속 검사", 사용자 확정 2026-08-13).
 *  ⚠️ 아동 개인정보(이름·번호·성별·생년월일)는 여기든 어디든 별도 키로 남기지 않는다. */
const CODE_KEY = 'kodys-survey:classCode'

export function saveClassCode(code: string): void {
  try { localStorage.setItem(CODE_KEY, code) } catch { /* noop */ }
}

export function loadClassCode(): string | null {
  try { return localStorage.getItem(CODE_KEY) } catch { return null }
}

/** 마이크 확인 통과 시각 — **기기 키**(학급 코드 키와 같은 성격, clearState가 지우지 않는다).
 *  같은 PC·같은 헤드셋으로 25명을 연달아 검사할 때 아이마다 "안녕하세요"를 시키지 않기 위한 것
 *  (사용자 확정 2026-09-22 ②, 담당자 회신 아님). 안전망은 이미 있다 — 첫 녹음이 작으면 「목소리가
 *  잘 안 담긴 것 같아요」가 뜬다. 마이크 확인은 검사지에 없는 운영 절차라 담당자 확정 없이 바꿀 수
 *  있는 영역으로 본다. **아동 정보가 아니다** — 시각 하나만 담는다. */
const MIC_OK_KEY = 'kodys-survey:micOkAt'

export function saveMicOk(): void {
  try { localStorage.setItem(MIC_OK_KEY, String(Date.now())) } catch { /* noop */ }
}

/** maxAgeMs 안에 통과한 기록이 있으면 true. 값이 없거나 손상됐으면 false(= 확인을 시킨다). */
export function recentMicOk(maxAgeMs: number): boolean {
  try {
    const at = Number(localStorage.getItem(MIC_OK_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < maxAgeMs
  } catch { return false }
}
