import { describe, it, expect } from 'vitest'
import {
  PROVISIONAL_CRITERIA, itemMaxWords, scoreInputFrom, scoreSession, scoringFor,
  sheetPdfGate, withUnrecordedDefaults, type ScoreInput,
} from '@/lib/scoring'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const G1 = formForGrade(1)
const G2 = formForGrade(2)
const g1 = itemsFor(G1)
const g2 = itemsFor(G2)

const READ_ALL = g1.readItems.map(i => i.code)
const WRITE_ALL = g1.writingItems.map(i => i.code)

const empty: ScoreInput = { marks: {}, sentences: {}, writing: {} }
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
  it('과제별 만점: G1 낱말 14 · 문장 36 · 쓰기 10', () => {
    expect(scoringFor(G1).taskMax).toEqual({ wordReading: 14, sentenceReading: 36, writing: 10 })
  })
  it('과제별 만점: G2 낱말 14 · 문장 35 · 쓰기 10', () => {
    expect(scoringFor(G2).taskMax).toEqual({ wordReading: 14, sentenceReading: 35, writing: 10 })
  })
  it('임시 Pass 기준이 만점보다 작고 0보다 크다 (확정 전 표시 대상)', () => {
    expect(PROVISIONAL_CRITERIA).toBe(true)
    for (const form of [G1, G2]) {
      const { passMark, taskMax } = scoringFor(form)
      for (const key of ['wordReading', 'sentenceReading', 'writing'] as const) {
        expect(passMark[key]).toBeGreaterThan(0)
        expect(passMark[key]).toBeLessThan(taskMax[key])
      }
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
    expect(score({ sentences: { rs01: 7, rs02: 5, rs03: 0, rs04: 10 } }).sentenceReading).toBe(22)
  })

  it('문장 점수는 해당 문항 만점을 넘지 못한다 (오입력 방어)', () => {
    expect(score({ sentences: { rs01: 999 } }).sentenceReading).toBe(7)
  })

  it('음수 문장 점수는 0으로 본다', () => {
    expect(score({ sentences: { rs01: -5 } }).sentenceReading).toBe(0)
  })

  it('소수·NaN·미입력·모르는 코드도 던지지 않고 안전하게 처리한다', () => {
    const r = score({ sentences: { rs01: 3.7, rs02: Number.NaN, rs03: undefined, zz99: 5 } })
    expect(r.sentenceReading).toBe(3)
  })

  it('낱말 쓰기는 1점(예)만 센다', () => {
    expect(score({ writing: { ww01: 1, ww02: 0, ww03: 1 } }).writing).toBe(2)
  })

  it('낱말 해독 만점', () => {
    expect(score({ marks: Object.fromEntries(READ_ALL.map(c => [c, true])) }).wordReading).toBe(14)
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
    const pass = score({ sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 } })
    expect(pass.sentenceReading).toBe(36)
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

describe('채점 완료 여부 (미실시·채점 전을 0점 Fail로 표시하지 않기 위한 근거)', () => {
  const allRead = Object.fromEntries(READ_ALL.map(c => [c, true]))
  const allSent = { rs01: 7, rs02: 7, rs03: 8, rs04: 14 }
  const allWrite = Object.fromEntries(WRITE_ALL.map(c => [c, 1]))

  it('갓 제출된 세션은 어느 과제도 완료가 아니다', () => {
    expect(score({}).complete).toEqual({ wordReading: false, sentenceReading: false, writing: false })
  })

  it('현장 채점(의미 7개)만 있으면 낱말 해독은 아직 미완료다', () => {
    // 무의미 낱말은 검사자가 현장에서 표시하지 않는다 — 관리자가 녹음을 듣고 채점해야 완료다.
    const r = score({ marks: Object.fromEntries(g1.meaningReadCodes.map(c => [c, true])) })
    expect(r.wordReading).toBe(7)
    expect(r.complete.wordReading).toBe(false)
  })

  it('전부 채점하면 완료로 바뀐다', () => {
    expect(score({ marks: allRead, sentences: allSent, writing: allWrite }).complete)
      .toEqual({ wordReading: true, sentenceReading: true, writing: true })
  })

  it('옛 규칙으로 전 문항 실시된 세션도 낱말 해독은 완료다 (소급 세션)', () => {
    // 무의미까지 채점된 세션 — 새 규칙 ①이 걸려도 complete는 유지된다.
    const r = score({ marks: { ...allRead, rw01: false, rw02: false, rw03: false } })
    expect(r.complete.wordReading).toBe(true)
    expect(r.complete.sentenceReading).toBe(false)
    expect(r.complete.writing).toBe(false)
    // 점수는 0이지만 완료가 아니므로 화면·인쇄물은 이 0을 확정값으로 쓰지 않는다.
    expect(r.sentenceReading).toBe(0)
  })

  it('중단 규칙 ②(G2): 첫 문장이 0점이면 그것만 채워도 완료다', () => {
    const r = scoreSession(G2, { ...empty, writing: { sw01: 0 } })
    expect(r.complete.writing).toBe(true)
    // 1점(부분 정답)이면 중단이 아니므로 나머지도 채워야 완료다
    expect(scoreSession(G2, { ...empty, writing: { sw01: 1 } }).complete.writing).toBe(false)
  })

  it('문장 하나라도 비면 미완료다', () => {
    const r = score({ marks: allRead, sentences: { rs01: 7, rs02: 7, rs03: 8 }, writing: allWrite })
    expect(r.complete.sentenceReading).toBe(false)
  })
})

describe('scoreInputFrom — 저장된 행을 채점 입력으로', () => {
  it('G1: 낱말 쓰기는 writing_answers에서 오고 1/0으로 바뀐다', () => {
    const input = scoreInputFrom(g1, {
      marks: [{ item_code: 'rw01', correct: true }],
      sentences: [{ item_code: 'rs01', words: 5 }],
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
      writing: [],
    })
    expect(input.sentences).toEqual({ rs01: 6 })
    expect(input.writing).toEqual({ sw01: 2, sw02: 0 })
  })

  it('다른 양식의 코드는 버린다 (학년을 바꿔 조회해도 점수가 섞이지 않는다)', () => {
    const input = scoreInputFrom(g2, {
      marks: [],
      sentences: [{ item_code: 'sw01', words: 2 }],
      writing: [{ item_code: 'ww01', can_write: true }],
    })
    // ww01은 G2 양식의 문항이 아니다 — 점수에도, "응답 수" 집계에도 들어오지 않아야 한다
    expect(input.writing).toEqual({ sw01: 2 })
    expect(scoreSession(G2, input).writing).toBe(2)
  })
})

describe('중단 규칙과 채점 (discontinued — 판정을 Pass/Fail이 아니라 중단으로)', () => {
  const MEANING = g1.meaningReadCodes
  const ceilingMarks = Object.fromEntries(MEANING.map((c, i) => [c, i >= 3]))  // 첫 3개 X, 나머지 O

  it('① 세션: 의미 7문항만 채점되면 낱말 해독은 완료다 (무의미는 미실시)', () => {
    const r = score({ marks: ceilingMarks })
    expect(r.complete.wordReading).toBe(true)
    expect(r.wordReading).toBe(4)          // 의미 4문항 정반응, 무의미 기여 0
  })

  it('① 세션: discontinued가 낱말 해독·문장 읽기유창성에 선다', () => {
    const r = score({ marks: ceilingMarks })
    expect(r.discontinued).toEqual({ wordReading: true, sentenceReading: true, writing: false })
  })

  it('중단 아닌 세션: 의미만 채점됐으면 여전히 미완료다 (기존 동작 보존)', () => {
    const okMarks = Object.fromEntries(MEANING.map(c => [c, true]))
    const r = score({ marks: okMarks })
    expect(r.complete.wordReading).toBe(false)
    expect(r.discontinued.wordReading).toBe(false)
  })

  it('② 세션: 쓰기 1번 0점이면 discontinued.writing — 1번만으로 완료다', () => {
    const r = score({ writing: { ww01: 0 } })
    expect(r.discontinued.writing).toBe(true)
    expect(r.complete.writing).toBe(true)
    const r2 = score({ writing: { sw01: 0 } }, G2)
    expect(r2.discontinued.writing).toBe(true)
    expect(r2.complete.writing).toBe(true)
  })

  // 사후 중단 — 관리자가 녹음을 듣고 의미 낱말을 고쳐 뒤늦게 ①이 성립하는 경로.
  // 검사 당시엔 실시된 무의미 낱말·문장 점수가 이미 저장돼 있다(사용자 보고 2026-08-12).
  it('① 성립 후에는 무의미 낱말·문장 점수를 총점에서 뺀다 (값이 남아 있어도)', () => {
    const marks = { ...Object.fromEntries(READ_ALL.map(c => [c, true])), rw01: false, rw02: false, rw03: false }
    const r = score({ marks, sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 } })
    expect(r.wordMeaning).toBe(4)      // 의미 낱말 4개 정반응 — 실시된 과제라 남는다
    expect(r.wordNonsense).toBe(0)     // 무의미 7개가 O로 저장돼 있어도 미실시
    expect(r.wordReading).toBe(4)
    expect(r.sentenceReading).toBe(0)  // 36점이 저장돼 있어도 미실시
  })

  it('의미 낱말 O/X를 되돌리면 뺐던 점수가 그대로 살아난다 (파생값)', () => {
    const marks = Object.fromEntries(READ_ALL.map(c => [c, true]))
    const sentences = { rs01: 7, rs02: 7, rs03: 8, rs04: 14 }
    const r = score({ marks, sentences })
    expect([r.wordNonsense, r.sentenceReading]).toEqual([7, 36])
  })

  it('중단이 없으면 discontinued는 전부 false — Pass/Fail 경로가 그대로다', () => {
    expect(score({}).discontinued)
      .toEqual({ wordReading: false, sentenceReading: false, writing: false })
  })

  // 항목 10 — 검사자가 2번 이후를 먼저 채점하고 1번을 마지막에 오반응으로 찍은 세션이
  // 실제로 저장돼 있다(운영 DB 899b51db: ww01=X, ww02~10=O).
  it('② 세션: 중단 이후 문항에 값이 남아 있어도 총점에 더하지 않는다', () => {
    const r = score({ writing: { ww01: 0, ww02: 1, ww03: 1, ww04: 1, ww05: 1, ww06: 1, ww07: 1, ww08: 1, ww09: 1, ww10: 1 } })
    expect(r.writing).toBe(0)
    expect([r.writeMeaning, r.writeNonsense]).toEqual([0, 0])
    expect(r.discontinued.writing).toBe(true)
  })

  it('② 세션(G2)도 같다 — 첫 문장 0점이면 2~5번 어절 점수는 총점에서 빠진다', () => {
    const r = score({ writing: { sw01: 0, sw02: 2, sw03: 2, sw04: 2, sw05: 2 } }, G2)
    expect(r.writing).toBe(0)
  })

  it('1번이 정반응이면 뒤 문항이 모두 합산된다 (절삭이 정상 경로를 건드리지 않는다)', () => {
    const all = Object.fromEntries(WRITE_ALL.map(c => [c, 1]))
    expect(score({ writing: all }).writing).toBe(10)
  })
})

describe('sheetPdfGate — 채점이 끝나기 전에는 공식 PDF를 내려받지 않는다', () => {
  const ALL_MARKS = Object.fromEntries(READ_ALL.map(c => [c, true]))
  const ALL_SENT = Object.fromEntries(g1.sentenceItems.map(i => [i.code, 1]))
  const ALL_WRITE = Object.fromEntries(WRITE_ALL.map(c => [c, 1]))
  const done = score({ marks: ALL_MARKS, sentences: ALL_SENT, writing: ALL_WRITE })

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
    const gate = sheetPdfGate(score({ marks: ALL_MARKS, sentences: ALL_SENT }), false)
    expect(gate).toMatchObject({ reason: 'unscored', tasks: ['writing'], overridable: true })
  })

  it('중단으로 실시하지 않은 과제는 관문에 걸리지 않는다 (채점할 것이 없다)', () => {
    // ① 의미 낱말 첫 3개 X → 무의미·문장 미실시, ② 쓰기 1번 0점 → 쓰기도 중단
    const marks = Object.fromEntries(g1.meaningReadCodes.map((c, i) => [c, i >= 3]))
    expect(sheetPdfGate(score({ marks, writing: { ww01: 0 } }), false)).toBeNull()
  })
})

