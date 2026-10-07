import { describe, it, expect } from 'vitest'
import {
  PROVISIONAL_CRITERIA, fluencyLabel, isValidReadSec, itemMaxWords, parseReadSec, readSecLabel, readSecMax,
  scoreInputFrom, scoreSession, scoringFor, sheetPdfGate, unrecordedItemCodes, unrecordedTimes, withUnrecordedFixed,
  type ScoreInput,
} from '@/lib/scoring'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const G1 = formForGrade(1)
const G2 = formForGrade(2)
const g1 = itemsFor(G1)
const g2 = itemsFor(G2)

const READ_ALL = g1.readItems.map(i => i.code)
const WRITE_ALL = g1.writingItems.map(i => i.code)

const empty: ScoreInput = { marks: {}, sentences: {}, times: {}, writing: {} }
const score = (s: Partial<ScoreInput>, form = G1) => scoreSession(form, { ...empty, ...s })

describe('배점 — 검사지 대조', () => {
  it('문항 배점은 어절 수에서 유도된다 — G1 문장 7·7·8·14', () => {
    expect(g1.sentenceItems.map(itemMaxWords)).toEqual([7, 7, 8, 14])
  })
  it('G2 문장은 7·8·9·11, 문장 쓰기는 전부 2어절', () => {
    expect(g2.sentenceItems.map(itemMaxWords)).toEqual([7, 8, 9, 11])
    expect(g2.writingItems.map(itemMaxWords)).toEqual([2, 2, 2, 2, 2])
  })
  it('낱말 쓰기는 낱말 하나가 곧 한 어절이라 문항 만점이 1이다', () => {
    expect(g1.writingItems.map(itemMaxWords)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })
  it('과제별 만점: G1 낱말 14 · 쓰기 10, 문장 정확 어절 36', () => {
    // 문장 읽기유창성은 어절/초라 만점이 없다 — taskMax에 없고 정확 어절 만점만 따로 있다
    expect(scoringFor(G1).taskMax).toEqual({ wordReading: 14, writing: 10 })
    expect(scoringFor(G1).sentenceWordsMax).toBe(36)
  })
  it('과제별 만점: G2 낱말 14 · 쓰기 10, 문장 정확 어절 35', () => {
    expect(scoringFor(G2).taskMax).toEqual({ wordReading: 14, writing: 10 })
    expect(scoringFor(G2).sentenceWordsMax).toBe(35)
  })
  it('임시 Pass 기준이 0보다 크고 개수형은 만점보다 작다 (확정 전 표시 대상)', () => {
    expect(PROVISIONAL_CRITERIA).toBe(true)
    for (const form of [G1, G2]) {
      const { passMark, taskMax } = scoringFor(form)
      for (const key of ['wordReading', 'writing'] as const) {
        expect(passMark[key]).toBeGreaterThan(0)
        expect(passMark[key]).toBeLessThan(taskMax[key])
      }
      expect(passMark.sentenceReading).toBeGreaterThan(0)   // 어절/초 — 만점이 없다
    }
  })
  it('의미·무의미 만점의 합이 과제 만점과 같다 (G1)', () => {
    const { readMax, writeMax, taskMax } = scoringFor(G1)
    expect(readMax.meaning + readMax.nonsense).toBe(taskMax.wordReading)
    expect(writeMax.meaning + writeMax.nonsense).toBe(taskMax.writing)
  })
})

describe('scoreSession — 합산', () => {
  it('아무것도 채점하지 않으면 전부 0점', () => {
    const r = score({})
    expect([r.wordMeaning, r.wordNonsense, r.wordReading, r.sentenceReading, r.writing])
      .toEqual([0, 0, 0, 0, 0])
  })

  it('낱말은 정반응(true)만 센다 — 의미/무의미를 나눠서도 집계', () => {
    const r = score({ marks: {
      rw01: true, rw02: true, rw03: false, rw04: true,   // 의미 3점
      rw08: true, rw09: false, rw10: true,               // 무의미 2점
    } })
    expect(r.wordMeaning).toBe(3)
    expect(r.wordNonsense).toBe(2)
    expect(r.wordReading).toBe(5)
  })

  it('문장은 입력한 어절 수를 더한다', () => {
    expect(score({ sentences: { rs01: 7, rs02: 5, rs03: 0, rs04: 10 } }).sentenceWords).toBe(22)
  })

  it('문장 점수는 해당 문항 만점을 넘지 못한다 (오입력 방어)', () => {
    expect(score({ sentences: { rs01: 999 } }).sentenceWords).toBe(7)
  })

  it('음수 문장 점수는 0으로 본다', () => {
    expect(score({ sentences: { rs01: -5 } }).sentenceWords).toBe(0)
  })

  it('소수·NaN·미입력·모르는 코드도 던지지 않고 안전하게 처리한다', () => {
    const r = score({ sentences: { rs01: 3.7, rs02: Number.NaN, rs03: undefined, zz99: 5 } })
    expect(r.sentenceWords).toBe(3)
  })

  it('낱말 쓰기는 1점(예)만 센다', () => {
    expect(score({ writing: { ww01: 1, ww02: 0, ww03: 1 } }).writing).toBe(2)
  })

  it('낱말 쓰기 만점은 10점', () => {
    expect(score({ writing: Object.fromEntries(WRITE_ALL.map(c => [c, 1])) }).writing).toBe(10)
  })

  it('낱말 해독 만점', () => {
    expect(score({ marks: Object.fromEntries(READ_ALL.map(c => [c, true])) }).wordReading).toBe(14)
  })

  it('[REGRESSION] 의미 낱말 첫 3개가 X여도 저장된 무의미·문장·쓰기 점수는 전부 산입된다', () => {
    // 예전 중단 규칙 ①이 걸리던 입력이다. 이제 읽은 것·쓴 것은 전부 산입한다 —
    // 담당자 회신("가정이 필요없을 것 같아")이 근거이나, 사후 채점 파생까지 걷어내는
    // 폐기 범위는 사용자 확정(2026-08-13)이다(lib/scoring.ts 주석 참고).
    const r = score({
      marks: { rw01: false, rw02: false, rw03: false, rw08: true },
      sentences: { rs01: 5 },
      writing: { ww01: 0, ww02: 1 },
    })
    expect(r.wordNonsense).toBe(1)
    expect(r.sentenceWords).toBe(5)
    expect(r.writing).toBe(1)
  })
})

describe('G2 문장 쓰기 채점 (어절당 1점)', () => {
  it('문항마다 0~2점을 더한다', () => {
    expect(scoreSession(G2, { ...empty, writing: { sw01: 2, sw02: 1, sw03: 0 } }).writing).toBe(3)
  })
  it('문항 만점(2)을 넘는 입력은 잘라낸다', () => {
    expect(scoreSession(G2, { ...empty, writing: { sw01: 9 } }).writing).toBe(2)
  })
  it('만점은 10점', () => {
    const all = Object.fromEntries(g2.writingItems.map(i => [i.code, 2]))
    const r = scoreSession(G2, { ...empty, writing: all })
    expect(r.writing).toBe(10)
    expect(r.verdict.writing).toBe('pass')
  })
  it('의미/무의미 소계는 문장 쓰기에 없다 (0으로 남는다)', () => {
    const r = scoreSession(G2, { ...empty, writing: { sw01: 2 } })
    expect(r.writeMeaning).toBe(0)
    expect(r.writeNonsense).toBe(0)
  })
  it('G2 세션에 G1 코드를 넣어도 점수에 섞이지 않는다', () => {
    expect(scoreSession(G2, { ...empty, writing: { ww01: 1, ww02: 1 } }).writing).toBe(0)
  })
})

describe('scoreSession — Pass/Fail 판정', () => {
  it('기준 이상이면 pass, 미만이면 fail', () => {
    // 36어절 ÷ 0.4초 = 90 어절/초 — 어떤 기준이 와도 넘는 값(임시 기준 숫자에 기대지 않는다)
    const pass = score({ sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 },
      times: { rs01: 0.1, rs02: 0.1, rs03: 0.1, rs04: 0.1 } })
    expect(pass.sentenceReading).toBe(90)
    expect(pass.verdict.sentenceReading).toBe('pass')
    expect(score({}).verdict.sentenceReading).toBe('fail')
  })

  it('기준값과 정확히 같으면 pass (경계 포함)', () => {
    const mark = scoringFor(G1).passMark.wordReading
    const marks = Object.fromEntries(READ_ALL.slice(0, mark).map(c => [c, true]))
    const r = score({ marks })
    expect(r.wordReading).toBe(mark)
    expect(r.verdict.wordReading).toBe('pass')
  })

  it('과제별로 따로 판정한다', () => {
    expect(Object.keys(score({}).verdict).sort()).toEqual(['sentenceReading', 'wordReading', 'writing'])
  })
})

