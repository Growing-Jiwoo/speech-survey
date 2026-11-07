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
  /** 같은 아동·**같은 학기** 안에서 started_at 오름차순 1부터 — 다른 학기의 검사는 재검사가 아니다(ResultsTerm) */
  attemptNo: number
  startedAt: string
  submittedAt: string | null
  status: SessionStatus
  /** scored일 때만. **채점되지 않은 과제도 0이 들어간다** — 그 0은 「0점을 받았다」가 아니므로
   *  `complete`가 false인 과제의 숫자는 화면에 그대로 찍으면 안 된다(아래 complete 주석).
   *  `sentenceReading`은 점수가 아니라 어절/10초다(만점이 없다 — lib/scoring `CountTaskKey`). */
  scores: Record<TaskKey, number> | null
  /** scored일 때만, 그리고 **세 과제가 모두 채점됐을 때만.** 하나라도 채점 전이면 null —
   *  치르지도 않은 과제의 0점으로 아동을 낙제시키지 않는다(아래 complete 주석). */
  verdict: Verdict | null
  /**
   * 과제별 채점 완료 여부(`scoreSession`의 `complete` 그대로). scored일 때만 채워진다.
   *
   * A안(사용자 확정 2026-09-22, 2026-10-08 재확인 — 담당자에게 따로 묻지 않는다)으로 **쓰기가 채점되지 않아도 scored가 된다** — (화면 방식) 쓰기는 검사 중
   * 검사자가 넣는 값이라 관리자가 나중에 채울 수 없고, 요구하면 그 아이 결과지가 영영 안 나간다. 스캔본 방식은
   * 담당자가 나중에 채우지만 받기 기준은 같다 — 대신 받을 때 「쓰기 채점 전」을 알린다(`awaitsScanWriting`).
   * 그 대가로 `scores.writing`에 0이 들어오는데, **그 0은 「0점을 받았다」가 아니다.**
   * lib/scoring.ts의 `complete` 주석이 경계하는 그대로다 — "아직 채점 전인 과제까지 0점 위험으로
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
   *  담당자 회신 아님: 같은 정보가 결과보고서 PDF에는 과제별 양호·주의·위험으로 이미 나간다). */
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
export type SessionLabel = SessionStatus | 'scanWait' | 'replaced' | 'laterTerm'

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
  /** 명단에 있는 아이 — 교사 결과지가 [명단에서 빼기]를 낸다. 명단 밖(직접 입력·명단 없는 학급)이면 false */
  inRoster: boolean
  /** **한 학기의** 검사, started_at 오름차순. 비어 있으면 그 학기에 검사하지 않은 아이(명단에만 있음) */
  sessions: ResultsSession[]
}

/** 명단에서 뺀 아이(migration 009) — 결과지 표·요약·[전체 PDF]에 들지 않고 「명단에서 뺀 학생」 칸에만 보인다.
 *  학기와 무관하게 한 번만 내려온다(어느 학기의 표에도 들지 않는다).
 *  검사 기록은 남아 있다(`tests`) — 그 결과지를 받으려면 되살린다(개발 판단 2026-11-05, 바꿀 수 있음). */
export interface RemovedChild {
  childNo: number
  name: string
  gender: string
  /** 이 학급에 남아 있는 이 번호의 검사 수(모든 학기 합) */
  tests: number
}

/**
 * 교사 결과지의 학기 한 칸 — 표·요약·받기·스캔본 올리기가 모두 고른 학기 안에서 돈다(lib/results termGroups).
 * 사용자 확정(2026-11-05) — 담당자 회신 아님. 학급 코드는 만료가 없어 같은 반이 1학기 코드로 2학기에도 검사하는데, 학기를
 * 섞으면 2학기 검사가 1학기 검사의 「2차 재검사」로 그려졌다.
 */
export interface ResultsTerm {
  /** `2026-2`(lib/format termKey) */
  key: string
  /** `2026학년도 2학기` */
  label: string
  /** 지금 학기 — 처음 보일 학기를 가른다(`defaultTerm`). 스캔본은 학기와 무관하게 가장 최근 제출 검사에 붙는다(`scanTargetsAcross`) */
  current: boolean
  /** 그 학기 검사에 임시 판정 기준이 있는지(검사가 없으면 지금 시작할 양식 기준) */
  provisional: boolean
  children: ResultsChild[]
}

