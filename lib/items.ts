// lib/items.ts — 읽기 선별검사 문항 (출처: [최종] 초등 1학년 선별검사지.pdf)
import { pad2 } from './format'

export type Section = 'word_reading' | 'sentence_reading' | 'word_writing' | 'checklist'
export type WordKind = 'meaning' | 'nonsense' | null

export interface SurveyItem {
  code: string      // rw01~rw14 / rs01~rs04 / ww01~ww10 / cl
  orderNo: number   // 1~29 (화면 문항 번호)
  section: Section
  kind: WordKind    // 낱말 의미/무의미 구분 (아이 화면 비노출, 관리자 결과지 전용)
  text: string      // 제시 낱말·문장 (체크리스트는 '')
  maxSec: number    // 녹음 제한(초). 비녹음 문항은 0
}

const READ_MEANING = ['어디', '바지', '양보', '그늘', '설탕', '장갑', '방법']
const READ_NONSENSE = ['아로', '부림', '영추', '주곡', '구말', '솔텅', '봉밥']
const SENTENCES = [
  '아이가 아빠와 우유 사러 가서 고기도 사요.',
  '스라소니가 피리 가져오고 개구리가 해바라기 가지고 와요.',
  '다람쥐가 두꺼비를 보고 도망가요 그래서 부엉이가 다람쥐를 숨겨줘요.',
  '쉬는시간에 친구가 나에게 장난을 계속 쳐서 다투었어요.\n학교가 끝난 후에 친구가 다가와서 사과를 했어요.',
]
const WRITE_MEANING = ['우비', '까치', '수박', '동상', '생각']
const WRITE_NONSENSE = ['오거', '끼추', '소벅', '당송', '갈먹']

export const ITEMS: SurveyItem[] = [
  ...READ_MEANING.map((text, i) => ({
    code: `rw${pad2(i + 1)}`, orderNo: i + 1,
    section: 'word_reading' as const, kind: 'meaning' as const, text, maxSec: 30,
  })),
  ...READ_NONSENSE.map((text, i) => ({
    code: `rw${pad2(i + 8)}`, orderNo: i + 8,
    section: 'word_reading' as const, kind: 'nonsense' as const, text, maxSec: 30,
  })),
  ...SENTENCES.map((text, i) => ({
    code: `rs${pad2(i + 1)}`, orderNo: i + 15,
    section: 'sentence_reading' as const, kind: null, text, maxSec: 40,
  })),
  ...WRITE_MEANING.map((text, i) => ({
    code: `ww${pad2(i + 1)}`, orderNo: i + 19,
    section: 'word_writing' as const, kind: 'meaning' as const, text, maxSec: 0,
  })),
  ...WRITE_NONSENSE.map((text, i) => ({
    code: `ww${pad2(i + 6)}`, orderNo: i + 24,
    section: 'word_writing' as const, kind: 'nonsense' as const, text, maxSec: 0,
  })),
  { code: 'cl', orderNo: 29, section: 'checklist', kind: null, text: '', maxSec: 0 },
]

/** 녹음 문항 판별의 단일 술어 — "maxSec > 0" 규약이 화면마다 재표현되는 것을 막는다. */
export const isRecordingItem = (i: SurveyItem): boolean => i.maxSec > 0

export const RECORDING_ITEMS = ITEMS.filter(isRecordingItem)
export const WRITING_ITEMS = ITEMS.filter(i => i.section === 'word_writing')
export const itemByCode = new Map(ITEMS.map(i => [i.code, i]))

export const CHECKLIST_AREAS = [
  { code: 'none', label: '특이사항 없음', hint: '' },
  { code: 'cognition', label: '인지', hint: '또래보다 전반적인 발달이나 이해도가 늦음' },
  { code: 'language', label: '언어 (이해/표현)', hint: '문장 표현이 서툴거나 대화 상황에 맞지 않는 말을 함' },
  { code: 'speech', label: '말 (조음/유창성)', hint: '발음이 부정확하거나 말을 심하게 더듬음' },
  { code: 'attention', label: '주의력', hint: '수업에 집중하지 못하고 과제를 끝내기 어려워함' },
] as const

