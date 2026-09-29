// lib/scoring.ts — 검사지 채점 규칙(배점·합산·Pass/Fail). 순수 함수만 둔다.
// 화면·저장 API·인쇄가 모두 이 파일 하나로 점수를 계산해, 표시되는 값과 저장되는 값이 어긋나지 않게 한다.
// 배점은 학년별 검사지(lib/forms)에서 나온다 — 숫자를 여기 적어 두지 않는다.
import { GRACE_SEC, itemsFor, type FormItems, type SurveyItem } from './items'
import type { SurveyForm } from './forms'

/**
 * 문항 배점 = **어절 수**. 검사지의 숫자를 따로 적어두지 않고 문항 텍스트에서 유도한다
 * — 문항이 바뀌면 배점이 자동으로 따라간다.
 *
 * 세 과제가 모두 같은 규칙이다:
 * · 문장 읽기유창성 — 문장별 "정확하게 읽은 어절 수"의 상한 (G1 7·7·8·14 / G2 7·8·9·11).
 *   과제 총점은 어절 수가 아니라 어절/초다(`fluencyOf`).
 * · 낱말 쓰기(G1)   — "정확하게 쓴 낱말은 1점" → 낱말 하나가 곧 한 어절이라 문항 만점 1
 * · 문장 쓰기(G2)   — "정확하게 쓴 어절은 1점" → 두 어절 문장이라 문항 만점 2
 */
export function itemMaxWords(item: SurveyItem): number {
  return item.text.trim().split(/\s+/).length
}

/**
 * ⚠️ 담당자 확인 대기 — 확정 아님. Pass 기준은 아직 **임시값**이다(양식별 `passMark`).
 * 담당자 회신(2026-08-11): "점수 기준이 아직 명확하지 않은데 대강 입력해둬도 괜찮다."
 * — 즉 담당자가 승낙한 것은 "임시값을 써도 된다"까지이고, **숫자 자체는 개발 판단이다**
 * (만점의 약 65%, 사용자 확정 2026-08-11).
 * 임의의 숫자이므로 이 플래그가 true인 동안 **화면**에 "임시 기준 · 확정 전"을 함께 표시한다
 * (시범 운영 중 나온 판정이 실제 판정으로 학교에 전달되는 것을 막기 위함). 결과보고서 PDF는
 * 담당자 양식을 1:1로 따르므로 이 표시를 싣지 않는다 — 기준표(2026-10-02 예정) 전에는 내려받은
 * PDF의 PASS/FAIL이 임시 기준에 의한 것임을 관리자 화면의 표시로만 알 수 있다.
 * 실제 기준표가 오면 양식의 숫자만 바꾸면 되고, 이미 채점한 세션도 저장된 점수로 다시 계산된다.
 */
export const PROVISIONAL_CRITERIA = true

export type TaskKey = 'wordReading' | 'sentenceReading' | 'writing'
export type Verdict = 'pass' | 'fail'

export const TASK_KEYS: TaskKey[] = ['wordReading', 'sentenceReading', 'writing']

/**
 * 최종결과: **세 영역 중 FAIL이 2개 이상이면 FAIL, 아니면 PASS.**
 *
 * 담당자 확정(2026-09-29) — 원문 「3개 중에 2개 이상이 fail이면 최종 fail로 할려고」. 2026-09-28 회신
 * 「1개 이상이 fail이면 fail」은 담당자가 「내가 잘못 얘기했다」며 정정했다. 담당자가 배포한 결과보고서
 * 예시(`KODYS_G*_결과보고서.docx`: PASS·PASS·FAIL → 최종 PASS, 미통과 문구 「2개 이상의 영역에서」)와
 * 일치한다. 교사 결과 화면(`lib/results.ts`)과 결과보고서 PDF(`lib/pdf/report.ts`)가 같이 쓴다.
 */