type TermLike = Pick<ResultsTerm, 'current' | 'children'>
const hasSessions = (t: TermLike) => t.children.some(c => c.sessions.length > 0)

/**
 * 처음 보일 학기 — 지금 학기에 검사가 있으면 지금 학기, 없으면 검사가 있는 가장 최근 학기(3월 초에 지난 학년도 결과지를 받으러
 * 온 선생님이 빈 표를 먼저 보지 않게), 아무 검사도 없으면 지금 학기. `terms`는 최근 학기 먼저(termGroups 순서).
 * 시작 화면의 결과지 요청(app/api/results/request)도 이 학기로 「받을 수 있는 결과지 수」를 센다 — 화면이 처음 보이는 수와 같아야 한다.
 */
export function defaultTerm<T extends TermLike>(terms: T[]): T | null {
  const cur = terms.find(t => t.current) ?? null
  if (cur && hasSessions(cur)) return cur
  return terms.find(hasSessions) ?? cur ?? terms[0] ?? null
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
 * 화면의 행·판정·정렬·요약 칸은 이것이 아니라 **대표 검사**(`representativeSession`)를 본다 — 제출돼 채점
 * 중인 재검사가 있으면 그것이 대표라, 받을 수 있는 앞 차수가 있어도 판정 없이 「채점 중」이다.
 */
export function latestScored(c: ResultsChild): ResultsSession | null {
  for (let i = c.sessions.length - 1; i >= 0; i--) if (c.sessions[i].status === 'scored') return c.sessions[i]
  return null
}

/**
 * 그 아이의 **대표 검사** — 가장 최근에 **제출된** 검사, 제출된 것이 없으면 가장 최근 검사.
 * 접힌 행·판정(`childVerdict`)·정렬(lib/results buildChildren)·요약 칸(`summarize`)이 모두 이것을 본다(2026-10-12 점검).
 * - 중단된(제출 전) 재검사는 대표가 아니다. 종전에는 최신 세션을 그려, 1차 FAIL(채점 완료)에 2차를 중단한
 *   아이가 표에서는 「미제출」·판정 「-」로 Fail 위로 올라가지 않는데 요약은 「채점 완료」로 세고 받는
 *   결과지에는 1차 FAIL이 실렸다 — 같은 아이를 화면 곳곳이 다르게 말했다.
 * - 제출된 재검사는 채점 중이어도 대표다 — 앞 차수의 판정을 지금 판정처럼 보이지 않는다.
 * 스캔본이 붙을 검사도 같은 규칙이다(`scanTargetSession`) — 기록지 QR에는 반과 번호만 있어 몇 차 검사인지
 * 모르고, 그만둔 재검사가 앞 차수의 스캔 대기를 가리면 선생님이 올릴 곳이 사라진다. 시작 화면의
 * 「스캔 대기 N명」(lib/db rosterWithTested)도 같은 규칙이다.
 */
export function representativeSession(c: ResultsChild): ResultsSession | null {
  for (let i = c.sessions.length - 1; i >= 0; i--) if (c.sessions[i].submittedAt) return c.sessions[i]
  return latestSession(c)
}

/** 스캔본이 붙을 검사 = 대표 검사. 이름만 호출부의 뜻대로 둘 뿐 규칙은 하나다 — 갈라지면 대표 검사가
 *  「재검사로 대체」로 그려지고 요약 칸이 어긋난다(`summarize`가 `sessionLabel(대표, 대표 id)`에 기댄다). */
export const scanTargetSession = representativeSession

/** 접힌 행의 판정 = 대표 검사가 채점 완료(scored)일 때만 그 판정. 정렬(위험 → 주의 먼저)도 이 값을 본다. */
export function childVerdict(c: ResultsChild): Verdict | null {
  const s = representativeSession(c)
  return s?.status === 'scored' ? s.verdict : null
}

/**
 * 학기를 가로질러 아이마다 하나로 모은다 — 스캔본이 붙을 검사는 학기와 무관하게 **그 아이의 가장 최근 제출 검사**다
 * (사용자 확정 2026-11-07 — 담당자 회신 아님: 8월 말 검사의 기록지를 9월에 올릴 수 있어야 한다. QR에는 반과 번호만 있다).
 * 학기마다 나눈 표(lib/results termGroups)를 받아 같은 번호의 검사를 시작 시각 순으로 잇는다. 학기를 넘는 아이는 검사가 둘
 * 이상이라 올리기 확인 창이 재검사처럼 선생님에게 한 번 더 묻는다(`retest`) — 남은 앞 학기 기록지가 섞여도 조용히 붙지 않게.
 */
export function scanTargetsAcross(terms: { children: ResultsChild[] }[]): ScanTarget[] {
  return scanTargets(childrenAcross(terms))
}

function childrenAcross(terms: { children: ResultsChild[] }[]): ResultsChild[] {
  const by = new Map<number, ResultsChild>()
  for (const t of terms) for (const c of t.children) {
    const cur = by.get(c.childNo)
    if (!cur) by.set(c.childNo, { ...c, sessions: [...c.sessions] })
    else cur.sessions.push(...c.sessions)
  }
  for (const c of by.values()) c.sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  return [...by.values()]
}

/** 학기를 가로지른 스캔 대상 검사 id(번호 → id) — 학기 표의 「다음 학기 검사로 대체」를 가른다(`termSessionLabel`) */
export function scanTargetIdsAcross(terms: { children: ResultsChild[] }[]): Map<number, string> {
  return new Map(scanTargetsAcross(terms).map(t => [t.childNo, t.sessionId]))
}

/** 학기 표의 화면 상태 — `sessionLabel`에 더해, 스캔 대기인데 기록지가 **다음 학기 검사**로 가는 검사는 「다음 학기 검사로 대체」.
 *  그 아이의 학기 안 대표 검사(`termTargetId`)라도 더 뒤 학기에 제출된 검사가 있으면 거기에 붙는다(`scanTargetsAcross`). */
export function termSessionLabel(s: ResultsSession, termTargetId: string | undefined, acrossTargetId: string | undefined): SessionLabel {
  const label = sessionLabel(s, termTargetId)
  return label === 'scanWait' && acrossTargetId !== undefined && acrossTargetId !== s.id ? 'laterTerm' : label
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
  /** 이 네 칸은 서로 겹치지 않는다 — 아이 하나는 한 칸에만 센다(합이 검사 인원과 맞아야 한다).
   *  칸은 **대표 검사의 화면 상태**(접힌 행의 상태 배지와 같은 값)다 */
  scored: number; scoring: number; scanWait: number; unsubmitted: number
  /** 채점 완료 중 위험·주의(대표 검사 판정 — 접힌 행의 판정과 같다) */
  risk: number; caution: number
  /** 명단에만 있는 아이 */
  untested: number
  /** **받을 수 있는 결과지가 있는 아이** 수 = [전체 PDF 다운로드]가 세는 것(`latestScored`). 스캔본 방식은 쓰기
   *  채점 전이어도 읽기 채점이 끝나면 받을 수 있고(A안), 제출된 재검사가 채점 중이어도 앞 차수를 받을 수 있어
   *  「채점 완료」보다 클 수 있다 */
  downloadable: number
}

export function summarize(children: ResultsChild[]): ResultsSummary {
  const s: ResultsSummary = { tested: 0, scored: 0, scoring: 0, scanWait: 0, unsubmitted: 0, risk: 0, caution: 0, untested: 0, downloadable: 0 }
  for (const c of children) {
    const rep = representativeSession(c)
    if (!rep) { s.untested++; continue }
    s.tested++
    if (latestScored(c)) s.downloadable++
    // 칸은 대표 검사의 화면 상태 하나로 정한다 — 접힌 행이 그리는 배지와 같은 값이어야 요약 숫자와 표가 맞는다
    // (종전에는 요약이 받을 수 있는 앞 차수를, 표가 최신 세션을 봐 「채점 완료 6」 옆 배지가 5개였다, 2026-10-12 점검).
    // 스캔 대기가 앞서는 것은 sessionLabel이 정한다 — 선생님이 할 일이 남았다(시작 화면 배너의 수와 같다).
    const label = sessionLabel(rep, rep.id)
    if (label === 'scored') { s.scored++; if (rep.verdict === 'risk') s.risk++; if (rep.verdict === 'caution') s.caution++ }
    else if (label === 'scoring') s.scoring++
    else if (label === 'scanWait') s.scanWait++
    else s.unsubmitted++   // 대표 검사는 스캔 대상 자신이라 「재검사로 대체」가 되지 않는다 — 남는 것은 미제출뿐
  }
  return s
}

