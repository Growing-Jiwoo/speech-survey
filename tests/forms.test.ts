import { describe, it, expect } from 'vitest'
import { DEFAULT_FORM, FORMS, formFor, formForGrade, formOfSession } from '@/lib/forms'
import { itemsFor } from '@/lib/items'

describe('formForGrade — 학년만으로 고르던 옛 규칙(form_id 없는 세션)', () => {
  it('1학년은 KODYS-G1, 2학년은 KODYS-G2', () => {
    expect(formForGrade(1).id).toBe('KODYS-G1')
    expect(formForGrade(2).id).toBe('KODYS-G2')
  })
  it('담당 양식이 없는 학년은 기본 양식으로 폴백한다', () => {
    // 3~6학년 검사지를 아직 받지 못했다. 결과지·인쇄물에 form.id가 찍혀 드러난다.
    expect(formForGrade(3)).toBe(DEFAULT_FORM)
    expect(formForGrade(6)).toBe(DEFAULT_FORM)
  })
  it('같은 학기 안에서 양식의 담당 학년은 서로 겹치지 않는다', () => {
    const seen = new Set<string>()
    for (const f of FORMS) for (const g of f.grades) {
      expect(seen.has(`${f.semester}-${g}`)).toBe(false)
      seen.add(`${f.semester}-${g}`)
    }
  })
  it('양식 id는 서로 다르다 (결과지 표기가 구분되어야 한다)', () => {
    expect(new Set(FORMS.map(f => f.id)).size).toBe(FORMS.length)
  })
})

describe('formFor — 새 세션의 양식(학년 · 검사일의 학기)', () => {
  it('1·2학년 2학기는 2학기 양식, 1학기는 기존 양식', () => {
    expect(formFor(1, 2).id).toBe('KODYS-G1-S2')
    expect(formFor(2, 2).id).toBe('KODYS-G2-S2')
    expect(formFor(1, 1).id).toBe('KODYS-G1')
    expect(formFor(2, 1).id).toBe('KODYS-G2')
  })
  it('담당 양식이 없는 학년은 같은 학기의 1학년 양식으로 폴백한다', () => {
    expect(formFor(3, 2)).toBe(formFor(1, 2))
    expect(formFor(6, 1)).toBe(formFor(1, 1))
  })
})

describe('formOfSession — 세션 행의 form_id(migration 008)', () => {
  it('form_id가 있으면 학년과 무관하게 그 양식이다 — 학기가 바뀌어도 끝난 검사의 문항은 그대로', () => {
    expect(formOfSession({ grade: 1, form_id: 'KODYS-G1' }).id).toBe('KODYS-G1')
    expect(formOfSession({ grade: 1, form_id: 'KODYS-G1-S2' }).id).toBe('KODYS-G1-S2')
    expect(formOfSession({ grade: 3, form_id: 'KODYS-G1-S2' }).id).toBe('KODYS-G1-S2')
  })
  it('form_id가 없으면(migration 008 이전 세션) 학년만으로 고르던 옛 규칙으로 읽는다', () => {
    expect(formOfSession({ grade: 2, form_id: null })).toBe(formForGrade(2))
    expect(formOfSession({ grade: 1 })).toBe(formForGrade(1))
  })
  it('모르는 form_id는 다른 양식으로 그리지 않고 던진다', () => {
    expect(() => formOfSession({ grade: 1, form_id: 'KODYS-G9' })).toThrow()
  })
  it('migration 008의 채우기 값이 실제 양식 id다', () => {
    expect(FORMS.map(f => f.id)).toEqual(expect.arrayContaining(['KODYS-G1', 'KODYS-G2']))
  })
})

