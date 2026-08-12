// lib/scoring.ts — 검사지 채점 규칙(배점·합산·Pass/Fail). 순수 함수만 둔다.
// 화면·저장 API·인쇄가 모두 이 파일 하나로 점수를 계산해, 표시되는 값과 저장되는 값이 어긋나지 않게 한다.
// 배점은 학년별 검사지(lib/forms)에서 나온다 — 숫자를 여기 적어 두지 않는다.
import { itemsFor, type FormItems, type SurveyItem } from './items'
import type { SurveyForm } from './forms'
import { readingCeilingHit, requiredWritingCodes, writingCeilingHit } from './survey-flow'

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
  /**
   * 과제별 중단 여부. true면 **Pass/Fail을 내지 않는다** — passMark는 전체 실시를 전제한
   * 기준이라(낱말 해독 9/14), 의미 7문항만 실시한 세션에 들이대면 근거가 성립하지 않는다.
   * 중단은 척도 위의 값이 아니라 그 자체가 결론이다. 화면은 `중단` 배지를 내고
   * PDF는 소계·총점 칸을 비운다(스펙 "검사지 PDF" 절).
   * complete보다 먼저 본다: discontinued가 true면 complete 값과 무관하게 '중단'으로 표시한다.
   */
  discontinued: Record<TaskKey, boolean>
}

export interface PdfGate {
  /** 왜 막혔는지 — dirty(미저장) · unscored(채점 남음) */
  reason: 'dirty' | 'unscored'
  /** 채점이 남은 과제 */
  tasks: TaskKey[]
  /** 경고만 하고 내려받게 둘지 — 채점자가 결과지 화면에서 채울 수 없는 경우만 true */
  overridable: boolean
}

/**
 * 검사지 PDF를 지금 내려받아도 되는지. `null`이면 받아도 된다.
 *
 * 학교로 나가는 공식 문서라 채점이 끝나기 전에 실수로 내려받는 것을 막는다
 * (사용자 확정 2026-08-12: 버튼 비활성화가 아니라 눌렀을 때 이유를 모달로 알린다).
 *
 * **채점자가 이 화면에서 채울 수 있는 것만 막는다** — 미저장·낱말 O/X·문장 어절 수.
 * 쓰기 과제는 검사 중 수집분이라 결과지에서 고칠 수 없으므로 경고만 하고 통과시킨다
 * (그렇지 않으면 아동이 쓰기를 건너뛴 세션의 결과지가 영구히 나갈 수 없다).
 * 중단으로 실시하지 않은 과제는 "채점할 것이 없는" 상태라 관문에 걸리지 않는다.
 */
