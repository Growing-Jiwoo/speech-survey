import { describe, it, expect, vi, beforeEach } from 'vitest'

// 계약 테스트 — 관리자 결과지의 캐시 보정(lib/sheet-cache patchDetail)이 **서버가 실제로 저장한 모양**과 같은지.
// sheet-cache.test.ts는 서버 규칙을 손으로 옮긴 기대값만 본다 — 서버 저장 규칙(saveScores·saveWriting·라우트의
// 소유 코드)이 바뀌어도 양쪽 테스트가 모두 초록으로 남는다(tests/README 「계약 테스트」와 같은 함정).
// 그래서 여기서는 채점 라우트와 lib/db 저장 함수를 **그대로** 돌리고, 저장소만 메모리 표로 바꾼 뒤
// 남은 행을 patchDetail의 결과와 대조한다. 다르면 다시 연 결과지가 옛 값으로 초기화돼 자동 저장이 채점을 덮는다.

type Row = Record<string, unknown>
const tables = new Map<string, Row[]>()

/** 저장 함수가 쓰는 만큼만 흉내 낸다 — upsert(onConflict) · delete().eq().in().not('in') */
function fakeFrom(table: string) {
  let op: { kind: 'upsert'; rows: Row[]; keys: string[] } | { kind: 'delete' } | null = null
  const filters: ((r: Row) => boolean)[] = []
  const run = () => {
    const cur = tables.get(table) ?? []
    if (op?.kind === 'upsert') {
      const { rows, keys } = op
      const same = (a: Row, b: Row) => keys.every(k => a[k] === b[k])
      tables.set(table, [...cur.filter(r => !rows.some(n => same(r, n))), ...rows])
    } else if (op?.kind === 'delete') {
      tables.set(table, cur.filter(r => !filters.every(f => f(r))))
    }
    return { data: null, error: null }
  }
  const q = {
    upsert(rows: Row[], o: { onConflict: string }) { op = { kind: 'upsert', rows, keys: o.onConflict.split(',') }; return q },
    delete() { op = { kind: 'delete' }; return q },
    eq(c: string, v: unknown) { filters.push(r => r[c] === v); return q },
    in(c: string, vs: unknown[]) { filters.push(r => vs.includes(r[c])); return q },
    not(c: string, operator: string, v: string) {
      if (operator !== 'in') throw new Error(`흉내 내지 않은 연산: not ${operator}`)
      const list = v.replace(/^\(|\)$/g, '').split(',')
      filters.push(r => !list.includes(String(r[c])))
      return q
    },
    then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
      try { resolve(run()) } catch (e) { reject(e) }
    },
  }
  return q
}

vi.mock('@/lib/supabase', () => ({ sb: () => ({ from: fakeFrom }) }))
vi.mock('@/lib/db', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  sessionState: vi.fn(),
  scanUploadedAt: vi.fn().mockResolvedValue('T'),
}))

import { PUT } from '@/app/api/admin/sessions/[id]/scores/route'
import * as db from '@/lib/db'
import { patchDetail, type SavedScores } from '@/lib/sheet-cache'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const SID = '11111111-1111-4111-8111-111111111111'
const ctx = { params: Promise.resolve({ id: SID }) }

interface Detail {
  marks: { item_code: string; correct: boolean }[]
  sentences: { item_code: string; words: number }[]
  times: { item_code: string; seconds: number }[]
  writing: { item_code: string; can_write: boolean }[]
}

const seed = (d: Detail) => {
  tables.clear()
  const put = (t: string, rows: Row[]) => tables.set(t, rows.map(r => ({ session_id: SID, ...r })))
  put('reading_marks', d.marks); put('sentence_scores', d.sentences); put('sentence_times', d.times); put('writing_answers', d.writing)
}
/** 저장 뒤 표 → 상세 모양(순서 무관 비교용으로 코드순) */
const stored = (): Detail => {
  const rows = (t: string, cols: string[]) => (tables.get(t) ?? [])
    .map(r => Object.fromEntries(cols.map(c => [c, r[c]])))
    .sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)))
  return {
    marks: rows('reading_marks', ['item_code', 'correct']) as Detail['marks'],
    sentences: rows('sentence_scores', ['item_code', 'words']) as Detail['sentences'],
    times: rows('sentence_times', ['item_code', 'seconds']) as Detail['times'],
    writing: rows('writing_answers', ['item_code', 'can_write']) as Detail['writing'],
  }
}
const sorted = (d: Detail): Detail => {
  const by = <T extends { item_code: string }>(xs: T[]) => [...xs].sort((a, b) => a.item_code.localeCompare(b.item_code))
  return { marks: by(d.marks), sentences: by(d.sentences), times: by(d.times), writing: by(d.writing) }
}

/** 화면이 보내는 그대로 저장하고, 서버에 남은 행과 캐시 보정 결과가 같은지 */
async function expectSameAsServer(grade: number, before: Detail, saved: SavedScores) {
  vi.mocked(db.sessionState).mockResolvedValue({ state: 'submitted', grade, writingMode: 'scan' })
  seed(before)
  const body = { ...saved, ...(saved.writing ? { scanUploadedAt: 'T' } : {}) }
  const res = await PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }), ctx)
  expect(res.status).toBe(200)
  const f = itemsFor(formForGrade(grade))
  expect(sorted(patchDetail(before, saved, f))).toEqual(stored())
}

const BEFORE_G1: Detail = {
  marks: [{ item_code: 'rw01', correct: false }, { item_code: 'rw02', correct: true }],
  sentences: [{ item_code: 'rs01', words: 3 }, { item_code: 'rs02', words: 4 }],
  times: [{ item_code: 'rs01', seconds: 5 }, { item_code: 'rs02', seconds: 6 }],
  writing: [{ item_code: 'ww01', can_write: true }, { item_code: 'ww02', can_write: false }],
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(db.scanUploadedAt).mockResolvedValue('T') })

describe('계약 — patchDetail은 채점 라우트가 저장한 모양과 같다', () => {
  it('G1 읽기만: O/X는 보낸 칸만, 문장 어절·시간은 보낸 것이 전부, 쓰기는 그대로', async () => {
    await expectSameAsServer(1, BEFORE_G1, { marks: { rw01: true, rw03: false }, sentences: { rs01: 7 }, times: { rs02: 4.5 } })
  })
  it('G1 쓰기까지: 쓰기 코드 안에서 교체(지운 칸은 사라진다)', async () => {
    await expectSameAsServer(1, BEFORE_G1, {
      marks: {}, sentences: { rs01: 3, rs02: 4 }, times: { rs01: 5, rs02: 6 }, writing: { ww02: 1, ww03: 0 },
    })
  })
  it('G1 쓰기를 모두 지움(연결 해제와 다른 길 — 빈 쓰기를 보냄)', async () => {
    await expectSameAsServer(1, BEFORE_G1, { marks: {}, sentences: {}, times: {}, writing: {} })
  })
  it('G2 쓰기는 문장 표의 sw 코드 — 문장 읽기(rs) 점수와 섞여 있어도 서로 지우지 않는다', async () => {
    const before: Detail = {
      ...BEFORE_G1, writing: [],
      sentences: [{ item_code: 'rs01', words: 3 }, { item_code: 'sw01', words: 1 }, { item_code: 'sw03', words: 2 }],
    }
    await expectSameAsServer(2, before, { marks: {}, sentences: { rs01: 5 }, times: {}, writing: { sw02: 2, sw03: 0 } })
    await expectSameAsServer(2, before, { marks: {}, sentences: {}, times: { rs01: 3.2 } })
  })
})