describe('양식 정의와 문항의 정합', () => {
  it('낱말 해독은 두 양식 모두 의미 7 + 무의미 7', () => {
    for (const f of FORMS) {
      expect(f.readMeaning).toHaveLength(7)
      expect(f.readNonsense).toHaveLength(7)
    }
  })
  it('1학년 낱말 쓰기는 의미 5 + 무의미 5, 2학년 문장 쓰기는 5문항 — 두 학기 모두', () => {
    for (const sem of [1, 2] as const) {
      const g1 = formFor(1, sem).writing
      const g2 = formFor(2, sem).writing
      expect(g1.kind).toBe('word')
      if (g1.kind === 'word') {
        expect(g1.meaning).toHaveLength(5)
        expect(g1.nonsense).toHaveLength(5)
      }
      expect(g2.kind).toBe('sentence')
      if (g2.kind === 'sentence') expect(g2.sentences).toHaveLength(5)
    }
  })
  it('모든 양식이 문장 4개다(2학기 원본의 빠진 번호는 번호를 잘못 매긴 것 — 담당자 2026-10-20)', () => {
    for (const f of FORMS) expect(f.sentences).toHaveLength(4)
  })
  it('문장별 제한 시간이 문장마다 하나씩 있다 — 1학기 20·20·20·20, 2학기 20·20·30·30(담당자 확정 2026-10-20)', () => {
    for (const f of FORMS) expect(f.limits.sentenceSec).toHaveLength(f.sentences.length)
    expect(formFor(1, 1).limits.sentenceSec).toEqual([20, 20, 20, 20])
    expect(formFor(1, 2).limits.sentenceSec).toEqual([20, 20, 30, 30])
    expect(formFor(2, 2).limits.sentenceSec).toEqual([20, 20, 30, 30])
  })
  it('문항의 제시어가 양식과 같은 순서로 만들어진다', () => {
    for (const form of FORMS) {
      const f = itemsFor(form)
      expect(f.readItems.map(i => i.text)).toEqual([...form.readMeaning, ...form.readNonsense])
      expect(f.sentenceItems.map(i => i.text)).toEqual([...form.sentences])
      const w = form.writing
      expect(f.writingItems.map(i => i.text))
        .toEqual(w.kind === 'word' ? [...w.meaning, ...w.nonsense] : [...w.sentences])
    }
  })
})

// 문항 글자를 검사지와 글자 단위로 대조하는 테스트는 tests/forms-sealed.test.ts에 있다 — 실제 문항은 암호문이라
// 키(FORMS_KEY)가 있을 때만 돈다. 여기 양식은 키가 없으면 공개용 가짜 문항이므로 모양만 본다.
describe('공개 양식(가짜 문항)의 모양 = 실제 검사지의 모양', () => {
  it('문장 어절 수 — G1 7·7·8·14(/36) · G2 7·8·9·11(/35), 문장 쓰기 전부 2어절', () => {
    const words = (s: string) => s.trim().split(/\s+/).length
    expect(formForGrade(1).sentences.map(words)).toEqual([7, 7, 8, 14])
    expect(formForGrade(2).sentences.map(words)).toEqual([7, 8, 9, 11])
    const w2 = formForGrade(2).writing
    expect(w2.kind === 'sentence' && w2.sentences.map(words)).toEqual([2, 2, 2, 2, 2])
  })
})

describe('2학기 공개 양식(가짜 문항)의 모양과 기준표', () => {
  const words = (s: string) => s.trim().split(/\s+/).length
  it('1학년 2학기 — 문장 어절 7·8·15·18(/48), 낱말 쓰기 5·5', () => {
    const f = formFor(1, 2)
    expect(f.sentences.map(words)).toEqual([7, 8, 15, 18])
    expect(f.writing.kind === 'word' && [f.writing.meaning.length, f.writing.nonsense.length]).toEqual([5, 5])
  })
  it('2학년 2학기 — 문장 어절 8·9·11·17(/45), 문장 쓰기 전부 2어절', () => {
    const f = formFor(2, 2)
    expect(f.sentences.map(words)).toEqual([8, 9, 11, 17])
    expect(f.writing.kind === 'sentence' && f.writing.sentences.map(words)).toEqual([2, 2, 2, 2, 2])
  })
  it('기준표(담당자 최종 2026-10-20) — 1학년 해독 ≤12/≤9 · 읽기유창성 ≤8.12/≤5.43 · 쓰기 ≤7/≤4', () => {
    expect(formFor(1, 2).cutoff).toEqual({
      wordReading: { caution: 12, risk: 9 }, sentenceReading: { caution: 8.12, risk: 5.43 }, writing: { caution: 7, risk: 4 },
    })
  })
  it('기준표(담당자 최종 2026-10-20) — 2학년 해독 ≤7/≤6 · 읽기유창성 ≤8.04/≤7.10 · 쓰기 ≤5/≤4', () => {
    expect(formFor(2, 2).cutoff).toEqual({
      wordReading: { caution: 7, risk: 6 }, sentenceReading: { caution: 8.04, risk: 7.1 }, writing: { caution: 5, risk: 4 },
    })
  })
})
