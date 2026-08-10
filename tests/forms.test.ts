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
  it('좌표(layout)의 쓰기 종류가 양식의 쓰기 과제와 짝이 맞는다', () => {
    // 어긋나면 인쇄물에 다른 과제의 좌표로 점수가 찍힌다.
    for (const form of FORMS) expect(form.layout.writing.kind).toBe(form.writing.kind)
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

/** 초등 2학년 선별검사 양식(가안). 무의미 낱말은 특히 눈으로 오타를 잡을 수 없다 —
 *  닺고(U+B2FA) · 앍아(U+C54D) · 딻아(U+B53B)처럼 낯선 받침이 많다. */
const SHEET_G2 = {
  readMeaning: ['친구', '무엇', '작품', '친척', '젖다', '닮다', '짧은'],
  readNonsense: ['고춘', '삭핌', '찬축', '닺고', '구말', '앍아', '딻아'],
  sentences: [
    '오늘 부모님께서 학교에 오셔서 담임 선생님과 인사하셨어요.',
    '바자회를 열어서 오랫동안 사용하지 않은 물건을 팔기로 결심했어요.',
    '승엽이는 수업시간에 수학 문제를 풀었고 친구들 앞에서 발표도 했어요.',
    '체험학습으로 넓은 경기장을 방문했습니다.\n조명이 밝아서 경기장 전체를 들여다볼 수 있었습니다.',
  ],
  writeSentences: ['집으로 와요', '글씨를 씁니다', '냄새를 맡다', '책상이 넓어요', '뛰지 않아요'],
} as const

describe('G1 문항이 종이 검사지와 글자 단위로 같다', () => {
  const g1 = formForGrade(1)
  for (const key of ['readMeaning', 'readNonsense', 'sentences'] as const) {
    it(key, () => expect(g1[key]).toEqual([...SHEET_G1[key]]))
  }
  it('writeMeaning / writeNonsense', () => {
    expect(g1.writing).toEqual({
      kind: 'word',
      meaning: [...SHEET_G1.writeMeaning],
      nonsense: [...SHEET_G1.writeNonsense],
    })
  })
})

describe('G2 문항이 종이 검사지와 글자 단위로 같다', () => {
  const g2 = formForGrade(2)
  for (const key of ['readMeaning', 'readNonsense', 'sentences'] as const) {
    it(key, () => expect(g2[key]).toEqual([...SHEET_G2[key]]))
  }
  it('문장 쓰기', () => {
    expect(g2.writing).toEqual({ kind: 'sentence', sentences: [...SHEET_G2.writeSentences] })
  })
  it('검사지에 인쇄된 배점과 문항 어절 수가 일치한다', () => {
    // 검사지: 문장 읽기유창성 /7 /8 /9 /11 (총 /35), 문장 쓰기 각 0·1·2 (총 /10)
    expect(g2.sentences.map(s => s.trim().split(/\s+/).length)).toEqual([7, 8, 9, 11])
    expect(SHEET_G2.writeSentences.map(s => s.split(/\s+/).length)).toEqual([2, 2, 2, 2, 2])
  })
})