export const AREA_CODES: string[] = CHECKLIST_AREAS.map(a => a.code)
export const areaLabel = (code: string) =>
  CHECKLIST_AREAS.find(a => a.code === code)?.label ?? code

/** 체크리스트 배타 토글: 'none'(특이사항 없음)과 실제 영역은 상호 배타. */
export function toggleChecklistArea(current: string[], code: string): string[] {
  if (code === 'none') return current.includes('none') ? [] : ['none']
  const base = current.filter(c => c !== 'none')
  return base.includes(code) ? base.filter(c => c !== code) : [...base, code]
}

export const SECTION_LABEL: Record<Section, string> = {
  word_reading: '낱말 해독',
  sentence_reading: '문장 읽기유창성',
  word_writing: '낱말 쓰기',
  checklist: '검사자 체크리스트',
}

/** 화면에 등장하는 순서(단계). 섹션 진입 안내(SectionIntro)의 "N단계 / 총" 표기에 쓴다. */
export const SECTION_ORDER: Section[] = ['word_reading', 'sentence_reading', 'word_writing', 'checklist']

/** 섹션 진입 안내 문구 — 주제가 바뀔 때 아동이 "무엇을 하는지" 알도록 아이 눈높이로.
 *  (checklist는 검사자용 단계라 그에 맞춰 안내) */
export const SECTION_INTRO: Record<Section, { title: string; desc: string }> = {
  word_reading: { title: '낱말 읽기', desc: '화면에 나오는 낱말을 소리 내어 읽어요.' },
  sentence_reading: { title: '문장 읽기', desc: '이번에는 문장을 소리 내어 읽어요.' },
  word_writing: { title: '낱말 쓰기', desc: '낱말을 정확하게 쓸 수 있는지 확인해요.' },
  checklist: { title: '마무리 확인', desc: '마지막으로 선생님이 확인하는 단계예요.' },
}

export const KIND_LABEL: Record<'meaning' | 'nonsense', string> = { meaning: '의미', nonsense: '무의미' }

// ── 페이지 모델 ────────────────────────────────────────────────────────
// 검사지는 "한 페이지에 문항 전체를 두고, 시작하면 전체를 읽는" 방식이다.
// 따라서 화면·녹음·제한시간의 단위는 문항이 아니라 페이지다.
// 채점 단위는 여전히 개별 문항(ITEMS) — 페이지가 그것을 묶어 참조만 한다.

/** 녹음 여유(초). 제한 시간에 칼같이 끊으면 마지막 낱말이 잘리므로 조금 더 녹음한다.
 *  채점은 어디까지나 limitSec까지만 한다(검사지 기준) — 이 값은 채점 기준이 아니다. */
export const GRACE_SEC = 5

/** 페이지를 조작하는 주체. examiner 페이지는 아동이 아니라 검사자가 응답한다. */
export type PageRole = 'child' | 'examiner'

export interface SurveyPage {
  /** 화면 키이자 녹음 저장 키(recordings.item_code). 문항 코드와 네임스페이스가 겹치지 않게 p_ 접두. */
  code: string
  section: Section
  role: PageRole
  kind: WordKind
  /** 이 페이지에 표시되는 문항들(채점 단위) */
  items: SurveyItem[]
  /** 검사지 제한 시간(초). 채점 기준. 0이면 비녹음 페이지 */
  limitSec: number
  /** 연습 페이지 — 녹음 동작은 본 검사와 같지만 업로드·채점하지 않는다 */
  practice: boolean
}

/** 연습용 낱말 — 담당자 확정: "쉬운 실제 낱말"(무의미 낱말이 아님).
 *  본 문항과 겹치지 않는 2음절 상용어로 고른다(겹치지 않음은 tests/items.test.ts가 검증).
 *  바꾸려면 이 배열만 교체하면 된다 — 연습은 녹음·채점하지 않으므로 다른 코드에 영향이 없다. */
