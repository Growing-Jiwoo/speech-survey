// lib/scoring.ts — 검사지 채점 규칙(배점·합산·Pass/Fail). 순수 함수만 둔다.
// 화면·저장 API·인쇄가 모두 이 파일 하나로 점수를 계산해, 표시되는 값과 저장되는 값이 어긋나지 않게 한다.
// 배점은 학년별 검사지(lib/forms)에서 나온다 — 숫자를 여기 적어 두지 않는다.
import { itemsFor, type FormItems, type SurveyItem } from './items'
import type { SurveyForm } from './forms'
import { requiredWritingCodes } from './survey-flow'

/**
 * 문항 배점 = **어절 수**. 검사지의 숫자를 따로 적어두지 않고 문항 텍스트에서 유도한다
 * — 문항이 바뀌면 배점이 자동으로 따라간다.
 *
 * 세 과제가 모두 같은 규칙이다:
 * · 문장 읽기유창성 — "정확하게 읽은 어절 수" (G1 7·7·8·14 / G2 7·8·9·11)
 * · 낱말 쓰기(G1)   — "정확하게 쓴 낱말은 1점" → 낱말 하나가 곧 한 어절이라 문항 만점 1
 * · 문장 쓰기(G2)   — "정확하게 쓴 어절은 1점" → 두 어절 문장이라 문항 만점 2
 */
export function itemMaxWords(item: SurveyItem): number {
  return item.text.trim().split(/\s+/).length
}

/**
 * ⚠️ Pass 기준은 아직 **임시값**이다(양식별 `passMark`).
 * 담당자 확인: "점수 기준이 아직 명확하지 않은데 대강 입력해둬도 괜찮다."
 * 임의의 숫자이므로 이 플래그가 true인 동안 화면·인쇄물에 "임시 기준 · 확정 전"을 함께 표시한다
 * (시범 운영 중 나온 판정이 실제 판정으로 학교에 전달되는 것을 막기 위함).
 * 실제 기준표가 오면 양식의 숫자만 바꾸면 되고, 이미 채점한 세션도 저장된 점수로 다시 계산된다.
 */
export const PROVISIONAL_CRITERIA = true

export type TaskKey = 'wordReading' | 'sentenceReading' | 'writing'
export type Verdict = 'pass' | 'fail'

export const TASK_KEYS: TaskKey[] = ['wordReading', 'sentenceReading', 'writing']

export interface FormScoring {
  /** 과제별 만점(검사지) */
  taskMax: Record<TaskKey, number>
  /** 낱말 해독의 의미/무의미 소계 만점 — 결과지가 '/ 7'을 이 값으로 찍는다 */
  readMax: { meaning: number; nonsense: number }
  /** 낱말 쓰기(G1)의 의미/무의미 소계 만점. 문장 쓰기 양식에서는 0이다. */
  writeMax: { meaning: number; nonsense: number }
  passMark: Record<TaskKey, number>
}

const SCORING = new WeakMap<SurveyForm, FormScoring>()

export function scoringFor(form: SurveyForm): FormScoring {
  const hit = SCORING.get(form)
  if (hit) return hit
  const f = itemsFor(form)
  const sum = (items: SurveyItem[]) => items.reduce((n, i) => n + itemMaxWords(i), 0)
  const maxOf = (codes: string[]) => sum(codes.map(c => f.byCode.get(c)!))
  const built: FormScoring = {
    taskMax: {
      wordReading: f.readItems.length,
      sentenceReading: sum(f.sentenceItems),
      writing: sum(f.writingItems),
    },
    readMax: { meaning: f.meaningReadCodes.length, nonsense: f.nonsenseReadCodes.length },
    writeMax: { meaning: maxOf(f.meaningWriteCodes), nonsense: maxOf(f.nonsenseWriteCodes) },
    passMark: form.passMark,
  }
  SCORING.set(form, built)
  return built
}

export interface ScoreInput {
  /** 낱말 해독 itemCode(rw..) → 정반응 여부 */
  marks: Partial<Record<string, boolean>>
  /** 문장 읽기유창성 itemCode(rs..) → 제한 시간 내 정확히 읽은 어절 수 */
  sentences: Partial<Record<string, number>>
  /** 쓰기 과제 itemCode(ww../sw..) → 정확히 쓴 어절 수 (검사 중 수집) */
  writing: Partial<Record<string, number>>
}

export interface ScoreResult {
  wordMeaning: number
  wordNonsense: number
  wordReading: number
  sentenceReading: number
  /** 낱말 쓰기(G1)의 의미/무의미 소계. 문장 쓰기 양식에서는 0이다. */
  writeMeaning: number
  writeNonsense: number
  /** 쓰기 과제 총점 */
  writing: number
  verdict: Record<TaskKey, Verdict>
  /**
   * 과제별 채점 완료 여부. 이것이 false면 **숫자도 판정도 확정된 값이 아니다.**
   *
   * 없는 데이터를 0으로 세는 것과 "0점을 받았다"는 전혀 다르다. 중단 규칙으로 실시하지
   * 않은 과제(문장·쓰기)나 아직 채점 전인 과제까지 0점 Fail로 표시하면, 치르지도
   * 않은 과제에서 낙제한 아동으로 기록된다. 화면은 판정을 감추고 인쇄물은 칸을 비운다.
   */
  complete: Record<TaskKey, boolean>
}