export function finalVerdict(v: Record<TaskKey, Verdict>): Verdict {
  return TASK_KEYS.filter(k => v[k] === 'fail').length >= 2 ? 'fail' : 'pass'
}

/**
 * 문장 읽기유창성 총점 = **정확하게 읽은 어절 수의 합 ÷ 읽은 시간(초)의 합** (어절/초).
 *
 * 담당자 확정(2026-09-29) — 원문 「총점은 (정확하게 읽은 어절 수 / 읽은 총 시간) 이 되어야 할 것 같아」,
 * 예시 「문장 4개 읽는데 총 10초가 걸렸고, 정확하게 읽은 어절이 20개면 (20/10)=2점」. 시간은 관리자가
 * 녹음을 듣고 문장마다 직접 넣는다 — 녹음 길이(recordings.duration_sec)로 채우지 않는다(원문 「녹음된 초를
 * 넣기에는 정확하지가 않을 것 같아서」). 검사지 인쇄 문구(「정확하게 읽은 어절 수로 채점」, 총점 /36)와
 * 다른 것은 의도된 것이다(CLAUDE.md 2절).
 *
 * 개수형 과제와 달리 **만점이 없다.** 그래서 `taskMax`에 이 과제가 없고, 정확 어절의 만점은
 * `sentenceWordsMax`가 따로 갖는다 — 「2.12 / 36」처럼 척도가 섞여 찍히는 것을 타입으로 막는다.
 */
export type CountTaskKey = Exclude<TaskKey, 'sentenceReading'>

/**
 * 소수 둘째 자리까지(셋째 자리에서 반올림) — 담당자 확정(2026-09-29), 원문 「cut-off를 소수점
 * 둘쨋자리까지 (셋째에서 반올림) 봐」. **판정도 반올림한 값으로 한다** — cut-off를 같은 자리에서
 * 보므로, 화면에 「1.00」이 찍혔는데 기준 1.00에서 Fail이 나오는 모순도 막는다.
 */
export const FLUENCY_DECIMALS = 2
export const FLUENCY_UNIT = '어절/초'
export const fluencyLabel = (v: number): string => v.toFixed(FLUENCY_DECIMALS)

/** 어절 ÷ 시간. 시간은 0.1초 단위 정수(tenths)로 받는다 — 초를 소수로 더하면 17.000000000000004 같은
 *  부동소수 오차가 생겨 반올림 경계에서 한 자리가 뒤집힐 수 있다. 시간이 0이면 0. */
function fluencyOf(words: number, tenths: number): number {
  if (tenths <= 0) return 0
  const scale = 10 ** FLUENCY_DECIMALS
  return Math.round((words * 10 * scale) / tenths) / scale
}

/**
 * 읽은 시간 입력의 상한(초) = 문장 녹음의 최대 길이(제한 시간 + 여유, `maxRecSec`와 같다).
 * **채점 규칙이 아니라 오타 방지용이다** — 20초를 넘겨 읽었을 때 어디까지 셀지는 담당자가 녹음을 듣고
 * 판단하므로 앱이 제한 시간을 강제하지 않는다(사용자 확정 2026-09-29, 담당자 원문 「내가 그냥 듣고
 * 입력하면 돼」). 녹음이 이보다 길 수 없으니 넘는 값은 잘못 친 것이다.
 */
export const readSecMax = (form: SurveyForm): number => form.limits.sentenceSec + GRACE_SEC

/** 저장할 수 있는 읽은 시간인지 — 0초 초과 · 상한 이하 · 0.1초 단위. 저장 라우트와 입력 칸이 같이 쓴다. */
export function isValidReadSec(v: unknown, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max
    && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9
}

/** 입력 칸 글자 → 초. 빈 칸은 `undefined`(입력 없음), 형식·범위를 벗어나면 `null`(잘못 친 값). */
export function parseReadSec(raw: string, max: number): number | undefined | null {
  const t = raw.trim()
  if (t === '') return undefined
  if (!/^(\d+\.?\d?|\.\d)$/.test(t)) return null
  const v = Number(t)
  return isValidReadSec(v, max) ? Math.round(v * 10) / 10 : null
}

