// lib/items.ts — 읽기 선별검사 문항. 학년별 검사지(lib/forms)에서 만들어진다.
//
// 문항·페이지는 **양식마다 다르다**(G1 낱말 쓰기 10문항 ↔ G2 문장 쓰기 5문항). 그래서
// 모듈 상수가 아니라 `itemsFor(form)`이 만들어 주는 묶음이다. 호출부는 세션의 학년으로
// 양식을 고른 뒤(`formForGrade`) 그 묶음을 쓴다.
import { pad2 } from './format'
import type { SurveyForm } from './forms'

export type Section =
  | 'word_reading' | 'sentence_reading' | 'word_writing' | 'sentence_writing' | 'checklist'
export type WordKind = 'meaning' | 'nonsense' | null

/** 쓰기 과제의 섹션 — 양식마다 둘 중 하나만 존재한다 */
export type WritingSection = Extract<Section, 'word_writing' | 'sentence_writing'>

export interface SurveyItem {
  code: string      // rw01~rw14 / rs01~rs04 / ww01~ww10(G1) / sw01~sw05(G2) / cl
  orderNo: number   // 화면 문항 번호(양식별 1..N)
  section: Section
  kind: WordKind    // 낱말 의미/무의미 구분 (아이 화면 비노출, 관리자 결과지 전용)
  text: string      // 제시 낱말·문장 (체크리스트는 '')
  maxSec: number    // 녹음 제한(초). 비녹음 문항은 0
}

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
  sentence_writing: '문장 쓰기',
  checklist: '검사자 체크리스트',
}

/** 섹션 진입 안내 문구 — 주제가 바뀔 때 아동이 "무엇을 하는지" 알도록 아이 눈높이로.
 *  (checklist는 검사자용 단계라 그에 맞춰 안내) */
export const SECTION_INTRO: Record<Section, { title: string; desc: string }> = {
  word_reading: { title: '낱말 읽기', desc: '화면에 나오는 낱말을 소리 내어 읽어요.' },
  sentence_reading: { title: '문장 읽기', desc: '이번에는 문장을 소리 내어 읽어요.' },
  word_writing: { title: '낱말 쓰기', desc: '낱말을 정확하게 쓸 수 있는지 확인해요.' },
  sentence_writing: { title: '문장 쓰기', desc: '문장을 정확하게 쓸 수 있는지 확인해요.' },
  checklist: { title: '마무리 확인', desc: '마지막으로 선생님이 확인하는 단계예요.' },
}

export const KIND_LABEL: Record<'meaning' | 'nonsense', string> = { meaning: '의미', nonsense: '무의미' }

// ── 페이지 모델 ────────────────────────────────────────────────────────
// 검사지는 "한 페이지에 문항 전체를 두고, 시작하면 전체를 읽는" 방식이다.
// 따라서 화면·녹음·제한시간의 단위는 문항이 아니라 페이지다.
// 채점 단위는 여전히 개별 문항(items) — 페이지가 그것을 묶어 참조만 한다.

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

/** 녹음이 있는 페이지인지 — "limitSec > 0" 규약이 화면마다 재표현되는 것을 막는다. */
export const isRecordingPage = (p: SurveyPage): boolean => p.limitSec > 0

/** 녹음 자동 종료 시각(초) = 검사지 제한 + 여유 */
export const maxRecSec = (p: SurveyPage): number => p.limitSec + GRACE_SEC

/** 연습용 낱말 — ⚠️ **담당자 확인 대기 중인 임시값(placeholder)이다. 확정 아님.**
 *
 *  담당자 원문은 "가짜 단어들 보여주고 테스트 하는 거야"인데, 이 표현이 두 갈래로 읽힌다:
 *    (a) 검사 문항이 아닌 **쉬운 실제 낱말**  ← 지금 이 배열이 가정한 쪽
 *    (b) **무의미 낱말**(아로·부림 같은)
 *  (b)로 확정되면 연습에서 무의미 낱말을 미리 경험하는 것이 본 검사 반응에 영향을 줄 수 있어
 *  단순한 문구 교체가 아니다 — 담당자에게 반드시 물을 것.
 *  경위: docs/superpowers/plans/2026-08-07-survey-session-controls.md
 *
 *  본 문항과 겹치지 않는 2음절 상용어로 고른다(겹치지 않음은 tests/items.test.ts가 검증).
 *  바꾸려면 이 배열만 교체하면 된다 — 연습은 녹음·채점하지 않으므로 다른 코드에 영향이 없다. */
