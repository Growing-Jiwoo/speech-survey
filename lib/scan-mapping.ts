// lib/scan-mapping.ts — 올린 스캔본의 쪽마다 「누구 기록지인지」를 정하는 순수 로직.
// 교사 결과지의 확인 화면(components/results/ScanUpload)이 쓴다. DB·브라우저를 모른다.
//
// 원칙(사용자 확정 2026-09-30):
// · 쪽마다 QR을 읽어 **자동으로** 짝짓는다 — 순서로 짝짓지 않는다(한 장만 빠져도 뒤가 전부 밀린다).
// · QR을 못 읽은 쪽은 선생님이 쪽 그림에 찍힌 이름을 보고 **직접 고른다.** 화질 경고는 띄우지 않는다.
// · **모든 쪽이 정해져야**(아이 또는 「올리지 않음」) 올릴 수 있다 — 누구 것인지 모르는 쪽은 올라가지 않는다.
// · 한 아이에게는 한 장만 — 두 쪽이 같은 아이를 가리키면 뒤의 쪽은 다시 고르게 한다.
// · 재검사한 아이는 자동으로 붙이지 않는다(사용자 확정 2026-10-01) — QR에는 반과 번호만 있어 몇 차 검사 때 쓴
//   기록지인지 모른다. 앞 차수 기록지가 섞이면 다른 차수 검사에 조용히 붙는다 — 선생님이 확인하고 고른다.
// · 빈 쪽(양면 스캔의 뒷면)은 「올리지 않음」으로 둔다 — 쪽마다 「골라 주세요」가 뜨면 진짜 못 읽은 쪽이 묻힌다.

/** 확인 화면이 아는 아이 한 명의 쓰기 상태 — 그 아이의 스캔본이 붙을 검사(**가장 최근에 제출된 검사**,
 *  없으면 가장 최근 검사 — lib/results-view scanTargetSession) 기준. */
export type ScanTargetState =
  /** 「스캔본으로 올리기」를 골랐고 아직 안 올렸다 — 올릴 대상 */
  | 'wait'
  /** 이미 올렸고 담당자가 아직 채점하지 않았다 — 다시 올리면 바꾼다 */
  | 'uploaded'
  /** 담당자가 쓰기를 채점했다 — 채점과 근거 그림이 어긋나지 않게 바꾸지 않는다 */
  | 'scored'
  /** 화면에서 바로 표시했다 — 스캔본을 받지 않는다 */
  | 'screen'
  /** 제출된 검사가 없다(쓰기 방식이 정해지지 않았다) */
  | 'unsubmitted'

export interface ScanTarget {
  childNo: number; name: string; sessionId: string; state: ScanTargetState
  /** 검사가 둘 이상인 아이(재검사) — 종이만 보고는 몇 차 기록지인지 모르므로 자동으로 붙이지 않는다 */
  retest?: boolean
  /** 스캔본이 붙을 검사의 시작 시각(ISO) — 재검사 확인 문구가 「M월 D일 검사」로 쓴다 */
  testedAt?: string
}

/**
 * 검사 한 건의 쓰기 상태. 서버(명단 배지·결과지)와 확인 화면이 같은 규칙을 쓴다.
 * 「채점됨」은 담당자가 쓰기 칸을 **하나라도** 넣은 것이다 — 그 뒤로는 선생님이 스캔본을 바꾸지 못한다
 * (사용자 확정 2026-09-30: 채점 전까지만 교체). 넣은 점수와 근거 그림이 어긋나지 않게 하려는 것이다.
 */
export function scanTargetState(s: {
  submitted: boolean; mode: 'screen' | 'scan'; hasScan: boolean; hasWriting: boolean
}): ScanTargetState {
  if (!s.submitted) return 'unsubmitted'
  if (s.mode === 'screen') return 'screen'
  if (s.hasWriting) return 'scored'
  return s.hasScan ? 'uploaded' : 'wait'
}

export interface ScanPage {
  /** 올린 파일들을 이어 붙인 순서의 쪽 번호(0부터) */
  index: number
  /** 읽은 QR. 못 읽었으면 null */
  qr: { tag: string; childNo: number } | null
  /** 거의 흰 쪽(lib/scan-pages isBlankPage) — QR을 못 읽은 쪽에만 붙는다 */
  blank?: boolean
}