const PRACTICE_WORDS = ['나무', '구름', '바다']

/** 연습 문항은 채점하지 않으므로 orderNo=0으로 둔다(본 문항 1~29와 구분). */
const PRACTICE_ITEMS: SurveyItem[] = PRACTICE_WORDS.map((text, i) => ({
  code: `pw${pad2(i + 1)}`, orderNo: 0,
  section: 'word_reading', kind: 'meaning', text, maxSec: 0,
}))

const readWords = (kind: 'meaning' | 'nonsense') =>
  ITEMS.filter(i => i.section === 'word_reading' && i.kind === kind)

/** 중단 규칙 판정에 쓰는 의미 낱말 코드(문항 순서 유지) */
export const MEANING_READ_CODES = readWords('meaning').map(i => i.code)
export const MEANING_WRITE_CODES =
  ITEMS.filter(i => i.section === 'word_writing' && i.kind === 'meaning').map(i => i.code)

export const PAGES: SurveyPage[] = [
  { code: 'p_practice_rw', section: 'word_reading', role: 'child', kind: 'meaning',
    items: PRACTICE_ITEMS, limitSec: 30, practice: true },
  { code: 'p_rw_meaning', section: 'word_reading', role: 'child', kind: 'meaning',
    items: readWords('meaning'), limitSec: 30, practice: false },
  // 검사지 중단 규칙 판정을 위해 의미 낱말 직후 검사자가 현장에서 O/X를 표시한다.
  { code: 'p_rw_meaning_mark', section: 'word_reading', role: 'examiner', kind: 'meaning',
    items: readWords('meaning'), limitSec: 0, practice: false },
  { code: 'p_rw_nonsense', section: 'word_reading', role: 'child', kind: 'nonsense',
    items: readWords('nonsense'), limitSec: 30, practice: false },
  ...ITEMS.filter(i => i.section === 'sentence_reading').map(i => ({
    code: `p_${i.code}`, section: 'sentence_reading' as const, role: 'child' as const,
    kind: null, items: [i], limitSec: 40, practice: false,
  })),
  { code: 'p_ww', section: 'word_writing', role: 'examiner', kind: null,
    items: WRITING_ITEMS, limitSec: 0, practice: false },
  { code: 'p_cl', section: 'checklist', role: 'examiner', kind: null,
    items: [], limitSec: 0, practice: false },
]

export const pageByCode = new Map(PAGES.map(p => [p.code, p]))

/** 각 섹션의 "첫 페이지" 코드 — 이 페이지에 진입할 때 섹션 안내를 한 번 보여준다.
 *  연습 페이지가 있는 섹션은 연습이 첫 페이지가 된다(안내 → 연습 → 본 검사 순서). */
export const SECTION_FIRST_CODES = new Set(
  SECTION_ORDER.map(sec => PAGES.find(p => p.section === sec)!.code),
)

/** 녹음이 있는 페이지인지 — "limitSec > 0" 규약이 화면마다 재표현되는 것을 막는다. */
export const isRecordingPage = (p: SurveyPage): boolean => p.limitSec > 0

/** 서버에 업로드되는 녹음 페이지(연습 제외). 진행률 분모·관리자 결과지가 공유한다. */
export const RECORDING_PAGES = PAGES.filter(p => isRecordingPage(p) && !p.practice)

/** 녹음 자동 종료 시각(초) = 검사지 제한 + 여유 */
export const maxRecSec = (p: SurveyPage): number => p.limitSec + GRACE_SEC

/** 진행률 분모 — 화면·녹음 단위(페이지)와 쓰기 문항 수. 관리자 목록·결과지가 같은 값을 쓴다. */
export const ITEM_TOTALS = { rec: RECORDING_PAGES.length, write: WRITING_ITEMS.length }