describe('낱말 쓰기 의미/무의미 소계', () => {
  it('의미·무의미를 나눠 세고 합이 총점과 같다', () => {
    // ww01~ww05 = 의미, ww06~ww10 = 무의미
    const r = score({ writing: {
      ww01: 1, ww02: 1, ww03: 0, ww04: 1, ww05: 0,
      ww06: 1, ww07: 0, ww08: 0, ww09: 0, ww10: 0,
    } })
    expect(r.writeMeaning).toBe(3)
    expect(r.writeNonsense).toBe(1)
    expect(r.writing).toBe(4)
    expect(r.writeMeaning + r.writeNonsense).toBe(r.writing)
  })
  it('미응답(undefined)은 0점으로 센다', () => {
    const r = score({})
    expect([r.writeMeaning, r.writeNonsense, r.writing]).toEqual([0, 0, 0])
  })
})

describe('채점 완료 여부 (채점 전을 0점 Fail로 표시하지 않기 위한 근거)', () => {
  const allRead = Object.fromEntries(READ_ALL.map(c => [c, true]))
  const allSent = { rs01: 7, rs02: 7, rs03: 8, rs04: 14 }
  const allTimes = { rs01: 4, rs02: 4, rs03: 4.5, rs04: 5.5 }
  const allWrite = Object.fromEntries(WRITE_ALL.map(c => [c, 1]))

  it('갓 제출된 세션은 어느 과제도 완료가 아니다', () => {
    expect(score({}).complete).toEqual({ wordReading: false, sentenceReading: false, writing: false })
  })

  it('의미 낱말 7개만 채점됐으면 낱말 해독은 아직 미완료다', () => {
    // 채점은 관리자가 녹음을 듣고 전 문항에 대해 한다 — 무의미까지 찍어야 완료다.
    const r = score({ marks: Object.fromEntries(g1.meaningReadCodes.map(c => [c, true])) })
    expect(r.wordReading).toBe(7)
    expect(r.complete.wordReading).toBe(false)
  })

  it('전부 채점하면 완료로 바뀐다', () => {
    expect(score({ marks: allRead, sentences: allSent, times: allTimes, writing: allWrite }).complete)
      .toEqual({ wordReading: true, sentenceReading: true, writing: true })
  })

  it('의미 낱말이 여러 개 오반응이어도 전 문항이 채점됐으면 낱말 해독은 완료다', () => {
    const r = score({ marks: { ...allRead, rw01: false, rw02: false, rw03: false } })
    expect(r.complete.wordReading).toBe(true)
    expect(r.complete.sentenceReading).toBe(false)
    expect(r.complete.writing).toBe(false)
    // 점수는 0이지만 완료가 아니므로 화면·인쇄물은 이 0을 확정값으로 쓰지 않는다.
    expect(r.sentenceReading).toBe(0)
  })

  it('쓰기 완료는 전 문항 입력 기준이다 (중단 규칙 ② 폐기 — 담당자 확정 2026-08-22)', () => {
    expect(score({ writing: { sw01: 0 } }, G2).complete.writing).toBe(false)
    const all = Object.fromEntries(g2.writingItems.map(i => [i.code, 0]))
    expect(score({ writing: all }, G2).complete.writing).toBe(true)
  })

  it('문장 하나라도 비면 미완료다', () => {
    const r = score({ marks: allRead, sentences: { rs01: 7, rs02: 7, rs03: 8 }, times: allTimes, writing: allWrite })
    expect(r.complete.sentenceReading).toBe(false)
  })

  it('[REGRESSION] 어절이 다 있어도 읽은 시간이 하나라도 없으면 미완료다 — 분모 없이 어절/초를 낼 수 없다', () => {
    const r = score({ sentences: allSent, times: { rs01: 4, rs02: 4, rs03: 4.5 } })
    expect(r.complete.sentenceReading).toBe(false)
    expect(score({ sentences: allSent }).complete.sentenceReading).toBe(false)
  })

  it('시간이 다 있어도 어절이 비면 미완료다', () => {
    expect(score({ sentences: { rs01: 7 }, times: allTimes }).complete.sentenceReading).toBe(false)
  })
})

