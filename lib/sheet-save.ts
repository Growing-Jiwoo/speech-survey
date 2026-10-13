// lib/sheet-save.ts — 관리자 결과지의 채점 저장(PUT …/scores)과 판 충돌 병합. 순수 로직 + fetch 한 겹 —
// 화면(ResultSheet)이 부르고 node 테스트가 본다(전송은 주입한다).
//
// 왜(2026-10-12 점검 X8): 결과지는 화면이 들고 있는 채점을 통째로 보낸다(문장 어절·읽은 시간·스캔본 쓰기는 「보낸 것이
// 전부」라 안 보낸 칸은 지워진다). 오래 열어 둔 탭이 그사이 다른 탭이 저장한 칸을 모른 채 저장하면 그 칸이 지워지거나
// (3·4번 문장 어절·시간) 되돌려졌다(다른 탭이 X로 바꾼 「어디」를 O로). 결과지 401 띠의 [다시 로그인]이 새 탭에 같은
// 결과지를 열어, 안내를 따르기만 해도 생겼다.
// 저장 의미는 그대로 두고 낙관적 동시성으로 막는다 — 화면이 본 판(baseVersion, lib/score-version)을 함께 보내고, 그사이
// 바뀌었으면 라우트가 저장하지 않고 409와 지금 행을 준다. 그러면 **이 화면에서 바꾼 칸만**(마지막으로 받은·저장한 값과
// 다른 칸) 지금 서버 값 위에 얹어 새 판으로 **한 번** 다시 보낸다. 같은 칸을 양쪽이 바꿨으면 이 화면(나중 저장)이 이긴다.
// 자동 저장·[채점 저장]·「저장하고 이동」(lib/sheet-leave)·떠날 때 저장(keepalive)이 모두 이 함수를 거친다.
import type { ScoreRows } from './score-version'
import { NETWORK_ERR_MSG } from './http'
import { parseReadSec } from './scoring'

export type { ScoreRows }

/** 문항 코드 → 값. 아직 채점하지 않은 칸은 키가 없다 */
export type Cells<V> = Partial<Record<string, V>>

/** 결과지의 채점 상태 네 갈래 — 화면 값·저장한 값·서버 값이 모두 이 모양이다(잠긴 미녹음 칸은 뺀다) */
export interface SheetScores {
  marks: Cells<boolean>
  sentences: Cells<number>
  times: Cells<number>
  /** 쓰기 — 스캔본 방식 검사에서만 이 화면의 채점 상태다(화면 방식은 검사 중 기록이라 보내지 않는다) */
  writing: Cells<number>
}

/** 같은 칸·같은 값인지 — **키 순서와 무관하게.** 병합한 객체는 키 순서가 달라져, JSON 문자열로 비교하면 같은 채점도
 *  「저장 안 한 채점」으로 보여 쓸데없는 자동 저장이 한 번 더 돈다. */
export function sameCells<V>(a: Cells<V>, b: Cells<V>): boolean {
  const ka = Object.keys(a).filter(k => a[k] !== undefined)
  const kb = Object.keys(b).filter(k => b[k] !== undefined)
  return ka.length === kb.length && ka.every(k => a[k] === b[k])
}

/** 3방향 병합 — base(마지막으로 받은·저장한 값)에서 mine이 바꾼 칸(지운 칸 포함)은 mine, 손대지 않은 칸은 theirs. */
export function mergeCells<V>(base: Cells<V>, mine: Cells<V>, theirs: Cells<V>): Cells<V> {
  const out: Cells<V> = {}
  for (const k of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const v = mine[k] !== base[k] ? mine[k] : theirs[k]
    if (v !== undefined) out[k] = v
  }
  return out
}

export function mergeScores(base: SheetScores, mine: SheetScores, theirs: SheetScores): SheetScores {
  return {
    marks: mergeCells(base.marks, mine.marks, theirs.marks),
    sentences: mergeCells(base.sentences, mine.sentences, theirs.sentences),
    times: mergeCells(base.times, mine.times, theirs.times),
    writing: mergeCells(base.writing, mine.writing, theirs.writing),
  }
}