const PRACTICE_WORDS = ['나무', '구름', '바다']

/** 연습 문항은 채점하지 않으므로 orderNo=0으로 둔다(본 문항과 구분). */
const PRACTICE_ITEMS: SurveyItem[] = PRACTICE_WORDS.map((text, i) => ({
  code: `pw${pad2(i + 1)}`, orderNo: 0,
  section: 'word_reading', kind: 'meaning', text, maxSec: 0,
}))

export interface Totals { rec: number; write: number }

/** 한 양식의 문항·페이지·집계 분모 묶음. `itemsFor(form)`가 만든다. */
export interface FormItems {
  form: SurveyForm
  items: SurveyItem[]
  byCode: Map<string, SurveyItem>
  pages: SurveyPage[]
  pageByCode: Map<string, SurveyPage>
  /** 화면에 등장하는 섹션 순서(단계). 섹션 진입 안내의 "N단계 / 총" 표기에 쓴다. */
  sections: Section[]

  readItems: SurveyItem[]
  /** 중단 규칙 판정에 쓰는 의미 낱말 코드(문항 순서 유지) */
  meaningReadCodes: string[]
  nonsenseReadCodes: string[]
  sentenceItems: SurveyItem[]

  /** 이 양식의 쓰기 과제 섹션 */
  writingSection: WritingSection
  writingItems: SurveyItem[]
  /** 낱말 쓰기(G1)의 의미/무의미 구분. 문장 쓰기 양식에서는 빈 배열이다. */
  meaningWriteCodes: string[]
  nonsenseWriteCodes: string[]

  /** 각 섹션의 "첫 페이지" 코드 — 이 페이지에 진입할 때 섹션 안내를 한 번 보여준다.
   *  연습 페이지가 있는 섹션은 연습이 첫 페이지가 된다(안내 → 연습 → 본 검사 순서). */
  sectionFirstCodes: Set<string>
  /** 서버에 업로드되는 녹음 페이지(연습 제외). 진행률 분모·관리자 결과지가 공유한다. */
  recordingPages: SurveyPage[]
  /** 진행률 분모 — 화면·녹음 단위(페이지)와 쓰기 문항 수. */
  totals: Totals
}

/**
 * 페이지를 사람이 읽는 이름으로. 검토 화면 목록과 업로드 재시도 배너가 공유한다.
 * (인자는 문항 코드가 아니라 **페이지 코드**다 — 문항으로 조회하면 이름이 빈칸이 된다.)
 *
 * 문항 전문을 이어 붙이지 않는 이유: 검토 화면은 "어느 단계인지 알아보고 눌러서 돌아가는"
 * 목록이다. 낱말 7개를 ' · '로 이으면 데스크톱 폭에서도 뒤가 잘려(…) 정작 어느 단계인지도,
 * 무슨 낱말인지도 알려주지 못한다. 이름과 개수만 두면 어느 폭에서도 잘리지 않는다.
 */
export function pageLabel(f: FormItems, code: string): string {
  const p = f.pageByCode.get(code)
  if (!p) return code
  if (p.section === 'checklist') return SECTION_LABEL.checklist
  if (p.code === 'p_rw_meaning_mark') return '검사자 확인 (의미 낱말 채점)'
  if (p.section === f.writingSection) return `${SECTION_LABEL[p.section]} ${p.items.length}문항`
  if (p.practice) return `연습 낱말 ${p.items.length}개`
  if (p.kind) return `${KIND_LABEL[p.kind]} 낱말 ${p.items.length}개`
  const n = f.sentenceItems.findIndex(i => `p_${i.code}` === p.code)
  return n >= 0 ? `${n + 1}번 문장` : SECTION_LABEL[p.section]
}

/** 양식별 묶음 캐시 — 양식은 모듈 싱글턴이라 객체 정체성으로 캐시해도 안전하다.
 *  같은 참조를 돌려줘야 React 의존성 배열·`===` 비교가 안정적으로 동작한다. */
const CACHE = new WeakMap<SurveyForm, FormItems>()

export function itemsFor(form: SurveyForm): FormItems {
  const hit = CACHE.get(form)
  if (hit) return hit
  const built = build(form)
  CACHE.set(form, built)
  return built
}

