import { describe, it, expect } from 'vitest'
import { ITEMS, RECORDING_ITEMS, WRITING_ITEMS, CHECKLIST_AREAS, itemByCode } from '@/lib/items'

describe('ITEMS (KODYS-G1)', () => {
  it('총 29문항, orderNo 1~29 연속', () => {
    expect(ITEMS).toHaveLength(29)
    ITEMS.forEach((item, i) => expect(item.orderNo).toBe(i + 1))
  })
  it('code 중복 없음', () => {
    expect(new Set(ITEMS.map(i => i.code)).size).toBe(29)
  })
  it('섹션별 문항 수: 낱말해독 14, 문장 4, 쓰기 10, 체크리스트 1', () => {
    const count = (s: string) => ITEMS.filter(i => i.section === s).length
    expect(count('word_reading')).toBe(14)
    expect(count('sentence_reading')).toBe(4)
    expect(count('word_writing')).toBe(10)
    expect(count('checklist')).toBe(1)
  })
  it('녹음 제한시간: 낱말 30초, 문장 40초, 그 외 0', () => {
    ITEMS.forEach(i => {
      if (i.section === 'word_reading') expect(i.maxSec).toBe(30)
      else if (i.section === 'sentence_reading') expect(i.maxSec).toBe(40)
      else expect(i.maxSec).toBe(0)
    })
  })
  it('PDF 문구 대조 (표본)', () => {
    expect(itemByCode.get('rw01')!.text).toBe('어디')
    expect(itemByCode.get('rw08')!.text).toBe('아로')
    expect(itemByCode.get('rw14')!.text).toBe('봉밥')
    expect(itemByCode.get('rs01')!.text).toBe('아이가 아빠와 우유 사러 가서 고기도 사요.')
    expect(itemByCode.get('rs04')!.text).toContain('사과를 했어요')
    expect(itemByCode.get('ww01')!.text).toBe('우비')
    expect(itemByCode.get('ww06')!.text).toBe('오거')
  })
  it('의미/무의미 구분', () => {
    expect(itemByCode.get('rw07')!.kind).toBe('meaning')
    expect(itemByCode.get('rw08')!.kind).toBe('nonsense')
    expect(itemByCode.get('ww05')!.kind).toBe('meaning')
    expect(itemByCode.get('ww10')!.kind).toBe('nonsense')
  })
  it('파생 목록: 녹음 18, 쓰기 10', () => {
    expect(RECORDING_ITEMS).toHaveLength(18)
    expect(WRITING_ITEMS).toHaveLength(10)
  })
  it('체크리스트 영역 5개 (PDF 순서)', () => {
    expect(CHECKLIST_AREAS.map(a => a.label)).toEqual(
      ['특이사항 없음', '인지', '언어 (이해/표현)', '말 (조음/유창성)', '주의력'])
  })
})