/**
 * 저장된 행들(sessionDetail) → 채점 입력.
 *
 * 쓰기 답은 과제 종류에 따라 저장 위치가 다르다 — 낱말 쓰기는 `writing_answers.can_write`
 * (boolean), 문장 쓰기는 `sentence_scores.words`(정수)다. 그 사실을 아는 곳을 여기 하나로
 * 모아, 결과지 화면과 인쇄 라우트가 같은 방식으로 읽게 한다.
 * `sentence_scores`에는 문장 읽기유창성(rs..)과 문장 쓰기(sw..)가 섞여 있으므로
 * 양식의 문항 코드로 갈라 담는다.
 */
export function scoreInputFrom(f: FormItems, rows: {
  marks: { item_code: string; correct: boolean }[]
  sentences: { item_code: string; words: number }[]
  writing: { item_code: string; can_write: boolean }[]
}): ScoreInput {
  const writingCodes = new Set(f.writingItems.map(i => i.code))
  const readingCodes = new Set(f.sentenceItems.map(i => i.code))
  return {
    marks: Object.fromEntries(rows.marks.map(m => [m.item_code, m.correct])),
    sentences: Object.fromEntries(
      rows.sentences.filter(s => readingCodes.has(s.item_code)).map(s => [s.item_code, s.words]),
    ),
    // 양쪽 다 양식의 문항 코드로 거른다 — 학년이 바뀐 세션에 남은 옛 코드가 진행률에
    // "응답 있음"으로 세어지지 않도록.
    writing: {
      ...Object.fromEntries(
        rows.writing.filter(w => writingCodes.has(w.item_code)).map(w => [w.item_code, w.can_write ? 1 : 0]),
      ),
      ...Object.fromEntries(
        rows.sentences.filter(s => writingCodes.has(s.item_code)).map(s => [s.item_code, s.words]),
      ),
    },
  }
}

const countTrue = (codes: string[], m: Partial<Record<string, boolean>>) =>
  codes.reduce((n, c) => n + (m[c] === true ? 1 : 0), 0)

/** 문항 만점을 넘거나 음수인 입력은 잘라낸다 — 오입력이 총점을 왜곡하지 않도록.
 *  총점만이 아니라 **개별 문항을 표시·인쇄할 때도** 이 값을 써야 행의 합과 총점이 어긋나지 않는다. */
export function clampWords(f: FormItems, code: string, raw: number | undefined): number {
  const item = f.byCode.get(code)
  if (!item || raw == null || !Number.isFinite(raw)) return 0
  return Math.max(0, Math.min(Math.floor(raw), itemMaxWords(item)))
}

/** 해당 코드들이 "모두" 채점됐는지 — 하나라도 비면 그 과제는 아직 확정된 점수가 없다. */
const allAnswered = (codes: Iterable<string>, m: Partial<Record<string, unknown>>) =>
  [...codes].every(c => m[c] !== undefined)

export function scoreSession(form: SurveyForm, s: ScoreInput): ScoreResult {
  const f = itemsFor(form)
  const { passMark } = scoringFor(form)
  const total = (codes: string[]) => codes.reduce((n, c) => n + clampWords(f, c, s.writing[c]), 0)

  const wordMeaning = countTrue(f.meaningReadCodes, s.marks)
  const wordNonsense = countTrue(f.nonsenseReadCodes, s.marks)
  const wordReading = wordMeaning + wordNonsense
  const sentenceReading = f.sentenceItems.reduce((n, i) => n + clampWords(f, i.code, s.sentences[i.code]), 0)
  const writeMeaning = total(f.meaningWriteCodes)
  const writeNonsense = total(f.nonsenseWriteCodes)
  const writing = total(f.writingItems.map(i => i.code))
  const at = (v: number, key: TaskKey): Verdict => (v >= passMark[key] ? 'pass' : 'fail')
  return {
    wordMeaning, wordNonsense, wordReading, sentenceReading, writeMeaning, writeNonsense, writing,
    verdict: {
      wordReading: at(wordReading, 'wordReading'),
      sentenceReading: at(sentenceReading, 'sentenceReading'),
      writing: at(writing, 'writing'),
    },
    complete: {
      wordReading: allAnswered(f.readItems.map(i => i.code), s.marks),
      sentenceReading: allAnswered(f.sentenceItems.map(i => i.code), s.sentences),
      // 쓰기는 중단 규칙 ②에 걸리면 앞 몇 개만 요구된다 — 요구 문항이 다 채워졌으면 완료다.
      writing: allAnswered(requiredWritingCodes(f, f.writingItems, s.writing), s.writing),
    },
  }
}
