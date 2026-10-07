// lib/results-view.ts — 교사 결과지 화면이 쓰는 타입과 순수 헬퍼.
// lib/results.ts에서 떼어 낸 이유: 그 파일은 채점 사슬(lib/forms 포함)을 import하므로, 화면
// (components/results/ResultsView)이 그것을 import하면 검사지 문항이 공개 JS 청크에 실린다.
// 이 파일은 **값으로 import하는 것이 없어야 한다**(타입만) — scripts/check-client-bundle.ts가 지킨다.
import type { TaskKey, Verdict } from './scoring'
import type { ScanTarget, ScanTargetState } from './scan-mapping'

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
   * A안(사용자 확정 2026-09-22)으로 **쓰기가 채점되지 않아도 scored가 된다** — (화면 방식) 쓰기는 검사 중
   * 검사자가 넣는 값이라 관리자가 나중에 채울 수 없고, 요구하면 그 아이 결과지가 영영 안 나간다. 스캔본 방식은
   * 담당자가 나중에 채우지만 받기 기준은 같다 — 대신 받을 때 「쓰기 채점 전」을 알린다(`awaitsScanWriting`).
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
  /** 과제별 판정(`scoreSession`의 `verdict` 그대로). scored일 때만 채워진다. **`complete[k]`가 false인 과제의
   *  값은 0점 기반이라 쓰면 안 된다** — 화면은 채점된 과제의 기준 미달만 표시한다(사용자 확정 2026-10-08,
   *  담당자 회신 아님: 같은 정보가 결과보고서 PDF에는 과제별 PASS/FAIL로 이미 나간다). */
  taskVerdict: Record<TaskKey, Verdict> | null
  /** 쓰기 방식(migration 006) — scan이면 담당자가 스캔본으로 쓰기를 채점한다 */
  writingMode: 'screen' | 'scan'
  /** 쓰기 상태(lib/scan-mapping) — 스캔 대기·올림·채점됨 등. 올리기 확인 화면과 상태 배지가 쓴다 */
  scanState: ScanTargetState
}

/**
 * 화면에 보이는 상태 — `status`(받을 수 있나)와 따로 둔다. 사용자 확정(2026-09-30, 담당자 시안 공유):
 * 스캔본 방식은 **스캔 대기 → 채점 중 → 채점 완료**로 바뀌고, 채점 완료는 세 과제가 다 채점된 때다.
 * 화면 방식은 종전 그대로다(A안 — 쓰기가 비어도 읽기 채점이 끝나면 채점 완료).
 * 받기는 두 방식 모두 A안 그대로 `status === 'scored'`면 된다 — 스캔 대기인 아이도 읽기 채점이 끝났으면
 * 결과지를 받을 수 있다(쓰기·최종결과 칸이 빈 채로. 받을 때 경고가 알린다).
 */
export type SessionLabel = SessionStatus | 'scanWait' | 'replaced'

/**
 * @param scanTargetId 그 아이의 스캔본이 붙을 검사(`scanTargetSession`)의 id. 주면 스캔 대기인데 대상이 아닌
 *   검사를 「재검사로 대체」(`replaced`)로 가른다 — 더 최근에 제출된 재검사가 있어 이 검사에는 스캔본을 올릴 수
 *   없다(QR에 차수가 없어 올리면 최근 검사로 간다). 「스캔 대기」로 두면 선생님이 올릴 곳을 찾아 헤맨다.
 */
export function sessionLabel(s: ResultsSession, scanTargetId?: string): SessionLabel {
  if (s.status === 'unsubmitted') return 'unsubmitted'
  // 선생님이 할 일(스캔본 올리기)이 남았다는 것이 가장 먼저다 — 읽기 채점 여부와 무관하게
  if (s.scanState === 'wait') return scanTargetId !== undefined && s.id !== scanTargetId ? 'replaced' : 'scanWait'
  if (s.status === 'scoring') return 'scoring'
  return awaitsScanWriting(s) ? 'scoring' : 'scored'
}

