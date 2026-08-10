import { describe, it, expect } from 'vitest'
import {
  PASS_MARK, PROVISIONAL_CRITERIA, SENTENCE_MAX, TASK_MAX, READ_MAX, WRITE_MAX,
  sentenceMaxWords, scoreSession, type ScoreInput,
} from '@/lib/scoring'
import { ITEMS, MEANING_READ_CODES, itemByCode } from '@/lib/items'

const READ_ALL = ITEMS.filter(i => i.section === 'word_reading').map(i => i.code)
const WRITE_ALL = ITEMS.filter(i => i.section === 'word_writing').map(i => i.code)

const empty: ScoreInput = { marks: {}, sentences: {}, writing: {} }

describe('배점 — 검사지 대조', () => {
  it('문장 배점은 어절 수에서 유도된다 (7·7·8·14)', () => {
    expect(sentenceMaxWords(itemByCode.get('rs01')!)).toBe(7)
    expect(sentenceMaxWords(itemByCode.get('rs02')!)).toBe(7)
    expect(sentenceMaxWords(itemByCode.get('rs03')!)).toBe(8)
    expect(sentenceMaxWords(itemByCode.get('rs04')!)).toBe(14)
  })
  it('과제별 만점: 낱말 14 · 문장 36 · 쓰기 10', () => {
    expect(TASK_MAX).toEqual({ wordReading: 14, sentenceReading: 36, wordWriting: 10 })
    expect(SENTENCE_MAX).toBe(36)
  })
  it('임시 Pass 기준이 만점보다 작고 0보다 크다 (확정 전 표시 대상)', () => {
    expect(PROVISIONAL_CRITERIA).toBe(true)
    expect(PASS_MARK.wordReading).toBeGreaterThan(0)
    expect(PASS_MARK.wordReading).toBeLessThan(TASK_MAX.wordReading)
    expect(PASS_MARK.sentenceReading).toBeLessThan(TASK_MAX.sentenceReading)
    expect(PASS_MARK.wordWriting).toBeLessThan(TASK_MAX.wordWriting)
  })
})

describe('scoreSession — 합산', () => {
  it('아무것도 채점하지 않으면 전부 0점', () => {
    const r = scoreSession(empty)
    expect(r.wordMeaning).toBe(0)
    expect(r.wordNonsense).toBe(0)
    expect(r.wordReading).toBe(0)
    expect(r.sentenceReading).toBe(0)
    expect(r.wordWriting).toBe(0)
  })

  it('낱말은 정반응(true)만 센다 — 의미/무의미를 나눠서도 집계', () => {
    const r = scoreSession({ ...empty, marks: {
      rw01: true, rw02: true, rw03: false, rw04: true,   // 의미 3점
      rw08: true, rw09: false, rw10: true,               // 무의미 2점
    } })
    expect(r.wordMeaning).toBe(3)
    expect(r.wordNonsense).toBe(2)
    expect(r.wordReading).toBe(5)
  })

  it('문장은 입력한 어절 수를 더한다', () => {
    const r = scoreSession({ ...empty, sentences: { rs01: 7, rs02: 5, rs03: 0, rs04: 10 } })
    expect(r.sentenceReading).toBe(22)
  })

  it('문장 점수는 해당 문항 만점을 넘지 못한다 (오입력 방어)', () => {
    const r = scoreSession({ ...empty, sentences: { rs01: 999 } })
    expect(r.sentenceReading).toBe(7)
  })

  it('음수 문장 점수는 0으로 본다', () => {
    expect(scoreSession({ ...empty, sentences: { rs01: -5 } }).sentenceReading).toBe(0)
  })

  it('소수·NaN·미입력·모르는 코드도 던지지 않고 안전하게 처리한다', () => {
    const r = scoreSession({ ...empty, sentences: {
      rs01: 3.7, rs02: Number.NaN, rs03: undefined, zz99: 5,
    } })
    expect(r.sentenceReading).toBe(3)
  })

  it('쓰기는 검사 중 수집한 예(true)를 1점으로 센다', () => {
    const r = scoreSession({ ...empty, writing: { ww01: true, ww02: false, ww03: true } })
    expect(r.wordWriting).toBe(2)
  })

  it('낱말 해독 만점', () => {
    const all = Object.fromEntries(
      ['rw01','rw02','rw03','rw04','rw05','rw06','rw07',
       'rw08','rw09','rw10','rw11','rw12','rw13','rw14'].map(c => [c, true]))
    expect(scoreSession({ ...empty, marks: all }).wordReading).toBe(14)
  })
})