/** 쪽마다 붙는 안내 — 화면은 이 값으로 문구를 고른다. */
export type PageProblem =
  | 'unreadable'   // QR을 못 읽었다 → 선생님이 고른다
  | 'blank'        // 빈 쪽(양면 스캔의 뒷면 등) → 올리지 않음
  | 'retest'       // 재검사한 아이 — 몇 차 기록지인지 모른다 → 선생님이 확인하고 고른다
  | 'otherClass'   // 다른 반 기록지 → 올리지 않음
  | 'noChild'      // 이 반에 그 번호의 검사 기록이 없다 → 올리지 않음
  | 'screen'       // 그 아이는 화면에서 입력했다 → 올리지 않음
  | 'scored'       // 담당자 채점이 끝났다 → 올리지 않음
  | 'unsubmitted'  // 그 아이의 검사가 아직 제출되지 않았다 → 올리지 않음
  | 'duplicate'    // 앞 쪽이 이미 같은 아이로 정해졌다 → 다시 고른다

export type PageChoice = number | 'skip' | null

export interface PagePlan {
  index: number
  /** QR로 찾은 아이 번호(찾았으면) */
  qrChildNo: number | null
  problem: PageProblem | null
  /** 처음 제안하는 선택 — 선생님이 바꿀 수 있다(바꾸는 스캔본인지는 화면이 대상의 상태 uploaded로 가른다) */
  choice: PageChoice
}

const BLOCKED: Partial<Record<ScanTargetState, PageProblem>> = {
  screen: 'screen', scored: 'scored', unsubmitted: 'unsubmitted',
}

/** 올릴 수 있는 아이인지(드롭다운 후보) */
export const isEligible = (t: ScanTarget) => t.state === 'wait' || t.state === 'uploaded'

export function proposeMapping(pages: ScanPage[], classTag: string, targets: ScanTarget[]): PagePlan[] {
  const byNo = new Map(targets.map(t => [t.childNo, t]))
  const taken = new Set<number>()
  return pages.map(p => {
    const plan = (problem: PageProblem | null, choice: PageChoice, qrChildNo: number | null = p.qr?.childNo ?? null): PagePlan =>
      ({ index: p.index, qrChildNo, problem, choice })
    if (!p.qr) return p.blank ? plan('blank', 'skip', null) : plan('unreadable', null, null)
    if (p.qr.tag !== classTag) return plan('otherClass', 'skip')
    const t = byNo.get(p.qr.childNo)
    if (!t) return plan('noChild', 'skip')
    const blocked = BLOCKED[t.state]
    if (blocked) return plan(blocked, 'skip')
    if (taken.has(t.childNo)) return plan('duplicate', null)
    if (t.retest) return plan('retest', null)
    taken.add(t.childNo)
    return plan(null, t.childNo)
  })
}

export interface MappingStatus {
  /** 모든 쪽이 정해졌고, 같은 아이가 두 번 고른 곳이 없고, 올릴 쪽이 하나 이상 */
  canConfirm: boolean
  /** 아직 고르지 않은 쪽 수 */
  undecided: number
  /** 두 쪽 이상이 같은 아이를 가리키는 아이 번호 */
  conflicts: number[]
  /** 올릴 쪽 수(「올리지 않음」 제외) */
  uploading: number
  /** 스캔 대기인데 이번 파일에 기록지가 없는 아이 */
  missing: ScanTarget[]
}

export function mappingStatus(choices: PageChoice[], targets: ScanTarget[]): MappingStatus {
  const count = new Map<number, number>()
  for (const c of choices) if (typeof c === 'number') count.set(c, (count.get(c) ?? 0) + 1)
  const conflicts = [...count].filter(([, n]) => n > 1).map(([no]) => no).sort((a, b) => a - b)
  const undecided = choices.filter(c => c === null).length
  const uploading = choices.filter(c => typeof c === 'number').length
  const missing = targets.filter(t => t.state === 'wait' && !count.has(t.childNo)).sort((a, b) => a.childNo - b.childNo)
  return { canConfirm: undecided === 0 && conflicts.length === 0 && uploading > 0, undecided, conflicts, uploading, missing }
}

/** 한 쪽의 드롭다운 후보 — 올릴 수 있는 아이 중 **다른 쪽이 이미 고른 아이는 뺀다**(자기 선택은 남긴다). */
export function candidatesFor(pageIndex: number, choices: PageChoice[], targets: ScanTarget[]): ScanTarget[] {
  const others = new Set(choices.filter((c, i) => i !== pageIndex && typeof c === 'number') as number[])
  return targets.filter(t => isEligible(t) && !others.has(t.childNo)).sort((a, b) => a.childNo - b.childNo)
}