describe('scoreInputFrom — 저장된 행을 채점 입력으로', () => {
  it('G1: 낱말 쓰기는 writing_answers에서 오고 1/0으로 바뀐다', () => {
    const input = scoreInputFrom(g1, {
      marks: [{ item_code: 'rw01', correct: true }],
      sentences: [{ item_code: 'rs01', words: 5 }],
      times: [],
      writing: [{ item_code: 'ww01', can_write: true }, { item_code: 'ww02', can_write: false }],
    })
    expect(input.marks).toEqual({ rw01: true })
    expect(input.sentences).toEqual({ rs01: 5 })
    expect(input.writing).toEqual({ ww01: 1, ww02: 0 })
  })

  it('G2: 문장 읽기(rs..)와 문장 쓰기(sw..)가 같은 테이블에 있어도 갈라 담는다', () => {
    const input = scoreInputFrom(g2, {
      marks: [],
      sentences: [
        { item_code: 'rs01', words: 6 },
        { item_code: 'sw01', words: 2 },
        { item_code: 'sw02', words: 0 },
      ],
      times: [],
      writing: [],
    })
    expect(input.sentences).toEqual({ rs01: 6 })
    expect(input.writing).toEqual({ sw01: 2, sw02: 0 })
  })

  it('다른 양식의 코드는 버린다 (학년을 바꿔 조회해도 점수가 섞이지 않는다)', () => {
    const input = scoreInputFrom(g2, {
      marks: [],
      sentences: [{ item_code: 'sw01', words: 2 }],
      times: [],
      writing: [{ item_code: 'ww01', can_write: true }],
    })
    // ww01은 G2 양식의 문항이 아니다 — 점수에도, "응답 수" 집계에도 들어오지 않아야 한다
    expect(input.writing).toEqual({ sw01: 2 })
    expect(scoreSession(G2, input).writing).toBe(2)
  })

  it('읽은 시간은 sentence_times에서 오고, 문장 읽기 코드만 받으며 숫자로 맞춘다', () => {
    const input = scoreInputFrom(g1, {
      marks: [], sentences: [], writing: [],
      // numeric 열이 문자열로 와도 합산이 문자열 이어 붙이기가 되지 않아야 한다
      times: [{ item_code: 'rs01', seconds: '4.5' as unknown as number }, { item_code: 'rw01', seconds: 3 }],
    })
    expect(input.times).toEqual({ rs01: 4.5 })
  })
})

