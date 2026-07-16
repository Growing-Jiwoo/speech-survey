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

/** 진행률 분모(녹음/쓰기 문항 수) — 관리자 목록·결과지가 같은 값을 쓰도록 한 곳에 정의. */
export const ITEM_TOTALS = { rec: RECORDING_ITEMS.length, write: WRITING_ITEMS.length }

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

/** 각 섹션의 "첫 문항" 코드 — 이 문항에 진입할 때 섹션 안내를 한 번 보여준다. */
export const SECTION_FIRST_CODES = new Set(
  SECTION_ORDER.map(sec => ITEMS.find(i => i.section === sec)!.code),
)
export const KIND_LABEL: Record<'meaning' | 'nonsense', string> = { meaning: '의미', nonsense: '무의미' }