/** 초 표기 — 정수는 그대로(17), 아니면 소수 한 자리(17.5). */
export const readSecLabel = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1))

export interface FormScoring {
  /** 개수형 과제의 만점(검사지). 문장 읽기유창성은 비율이라 없다(`CountTaskKey` 주석) */
  taskMax: Record<CountTaskKey, number>
  /** 문장 읽기유창성의 정확 어절 만점(G1 36 / G2 35) — 소계 「정확 어절 __ / 36」 */
  sentenceWordsMax: number
  /** 낱말 해독의 의미/무의미 소계 만점 — 결과지가 '/ 7'을 이 값으로 찍는다 */
  readMax: { meaning: number; nonsense: number }
  /** 낱말 쓰기(G1)의 의미/무의미 소계 만점. 문장 쓰기 양식에서는 0이다. */
  writeMax: { meaning: number; nonsense: number }
  /** 과제별 Pass 기준 — 개수형은 점수, 문장 읽기유창성은 어절/초 */
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
      writing: sum(f.writingItems),
    },
    sentenceWordsMax: sum(f.sentenceItems),
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
  /** 문장 읽기유창성 itemCode(rs..) → 정확히 읽은 어절 수 */
  sentences: Partial<Record<string, number>>
  /** 문장 읽기유창성 itemCode(rs..) → 읽은 시간(초, 0.1초 단위). 관리자가 녹음을 듣고 넣는다 */
  times: Partial<Record<string, number>>
  /** 쓰기 과제 itemCode(ww../sw..) → 정확히 쓴 어절 수 (검사 중 수집) */
  writing: Partial<Record<string, number>>
}

