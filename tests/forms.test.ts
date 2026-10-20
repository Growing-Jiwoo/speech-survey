import { describe, it, expect } from 'vitest'
import { DEFAULT_FORM, FORMS, formForGrade } from '@/lib/forms'
import { itemsFor } from '@/lib/items'

describe('formForGrade', () => {
  it('1학년은 KODYS-G1, 2학년은 KODYS-G2', () => {
    expect(formForGrade(1).id).toBe('KODYS-G1')
    expect(formForGrade(2).id).toBe('KODYS-G2')
  })
  it('담당 양식이 없는 학년은 기본 양식으로 폴백한다', () => {
    // 3~6학년 검사지를 아직 받지 못했다. 결과지·인쇄물에 form.id가 찍혀 드러난다.
    expect(formForGrade(3)).toBe(DEFAULT_FORM)
    expect(formForGrade(6)).toBe(DEFAULT_FORM)
  })
  it('모든 양식의 담당 학년은 서로 겹치지 않는다', () => {
    const seen = new Set<number>()
    for (const f of FORMS) for (const g of f.grades) {
      expect(seen.has(g)).toBe(false)
      seen.add(g)
    }
  })
  it('양식 id는 서로 다르다 (결과지 표기가 구분되어야 한다)', () => {
    expect(new Set(FORMS.map(f => f.id)).size).toBe(FORMS.length)
  })
})

describe('양식 정의와 문항의 정합', () => {
  it('낱말 해독은 두 양식 모두 의미 7 + 무의미 7', () => {
    for (const f of FORMS) {
      expect(f.readMeaning).toHaveLength(7)
      expect(f.readNonsense).toHaveLength(7)
    }
  })
  it('G1 낱말 쓰기는 의미 5 + 무의미 5, G2 문장 쓰기는 5문항', () => {
    const g1 = formForGrade(1).writing
    const g2 = formForGrade(2).writing
    expect(g1.kind).toBe('word')
    if (g1.kind === 'word') {
      expect(g1.meaning).toHaveLength(5)
      expect(g1.nonsense).toHaveLength(5)
    }
    expect(g2.kind).toBe('sentence')
    if (g2.kind === 'sentence') expect(g2.sentences).toHaveLength(5)
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