describe('sheetPdfGate — 채점이 끝나기 전에는 공식 PDF를 내려받지 않는다', () => {
  const ALL_MARKS = Object.fromEntries(READ_ALL.map(c => [c, true]))
  const ALL_SENT = Object.fromEntries(g1.sentenceItems.map(i => [i.code, 1]))
  const ALL_TIMES = Object.fromEntries(g1.sentenceItems.map(i => [i.code, 3]))
  const ALL_WRITE = Object.fromEntries(WRITE_ALL.map(c => [c, 1]))
  const done = score({ marks: ALL_MARKS, sentences: ALL_SENT, times: ALL_TIMES, writing: ALL_WRITE })

  it('전부 채점되고 저장됐으면 관문이 없다', () => {
    expect(sheetPdfGate(done, false)).toBeNull()
  })

  it('저장하지 않은 채점이 있으면 막는다 (PDF는 저장된 값으로 만들어진다)', () => {
    expect(sheetPdfGate(done, true)).toMatchObject({ reason: 'dirty', overridable: false })
  })

  it('낱말 O/X·문장 점수가 남았으면 막고, 어느 과제인지 알려준다', () => {
    const gate = sheetPdfGate(score({ writing: ALL_WRITE }), false)
    expect(gate).toMatchObject({ reason: 'unscored', overridable: false })
    expect(gate!.tasks).toEqual(['wordReading', 'sentenceReading'])
  })

  it('쓰기만 비어 있으면 경고만 하고 통과시킨다 — 결과지에서 채울 수 없는 값이다', () => {
    const gate = sheetPdfGate(score({ marks: ALL_MARKS, sentences: ALL_SENT, times: ALL_TIMES }), false)
    expect(gate).toMatchObject({ reason: 'unscored', tasks: ['writing'], overridable: true })
  })

  it('문장의 읽은 시간이 비면 막는다 — 결과지에서 채울 수 있는 값이다', () => {
    const gate = sheetPdfGate(score({ marks: ALL_MARKS, sentences: ALL_SENT, writing: ALL_WRITE }), false)
    expect(gate).toMatchObject({ reason: 'unscored', tasks: ['sentenceReading'], overridable: false })
  })
})