export function sheetPdfGate(r: ScoreResult, dirty: boolean): PdfGate | null {
  const left = (k: TaskKey) => !r.complete[k] && !r.discontinued[k]
  const fixable = TASK_KEYS.filter(k => k !== 'writing' && left(k))
  if (dirty) return { reason: 'dirty', tasks: fixable, overridable: false }
  if (fixable.length > 0) return { reason: 'unscored', tasks: fixable, overridable: false }
  if (left('writing')) return { reason: 'unscored', tasks: ['writing'], overridable: true }
  return null
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

/**
 * 녹음이 없는 페이지의 문항을 **오반응(X)·0점**으로 채운 채점 입력을 만든다
 * (사용자 확정 2026-08-12: "미녹음 한 거는 기본적으로 X하거나 0점이 default로 입력되게").
 *
 * 아동이 읽지 않고 넘긴 페이지(「모르겠어요」)는 정반응이 있을 수 없는데, 채점자가 X를
 * 하나하나 찍어 주지 않으면 그 과제가 영원히 "채점 전"으로 남아 결과지·검사지 PDF의 점수
 * 칸이 통째로 비어 나갔다(사용자 보고 항목 9).
 *
 * 두 가지를 지킨다:
 *  · **저장된 채점이 언제나 우선한다** — 채점자가 녹음 없이 O를 준 판단을 덮지 않는다.
 *  · **중단 규칙으로 실시하지 않은 과제에는 넣지 않는다** — 미실시는 0점이 아니다.
 *    (의미 낱말이 미녹음이라 첫 3개가 X로 채워지면 그 뒤 과제는 미실시가 되므로,
 *     의미 낱말을 먼저 채운 뒤 중단 여부를 다시 판정한다.)
 *
 * 화면(관리자 결과지)과 검사지 PDF가 같은 함수를 거쳐 같은 값을 쓴다 — 한쪽만 적용하면
 * 저장 버튼을 누르기 전까지 두 출력이 어긋난다.
 */
export function withUnrecordedDefaults(
  f: FormItems, input: ScoreInput, hasRecording: (pageCode: string) => boolean,
): ScoreInput {
  const marks = { ...input.marks }
  const sentences = { ...input.sentences }
  const fillMarks = (page: (typeof f.recordingPages)[number]) => {
    for (const i of page.items) if (marks[i.code] === undefined) marks[i.code] = false
  }
  const unrecorded = f.recordingPages.filter(p => !hasRecording(p.code))
  // ① 의미 낱말 먼저 — 이 페이지의 기본값이 중단 판정을 바꿀 수 있다.
  for (const p of unrecorded.filter(p => p.section === 'word_reading' && p.kind === 'meaning'))
    fillMarks(p)
  // ② 중단이면 나머지(무의미 낱말·문장 읽기유창성)는 미실시 — 비워 둔다.
  if (readingCeilingHit(f, marks)) return { ...input, marks, sentences }
  for (const p of unrecorded) {
    if (p.section === 'word_reading') fillMarks(p)
    else for (const i of p.items) if (sentences[i.code] === undefined) sentences[i.code] = 0
  }
  return { ...input, marks, sentences }
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
  // 중단 규칙 ①·② — 어느 문항까지가 "실시된 전부"인지를 정한다
  const discReading = readingCeilingHit(f, s.marks)
  const discWriting = writingCeilingHit(f, s.writing)
  // 쓰기 총점은 **실시된 문항만** 더한다. ②가 걸린 뒤에도 값이 남아 있는 세션이 있는데
  // (검사자가 2번 이후를 먼저 채점한 경우 — 사용자 보고 항목 10) 그것까지 더하면
  // "중단 · 실시분 9점"처럼 실시하지 않은 문항의 점수가 결과지에 나타난다.
  const implemented = requiredWritingCodes(f, f.writingItems, s.writing)
  const total = (codes: string[]) =>
    codes.filter(c => implemented.has(c)).reduce((n, c) => n + clampWords(f, c, s.writing[c]), 0)

  const wordMeaning = countTrue(f.meaningReadCodes, s.marks)
  // ①이 성립하면 무의미 낱말·문장 읽기유창성은 **실시 대상이 아니다** — 값이 남아 있어도 총점에서 뺀다.
  // 값이 남는 경로가 실제로 있다(사용자 보고 2026-08-12): 관리자가 녹음을 듣고 의미 낱말을
  // 고쳐 뒤늦게 중단이 성립하면, 검사 당시엔 실시된 무의미·문장의 점수가 이미 저장돼 있다.
  // 기록(DB·화면의 회색 값)은 지우지 않고 채점에서만 뺀다 — O/X를 되돌리면 점수가 그대로 살아난다.
  const wordNonsense = discReading ? 0 : countTrue(f.nonsenseReadCodes, s.marks)
  const wordReading = wordMeaning + wordNonsense
  const sentenceReading = discReading
    ? 0
    : f.sentenceItems.reduce((n, i) => n + clampWords(f, i.code, s.sentences[i.code]), 0)
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
      // ①이 걸리면 무의미는 실시하지 않으므로 의미 7문항이 "실시된 전부"다.
      wordReading: allAnswered(discReading ? f.meaningReadCodes : f.readItems.map(i => i.code), s.marks),
      sentenceReading: allAnswered(f.sentenceItems.map(i => i.code), s.sentences),
      // 쓰기는 중단 규칙 ②에 걸리면 1번만 요구된다 — 요구 문항이 다 채워졌으면 완료다.
      writing: allAnswered(requiredWritingCodes(f, f.writingItems, s.writing), s.writing),
    },
    discontinued: {
      wordReading: discReading,
      sentenceReading: discReading,
      writing: discWriting,
    },
  }
}