/** 스캔본 방식인데 쓰기가 아직 다 채점되지 않았다 — 담당자가 채울 것이라 「나중에 다시 받을」 결과지다.
 *  화면 방식의 빈 쓰기(A안)는 여기 들지 않는다: 그 칸은 나중에 채워지지 않는다. */
export function awaitsScanWriting(s: ResultsSession): boolean {
  return s.writingMode === 'scan' && s.complete?.writing !== true
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

/**
 * 그 아이의 스캔본이 붙을 검사 — **가장 최근에 제출된 검사**, 없으면 가장 최근 검사.
 * 기록지 QR에는 반과 번호만 있어 몇 차 검사인지 모른다. 재검사를 시작했다가 그만둔(제출 전) 검사가
 * 앞 차수의 스캔 대기를 가리면 선생님이 올릴 곳이 사라진다. 시작 화면의 「스캔 대기 N명」
 * (lib/db rosterWithTested)도 같은 규칙이다.
 */
export function scanTargetSession(c: ResultsChild): ResultsSession | null {
  for (let i = c.sessions.length - 1; i >= 0; i--) if (c.sessions[i].submittedAt) return c.sessions[i]
  return latestSession(c)
}

/** 올리기 확인 화면의 대상 — 아이마다 스캔본이 붙을 검사 하나. 검사가 없는 아이(미실시)는 없다. */
export function scanTargets(children: ResultsChild[]): ScanTarget[] {
  const out: ScanTarget[] = []
  for (const c of children) {
    const t = scanTargetSession(c)
    if (t) out.push({
      childNo: c.childNo, name: c.name, sessionId: t.id, state: t.scanState,
      retest: c.sessions.length > 1, testedAt: t.startedAt,
    })
  }
  return out.sort((a, b) => a.childNo - b.childNo)
}

export interface ResultsSummary {
  /** 세션이 하나라도 있는 아이 */
  tested: number
  /** 이 네 칸은 서로 겹치지 않는다 — 아이 하나는 한 칸에만 센다(합이 검사 인원과 맞아야 한다) */
  scored: number; scoring: number; scanWait: number; unsubmitted: number
  /** 채점 완료 중 Fail(최신 세션 판정) */
  fail: number
  /** 명단에만 있는 아이 */
  untested: number
  /** **받을 수 있는 결과지가 있는 아이** 수 = [전체 PDF 다운로드]가 세는 것. 스캔본 방식은 쓰기 채점 전이어도
   *  읽기 채점이 끝나면 받을 수 있어(A안) 「채점 완료」보다 클 수 있다 */
  downloadable: number
}

export function summarize(children: ResultsChild[]): ResultsSummary {
  const s: ResultsSummary = { tested: 0, scored: 0, scoring: 0, scanWait: 0, unsubmitted: 0, fail: 0, untested: 0, downloadable: 0 }
  for (const c of children) {
    const l = latestSession(c)
    if (!l) { s.untested++; continue }
    s.tested++
    const d = latestScored(c)
    if (d) s.downloadable++
    // 스캔본을 기다리는 아이는 채점이 끝난 앞 차수가 있어도 「스캔 대기」다 — 선생님이 할 일이 남았다
    // (시작 화면 배너의 수와 같아야 한다).
    if (scanTargetSession(c)?.scanState === 'wait') { s.scanWait++; continue }
    // 받을 수 있는 결과지가 있으면 그 검사 기준 — 최신 세션이 중단된 재검사여도 채점이 끝난 앞 차수가
    // 있으면 그 아이는 결과지를 받을 수 있다. 다만 스캔본 쓰기가 남았으면 아직 「채점 중」이다.
    if (d) {
      if (sessionLabel(d, scanTargetSession(c)?.id) === 'scored') { s.scored++; if (l.verdict === 'fail') s.fail++ }
      else s.scoring++
    }
    else if (l.status === 'scoring') s.scoring++
    else s.unsubmitted++
  }
  return s
}