describe('withUnrecordedFixed — 미녹음은 오반응(X·0점)으로 고정 채점 (항목 8)', () => {
  const none = () => false
  const all = () => true

  it('문장 페이지가 미녹음이면 어절 0점과 읽은 시간 = 제한 시간(20초)이 채워진다', () => {
    const out = withUnrecordedFixed(g1, empty, code => code !== 'p_rs02')
    expect(out.sentences.rs02).toBe(0)
    expect(out.times.rs02).toBe(20)
    expect(out.sentences.rs01).toBeUndefined()
    expect(out.times.rs01).toBeUndefined()
  })

  it('무의미 낱말 페이지가 미녹음이면 그 7문항이 X로 채워진다', () => {
    const marks = Object.fromEntries(g1.meaningReadCodes.map(c => [c, true]))
    const out = withUnrecordedFixed(g1, { ...empty, marks }, code => code !== 'p_rw_nonsense')
    expect(g1.nonsenseReadCodes.every(c => out.marks[c] === false)).toBe(true)
    // 이제 낱말 해독이 "채점 완료"가 되어 결과보고서 PDF의 해독 판정 칸이 채워진다
    expect(scoreSession(G1, out).complete.wordReading).toBe(true)
    expect(scoreSession(G1, out).wordReading).toBe(7)
  })

  it('[REGRESSION] 저장된 채점이 있어도 덮는다 — 들을 녹음이 없어 그 값은 근거가 없다(사용자 확정 2026-09-29)', () => {
    const input: ScoreInput = { marks: { rw08: true }, sentences: { rs01: 5 }, times: { rs01: 3.5 }, writing: {} }
    const out = withUnrecordedFixed(g1, input, none)
    expect(out.marks.rw08).toBe(false)
    expect(out.sentences.rs01).toBe(0)
    expect(out.times.rs01).toBe(20)
  })

  it('녹음이 있는 페이지의 저장값은 그대로 둔다', () => {
    const input: ScoreInput = { marks: { rw01: true }, sentences: { rs01: 5 }, times: { rs01: 3.5 }, writing: {} }
    const out = withUnrecordedFixed(g1, input, code => code === 'p_rw_meaning' || code === 'p_rs01')
    expect([out.marks.rw01, out.sentences.rs01, out.times.rs01]).toEqual([true, 5, 3.5])
  })

  it('값이 undefined인 키가 있어도 시간 기본값을 채운다 (비어 있는 것과 같다)', () => {
    const out = withUnrecordedFixed(g1, { ...empty, times: { rs02: undefined } }, code => code !== 'p_rs02')
    expect(out.times.rs02).toBe(20)
  })

  it('녹음이 다 있으면 아무것도 채우지 않는다', () => {
    expect(withUnrecordedFixed(g1, empty, all)).toEqual(empty)
  })

  it('[REGRESSION] 의미 낱말 첫 3개가 X로 채워져도 무의미·문장까지 전부 기본채점한다 (중단 규칙 폐기)', () => {
    const out = withUnrecordedFixed(g1, empty, none)
    expect(Object.keys(out.marks)).toHaveLength(14)          // 의미 7 + 무의미 7 전부 X
    expect(Object.values(out.marks).every(v => v === false)).toBe(true)
    expect(Object.keys(out.sentences)).toHaveLength(4)       // 문장 4개 전부 0
    expect(Object.keys(out.times)).toHaveLength(4)           // 읽은 시간도 4개 전부 제한 시간
  })

  it('쓰기 과제는 손대지 않는다 (녹음이 없는 과제라 미녹음 판정 대상이 아니다)', () => {
    expect(withUnrecordedFixed(g1, empty, none).writing).toEqual({})
  })
})