export interface ScoreResult {
  wordMeaning: number
  wordNonsense: number
  wordReading: number
  /** 문장 읽기유창성 총점 — 어절/초, `FLUENCY_DECIMALS` 자리 반올림. 판정도 이 값으로 한다 */
  sentenceReading: number
  /** 문장 읽기유창성의 정확 어절 합(총점의 분자) */
  sentenceWords: number
  /** 문장 읽기유창성의 읽은 시간 합(초, 0.1초 단위 — 총점의 분모) */
  sentenceSec: number
  /** 낱말 쓰기(G1)의 의미/무의미 소계. 문장 쓰기 양식에서는 0이다. */
  writeMeaning: number
  writeNonsense: number
  /** 쓰기 과제 총점 */
  writing: number
  verdict: Record<TaskKey, Verdict>
  /**
   * 과제별 채점 완료 여부. 이것이 false면 **숫자도 판정도 확정된 값이 아니다.**
   *
   * 없는 데이터를 0으로 세는 것과 "0점을 받았다"는 전혀 다르다. 아직 채점 전인 과제까지
   * 0점 Fail로 표시하면, 치르지도 않은 과제에서 낙제한 아동으로 기록된다.
   * 화면은 판정을 감추고 인쇄물은 칸을 비운다.
   */
  complete: Record<TaskKey, boolean>
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
 * 결과보고서 PDF를 지금 내려받아도 되는지. `null`이면 받아도 된다.
 *
 * 학교로 나가는 공식 문서라 채점이 끝나기 전에 실수로 내려받는 것을 막는다
 * (사용자 확정 2026-08-12: 버튼 비활성화가 아니라 눌렀을 때 이유를 모달로 알린다).
 *
 * **채점자가 이 화면에서 채울 수 있는 것만 막는다** — 미저장·낱말 O/X·문장 어절 수·읽은 시간.
 * 쓰기 과제는 검사 중 수집분이라 결과지에서 고칠 수 없으므로 경고만 하고 통과시킨다
 * (그렇지 않으면 아동이 쓰기를 건너뛴 세션의 결과지가 영구히 나갈 수 없다).
 */
export function sheetPdfGate(r: ScoreResult, dirty: boolean): PdfGate | null {
  const left = (k: TaskKey) => !r.complete[k]
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
 * 양식의 문항 코드로 갈라 담는다. 문장 읽기의 읽은 시간은 `sentence_times`에 따로 있다.
 */
export function scoreInputFrom(f: FormItems, rows: {
  marks: { item_code: string; correct: boolean }[]
  sentences: { item_code: string; words: number }[]
  times: { item_code: string; seconds: number }[]
  writing: { item_code: string; can_write: boolean }[]
}): ScoreInput {
  const writingCodes = new Set(f.writingItems.map(i => i.code))
  const readingCodes = new Set(f.sentenceItems.map(i => i.code))
  return {
    marks: Object.fromEntries(rows.marks.map(m => [m.item_code, m.correct])),
    sentences: Object.fromEntries(
      rows.sentences.filter(s => readingCodes.has(s.item_code)).map(s => [s.item_code, s.words]),
    ),
    // numeric 열이라 방어적으로 숫자로 맞춘다(문자열로 와도 합산이 문자열 이어 붙이기가 되지 않게).
    times: Object.fromEntries(
      rows.times.filter(t => readingCodes.has(t.item_code)).map(t => [t.item_code, Number(t.seconds)]),
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
 * 검사지 명문: "제한시간 내 읽지 못한 낱말은 0점으로 채점합니다" — 미녹음도 같은 취급.
 *
 * 아동이 읽지 않고 넘긴 페이지(「모르겠어요」)는 정반응이 있을 수 없는데, 채점자가 X를
 * 하나하나 찍어 주지 않으면 그 과제가 영원히 "채점 전"으로 남아 결과지·결과보고서 PDF의 점수
 * 칸이 통째로 비어 나갔다(사용자 보고 항목 9).
 *
 * **저장된 채점이 언제나 우선한다** — 채점자가 녹음 없이 O를 준 판단을 덮지 않는다.
 *
 * 화면(관리자 결과지)과 결과보고서 PDF가 같은 함수를 거쳐 같은 값을 쓴다 — 한쪽만 적용하면
 * 저장 버튼을 누르기 전까지 두 출력이 어긋난다.
 *
 * 문장의 읽은 시간 기본값은 `unrecordedTimeDefaults`가 정한다(규칙과 근거는 그 주석).
 */
export function withUnrecordedDefaults(
  f: FormItems, input: ScoreInput, hasRecording: (pageCode: string) => boolean,
): ScoreInput {
  const marks = { ...input.marks }
  const sentences = { ...input.sentences }
  for (const p of f.recordingPages.filter(p => !hasRecording(p.code))) {
    if (p.section === 'word_reading') {
      for (const i of p.items) if (marks[i.code] === undefined) marks[i.code] = false
    } else {
      for (const i of p.items) if (sentences[i.code] === undefined) sentences[i.code] = 0
    }
  }
  // 위 둘과 같이 「비어 있을 때만」 채운다 — spread로 합치면 값이 undefined인 키가 기본값을 지운다.
  const times = { ...input.times }
  for (const [code, sec] of Object.entries(unrecordedTimeDefaults(f, hasRecording)))
    if (times[code] === undefined) times[code] = sec
  return { ...input, marks, sentences, times }
}

/**
 * 녹음이 없는 문장의 읽은 시간 기본값 = **그 문장의 제한 시간**(20초) — 「주어진 시간 동안 0어절」.
 *
 * 담당자 확정(2026-09-29) — 원문 「20초로 치고 0어절로 계산하면 될 듯」. 「모르겠어요」·업로드 실패를
 * 가리지 않는다(서버는 둘을 구분하지 않는다). 계산에서 빼지 않는 이유: 빼면 총점이 비율이라
 * 못 읽은 문장이 점수를 깎지 않는다 — 1번만 5초에 7어절 읽고 나머지를 넘긴 아이가 7÷5 = 1.40으로,
 * 4문장을 30초에 다 읽은 아이(36÷30 = 1.20)보다 높아진다. 제한 시간으로 치면 7÷65 = 0.11.
 * 어절 0점 기본값(검사지 「제한시간 내 읽지 못한 어절은 0점」)과 같은 생각이다.
 *
 * **이 값은 저장하지 않고 채점할 때마다 파생한다** — 관리자 결과지는 입력 칸의 placeholder로만 보여 주고
 * 저장 요청에 싣지 않는다. 확인 대기 중에 임시값이 DB에 굳지 않게 하려고 이렇게 만들었고, 확정 뒤에도
 * 바꿀 이유가 없다: 제출된 검사는 업로드가 잠겨 녹음이 새로 생기지 않으므로 파생값이 달라지지 않는다.
 */
export function unrecordedTimeDefaults(
  f: FormItems, hasRecording: (pageCode: string) => boolean,
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {}
  for (const p of f.recordingPages)
    if (p.section === 'sentence_reading' && !hasRecording(p.code))
      for (const i of p.items) out[i.code] = p.limitSec
  return out
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
  // 읽은 것·쓴 것은 전부 산입한다 — 중단 규칙으로 뒤 과제를 채점에서 빼던 파생은 폐기됐다.
  // 담당자 회신("가정이 필요없을 것 같아")이 근거이나, **사후 채점 파생까지 걷어내는
  // 폐기 범위는 사용자 확정(2026-08-13)이다** — 담당자가 그 범위까지 답한 것은 아니다.
  const total = (codes: string[]) => codes.reduce((n, c) => n + clampWords(f, c, s.writing[c]), 0)
  const wordMeaning = countTrue(f.meaningReadCodes, s.marks)
  const wordNonsense = countTrue(f.nonsenseReadCodes, s.marks)
  const wordReading = wordMeaning + wordNonsense
  const sentenceCodes = f.sentenceItems.map(i => i.code)
  const sentenceWords = sentenceCodes.reduce((n, c) => n + clampWords(f, c, s.sentences[c]), 0)
  // 0초·음수·NaN은 입력이 없는 것으로 본다 — 저장 라우트가 이미 거르지만, 분모에 0이 섞이면
  // 「시간이 있다」로 세어져 채점 완료가 되고 총점이 부풀기 때문에 여기서도 막는다.
  const tenthsOf = (code: string): number | null => {
    const v = s.times[code]
    return v !== undefined && Number.isFinite(v) && v > 0 ? Math.round(v * 10) : null
  }
  const sentenceTenths = sentenceCodes.reduce((n, c) => n + (tenthsOf(c) ?? 0), 0)
  const sentenceReading = fluencyOf(sentenceWords, sentenceTenths)
  const writeMeaning = total(f.meaningWriteCodes)
  const writeNonsense = total(f.nonsenseWriteCodes)
  const writing = total(f.writingItems.map(i => i.code))
  const at = (v: number, key: TaskKey): Verdict => (v >= passMark[key] ? 'pass' : 'fail')
  return {
    wordMeaning, wordNonsense, wordReading,
    sentenceReading, sentenceWords, sentenceSec: sentenceTenths / 10,
    writeMeaning, writeNonsense, writing,
    verdict: {
      wordReading: at(wordReading, 'wordReading'),
      sentenceReading: at(sentenceReading, 'sentenceReading'),
      writing: at(writing, 'writing'),
    },
    complete: {
      wordReading: allAnswered(f.readItems.map(i => i.code), s.marks),
      // 어절과 시간이 **네 문장 모두** 있어야 총점이 나온다 — 한 문장이라도 비면 분모·분자가 어긋난다.
      sentenceReading: allAnswered(sentenceCodes, s.sentences) && sentenceCodes.every(c => tenthsOf(c) !== null),
      writing: allAnswered(f.writingItems.map(i => i.code), s.writing),
    },
  }
}
