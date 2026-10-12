import { describe, expect, it } from 'vitest'
import { scoresVersion, type ScoreRows } from '@/lib/score-version'

// 채점의 판 — 결과지 상세 GET과 채점 PUT이 같은 행에서 같은 판을 만들어야 한다(다르면 저장마다 충돌한다).
// 행 순서·숫자 표기에는 흔들리지 않고, 칸 하나라도 바뀌면 달라져야 한다(안 바뀌면 낡은 화면의 저장이 통과한다).
const ROWS: ScoreRows = {
  marks: [{ item_code: 'rw01', correct: true }, { item_code: 'rw02', correct: false }],
  sentences: [{ item_code: 'rs01', words: 3 }, { item_code: 'sw01', words: 2 }],
  times: [{ item_code: 'rs01', seconds: 5.2 }],
  writing: [{ item_code: 'ww01', can_write: true }],
}

describe('scoresVersion', () => {
  it('같은 행이면 같은 판 — 행 순서와 무관하다(DB가 주는 순서는 정해져 있지 않다)', () => {
    const shuffled: ScoreRows = {
      marks: [...ROWS.marks].reverse(), sentences: [...ROWS.sentences].reverse(), times: ROWS.times, writing: ROWS.writing,
    }
    expect(scoresVersion(shuffled)).toBe(scoresVersion(ROWS))
    expect(scoresVersion(ROWS)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('숫자 표기(5 · 5.0 · "5")에 흔들리지 않는다 — numeric 열이 문자열로 와도 같은 판', () => {
    const asText = { ...ROWS, times: [{ item_code: 'rs01', seconds: '5.20' as unknown as number }] }
    expect(scoresVersion(asText)).toBe(scoresVersion(ROWS))
  })

  it('[REGRESSION] 칸 하나라도 바뀌면(값·추가·삭제) 판이 달라진다 — 그래야 낡은 화면의 저장을 막는다', () => {
    const v = scoresVersion(ROWS)
    const variants: ScoreRows[] = [
      { ...ROWS, marks: [{ item_code: 'rw01', correct: true }, { item_code: 'rw02', correct: true }] },   // X → O
      { ...ROWS, sentences: [...ROWS.sentences, { item_code: 'rs03', words: 5 }] },                        // 추가
      { ...ROWS, times: [] },                                                                               // 삭제
      { ...ROWS, times: [{ item_code: 'rs01', seconds: 5.3 }] },                                            // 0.1초
      { ...ROWS, writing: [{ item_code: 'ww01', can_write: false }] },                                      // 쓰기
    ]
    for (const r of variants) expect(scoresVersion(r)).not.toBe(v)
  })

  it('같은 코드·값이 다른 표에 있으면 다른 판이다(표를 구별한다)', () => {
    const a: ScoreRows = { marks: [], sentences: [{ item_code: 'rs01', words: 5 }], times: [], writing: [] }
    const b: ScoreRows = { marks: [], sentences: [], times: [{ item_code: 'rs01', seconds: 5 }], writing: [] }
    expect(scoresVersion(a)).not.toBe(scoresVersion(b))
  })
})
