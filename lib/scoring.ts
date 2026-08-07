// lib/scoring.ts — 검사지 채점 규칙(배점·합산·Pass/Fail). 순수 함수만 둔다.
// 화면·저장 API·인쇄가 모두 이 파일 하나로 점수를 계산해, 표시되는 값과 저장되는 값이 어긋나지 않게 한다.
import { ITEMS, MEANING_READ_CODES, MEANING_WRITE_CODES, itemByCode, type SurveyItem } from './items'

/** 문장 배점 = 어절 수. 검사지의 7·7·8·14가 문항 텍스트의 어절 수와 정확히 일치하므로
 *  숫자를 따로 적어두지 않고 유도한다 — 문항이 바뀌면 배점이 자동으로 따라간다. */
export function sentenceMaxWords(item: SurveyItem): number {
  return item.text.trim().split(/\s+/).length
}

const SENTENCE_ITEMS = ITEMS.filter(i => i.section === 'sentence_reading')
const READ_CODES = ITEMS.filter(i => i.section === 'word_reading').map(i => i.code)
const NONSENSE_READ_CODES = READ_CODES.filter(c => !MEANING_READ_CODES.includes(c))
const WRITE_CODES = ITEMS.filter(i => i.section === 'word_writing').map(i => i.code)
const NONSENSE_WRITE_CODES = WRITE_CODES.filter(c => !MEANING_WRITE_CODES.includes(c))

export const SENTENCE_MAX = SENTENCE_ITEMS.reduce((sum, i) => sum + sentenceMaxWords(i), 0)

/** 과제별 만점(검사지) */
export const TASK_MAX = {
  wordReading: READ_CODES.length,
  sentenceReading: SENTENCE_MAX,
  wordWriting: WRITE_CODES.length,
} as const

/** 검사지의 의미/무의미 소계 만점 — 결과지가 '/ 7', '/ 5'를 이 값으로 찍는다. */
export const READ_MAX = {
  meaning: MEANING_READ_CODES.length,
  nonsense: READ_CODES.length - MEANING_READ_CODES.length,
} as const
export const WRITE_MAX = {
  meaning: MEANING_WRITE_CODES.length,
  nonsense: NONSENSE_WRITE_CODES.length,
} as const

/**
 * ⚠️ 임시 Pass 기준 — 담당자에게 실제 기준표를 받기 전까지 쓰는 값(만점의 약 65%).
 * 담당자 확인: "점수 기준이 아직 명확하지 않은데 대강 입력해둬도 괜찮다."
 * 임의의 숫자이므로 화면·인쇄물에 반드시 "임시 기준 · 확정 전"을 함께 표시한다
 * (시범 운영 중 나온 판정이 실제 판정으로 학교에 전달되는 것을 막기 위함).
 * 실제 기준표가 오면 이 숫자만 바꾸면 되고, 이미 채점한 세션도 저장된 점수로 다시 계산된다.
 */
export const PROVISIONAL_CRITERIA = true
export const PASS_MARK = {
  wordReading: 9,        // /14
  sentenceReading: 23,   // /36
  wordWriting: 6,        // /10
} as const

export type TaskKey = keyof typeof TASK_MAX
export type Verdict = 'pass' | 'fail'

export interface ScoreInput {
  /** 낱말 해독 itemCode(rw01~rw14) → 정반응 여부 */
  marks: Partial<Record<string, boolean>>
  /** 문장 itemCode(rs01~rs04) → 제한 시간 내 정확히 읽은 어절 수 */
  sentences: Partial<Record<string, number>>
  /** 낱말 쓰기 itemCode(ww01~ww10) → 정확히 씀 (검사 중 수집) */
  writing: Partial<Record<string, boolean>>
}

export interface ScoreResult {
  wordMeaning: number
  wordNonsense: number
  wordReading: number
  sentenceReading: number
  writeMeaning: number
  writeNonsense: number
  wordWriting: number
  verdict: Record<TaskKey, Verdict>
}

const countTrue = (codes: string[], m: Partial<Record<string, boolean>>) =>
  codes.reduce((n, c) => n + (m[c] === true ? 1 : 0), 0)

/** 문항 만점을 넘거나 음수인 입력은 잘라낸다 — 오입력이 총점을 왜곡하지 않도록. */
function clampSentence(code: string, raw: number | undefined): number {
  const item = itemByCode.get(code)
  if (!item || raw == null || !Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(Math.floor(raw), sentenceMaxWords(item)))
}

export function scoreSession(s: ScoreInput): ScoreResult {
  const wordMeaning = countTrue(MEANING_READ_CODES, s.marks)
  const wordNonsense = countTrue(NONSENSE_READ_CODES, s.marks)
  const wordReading = wordMeaning + wordNonsense
  const sentenceReading = SENTENCE_ITEMS.reduce((sum, i) => sum + clampSentence(i.code, s.sentences[i.code]), 0)
  const writeMeaning = countTrue(MEANING_WRITE_CODES, s.writing)
  const writeNonsense = countTrue(NONSENSE_WRITE_CODES, s.writing)
  const wordWriting = writeMeaning + writeNonsense
  const at = (v: number, mark: number): Verdict => (v >= mark ? 'pass' : 'fail')
  return {
    wordMeaning, wordNonsense, wordReading, sentenceReading, writeMeaning, writeNonsense, wordWriting,
    verdict: {
      wordReading: at(wordReading, PASS_MARK.wordReading),
      sentenceReading: at(sentenceReading, PASS_MARK.sentenceReading),
      wordWriting: at(wordWriting, PASS_MARK.wordWriting),
    },
  }
}
