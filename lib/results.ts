// lib/results.ts — 교사 결과지 표의 순수 로직. DB·HTTP를 모른다(행 모양만 받는다).
// 목록 라우트·PDF 라우트·테스트가 공유한다. 채점은 관리자 결과지와 **같은 함수 사슬**을 쓴다 —
// scoreInputFrom → (제출됨이면) withUnrecordedDefaults → scoreSession → sheetPdfGate.
// 여기서 규칙을 새로 만들지 않는다: 관리자와 교사가 다른 점수를 보면 그 자체가 사고다.
import { formForGrade, type SurveyForm } from './forms'
import { itemsFor } from './items'
import { pad2 } from './format'
import {
  TASK_KEYS, scoreInputFrom, scoreSession, sheetPdfGate, withUnrecordedDefaults,
  type ScoreInput, type TaskKey, type Verdict,
} from './scoring'

/** 목록·PDF 라우트가 DB에서 받아 넘기는 세션 한 행(관계 select 포함). */
export interface ResultsSessionRow {
  id: string
  child_no: number
  child_name: string
  gender: string
  grade: number
  started_at: string
  submitted_at: string | null
  /** 결과지 PDF 머리글이 찍는다(stampSheet). **목록 API 응답에는 싣지 않는다** — buildChildren이 옮기지 않는다. */
  birth_ymd: string
  /** 검사자 체크리스트 — 결과지 PDF가 체크 표시를 찍는다(관리자 PDF와 같은 문서여야 한다) */
  checklist: string[]
  recordings: { item_code: string }[]
  reading_marks: { item_code: string; correct: boolean }[]
  sentence_scores: { item_code: string; words: number }[]
  writing_answers: { item_code: string; can_write: boolean }[]
}

/** 명단 한 줄 — `RosterRow`의 부분집합(생년월일은 결과 표에 싣지 않는다). */
export interface ResultsRosterRow { child_no: number; child_name: string; gender: string }

/**
 * 세션 상태. 사용자 확정(2026-09-22):
 *  scored      제출됨 + 관리자 PDF 게이트 통과(읽기 두 과제 채점됨. 쓰기는 비어도 됨 — A안)
 *  scoring     제출됨 + 읽기 채점이 남음
 *  unsubmitted 검사 도중 나감(다시 검사해야 함) — 「채점 중」과 다르다
 */
export type SessionStatus = 'scored' | 'scoring' | 'unsubmitted'

export interface ResultsSession {
  id: string
  /** 같은 아동 안에서 started_at 오름차순 1부터 */
  attemptNo: number
  startedAt: string
  submittedAt: string | null
  status: SessionStatus
  /** scored일 때만. **채점되지 않은 과제도 0이 들어간다** — 그 0은 「0점을 받았다」가 아니므로
   *  `complete`가 false인 과제의 숫자는 화면에 그대로 찍으면 안 된다(아래 complete 주석). */
  scores: Record<TaskKey, number> | null
  /** scored일 때만, 그리고 **세 과제가 모두 채점됐을 때만.** 하나라도 채점 전이면 null —
   *  치르지도 않은 과제의 0점으로 아동을 낙제시키지 않는다(아래 complete 주석). */
  verdict: Verdict | null
  /**
   * 과제별 채점 완료 여부(`scoreSession`의 `complete` 그대로). scored일 때만 채워진다.
   *
   * A안(사용자 확정 2026-09-22)으로 **쓰기가 채점되지 않아도 scored가 된다** — 쓰기는 검사 중
   * 검사자가 넣는 값이라 관리자가 나중에 채울 수 없고, 요구하면 그 아이 결과지가 영영 안 나간다.
   * 그 대가로 `scores.writing`에 0이 들어오는데, **그 0은 「0점을 받았다」가 아니다.**
   * lib/scoring.ts의 `complete` 주석이 경계하는 그대로다 — "아직 채점 전인 과제까지 0점 Fail로
   * 표시하면, 치르지도 않은 과제에서 낙제한 아동으로 기록된다. 화면은 판정을 감추고 인쇄물은
   * 칸을 비운다." 관리자 결과지가 이미 그렇게 하므로 교사 화면도 같아야 한다 — 두 화면이 같은
   * 아이를 다르게 말하면 안 된다(사용자 확정 2026-09-22: 「관리자와 동일」 A안).
   *
   * 그래서 화면은 `complete[k] === false`인 과제를 **점수 대신 「채점 전」**으로 그리고,
   * `verdict`가 null이면 판정 칸을 비운다.
   */
  complete: Record<TaskKey, boolean> | null
}

