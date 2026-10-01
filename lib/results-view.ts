// lib/results-view.ts — 교사 결과지 화면이 쓰는 타입과 순수 헬퍼.
// lib/results.ts에서 떼어 낸 이유: 그 파일은 채점 사슬(lib/forms 포함)을 import하므로, 화면
// (components/results/ResultsView)이 그것을 import하면 검사지 문항이 공개 JS 청크에 실린다.
// 이 파일은 **값으로 import하는 것이 없어야 한다**(타입만) — scripts/check-client-bundle.ts가 지킨다.
import type { TaskKey, Verdict } from './scoring'

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
   *  `complete`가 false인 과제의 숫자는 화면에 그대로 찍으면 안 된다(아래 complete 주석).
   *  `sentenceReading`은 점수가 아니라 어절/초다(만점이 없다 — lib/scoring `CountTaskKey`). */
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

export function latestSession(c: ResultsChild): ResultsSession | null {
  return c.sessions.length > 0 ? c.sessions[c.sessions.length - 1] : null
}

/**
 * 그 아이의 **가장 최근 채점 완료 세션**. 없으면 null.
 *
 * 결과지로 내보낼 수 있는 한 장이 이것이다 — 「아이당 최신 1장」이 뜻하는 것은 *최신 세션*이
 * 아니라 *받을 수 있는 것 중 최신*이다. 재검사를 시작했다가 중단하면 최신 세션은 미제출이 되는데,
 * 그 아이를 통째로 빼면 **채점이 끝난 1차 결과지를 영영 못 받는다**(전수 점검 2026-09-22에서 발견).
 * 판정 표시(`childVerdict`)는 이것과 달리 **최신 세션만** 본다 — 채점 중인 재검사가 옛 판정을
 * 가리지 않게 하려는 별개의 규칙이다.
 */
export function latestScored(c: ResultsChild): ResultsSession | null {
  for (let i = c.sessions.length - 1; i >= 0; i--) if (c.sessions[i].status === 'scored') return c.sessions[i]
  return null
}

/** 접힌 행의 판정 = 최신 세션이 scored일 때만 그 판정. 채점 중인 재검사가 옛 판정을 가리지 않는다. */
export function childVerdict(c: ResultsChild): Verdict | null {
  const s = latestSession(c)
  return s?.status === 'scored' ? s.verdict : null
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
    // 「채점 완료」는 **받을 수 있는 결과지가 있는 아이** 수다(= 다운로드 버튼이 세는 것과 같은 기준).
    // 최신 세션이 중단된 재검사여도 채점이 끝난 앞 차수가 있으면 그 아이는 결과지를 받을 수 있다.
    // 칸은 서로 겹치지 않는다 — 아이 하나는 한 칸에만 센다(합이 검사 인원과 맞아야 한다).
    if (latestScored(c)) { s.scored++; if (l.verdict === 'fail') s.fail++ }
    else if (l.status === 'scoring') s.scoring++
    else s.unsubmitted++
  }
  return s
}