/** 채점 PUT 본문 — 라우트 주석(app/api/admin/sessions/[id]/scores) 참고 */
export interface SaveBody {
  marks: Cells<boolean>
  sentences: Cells<number>
  times: Cells<number>
  writing?: Cells<number>
  scanUploadedAt?: string | null
  baseVersion?: string
}

export type SendResult =
  | { ok: true; version: string | null }
  | {
      ok: false; status: number; error: string
      /** 409의 갈래 — scores: 판 충돌(지금 판·행이 함께 온다), scan: 그사이 스캔본이 바뀜 */
      conflict?: 'scores' | 'scan'
      version?: string
      rows?: ScoreRows
    }

const SAVE_FAILED = '채점을 저장하지 못했어요. 다시 시도해 주세요.'

/** 병합해 다시 보낸 것까지 또 충돌했다(셋째 화면이 그사이 또 저장) — 더 돌지 않는다. 다음 저장이 같은 길로 다시 맞춘다. */
export const SAVE_RACE_MSG = '다른 화면에서도 지금 채점을 저장하고 있어요. 잠시 뒤 [채점 저장]을 다시 눌러 주세요.'

/** 판 충돌을 병합해 저장했을 때 화면에 남기는 한 줄 */
export const MERGED_NOTICE = '다른 화면에서 저장한 채점을 함께 반영했어요.'

/** PUT …/scores. 던지지 않는다(연결 끊김은 status 0). `keepalive`면 화면을 떠나도 요청이 끝까지 간다 —
 *  응답은 앱 안에서 화면만 옮긴 경우에만 받는다. */
export async function putScores(sessionId: string, body: SaveBody, opts: { keepalive?: boolean } = {}): Promise<SendResult> {
  try {
    const res = await fetch(`/api/admin/sessions/${sessionId}/scores`, {
      method: 'PUT', ...(opts.keepalive ? { keepalive: true } : {}),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string; version?: unknown; conflict?: unknown; rows?: ScoreRows
    }
    if (res.ok) return { ok: true, version: typeof data.version === 'string' ? data.version : null }
    return {
      ok: false, status: res.status, error: data.error ?? SAVE_FAILED,
      ...(data.conflict === 'scores' || data.conflict === 'scan' ? { conflict: data.conflict } : {}),
      ...(typeof data.version === 'string' ? { version: data.version } : {}),
      ...(data.rows ? { rows: data.rows } : {}),
    }
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERR_MSG }
  }
}

export type SaveOutcome =
  | {
      ok: true
      /** 이제 서버에 저장된 값(잠긴 칸 제외) — 화면의 「저장한 값」이 된다 */
      saved: SheetScores
      /** 저장 뒤 판. 서버가 못 만들었으면 null — 갖고 있던 판을 그대로 쓴다(다음 저장이 한 번 충돌을 거쳐 맞춰진다) */
      version: string | null
      /** 쓰기를 보냈는지 — 캐시를 고칠 범위·목록 진행 표시를 다시 받을지 */
      wroteWriting: boolean
      /** 판 충돌로 병합해 다시 보냈으면 그때 받은 서버 행 — 캐시를 이 행 위에서 고친다(상세를 다시 받지 않는다) */
      merged: ScoreRows | null
      /** 병합으로 다른 화면의 값이 이 화면에 실제로 들어왔는지 — 그때만 화면에 알린다. 판만 낡았던 경우(같은 탭의 연결
       *  해제 뒤 등)는 들어온 값이 없다 */
      pulled: boolean
    }
  | {
      ok: false; status: number; error: string
      /** 쓰기를 보냈는데 그사이 스캔본이 바뀌었다(409 scan) — 화면은 저장 전 쓰기를 버리고 상세를 다시 받는다 */
      scanStale: boolean
    }

/**
 * 채점 저장 — 판 충돌(409 scores)이면 이 화면에서 바꾼 칸만 지금 서버 값 위에 얹어 **한 번** 다시 보낸다.
 *
 * 쓰기는 `withWriting`(스캔본 방식, 연결 해제 중 아님)이고 **바뀌었을 때만** 싣는다 — 화면 방식 검사에 실으면 라우트가 409로
 * 거부하고(쓰기 소유권), 안 바뀐 쓰기를 읽기 저장마다 보내면 연결 해제와 겹쳤을 때 지운 채점을 되살린다. 실을 때는 본
 * 스캔본의 올린 시각을 함께 보낸다(그사이 선생님이 바꿨으면 409 scan).
 */