describe('문장 읽기유창성 — 정확 어절 합 ÷ 읽은 시간 합 (담당자 확정 2026-09-29)', () => {
  /** 기준을 1.0으로 고정한 양식 사본 — 임시 기준이 바뀌어도 판정 경계 테스트의 뜻은 그대로다. */
  const at1 = { ...G1, passMark: { ...G1.passMark, sentenceReading: 1 } }
  const words20 = { rs01: 7, rs02: 7, rs03: 6, rs04: 0 }

  it('담당자 예시 — 4문장 총 10초에 정확 어절 20개면 2점', () => {
    const r = score({ sentences: words20, times: { rs01: 2, rs02: 3, rs03: 3, rs04: 2 } })
    expect([r.sentenceWords, r.sentenceSec, r.sentenceReading]).toEqual([20, 10, 2])
    expect(r.complete.sentenceReading).toBe(true)
  })

  it('소수 둘째 자리에서 반올림한다 — 36어절 ÷ 17초 = 2.1176… → 2.12, 0.125 → 0.13', () => {
    expect(score({ sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 },
      times: { rs01: 4, rs02: 4, rs03: 4.5, rs04: 4.5 } }).sentenceReading).toBe(2.12)
    expect(score({ sentences: { rs01: 1, rs02: 0, rs03: 0, rs04: 0 },
      times: { rs01: 2, rs02: 2, rs03: 2, rs04: 2 } }).sentenceReading).toBe(0.13)
  })

  it('[REGRESSION] 0.1초 단위 시간을 더해도 부동소수 오차가 없다 — 4.1+4.2+4.3+4.4 = 17', () => {
    const r = score({ sentences: words20, times: { rs01: 4.1, rs02: 4.2, rs03: 4.3, rs04: 4.4 } })
    expect(r.sentenceSec).toBe(17)
    expect(r.sentenceReading).toBe(1.18)   // 20 ÷ 17 = 1.176…
  })

  it('[REGRESSION] 판정은 반올림한 값으로 한다 — 화면의 「1.00」이 기준 1.00에서 Fail이 되지 않는다', () => {
    const edge = scoreSession(at1, { ...empty, sentences: words20, times: { rs01: 5, rs02: 5, rs03: 5, rs04: 5.1 } })
    expect(edge.sentenceReading).toBe(1)       // 20 ÷ 20.1 = 0.995… → 1.00
    expect(edge.verdict.sentenceReading).toBe('pass')
    const below = scoreSession(at1, { ...empty, sentences: words20, times: { rs01: 5, rs02: 5, rs03: 5, rs04: 5.2 } })
    expect(below.sentenceReading).toBe(0.99)   // 20 ÷ 20.2 = 0.990…
    expect(below.verdict.sentenceReading).toBe('fail')
  })

  it('[REGRESSION] 녹음 없는 문장은 제한 시간을 분모에 더한다 — 1문장만 읽고 넘긴 아이가 유창해 보이지 않게', () => {
    // 1번만 5초에 7어절 읽고 2~4번은 「모르겠어요」(녹음 없음): 7 ÷ (5 + 20×3) = 0.107… → 0.11.
    // 계산에서 빼면 7 ÷ 5 = 1.40으로 4문장을 30초에 다 읽은 아이(1.20)보다 높아진다(lib/scoring 주석).
    const input = withUnrecordedFixed(g1, { ...empty, sentences: { rs01: 7 }, times: { rs01: 5 } },
      code => code === 'p_rs01')
    const r = scoreSession(G1, input)
    expect(r.sentenceReading).toBe(0.11)
    expect(r.complete.sentenceReading).toBe(true)
  })

  it('0초·음수·NaN 시간은 입력 없음으로 본다 — 분모에 섞여 채점 완료가 되지 않는다', () => {
    const r = score({ sentences: words20, times: { rs01: 0, rs02: -1, rs03: Number.NaN, rs04: 5 } })
    expect(r.sentenceSec).toBe(5)
    expect(r.complete.sentenceReading).toBe(false)
  })

  it('시간이 하나도 없으면 0 (0으로 나누지 않는다)', () => {
    expect(score({ sentences: words20 }).sentenceReading).toBe(0)
  })

  it('표기는 소수 둘째 자리까지 고정 — 2 → 「2.00」', () => {
    expect(fluencyLabel(2)).toBe('2.00')
    expect(fluencyLabel(0.1)).toBe('0.10')
  })
})