export interface ResultsChild {
  childNo: number
  name: string
  gender: string
  /** started_at 오름차순. 비어 있으면 명단에만 있는 아이(미실시) */
  sessions: ResultsSession[]
}

/**
 * `kim@school.kr` → `k***@sch***.kr`. 어느 메일함인지는 알려주되 주소는 새지 않게.
 * 도메인은 **첫 라벨만** 앞 3글자를 남기고 TLD를 붙인다 — `b.co.kr`을 `b.c***`로 자르면
 * 다단계 TLD에서 점이 뜬금없이 드러난다(`a***@b***.kr`이 맞다).
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  const local = email.slice(0, at)
  const labels = email.slice(at + 1).split('.')
  const tld = labels.length > 1 ? `.${labels[labels.length - 1]}` : ''
  return `${local.slice(0, 1)}***@${labels[0].slice(0, 3)}***${tld}`
}

/**
 * 채점 입력 조립 — 관리자 결과지·PDF 라우트(`app/api/admin/sessions/[id]/sheet.pdf`)와 같다.
 * 제출된 세션만 미녹음 기본값(X·0점)을 적용한다: 진행 중인 검사의 빈 녹음은 "아직 안 한 것".
 */
export function scoreInputFor(r: ResultsSessionRow): { form: SurveyForm; input: ScoreInput } {
  const form = formForGrade(r.grade)
  const f = itemsFor(form)
  const raw = scoreInputFrom(f, { marks: r.reading_marks, sentences: r.sentence_scores, writing: r.writing_answers })
  if (!r.submitted_at) return { form, input: raw }
  const recorded = new Set(r.recordings.map(x => x.item_code))
  return { form, input: withUnrecordedDefaults(f, raw, c => recorded.has(c)) }
}

export function evaluateSession(r: ResultsSessionRow): Pick<ResultsSession, 'status' | 'scores' | 'verdict' | 'complete'> {
  if (!r.submitted_at) return { status: 'unsubmitted', scores: null, verdict: null, complete: null }
  const { form, input } = scoreInputFor(r)
  const result = scoreSession(form, input)
  // 관리자 PDF와 같은 게이트 — 읽기 두 과제가 남으면 막고, 쓰기만 남으면(overridable) 통과.
  const gate = sheetPdfGate(result, false)
  if (gate !== null && !gate.overridable)
    return { status: 'scoring', scores: null, verdict: null, complete: null }
  // **모든 과제가 채점됐을 때만 판정한다**(사용자 확정 2026-09-22 A안 — 관리자 화면과 동일).
  // 쓰기만 남은 채로 통과한 세션은 `result.writing`이 0인데 그것은 미채점이지 0점이 아니다.
  // 그 0으로 fail을 만들면 치르지도 않은 과제에서 낙제한 아동이 된다(ResultsSession.complete 주석).
  const allScored = TASK_KEYS.every(k => result.complete[k])
  const verdict: Verdict | null = allScored
    ? (TASK_KEYS.every(k => result.verdict[k] === 'pass') ? 'pass' : 'fail')
    : null
  return {
    status: 'scored',
    scores: { wordReading: result.wordReading, sentenceReading: result.sentenceReading, writing: result.writing },
    verdict,
    complete: result.complete,
  }
}

export function latestSession(c: ResultsChild): ResultsSession | null {
  return c.sessions.length > 0 ? c.sessions[c.sessions.length - 1] : null
}

