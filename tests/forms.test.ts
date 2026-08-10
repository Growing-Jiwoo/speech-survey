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

/**
 * 종이 검사지(PDF)의 텍스트를 그대로 옮겨 적은 고정값.
 * 검사지에서 pdfjs로 추출해 400dpi 렌더링과 대조한 값이며, 아래 두 값은 눈으로 구분이 어렵다:
 *   붕밥(U+BD95) ↔ 봉밥(U+BD09)  ― 실제로 '봉밥'으로 잘못 들어가 있던 것을 2026-08-10에 바로잡았다.
 * 무의미 낱말은 뜻으로 유추할 수 없어 오타가 나도 코드 리뷰로 걸러지지 않으므로,
 * 검사지가 개정되지 않는 한 이 배열은 손대지 않는다(개정 시 PDF 재추출 후 함께 교체).
 */
const SHEET_G1 = {
  readMeaning: ['어디', '바지', '양보', '그늘', '설탕', '장갑', '방법'],
  readNonsense: ['아로', '부림', '영추', '주곡', '구말', '솔텅', '붕밥'],
  writeMeaning: ['우비', '까치', '수박', '동상', '생각'],
  writeNonsense: ['오거', '끼추', '소벅', '당송', '갈먹'],
  sentences: [
    '아이가 아빠와 우유 사러 가서 고기도 사요.',
    '스라소니가 피리 가져오고 개구리가 해바라기 가지고 와요.',
    '다람쥐가 두꺼비를 보고 도망가요 그래서 부엉이가 다람쥐를 숨겨줘요.',
    '쉬는시간에 친구가 나에게 장난을 계속 쳐서 다투었어요.\n학교가 끝난 후에 친구가 다가와서 사과를 했어요.',
  ],
} as const

describe('G1 문항이 종이 검사지와 글자 단위로 같다', () => {
  const g1 = formForGrade(1)
  for (const key of ['readMeaning', 'readNonsense', 'writeMeaning', 'writeNonsense', 'sentences'] as const) {
    it(key, () => {
      expect(g1[key]).toEqual([...SHEET_G1[key]])
    })
  }
})