describe('unrecordedTimes · unrecordedItemCodes — 녹음 없는 문항', () => {
  it('읽은 시간은 녹음 없는 문장 페이지만, 그 페이지의 제한 시간으로 — 낱말 페이지는 대상이 아니다', () => {
    expect(unrecordedTimes(g1, code => code !== 'p_rs03' && code !== 'p_rw_meaning')).toEqual({ rs03: 20 })
    expect(unrecordedTimes(g1, () => true)).toEqual({})
  })
  it('잠글 문항 코드 — 낱말 그룹은 7문항 통째로, 문장은 그 한 문장', () => {
    const codes = unrecordedItemCodes(g1, code => code !== 'p_rs03' && code !== 'p_rw_meaning')
    expect([...codes].sort()).toEqual([...g1.meaningReadCodes, 'rs03'].sort())
    expect(unrecordedItemCodes(g1, () => true).size).toBe(0)
  })
  it('쓰기 문항은 녹음 페이지가 아니라 잠그지 않는다', () => {
    expect([...unrecordedItemCodes(g1, () => false)].some(c => c.startsWith('ww'))).toBe(false)
  })
})

describe('읽은 시간 입력 — parseReadSec · isValidReadSec · readSecLabel', () => {
  const MAX = readSecMax(G1)

  it('상한은 녹음 최대 길이 — 제한 20초 + 여유 5초 (채점 규칙이 아니라 오타 방지)', () => {
    expect(MAX).toBe(25)
  })

  it('빈 칸은 입력 없음(undefined)', () => {
    expect(parseReadSec('', MAX)).toBeUndefined()
    expect(parseReadSec('   ', MAX)).toBeUndefined()
  })

  it('정수·소수 한 자리를 받는다', () => {
    expect(parseReadSec('4', MAX)).toBe(4)
    expect(parseReadSec('4.5', MAX)).toBe(4.5)
    expect(parseReadSec('.5', MAX)).toBe(0.5)
    expect(parseReadSec(' 12 ', MAX)).toBe(12)
    expect(parseReadSec('25', MAX)).toBe(25)
  })

  it('치는 도중의 「4.」는 4로 읽는다 — 소수를 치는 동안 계산이 끊기지 않게', () => {
    expect(parseReadSec('4.', MAX)).toBe(4)
  })

  it('0초·상한 초과·소수 두 자리·숫자가 아닌 글자는 null(잘못 친 값)', () => {
    for (const t of ['0', '0.0', '25.1', '30', '4.55', 'abc', '1e1', '-1', '.', '4,5'])
      expect(parseReadSec(t, MAX), t).toBeNull()
  })

  it('isValidReadSec — 숫자·0 초과·상한 이하·0.1초 단위만', () => {
    expect(isValidReadSec(4.5, MAX)).toBe(true)
    expect(isValidReadSec(0.1 + 0.2, MAX)).toBe(true)   // 부동소수 꼬리는 0.1초 단위로 본다
    for (const v of [0, -1, 4.55, 25.1, Number.NaN, Number.POSITIVE_INFINITY, '4.5', null])
      expect(isValidReadSec(v, MAX), String(v)).toBe(false)
  })

  it('readSecLabel — 정수는 그대로, 아니면 소수 한 자리', () => {
    expect(readSecLabel(17)).toBe('17')
    expect(readSecLabel(17.5)).toBe('17.5')
  })
})

