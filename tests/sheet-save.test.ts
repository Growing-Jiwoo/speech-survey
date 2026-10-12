import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MERGED_NOTICE, SAVE_RACE_MSG, mergeCells, mergeScores, putScores, sameCells, saveScoresMerging, syncSecondsTexts,
  type SaveBody, type ScoreRows, type SendResult, type SheetScores,
} from '@/lib/sheet-save'
import { NETWORK_ERR_MSG } from '@/lib/http'

// 관리자 결과지 저장의 판 충돌 병합(2026-10-12 점검 X8). 서버 저장 의미(보낸 것이 전부)는 그대로 두고, 그사이 다른 화면이
// 저장했으면 **이 화면에서 바꾼 칸만** 지금 서버 값 위에 얹어 한 번 다시 보낸다. 실제 라우트·저장 함수로 끝까지 도는
// 재현은 sheet-cache-contract.test.ts에 있다 — 여기는 규칙 자체(전송은 가짜).

const S = (over: Partial<SheetScores> = {}): SheetScores => ({ marks: {}, sentences: {}, times: {}, writing: {}, ...over })

/** 서버 행 → 채점 상태(화면의 fromRows 흉내 — 잠긴 칸 없음, 쓰기는 낱말 쓰기 0/1) */
const fromRows = (r: ScoreRows): SheetScores => ({
  marks: Object.fromEntries(r.marks.map(m => [m.item_code, m.correct])),
  sentences: Object.fromEntries(r.sentences.map(s => [s.item_code, s.words])),
  times: Object.fromEntries(r.times.map(t => [t.item_code, Number(t.seconds)])),
  writing: Object.fromEntries(r.writing.map(w => [w.item_code, w.can_write ? 1 : 0])),
})

/** 보낸 본문을 쌓고 미리 정한 응답을 차례로 돌려주는 전송 */
function fakeSend(...results: SendResult[]) {
  const bodies: SaveBody[] = []
  const send = vi.fn(async (b: SaveBody) => { bodies.push(b); return results.shift()! })
  return { bodies, send }
}

const conflict = (version: string, rows: ScoreRows): SendResult =>
  ({ ok: false, status: 409, error: '그사이 다른 화면에서 채점이 저장됐어요.', conflict: 'scores', version, rows })

