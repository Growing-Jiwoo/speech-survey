import { describe, it, expect } from 'vitest'
import {
  ITEMS, ITEM_TOTALS, RECORDING_ITEMS, WRITING_ITEMS, CHECKLIST_AREAS,
  areaLabel, isRecordingItem, itemByCode, toggleChecklistArea,
  PAGES, RECORDING_PAGES, pageByCode, isRecordingPage, maxRecSec,
  GRACE_SEC, MEANING_READ_CODES, MEANING_WRITE_CODES,
} from '@/lib/items'

describe('ITEMS', () => {
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
    expect(itemByCode.get('rw14')!.text).toBe('붕밥')
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
  it('isRecordingItem은 RECORDING_ITEMS 필터와 동일한 술어', () => {
    expect(ITEMS.filter(isRecordingItem)).toEqual(RECORDING_ITEMS)
    expect(isRecordingItem(itemByCode.get('rw01')!)).toBe(true)
    expect(isRecordingItem(itemByCode.get('ww01')!)).toBe(false)
  })
  it('areaLabel 미지 코드는 코드 그대로 반환 (구버전 데이터 표시 안전망)', () => {
    expect(areaLabel('speech')).toBe('말 (조음/유창성)')
    expect(areaLabel('unknown-code')).toBe('unknown-code')
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

describe('toggleChecklistArea (배타 선택)', () => {
  it('none 선택 시 나머지 모두 해제', () => {
    expect(toggleChecklistArea(['cognition', 'language'], 'none')).toEqual(['none'])
  })
  it('none 재선택 시 해제', () => {
    expect(toggleChecklistArea(['none'], 'none')).toEqual([])
  })
  it('영역 선택 시 none 제거 후 추가', () => {
    expect(toggleChecklistArea(['none'], 'cognition')).toEqual(['cognition'])
  })
  it('영역 토글 (있으면 제거)', () => {
    expect(toggleChecklistArea(['cognition', 'speech'], 'cognition')).toEqual(['speech'])
  })
  it('영역 추가는 기존 유지 + append', () => {
    expect(toggleChecklistArea(['cognition'], 'speech')).toEqual(['cognition', 'speech'])
  })
})

describe('PAGES (화면·녹음 단위)', () => {
  it('페이지 순서와 코드 — 연습→의미→현장채점→무의미→문장4→쓰기→체크리스트', () => {
    expect(PAGES.map(p => p.code)).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_meaning_mark', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_ww', 'p_cl',
    ])
  })

  it('page.code 중복 없음', () => {
    expect(new Set(PAGES.map(p => p.code)).size).toBe(PAGES.length)
  })

  it('낱말 해독 페이지는 의미 7개 / 무의미 7개를 묶는다', () => {
    expect(pageByCode.get('p_rw_meaning')!.items.map(i => i.text))
      .toEqual(['어디', '바지', '양보', '그늘', '설탕', '장갑', '방법'])
    expect(pageByCode.get('p_rw_nonsense')!.items.map(i => i.text))
      .toEqual(['아로', '부림', '영추', '주곡', '구말', '솔텅', '붕밥'])
  })

  it('문장 페이지는 문장 1개씩', () => {
    expect(pageByCode.get('p_rs01')!.items.map(i => i.code)).toEqual(['rs01'])
    expect(pageByCode.get('p_rs04')!.items[0].text).toContain('사과를 했어요')
  })

  it('쓰기 페이지는 낱말 10개를 한 번에 묶는다', () => {
    expect(pageByCode.get('p_ww')!.items).toHaveLength(10)
    expect(pageByCode.get('p_ww')!.items[0].text).toBe('우비')
  })

  it('제한 시간(검사지 기준): 낱말 30초, 문장 40초, 비녹음 0초', () => {
    expect(pageByCode.get('p_rw_meaning')!.limitSec).toBe(30)
    expect(pageByCode.get('p_rw_nonsense')!.limitSec).toBe(30)
    expect(pageByCode.get('p_rs01')!.limitSec).toBe(40)
    expect(pageByCode.get('p_ww')!.limitSec).toBe(0)
    expect(pageByCode.get('p_cl')!.limitSec).toBe(0)
  })

  it('녹음 자동 종료 = 제한 + 여유(GRACE_SEC)', () => {
    expect(GRACE_SEC).toBe(5)
    expect(maxRecSec(pageByCode.get('p_rw_meaning')!)).toBe(35)
    expect(maxRecSec(pageByCode.get('p_rs01')!)).toBe(45)
  })

  it('연습 페이지는 practice=true이고 본 문항과 낱말이 겹치지 않는다', () => {
    const practice = pageByCode.get('p_practice_rw')!
    expect(practice.practice).toBe(true)
    const realTexts = new Set(ITEMS.map(i => i.text))
    practice.items.forEach(i => expect(realTexts.has(i.text)).toBe(false))
  })

  it('현장 채점 페이지는 검사자용(role=examiner)이며 의미 낱말 7개를 다룬다', () => {
    const mark = pageByCode.get('p_rw_meaning_mark')!
    expect(mark.role).toBe('examiner')
    expect(mark.items.map(i => i.code)).toEqual(MEANING_READ_CODES)
    expect(MEANING_READ_CODES).toHaveLength(7)
  })

  it('아동 조작 페이지 / 검사자 조작 페이지 구분', () => {
    const roleOf = (c: string) => pageByCode.get(c)!.role
    expect(roleOf('p_rw_meaning')).toBe('child')
    expect(roleOf('p_rs01')).toBe('child')
    expect(roleOf('p_ww')).toBe('examiner')
    expect(roleOf('p_cl')).toBe('examiner')
  })

  it('RECORDING_PAGES는 업로드 대상만 — 연습 제외 6페이지', () => {
    expect(RECORDING_PAGES.map(p => p.code))
      .toEqual(['p_rw_meaning', 'p_rw_nonsense', 'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04'])
    expect(RECORDING_PAGES.every(p => !p.practice)).toBe(true)
    expect(isRecordingPage(pageByCode.get('p_ww')!)).toBe(false)
  })

  it('ITEM_TOTALS 분모는 페이지 기준(녹음 6, 쓰기 10)', () => {
    expect(ITEM_TOTALS).toEqual({ rec: 6, write: 10 })
  })

  it('의미 낱말 코드 목록 (중단 규칙 판정에 쓰임)', () => {
    expect(MEANING_READ_CODES).toEqual(['rw01', 'rw02', 'rw03', 'rw04', 'rw05', 'rw06', 'rw07'])
    expect(MEANING_WRITE_CODES).toEqual(['ww01', 'ww02', 'ww03', 'ww04', 'ww05'])
  })

  it('연습 낱말은 담당자가 확정한 쉬운 실제 낱말이다', () => {
    // 무의미 낱말이 아니라 쉬운 실제 낱말을 쓴다 — "낱말이 쭉 있는 화면"에 익숙해지는 것이 목적이라
    // 연습에서까지 낯선 무의미 낱말을 주면 오히려 당황시킨다.
    // 길이만 검사하면 '붕밥'·'솔텅' 같은 무의미 낱말도 통과해 이 의도를 전혀 지키지 못한다.
    // 값을 고정해 바꾸려면 반드시 의도적으로 바꾸게 한다.
    expect(pageByCode.get('p_practice_rw')!.items.map(i => i.text)).toEqual(['나무', '구름', '바다'])
  })

  it('WRITING_ITEMS 앞 3개는 의미 낱말이다 (역사적 불변식 — WritingPage는 이제 코드 기반으로 동작해 이 순서에 의존하지 않지만, 데이터 구성 의도를 문서화한다)', () => {
    expect(WRITING_ITEMS.slice(0, 3).every(i => i.kind === 'meaning')).toBe(true)
  })
})