describe('scoreSession — Pass/Fail 판정', () => {
  it('기준 이상이면 pass, 미만이면 fail', () => {
    const pass = scoreSession({ ...empty, sentences: { rs01: 7, rs02: 7, rs03: 8, rs04: 14 } })
    expect(pass.sentenceReading).toBe(36)
    expect(pass.verdict.sentenceReading).toBe('pass')
    expect(scoreSession(empty).verdict.sentenceReading).toBe('fail')
  })

  it('기준값과 정확히 같으면 pass (경계 포함)', () => {
    const marks = Object.fromEntries(
      Array.from({ length: PASS_MARK.wordReading }, (_, i) => [`rw${String(i + 1).padStart(2, '0')}`, true]))
    const r = scoreSession({ ...empty, marks })
    expect(r.wordReading).toBe(PASS_MARK.wordReading)
    expect(r.verdict.wordReading).toBe('pass')
  })

  it('과제별로 따로 판정한다', () => {
    const r = scoreSession(empty)
    expect(Object.keys(r.verdict).sort()).toEqual(['sentenceReading', 'wordReading', 'wordWriting'])
  })
})

describe('낱말 쓰기 의미/무의미 소계', () => {
  it('의미·무의미를 나눠 세고 합이 총점과 같다', () => {
    // ww01~ww05 = 의미, ww06~ww10 = 무의미
    const writing = {
      ww01: true, ww02: true, ww03: false, ww04: true, ww05: false,
      ww06: true, ww07: false, ww08: false, ww09: false, ww10: false,
    }
    const r = scoreSession({ marks: {}, sentences: {}, writing })
    expect(r.writeMeaning).toBe(3)
    expect(r.writeNonsense).toBe(1)
    expect(r.wordWriting).toBe(4)
    expect(r.writeMeaning + r.writeNonsense).toBe(r.wordWriting)
  })
  it('미응답(undefined)은 0점으로 센다', () => {
    const r = scoreSession({ marks: {}, sentences: {}, writing: {} })
    expect(r.writeMeaning).toBe(0)
    expect(r.writeNonsense).toBe(0)
    expect(r.wordWriting).toBe(0)
  })
})

describe('과제별 만점', () => {
  it('의미·무의미 만점의 합이 과제 만점과 같다', () => {
    expect(WRITE_MAX.meaning + WRITE_MAX.nonsense).toBe(TASK_MAX.wordWriting)
    expect(READ_MAX.meaning + READ_MAX.nonsense).toBe(TASK_MAX.wordReading)
  })
})

describe('채점 완료 여부 (미실시·채점 전을 0점 Fail로 표시하지 않기 위한 근거)', () => {
  const allRead = Object.fromEntries(READ_ALL.map(c => [c, true]))
  const allSent = { rs01: 7, rs02: 7, rs03: 8, rs04: 14 }
  const allWrite = Object.fromEntries(WRITE_ALL.map(c => [c, true]))

  it('갓 제출된 세션은 어느 과제도 완료가 아니다', () => {
    const r = scoreSession({ marks: {}, sentences: {}, writing: {} })
    expect(r.complete).toEqual({ wordReading: false, sentenceReading: false, wordWriting: false })
  })

  it('현장 채점(의미 7개)만 있으면 낱말 해독은 아직 미완료다', () => {
    // 무의미 낱말은 검사자가 현장에서 표시하지 않는다 — 관리자가 녹음을 듣고 채점해야 완료다.
    const meaningOnly = Object.fromEntries(MEANING_READ_CODES.map(c => [c, true]))
    const r = scoreSession({ marks: meaningOnly, sentences: {}, writing: {} })
    expect(r.wordReading).toBe(7)
    expect(r.complete.wordReading).toBe(false)
  })

  it('전부 채점하면 완료로 바뀐다', () => {
    const r = scoreSession({ marks: allRead, sentences: allSent, writing: allWrite })
    expect(r.complete).toEqual({ wordReading: true, sentenceReading: true, wordWriting: true })
  })

  it('중단 규칙 ①: 문장·낱말 쓰기를 실시하지 않은 세션은 그 과제가 완료가 아니다', () => {
    // 첫 3개 의미 낱말 오반응 → 문장·쓰기 미실시. 낱말 해독 자체는 무의미까지 실시된다.
    const marks = { ...allRead, rw01: false, rw02: false, rw03: false }
    const r = scoreSession({ marks, sentences: {}, writing: {} })
    expect(r.complete.wordReading).toBe(true)
    expect(r.complete.sentenceReading).toBe(false)
    expect(r.complete.wordWriting).toBe(false)
    // 점수는 0이지만 완료가 아니므로 화면·인쇄물은 이 0을 확정값으로 쓰지 않는다.
    expect(r.sentenceReading).toBe(0)
  })

  it('중단 규칙 ②: 낱말 쓰기 앞 3개만 요구되면 그것만 채워도 완료다', () => {
    const writing = { ww01: false, ww02: false, ww03: false }
    const r = scoreSession({ marks: allRead, sentences: allSent, writing })
    expect(r.complete.wordWriting).toBe(true)
  })

  it('문장 하나라도 비면 미완료다', () => {
    const r = scoreSession({ marks: allRead, sentences: { rs01: 7, rs02: 7, rs03: 8 }, writing: allWrite })
    expect(r.complete.sentenceReading).toBe(false)
  })
})
