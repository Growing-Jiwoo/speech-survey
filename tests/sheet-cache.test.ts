import { describe, expect, it } from 'vitest'
import { patchDetail } from '@/lib/sheet-cache'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

// 관리자 결과지 저장 뒤 캐시 보정 — 서버 저장 규칙(lib/db saveScores·saveWriting)과 같게 고치는지.
// 다르면 목록을 다녀와 다시 연 결과지가 옛 값으로 초기화되고, 다음 자동 저장이 방금 저장한 채점을 덮는다.
const g1 = itemsFor(formForGrade(1))
const g2 = itemsFor(formForGrade(2))
const base = {
  session: { id: 's' },
  marks: [{ item_code: 'rw01', correct: false }, { item_code: 'rw02', correct: true }],
  sentences: [{ item_code: 'rs01', words: 3 }, { item_code: 'rs02', words: 4 }],
  times: [{ item_code: 'rs01', seconds: 5 }, { item_code: 'rs02', seconds: 6 }],
  writing: [{ item_code: 'ww01', can_write: true }],
}

describe('patchDetail — 저장한 모양 그대로 캐시를 고친다', () => {
  it('낱말 O/X는 보낸 칸만 바뀐다(upsert) — 보내지 않은 칸(잠긴 미녹음 문항의 옛 값)은 남는다', () => {
    const r = patchDetail(base, { marks: { rw01: true }, sentences: {}, times: {} }, g1)
    expect(r.marks).toEqual(expect.arrayContaining([{ item_code: 'rw01', correct: true }, { item_code: 'rw02', correct: true }]))
    expect(r.marks).toHaveLength(2)
  })
  it('문장 읽기 어절·시간은 문장 읽기 코드 안에서 교체한다(지운 칸은 사라진다)', () => {
    const r = patchDetail(base, { marks: {}, sentences: { rs01: 7 }, times: { rs02: 4.5 } }, g1)
    expect(r.sentences).toEqual([{ item_code: 'rs01', words: 7 }])
    expect(r.times).toEqual([{ item_code: 'rs02', seconds: 4.5 }])
  })
  it('쓰기를 보내지 않았으면 쓰기는 그대로', () => {
    expect(patchDetail(base, { marks: {}, sentences: {}, times: {} }, g1).writing).toBe(base.writing)
  })
  it('낱말 쓰기(G1)는 writing(can_write)을 쓰기 코드 안에서 교체', () => {
    const r = patchDetail(base, { marks: {}, sentences: {}, times: {}, writing: { ww02: 1, ww03: 0 } }, g1)
    expect(r.writing).toEqual([{ item_code: 'ww02', can_write: true }, { item_code: 'ww03', can_write: false }])
  })
  it('문장 쓰기(G2)는 sentences의 sw 코드만 교체 — 문장 읽기(rs) 점수는 그대로', () => {
    const old = { ...base, sentences: [{ item_code: 'rs01', words: 3 }, { item_code: 'sw01', words: 1 }] }
    const r = patchDetail(old, { marks: {}, sentences: { rs01: 3 }, times: {}, writing: { sw02: 2 } }, g2)
    expect(r.sentences).toEqual([{ item_code: 'rs01', words: 3 }, { item_code: 'sw02', words: 2 }])
  })
  it('다른 필드(세션 등)는 그대로 둔다', () => {
    expect(patchDetail(base, { marks: {}, sentences: {}, times: {} }, g1).session).toBe(base.session)
  })
})