describe('문장 읽기유창성 — 경계·예외 상황', () => {
  const MAX = readSecMax(G1)

  it('[전수] 어절 0~36 × 시간 0.4~100초(0.1초 간격) 전부 — 둘째 자리까지이고, 참값과 0.005 안이며, 딱 절반이면 올린다', () => {
    const caps = g1.sentenceItems.map(itemMaxWords)            // 7·7·8·14
    const codes = g1.sentenceItems.map(i => i.code)
    let checked = 0
    for (let w = 0; w <= 36; w++) {
      // 어절을 문장 만점 안에서 앞에서부터 채운다
      let left = w
      const sentences = Object.fromEntries(codes.map((c, k) => { const n = Math.min(left, caps[k]); left -= n; return [c, n] }))
      for (let tenths = 4; tenths <= 1000; tenths++) {
        const times = { rs01: (tenths - 3) / 10, rs02: 0.1, rs03: 0.1, rs04: 0.1 }
        const r = score({ sentences, times })
        const hundredths = r.sentenceReading * 100
        expect(Math.abs(hundredths - Math.round(hundredths))).toBeLessThan(1e-9)          // 둘째 자리까지
        expect(r.sentenceSec * 10).toBe(tenths)                                           // 분모에 오차 없음
        const num = w * 1000, exactFloor = Math.floor(num / tenths), rem = num % tenths
        const want = 2 * rem >= tenths ? exactFloor + 1 : exactFloor                     // 반올림(절반은 올림)을 정수로
        if (Math.round(hundredths) !== want) throw new Error(`w=${w} tenths=${tenths}: ${r.sentenceReading} ≠ ${want / 100}`)
        checked++
      }
    }
    expect(checked).toBe(37 * 997)
  })

  it('G2 양식도 같은 규칙 — 정확 어절 만점 35, 미녹음 문장 20초', () => {
    const r = scoreSession(G2, { ...empty, sentences: { rs01: 7, rs02: 8, rs03: 9, rs04: 11 },
      times: { rs01: 5, rs02: 5, rs03: 5, rs04: 5 } })
    expect([r.sentenceWords, r.sentenceSec, r.sentenceReading]).toEqual([35, 20, 1.75])
    expect(withUnrecordedFixed(g2, empty, () => false).times).toEqual({ rs01: 20, rs02: 20, rs03: 20, rs04: 20 })
  })

  it('만점을 넘는 어절은 나누기 전에 잘라낸다 — 오입력이 비율을 부풀리지 않는다', () => {
    const r = score({ sentences: { rs01: 99, rs02: 0, rs03: 0, rs04: 0 }, times: { rs01: 1, rs02: 1, rs03: 1, rs04: 1 } })
    expect(r.sentenceWords).toBe(7)
    expect(r.sentenceReading).toBe(1.75)
  })

  it('문장 읽기가 아닌 코드의 시간은 분모에 들어가지 않는다', () => {
    const r = score({ sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 },
      times: { rs01: 4, rs02: 4, rs03: 4.5, rs04: 4.5, rw01: 100, sw01: 100, zz99: 100 } })
    expect(r.sentenceSec).toBe(17)
  })

  it('녹음 없는 문장은 채점자가 넣은 시간이 있어도 제한 시간(20초)으로 고정된다', () => {
    const out = withUnrecordedFixed(g1, { ...empty, times: { rs02: 7.5 } }, () => false)
    expect(out.times).toEqual({ rs01: 20, rs02: 20, rs03: 20, rs04: 20 })
  })

  it('가장 느린 경우 — 네 문장 모두 녹음 상한(25초)에 만점이면 36 ÷ 100 = 0.36', () => {
    const r = score({ sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 },
      times: { rs01: MAX, rs02: MAX, rs03: MAX, rs04: MAX } })
    expect(r.sentenceReading).toBe(0.36)
  })

  it('읽기유창성 판정은 최종결과에 그대로 들어간다 — 다 맞게 읽어도 느리면 FAIL로 세어진다', () => {
    const at1 = { ...G1, passMark: { ...G1.passMark, sentenceReading: 1 } }
    const slow = scoreSession(at1, { ...empty,
      marks: Object.fromEntries(READ_ALL.map(c => [c, false])),                         // 낱말 해독 FAIL
      sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 }, times: { rs01: 20, rs02: 20, rs03: 20, rs04: 20 },
      writing: Object.fromEntries(WRITE_ALL.map(c => [c, 1])) })
    expect(slow.verdict).toEqual({ wordReading: 'fail', sentenceReading: 'fail', writing: 'pass' })
  })

  it('parseReadSec — 전각 숫자·부호·공백 낀 숫자·유니코드 마이너스는 잘못 친 값, 「4.0」「00.5」는 받는다', () => {
    for (const t of ['４', '+4', '4 5', '−4', '4.5.', '0x10', 'Infinity'])
      expect(parseReadSec(t, MAX), t).toBeNull()
    expect(parseReadSec('4.0', MAX)).toBe(4)
    expect(parseReadSec('25.0', MAX)).toBe(25)
    expect(parseReadSec('0.1', MAX)).toBe(0.1)
    expect(parseReadSec('00.5', MAX)).toBe(0.5)
  })

  it('isValidReadSec — 아주 작은 수·-0·최댓값·상한 근처', () => {
    for (const v of [1e-7, -0, Number.MAX_VALUE, 25.05, true, {}, []])
      expect(isValidReadSec(v, MAX), String(v)).toBe(false)
    expect(isValidReadSec(24.9, MAX)).toBe(true)
    expect(isValidReadSec(0.1, MAX)).toBe(true)
  })

  it('readSecLabel — 0.1초·100초', () => {
    expect(readSecLabel(0.1)).toBe('0.1')
    expect(readSecLabel(100)).toBe('100')
  })
})