export async function saveScoresMerging(a: {
  /** 마지막으로 받은·저장한 서버 값 */
  base: SheetScores
  /** 지금 화면 값 */
  mine: SheetScores
  /** base의 판 — 없으면(판을 주지 않는 서버) 대조 없이 종전대로 저장한다 */
  version: string | null
  withWriting: boolean
  scanUploadedAt: string | null
  /** 서버 행 → 채점 상태(화면이 처음 채울 때와 같은 규칙 — 잠긴 칸을 뺀다) */
  fromRows: (rows: ScoreRows) => SheetScores
  send: (body: SaveBody) => Promise<SendResult>
}): Promise<SaveOutcome> {
  const attempt = async (base: SheetScores, mine: SheetScores, version: string | null) => {
    const writing = a.withWriting && !sameCells(mine.writing, base.writing)
    const res = await a.send({
      marks: mine.marks, sentences: mine.sentences, times: mine.times,
      ...(writing ? { writing: mine.writing, scanUploadedAt: a.scanUploadedAt } : {}),
      ...(version !== null ? { baseVersion: version } : {}),
    })
    // 보내지 않은 쓰기는 서버에 base 그대로 남아 있다
    return { res, writing, saved: { ...mine, writing: writing ? mine.writing : base.writing } }
  }
  const failed = (r: Extract<SendResult, { ok: false }>, writing: boolean, error = r.error): SaveOutcome => ({
    ok: false, status: r.status, error, scanStale: r.status === 409 && writing && r.conflict !== 'scores',
  })

  const first = await attempt(a.base, a.mine, a.version)
  if (first.res.ok)
    return { ok: true, saved: first.saved, version: first.res.version, wroteWriting: first.writing, merged: null, pulled: false }
  const r1 = first.res
  if (r1.conflict !== 'scores' || !r1.rows || r1.version === undefined) return failed(r1, first.writing)

  // 그사이 다른 화면이 저장했다 — 지금 서버 값(theirs)을 새 base로, 내가 바꾼 칸만 그 위에 얹는다
  const theirs = a.fromRows(r1.rows)
  const merged = mergeScores(a.base, a.mine, theirs)
  const second = await attempt(theirs, merged, r1.version)
  if (second.res.ok) {
    // 병합 결과가 이 화면 값과 다르면 = 내가 손대지 않은 칸에 다른 화면 값이 들어왔다(쓰기는 다룰 때만 본다)
    const pulled = !sameCells(merged.marks, a.mine.marks) || !sameCells(merged.sentences, a.mine.sentences)
      || !sameCells(merged.times, a.mine.times) || (a.withWriting && !sameCells(merged.writing, a.mine.writing))
    return { ok: true, saved: second.saved, version: second.res.version, wroteWriting: second.writing, merged: r1.rows, pulled }
  }
  const r2 = second.res
  return failed(r2, second.writing, r2.conflict === 'scores' ? SAVE_RACE_MSG : r2.error)
}

/**
 * 읽은 시간 칸의 글자를 화면 값에 맞춘다 — 칸이 친 글자를 따로 들고 있어서(SentenceRows), 병합으로 다른 화면의 시간이
 * 들어오면 그 칸의 글자를 새 값으로 바꿔야 보이는 것과 저장할 값이 갈리지 않는다. 친 글자가 지금 값과 같으면(「4.」 = 4,
 * 잘못 친 글자 = 값 없음) 건드리지 않는다 — 치는 중인 글자를 지우지 않게. 바뀐 칸이 없으면 같은 객체를 돌려준다.
 */
export function syncSecondsTexts(texts: Cells<string>, times: Cells<number>, max: number): Cells<string> {
  let out: Cells<string> | null = null
  for (const code of new Set([...Object.keys(texts), ...Object.keys(times)])) {
    const value = times[code]
    if ((parseReadSec(texts[code] ?? '', max) ?? undefined) === value) continue
    out ??= { ...texts }
    out[code] = value === undefined ? '' : String(value)
  }
  return out ?? texts
}