describe('sameCells · mergeCells', () => {
  it('sameCells는 키 순서와 무관하다 — 병합한 객체는 키 순서가 달라도 같은 채점이다', () => {
    expect(sameCells({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(sameCells({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameCells({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(sameCells<boolean>({ a: true }, { a: false })).toBe(false)
  })

  it('내가 바꾼 칸(지운 칸 포함)은 내 값, 손대지 않은 칸은 서버 값(추가·변경·삭제 모두)', () => {
    const base = { a: 1, b: 2, c: 3, d: 4 }
    const mine = { a: 9, c: 3, d: 4 }                 // a 고침, b 지움
    const theirs = { a: 1, b: 2, c: 7, e: 5 }         // c 고침, d 지움, e 추가
    expect(mergeCells(base, mine, theirs)).toEqual({ a: 9, c: 7, e: 5 })
  })

  it('mergeScores는 네 갈래를 따로 병합한다', () => {
    const m = mergeScores(S({ marks: { rw01: true } }), S({ marks: { rw01: false } }), S({ marks: { rw01: true, rw02: true }, times: { rs01: 4 } }))
    expect(m).toEqual(S({ marks: { rw01: false, rw02: true }, times: { rs01: 4 } }))
  })
})

describe('saveScoresMerging', () => {
  const base = S({ marks: { rw01: false }, sentences: { rs01: 3, rs02: 4 }, times: { rs01: 5, rs02: 6 } })

  it('충돌이 없으면 한 번 보낸다 — 판을 싣고, 고치지 않은 쓰기는 싣지 않는다', async () => {
    const mine = { ...base, marks: { rw01: true } }
    const { bodies, send } = fakeSend({ ok: true, version: 'v2' })
    const r = await saveScoresMerging({ base, mine, version: 'v1', withWriting: true, scanUploadedAt: 'T', fromRows, send })
    expect(bodies).toEqual([{ marks: { rw01: true }, sentences: base.sentences, times: base.times, baseVersion: 'v1' }])
    expect(r).toEqual({ ok: true, saved: mine, version: 'v2', wroteWriting: false, merged: null, pulled: false })
  })

  it('[REGRESSION] 1·2번만 가진 낡은 화면이 저장해도 다른 화면이 저장한 3·4번 어절·시간이 남는다', async () => {
    // 탭 A: 1·2번 문장만 채점된 결과지를 열어 둠 → 탭 B가 3·4번 저장 → 탭 A에서 O 하나
    const serverNow: ScoreRows = {
      marks: [{ item_code: 'rw01', correct: false }],
      sentences: [1, 2, 3, 4].map(n => ({ item_code: `rs0${n}`, words: n + 2 })),
      times: [1, 2, 3, 4].map(n => ({ item_code: `rs0${n}`, seconds: n + 4 })),
      writing: [],
    }
    const mine = { ...base, marks: { rw01: false, rw05: true } }
    const { bodies, send } = fakeSend(conflict('vB', serverNow), { ok: true, version: 'vC' })
    const r = await saveScoresMerging({ base, mine, version: 'vA', withWriting: false, scanUploadedAt: null, fromRows, send })
    expect(send).toHaveBeenCalledTimes(2)
    expect(bodies[1]).toEqual({
      marks: { rw01: false, rw05: true },
      sentences: { rs01: 3, rs02: 4, rs03: 5, rs04: 6 },
      times: { rs01: 5, rs02: 6, rs03: 7, rs04: 8 },
      baseVersion: 'vB',
    })
    expect(r.ok && r.merged).toEqual(serverNow)
    expect(r.ok && r.pulled).toBe(true)
    expect(r.ok && r.version).toBe('vC')
    expect(r.ok && r.saved.sentences).toEqual({ rs01: 3, rs02: 4, rs03: 5, rs04: 6 })
  })

  it('[REGRESSION] 다른 화면이 X로 저장한 칸을 이 화면이 손대지 않았으면 O로 되돌리지 않는다', async () => {
    const before = S({ marks: { rw01: true, rw03: true } })          // 「어디」(rw03)는 O였다
    const serverNow: ScoreRows = { marks: [{ item_code: 'rw01', correct: true }, { item_code: 'rw03', correct: false }], sentences: [], times: [], writing: [] }
    const mine = S({ marks: { rw01: false, rw03: true } })           // 이 화면은 rw01만 고쳤다
    const { bodies, send } = fakeSend(conflict('vB', serverNow), { ok: true, version: 'vC' })
    await saveScoresMerging({ base: before, mine, version: 'vA', withWriting: false, scanUploadedAt: null, fromRows, send })
    expect(bodies[1].marks).toEqual({ rw01: false, rw03: false })
  })

  it('같은 칸을 양쪽이 바꿨으면 이 화면(나중 저장)이 이긴다 — 내가 지운 칸도 지운 채로 보낸다', async () => {
    const before = S({ sentences: { rs02: 4, rs03: 2 } })
    // 다른 화면: rw01을 X로 새로 찍고, rs02를 6·rs03을 7로 고쳤다
    const serverNow: ScoreRows = {
      marks: [{ item_code: 'rw01', correct: false }],
      sentences: [{ item_code: 'rs02', words: 6 }, { item_code: 'rs03', words: 7 }], times: [], writing: [],
    }
    // 이 화면: rw01을 O로 새로 찍고, rs02를 5로 고치고, rs03을 지웠다
    const mine = S({ marks: { rw01: true }, sentences: { rs02: 5 } })
    const { bodies, send } = fakeSend(conflict('vB', serverNow), { ok: true, version: 'vC' })
    await saveScoresMerging({ base: before, mine, version: 'vA', withWriting: false, scanUploadedAt: null, fromRows, send })
    expect(bodies[1].marks).toEqual({ rw01: true })
    expect(bodies[1].sentences).toEqual({ rs02: 5 })
  })

  it('판만 낡았고 들어온 값이 없으면(같은 탭의 연결 해제 뒤 등) 병합해 저장하되 「다른 화면」이라 알리지 않는다', async () => {
    const rows: ScoreRows = { marks: [{ item_code: 'rw01', correct: false }], sentences: [{ item_code: 'rs01', words: 3 }, { item_code: 'rs02', words: 4 }], times: [{ item_code: 'rs01', seconds: 5 }, { item_code: 'rs02', seconds: 6 }], writing: [] }
    const { send } = fakeSend(conflict('vB', rows), { ok: true, version: 'vC' })
    const r = await saveScoresMerging({ base, mine: { ...base, marks: { rw01: true } }, version: 'vA', withWriting: false, scanUploadedAt: null, fromRows, send })
    expect(r.ok && r.merged).toEqual(rows)
    expect(r.ok && r.pulled).toBe(false)
  })

  it('병합해 다시 보낸 것도 충돌하면 더 돌지 않는다 — 두 번만 보내고 안내 문구를 돌려준다', async () => {
    const rows: ScoreRows = { marks: [], sentences: [], times: [], writing: [] }
    const { send } = fakeSend(conflict('vB', rows), conflict('vC', rows))
    const r = await saveScoresMerging({ base, mine: base, version: 'vA', withWriting: false, scanUploadedAt: null, fromRows, send })
    expect(send).toHaveBeenCalledTimes(2)
    expect(r).toEqual({ ok: false, status: 409, error: SAVE_RACE_MSG, scanStale: false })
  })

  it('판이 없으면(판을 주지 않는 서버) baseVersion 없이 종전대로 보낸다', async () => {
    const { bodies, send } = fakeSend({ ok: true, version: null })
    const r = await saveScoresMerging({ base, mine: base, version: null, withWriting: false, scanUploadedAt: null, fromRows, send })
    expect(bodies[0]).not.toHaveProperty('baseVersion')
    expect(r.ok && r.version).toBeNull()
  })

  it('스캔본 쓰기는 고쳤을 때만 본 스캔본 시각과 싣는다 — 그사이 스캔본이 바뀐 409는 scanStale', async () => {
    const b = S({ writing: { ww01: 1 } })
    const mine = S({ writing: { ww01: 0 } })
    const ok = fakeSend({ ok: true, version: 'v2' })
    const r = await saveScoresMerging({ base: b, mine, version: 'v1', withWriting: true, scanUploadedAt: 'T', fromRows, send: ok.send })
    expect(ok.bodies[0]).toMatchObject({ writing: { ww01: 0 }, scanUploadedAt: 'T' })
    expect(r.ok && r.wroteWriting).toBe(true)

    const stale = fakeSend({ ok: false, status: 409, error: '스캔본이 바뀜', conflict: 'scan' })
    const r2 = await saveScoresMerging({ base: b, mine, version: 'v1', withWriting: true, scanUploadedAt: 'T', fromRows, send: stale.send })
    expect(r2).toEqual({ ok: false, status: 409, error: '스캔본이 바뀜', scanStale: true })
  })

  it('쓰기도 칸 단위로 병합한다 — 다른 화면이 넣은 쓰기 칸은 남기고 내가 바꾼 칸만 얹는다', async () => {
    const serverNow: ScoreRows = { marks: [], sentences: [], times: [], writing: [{ item_code: 'ww01', can_write: true }, { item_code: 'ww02', can_write: true }] }
    const { bodies, send } = fakeSend(conflict('vB', serverNow), { ok: true, version: 'vC' })
    const r = await saveScoresMerging({
      base: S({ writing: { ww01: 1 } }), mine: S({ writing: { ww01: 0 } }), version: 'vA', withWriting: true, scanUploadedAt: 'T', fromRows, send,
    })
    expect(bodies[1]).toMatchObject({ writing: { ww01: 0, ww02: 1 }, scanUploadedAt: 'T' })
    expect(r.ok && r.saved.writing).toEqual({ ww01: 0, ww02: 1 })
  })

  it('쓰기를 다루지 않으면(화면 방식·연결 해제 중) 쓰기를 싣지 않고, 저장한 쓰기는 서버 값 그대로다', async () => {
    const serverNow: ScoreRows = { marks: [], sentences: [], times: [], writing: [{ item_code: 'ww02', can_write: true }] }
    const { bodies, send } = fakeSend(conflict('vB', serverNow), { ok: true, version: 'vC' })
    const r = await saveScoresMerging({
      base: S(), mine: S({ writing: { ww01: 1 } }), version: 'vA', withWriting: false, scanUploadedAt: 'T', fromRows, send,
    })
    for (const body of bodies) expect(body).not.toHaveProperty('writing')
    expect(r.ok && r.saved.writing).toEqual({ ww02: 1 })
    expect(r.ok && r.wroteWriting).toBe(false)
  })

  it('그 밖의 실패(401 등)는 문구를 그대로 돌려준다', async () => {
    const { send } = fakeSend({ ok: false, status: 401, error: '로그인이 끝났어요.' })
    expect(await saveScoresMerging({ base, mine: base, version: 'v', withWriting: false, scanUploadedAt: null, fromRows, send }))
      .toEqual({ ok: false, status: 401, error: '로그인이 끝났어요.', scanStale: false })
  })

  it('안내 문구가 있다', () => { expect(MERGED_NOTICE).toMatch(/다른 화면에서 저장한 채점/) })
})

describe('putScores', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

  it('성공이면 새 판을 돌려준다 — 떠날 때 저장은 keepalive로 보낸다', async () => {
    const f = respond(200, { ok: true, version: 'v2' })
    vi.stubGlobal('fetch', f)
    expect(await putScores('s1', { marks: {}, sentences: {}, times: {} }, { keepalive: true })).toEqual({ ok: true, version: 'v2' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin/sessions/s1/scores')
    expect(init).toMatchObject({ method: 'PUT', keepalive: true })
  })

  it('판 충돌 409는 갈래·지금 판·행을 싣는다', async () => {
    const rows: ScoreRows = { marks: [], sentences: [], times: [], writing: [] }
    vi.stubGlobal('fetch', respond(409, { error: 'e', conflict: 'scores', version: 'vB', rows }))
    expect(await putScores('s1', { marks: {}, sentences: {}, times: {} }))
      .toEqual({ ok: false, status: 409, error: 'e', conflict: 'scores', version: 'vB', rows })
  })

  it('연결이 끊기면 status 0과 연결 문구', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect(await putScores('s1', { marks: {}, sentences: {}, times: {} })).toEqual({ ok: false, status: 0, error: NETWORK_ERR_MSG })
  })
})

describe('syncSecondsTexts — 병합으로 바뀐 시간을 칸의 글자에 맞춘다', () => {
  it('바뀐 칸만 새 값으로, 사라진 칸은 빈 칸으로', () => {
    expect(syncSecondsTexts({ rs01: '5', rs02: '6' }, { rs01: 5, rs03: 7.5 }, 25)).toEqual({ rs01: '5', rs02: '', rs03: '7.5' })
  })
  it('치는 중인 글자는 지우지 않는다 — 「4.」는 4, 잘못 친 글자는 값 없음과 같다', () => {
    const texts = { rs01: '4.', rs02: 'abc' }
    expect(syncSecondsTexts(texts, { rs01: 4 }, 25)).toBe(texts)
  })
})