/** 접힌 행의 판정 = 최신 세션이 scored일 때만 그 판정. 채점 중인 재검사가 옛 판정을 가리지 않는다. */
export function childVerdict(c: ResultsChild): Verdict | null {
  const s = latestSession(c)
  return s?.status === 'scored' ? s.verdict : null
}

/**
 * 명단 ∪ 세션 → 아이당 한 줄. 정렬은 **Fail 먼저, 그 안에서 번호순**(사용자 확정 ④).
 * - 명단에만 있음 → sessions 빈 행(미실시)
 * - 세션만 있음(직접 입력·명단 없는 학급) → 세션의 이름·성별
 * - 둘 다 → 이름·성별은 **최신 세션** 값(임상 기록이 명단보다 우선 — 관리자가 고친 값이 여기 있다)
 */
export function buildChildren(roster: ResultsRosterRow[], rows: ResultsSessionRow[]): ResultsChild[] {
  const byNo = new Map<number, ResultsChild>()
  for (const r of roster) byNo.set(r.child_no, { childNo: r.child_no, name: r.child_name, gender: r.gender, sessions: [] })

  const sorted = [...rows].sort((a, b) => a.started_at.localeCompare(b.started_at))
  for (const r of sorted) {
    const c = byNo.get(r.child_no) ?? { childNo: r.child_no, name: r.child_name, gender: r.gender, sessions: [] }
    c.name = r.child_name
    c.gender = r.gender
    c.sessions.push({
      id: r.id, attemptNo: c.sessions.length + 1, startedAt: r.started_at, submittedAt: r.submitted_at,
      ...evaluateSession(r),
    })
    byNo.set(r.child_no, c)
  }

  const rank = (c: ResultsChild) => (childVerdict(c) === 'fail' ? 0 : 1)
  return [...byNo.values()].sort((a, b) => rank(a) - rank(b) || a.childNo - b.childNo)
}

export interface ResultsSummary {
  /** 세션이 하나라도 있는 아이 */
  tested: number
  /** 최신 세션 기준 */
  scored: number; fail: number; scoring: number; unsubmitted: number
  /** 명단에만 있는 아이 */
  untested: number
}

export function summarize(children: ResultsChild[]): ResultsSummary {
  const s: ResultsSummary = { tested: 0, scored: 0, fail: 0, scoring: 0, unsubmitted: 0, untested: 0 }
  for (const c of children) {
    const l = latestSession(c)
    if (!l) { s.untested++; continue }
    s.tested++
    if (l.status === 'scored') { s.scored++; if (l.verdict === 'fail') s.fail++ }
    else if (l.status === 'scoring') s.scoring++
    else s.unsubmitted++
  }
  return s
}

/** 파일명에 쓰는 학급 표기 — `1-2`, 단일학급은 `2학년`. */
const classTag = (grade: number, classNo: number) => (classNo === 0 ? `${grade}학년` : `${grade}-${classNo}`)

/**
 * 내려받기 파일명. 관리자 규약(`03_이름_날짜.pdf`, 사용자 확정 2026-08-15)을 한 장에 그대로 쓰고,
 * 그 아이에 재검사가 있으면 `_2차`를 붙여 같은 이름으로 덮어써지지 않게 한다.
 */
export function sheetsFileName(a: {
  grade: number; classNo: number
  /** 병합 파일의 날짜(오늘, KST) */
  date: string
  all: boolean
  picked: { childNo: number; name: string; attemptNo: number; attemptCount: number; startedDate: string }[]
}): string {
  const tag = classTag(a.grade, a.classNo)
  if (a.all) return `${tag}_결과지_전체_${a.date}.pdf`
  if (a.picked.length === 1) {
    const p = a.picked[0]
    const nth = p.attemptCount > 1 ? `_${p.attemptNo}차` : ''
    return `${pad2(p.childNo)}_${p.name}${nth}_${p.startedDate}.pdf`
  }
  return `${tag}_결과지_${a.picked.length}명_${a.date}.pdf`
}
