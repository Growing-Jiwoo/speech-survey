import { describe, it, expect } from 'vitest'
import { DEFAULT_FORM, FORMS, formForGrade } from '@/lib/forms'
import { ITEMS } from '@/lib/items'

describe('formForGrade', () => {
  it('1학년은 KODYS-G1', () => {
    expect(formForGrade(1).id).toBe('KODYS-G1')
  })
  it('담당 양식이 없는 학년은 기본 양식으로 폴백한다', () => {
    // 검사 진행 흐름이 단일 양식이라, 3학년 세션도 실제로는 G1 문항으로 검사받았다.
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
})

describe('G1 정의와 ITEMS의 정합', () => {
  const g1 = formForGrade(1)
  it('낱말 해독은 의미 7 + 무의미 7', () => {
    expect(g1.readMeaning).toHaveLength(7)
    expect(g1.readNonsense).toHaveLength(7)
  })
  it('낱말 쓰기는 의미 5 + 무의미 5', () => {
    expect(g1.writeMeaning).toHaveLength(5)
    expect(g1.writeNonsense).toHaveLength(5)
  })
  it('ITEMS의 제시어가 양식과 같은 순서로 만들어진다', () => {
    const readText = ITEMS.filter(i => i.section === 'word_reading').map(i => i.text)
    expect(readText).toEqual([...g1.readMeaning, ...g1.readNonsense])
    const writeText = ITEMS.filter(i => i.section === 'word_writing').map(i => i.text)
    expect(writeText).toEqual([...g1.writeMeaning, ...g1.writeNonsense])
  })
})