function build(form: SurveyForm): FormItems {
  const { wordSec, sentenceSec } = form.limits
  let orderNo = 0
  const next = () => ++orderNo

  const readItems: SurveyItem[] = [
    ...form.readMeaning.map((text, i) => ({
      code: `rw${pad2(i + 1)}`, orderNo: next(),
      section: 'word_reading' as const, kind: 'meaning' as const, text, maxSec: wordSec,
    })),
    ...form.readNonsense.map((text, i) => ({
      code: `rw${pad2(form.readMeaning.length + i + 1)}`, orderNo: next(),
      section: 'word_reading' as const, kind: 'nonsense' as const, text, maxSec: wordSec,
    })),
  ]
  const sentenceItems: SurveyItem[] = form.sentences.map((text, i) => ({
    code: `rs${pad2(i + 1)}`, orderNo: next(),
    section: 'sentence_reading' as const, kind: null, text, maxSec: sentenceSec,
  }))

  const w = form.writing
  const writingSection: WritingSection = w.kind === 'word' ? 'word_writing' : 'sentence_writing'
  const writingItems: SurveyItem[] = w.kind === 'word'
    ? [
        ...w.meaning.map((text, i) => ({
          code: `ww${pad2(i + 1)}`, orderNo: next(),
          section: 'word_writing' as const, kind: 'meaning' as const, text, maxSec: 0,
        })),
        ...w.nonsense.map((text, i) => ({
          code: `ww${pad2(w.meaning.length + i + 1)}`, orderNo: next(),
          section: 'word_writing' as const, kind: 'nonsense' as const, text, maxSec: 0,
        })),
      ]
    : w.sentences.map((text, i) => ({
        code: `sw${pad2(i + 1)}`, orderNo: next(),
        section: 'sentence_writing' as const, kind: null, text, maxSec: 0,
      }))

  const checklistItem: SurveyItem =
    { code: 'cl', orderNo: next(), section: 'checklist', kind: null, text: '', maxSec: 0 }

  const items = [...readItems, ...sentenceItems, ...writingItems, checklistItem]
  const readOf = (kind: 'meaning' | 'nonsense') => readItems.filter(i => i.kind === kind)

  const pages: SurveyPage[] = [
    { code: 'p_practice_rw', section: 'word_reading', role: 'child', kind: 'meaning',
      items: PRACTICE_ITEMS, limitSec: wordSec, practice: true },
    { code: 'p_rw_meaning', section: 'word_reading', role: 'child', kind: 'meaning',
      items: readOf('meaning'), limitSec: wordSec, practice: false },
    // 검사지 중단 규칙 판정을 위해 의미 낱말 직후 검사자가 현장에서 O/X를 표시한다.
    { code: 'p_rw_meaning_mark', section: 'word_reading', role: 'examiner', kind: 'meaning',
      items: readOf('meaning'), limitSec: 0, practice: false },
    { code: 'p_rw_nonsense', section: 'word_reading', role: 'child', kind: 'nonsense',
      items: readOf('nonsense'), limitSec: wordSec, practice: false },
    ...sentenceItems.map(i => ({
      code: `p_${i.code}`, section: 'sentence_reading' as const, role: 'child' as const,
      kind: null, items: [i], limitSec: sentenceSec, practice: false,
    })),
    { code: writingSection === 'word_writing' ? 'p_ww' : 'p_sw', section: writingSection,
      role: 'examiner', kind: null, items: writingItems, limitSec: 0, practice: false },
    { code: 'p_cl', section: 'checklist', role: 'examiner', kind: null,
      items: [], limitSec: 0, practice: false },
  ]

  const sections = [...new Set(pages.map(p => p.section))]
  const recordingPages = pages.filter(p => isRecordingPage(p) && !p.practice)

  return {
    form,
    items,
    byCode: new Map(items.map(i => [i.code, i])),
    pages,
    pageByCode: new Map(pages.map(p => [p.code, p])),
    sections,
    readItems,
    meaningReadCodes: readOf('meaning').map(i => i.code),
    nonsenseReadCodes: readOf('nonsense').map(i => i.code),
    sentenceItems,
    writingSection,
    writingItems,
    meaningWriteCodes: writingItems.filter(i => i.kind === 'meaning').map(i => i.code),
    nonsenseWriteCodes: writingItems.filter(i => i.kind === 'nonsense').map(i => i.code),
    sectionFirstCodes: new Set(sections.map(sec => pages.find(p => p.section === sec)!.code)),
    recordingPages,
    totals: { rec: recordingPages.length, write: writingItems.length },
  }
}