describe('withUnrecordedDefaults — 미녹음은 오반응(X·0점)으로 기본 채점 (항목 8)', () => {
  const none = () => false
  const all = () => true

  it('문장 페이지가 미녹음이면 어절 점수 0이 채워진다', () => {
    const out = withUnrecordedDefaults(g1, empty, code => code !== 'p_rs02')
    expect(out.sentences.rs02).toBe(0)
    expect(out.sentences.rs01).toBeUndefined()
  })

  it('무의미 낱말 페이지가 미녹음이면 그 7문항이 X로 채워진다', () => {
    const marks = Object.fromEntries(g1.meaningReadCodes.map(c => [c, true]))
    const out = withUnrecordedDefaults(g1, { ...empty, marks }, code => code !== 'p_rw_nonsense')
    expect(g1.nonsenseReadCodes.every(c => out.marks[c] === false)).toBe(true)
    // 이제 낱말 해독이 "채점 완료"가 되어 검사지 PDF의 총점 칸이 찍힌다
    expect(scoreSession(G1, out).complete.wordReading).toBe(true)
    expect(scoreSession(G1, out).wordReading).toBe(7)
  })

  it('저장된 채점이 있으면 덮지 않는다 (채점자의 판단이 기본값보다 우선)', () => {
    const input: ScoreInput = { marks: { rw08: true }, sentences: { rs01: 5 }, writing: {} }
    const out = withUnrecordedDefaults(g1, input, none)
    expect(out.marks.rw08).toBe(true)
    expect(out.sentences.rs01).toBe(5)
  })

  it('녹음이 다 있으면 아무것도 채우지 않는다', () => {
    expect(withUnrecordedDefaults(g1, empty, all)).toEqual(empty)
  })

  it('중단 규칙 ① 세션에서는 무의미·문장에 0점을 넣지 않는다 (미실시는 0점이 아니다)', () => {
    const marks = Object.fromEntries(g1.meaningReadCodes.map((c, i) => [c, i >= 3]))
    const out = withUnrecordedDefaults(g1, { ...empty, marks }, none)
    expect(g1.nonsenseReadCodes.every(c => out.marks[c] === undefined)).toBe(true)
    expect(g1.sentenceItems.every(i => out.sentences[i.code] === undefined)).toBe(true)
  })

  it('의미 낱말 자체가 미녹음이면 X 7개가 채워지고, 그로써 성립한 중단 이후는 비운다', () => {
    const out = withUnrecordedDefaults(g1, empty, none)
    expect(g1.meaningReadCodes.every(c => out.marks[c] === false)).toBe(true)
    expect(g1.nonsenseReadCodes.every(c => out.marks[c] === undefined)).toBe(true)
    expect(scoreSession(G1, out).discontinued.wordReading).toBe(true)
  })

  it('쓰기 과제는 손대지 않는다 (녹음이 없는 과제라 미녹음 판정 대상이 아니다)', () => {
    expect(withUnrecordedDefaults(g1, empty, none).writing).toEqual({})
  })
})
