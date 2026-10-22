import { describe, it, expect } from 'vitest'
import {
  CHECKLIST_AREAS, GRACE_SEC, areaLabel, isRecordingPage, itemsFor, maxRecSec,
  pageLabel, sentenceFitEm, toggleChecklistArea,
} from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const g1 = itemsFor(formForGrade(1))
const g2 = itemsFor(formForGrade(2))

describe('itemsFor — 양식별 문항', () => {
  it('같은 양식은 같은 묶음을 돌려준다 (React 의존성 배열·=== 비교 안정성)', () => {
    expect(itemsFor(formForGrade(1))).toBe(g1)
    expect(g2).not.toBe(g1)
  })

  it('G1: 총 29문항 / G2: 총 24문항, orderNo 1..N 연속', () => {
    expect(g1.items).toHaveLength(29)
    expect(g2.items).toHaveLength(24)
    for (const f of [g1, g2]) f.items.forEach((item, i) => expect(item.orderNo).toBe(i + 1))
  })

  it('code 중복 없음', () => {
    for (const f of [g1, g2]) expect(new Set(f.items.map(i => i.code)).size).toBe(f.items.length)
  })

  it('섹션별 문항 수 — G1은 낱말 쓰기 10, G2는 문장 쓰기 5', () => {
    const count = (f: typeof g1, s: string) => f.items.filter(i => i.section === s).length
    expect(count(g1, 'word_reading')).toBe(14)
    expect(count(g1, 'sentence_reading')).toBe(4)
    expect(count(g1, 'word_writing')).toBe(10)
    expect(count(g1, 'sentence_writing')).toBe(0)
    expect(count(g1, 'checklist')).toBe(1)

    expect(count(g2, 'word_reading')).toBe(14)
    expect(count(g2, 'sentence_reading')).toBe(4)
    expect(count(g2, 'word_writing')).toBe(0)
    expect(count(g2, 'sentence_writing')).toBe(5)
    expect(count(g2, 'checklist')).toBe(1)
  })

  it('쓰기 과제 문항 코드는 양식끼리 네임스페이스가 겹치지 않는다', () => {
    expect(g1.writingItems.map(i => i.code)).toEqual(
      ['ww01', 'ww02', 'ww03', 'ww04', 'ww05', 'ww06', 'ww07', 'ww08', 'ww09', 'ww10'])
    expect(g2.writingItems.map(i => i.code)).toEqual(['sw01', 'sw02', 'sw03', 'sw04', 'sw05'])
  })

  // 낱말 30초·문장 40초(검사지 인쇄값)가 아니라 페이지당 20초다 — 담당자 확정(2026-09-21).
  // 근거는 lib/forms/g1.ts의 limits 주석: 인쇄값은 한 화면에 다 제시할 때의 시간이고,
  // 이 앱은 페이지를 쪼개므로 페이지당으로 재배분했다.
  it('녹음 제한시간: 낱말 20초, 문장 20초, 그 외 0', () => {
    for (const f of [g1, g2]) f.items.forEach(i => {
      if (i.section === 'word_reading') expect(i.maxSec).toBe(20)
      else if (i.section === 'sentence_reading') expect(i.maxSec).toBe(20)
      else expect(i.maxSec).toBe(0)
    })
  })

  it('문항 코드는 양식 배열의 자리 순서대로 붙는다 — 낱말은 의미 다음 무의미(rw01~07 · rw08~14)', () => {
    // 문항 글자 자체의 대조는 실제 문항으로 tests/forms-sealed.test.ts가 한다(여기 양식은 공개용 가짜 문항일 수 있다).
    for (const [f, form] of [[g1, formForGrade(1)], [g2, formForGrade(2)]] as const) {
      expect(f.byCode.get('rw01')!.text).toBe(form.readMeaning[0])
      expect(f.byCode.get('rw08')!.text).toBe(form.readNonsense[0])
      expect(f.byCode.get('rw14')!.text).toBe(form.readNonsense[6])
      expect(f.byCode.get('rs01')!.text).toBe(form.sentences[0])
      expect(f.byCode.get('rs04')!.text).toBe(form.sentences[3])
    }
    const w1 = formForGrade(1).writing, w2 = formForGrade(2).writing
    if (w1.kind !== 'word' || w2.kind !== 'sentence') throw new Error('쓰기 과제 종류')
    expect(g1.byCode.get('ww01')!.text).toBe(w1.meaning[0])
    expect(g1.byCode.get('ww06')!.text).toBe(w1.nonsense[0])
    expect(g2.byCode.get('sw01')!.text).toBe(w2.sentences[0])
    expect(g2.byCode.get('sw05')!.text).toBe(w2.sentences[4])
  })

  it('의미/무의미 구분 — 문장 쓰기 문항은 구분이 없다', () => {
    expect(g1.byCode.get('rw07')!.kind).toBe('meaning')
    expect(g1.byCode.get('rw08')!.kind).toBe('nonsense')
    expect(g1.byCode.get('ww05')!.kind).toBe('meaning')
    expect(g1.byCode.get('ww10')!.kind).toBe('nonsense')
    expect(g2.byCode.get('sw01')!.kind).toBeNull()
    expect(g2.meaningWriteCodes).toEqual([])
    expect(g2.nonsenseWriteCodes).toEqual([])
  })

  it('areaLabel 미지 코드는 코드 그대로 반환 (구버전 데이터 표시 안전망)', () => {
    expect(areaLabel('speech')).toBe('말 (조음/유창성)')
    expect(areaLabel('unknown-code')).toBe('unknown-code')
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

describe('pages (화면·녹음 단위)', () => {
  it('페이지 순서와 코드 — 연습→의미→무의미→문장4→쓰기→체크리스트', () => {
    expect(g1.pages.map(p => p.code)).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_ww', 'p_cl',
    ])
    // G2는 쓰기 페이지만 다르다 — 문장 쓰기이므로 p_sw
    expect(g2.pages.map(p => p.code)).toEqual([
      'p_practice_rw', 'p_rw_meaning', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_sw', 'p_cl',
    ])
  })

  it('page.code 중복 없음', () => {
    for (const f of [g1, g2]) expect(new Set(f.pages.map(p => p.code)).size).toBe(f.pages.length)
  })

  it('낱말 해독 페이지는 의미 7개 / 무의미 7개를 묶는다', () => {
    for (const [f, form] of [[g1, formForGrade(1)], [g2, formForGrade(2)]] as const) {
      expect(f.pageByCode.get('p_rw_meaning')!.items.map(i => i.text)).toEqual([...form.readMeaning])
      expect(f.pageByCode.get('p_rw_nonsense')!.items.map(i => i.text)).toEqual([...form.readNonsense])
      expect(form.readMeaning).toHaveLength(7)
      expect(form.readNonsense).toHaveLength(7)
    }
  })

  it('문장 페이지는 문장 1개씩', () => {
    expect(g1.pageByCode.get('p_rs01')!.items.map(i => i.code)).toEqual(['rs01'])
    expect(g1.pageByCode.get('p_rs04')!.items[0].text).toBe(formForGrade(1).sentences[3])
  })

  it('쓰기 페이지는 문항 전체를 한 번에 묶는다', () => {
    expect(g1.pageByCode.get('p_ww')!.items).toHaveLength(10)
    expect(g1.pageByCode.get('p_ww')!.items[0].text).toBe(g1.writingItems[0].text)
    expect(g2.pageByCode.get('p_sw')!.items).toHaveLength(5)
    expect(g2.pageByCode.get('p_sw')!.items[0].text).toBe(g2.writingItems[0].text)
  })

  it('제한 시간(페이지당): 낱말 20초, 문장 20초, 비녹음 0초', () => {
    expect(g1.pageByCode.get('p_rw_meaning')!.limitSec).toBe(20)
    expect(g1.pageByCode.get('p_rw_nonsense')!.limitSec).toBe(20)
    expect(g1.pageByCode.get('p_rs01')!.limitSec).toBe(20)
    expect(g1.pageByCode.get('p_ww')!.limitSec).toBe(0)
    expect(g1.pageByCode.get('p_cl')!.limitSec).toBe(0)
    expect(g2.pageByCode.get('p_sw')!.limitSec).toBe(0)
  })

  it('녹음 자동 종료 = 제한 + 여유(GRACE_SEC)', () => {
    expect(GRACE_SEC).toBe(5)
    expect(maxRecSec(g1.pageByCode.get('p_rw_meaning')!)).toBe(25)
    expect(maxRecSec(g1.pageByCode.get('p_rs01')!)).toBe(25)
  })

  it('연습 페이지는 practice=true이고 본 문항과 낱말이 겹치지 않는다', () => {
    for (const f of [g1, g2]) {
      const practice = f.pageByCode.get('p_practice_rw')!
      expect(practice.practice).toBe(true)
      const realTexts = new Set(f.items.map(i => i.text))
      practice.items.forEach(i => expect(realTexts.has(i.text)).toBe(false))
    }
  })

  it('현장 채점 페이지는 없다 (담당자 확정 2026-08-13 — 채점은 관리자 전담)', () => {
    expect(g1.pages.some(p => p.code === 'p_rw_meaning_mark')).toBe(false)
    expect(g2.pages.some(p => p.code === 'p_rw_meaning_mark')).toBe(false)
    expect(g1.pages.every(p => p.role === 'child' || !isRecordingPage(p))).toBe(true)
  })

  it('아동 조작 페이지 / 검사자 조작 페이지 구분', () => {
    const roleOf = (f: typeof g1, c: string) => f.pageByCode.get(c)!.role
    expect(roleOf(g1, 'p_rw_meaning')).toBe('child')
    expect(roleOf(g1, 'p_rs01')).toBe('child')
    expect(roleOf(g1, 'p_ww')).toBe('examiner')
    expect(roleOf(g2, 'p_sw')).toBe('examiner')
    expect(roleOf(g1, 'p_cl')).toBe('examiner')
  })

  it('recordingPages는 업로드 대상만 — 연습 제외 6페이지', () => {
    for (const f of [g1, g2]) {
      expect(f.recordingPages.map(p => p.code))
        .toEqual(['p_rw_meaning', 'p_rw_nonsense', 'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04'])
      expect(f.recordingPages.every(p => !p.practice)).toBe(true)
    }
    expect(isRecordingPage(g1.pageByCode.get('p_ww')!)).toBe(false)
    expect(isRecordingPage(g2.pageByCode.get('p_sw')!)).toBe(false)
  })

  it('진행률 분모는 페이지 기준 — 쓰기 문항 수가 양식마다 다르다', () => {
    expect(g1.totals).toEqual({ rec: 6, write: 10 })
    expect(g2.totals).toEqual({ rec: 6, write: 5 })
  })

  it('섹션 순서(단계)는 양식의 쓰기 과제를 따른다', () => {
    expect(g1.sections).toEqual(['word_reading', 'sentence_reading', 'word_writing', 'checklist'])
    expect(g2.sections).toEqual(['word_reading', 'sentence_reading', 'sentence_writing', 'checklist'])
    expect(g1.writingSection).toBe('word_writing')
    expect(g2.writingSection).toBe('sentence_writing')
  })

  it('의미 낱말 코드 목록 (문항 순서 유지 — 관리자 채점·소계가 씀)', () => {
    expect(g1.meaningReadCodes).toEqual(['rw01', 'rw02', 'rw03', 'rw04', 'rw05', 'rw06', 'rw07'])
    expect(g1.meaningWriteCodes).toEqual(['ww01', 'ww02', 'ww03', 'ww04', 'ww05'])
    expect(g2.meaningReadCodes).toEqual(['rw01', 'rw02', 'rw03', 'rw04', 'rw05', 'rw06', 'rw07'])
  })

  it('연습 낱말은 담당자가 확정한 쉬운 실제 낱말이다', () => {
    // 무의미 낱말이 아니라 쉬운 실제 낱말을 쓴다 — "낱말이 쭉 있는 화면"에 익숙해지는 것이 목적이라
    // 연습에서까지 낯선 무의미 낱말을 주면 오히려 당황시킨다.
    // 길이만 검사하면 두 글자 무의미 낱말도 통과해 이 의도를 전혀 지키지 못한다.
    // 값을 고정해 바꾸려면 반드시 의도적으로 바꾸게 한다.
    expect(g1.pageByCode.get('p_practice_rw')!.items.map(i => i.text)).toEqual(['나무', '구름', '바다'])
  })

  it('낱말 쓰기 앞 3개는 의미 낱말이다 (역사적 불변식 — 중단 규칙은 코드 기반이라 순서에 의존하지 않지만, 데이터 구성 의도를 문서화한다)', () => {
    expect(g1.writingItems.slice(0, 3).every(i => i.kind === 'meaning')).toBe(true)
  })
})

describe('pageLabel — 검토 화면 목록·업로드 재시도 안내', () => {
  it('페이지 코드로 사람이 읽는 이름을 만든다 (문항 코드로 조회하면 빈칸이 된다)', () => {
    expect(pageLabel(g1, 'p_practice_rw')).toBe('연습 낱말 3개')
    expect(pageLabel(g1, 'p_rw_meaning')).toBe('의미 낱말 7개')
    expect(pageLabel(g1, 'p_rw_nonsense')).toBe('무의미 낱말 7개')
    expect(pageLabel(g1, 'p_rs03')).toBe('3번 문장')
    expect(pageLabel(g1, 'p_cl')).toBe('검사자 체크리스트')
  })
  it('쓰기 과제는 양식에 따라 이름과 문항 수가 다르다', () => {
    expect(pageLabel(g1, 'p_ww')).toBe('낱말 쓰기 10문항')
    expect(pageLabel(g2, 'p_sw')).toBe('문장 쓰기 5문항')
  })
  it('어떤 라벨도 문항 전문을 이어 붙이지 않는다 (어느 폭에서도 잘리지 않게)', () => {
    // 낱말 7개를 ' · '로 이으면 데스크톱에서도 뒤가 잘렸다 — 회귀 방지.
    for (const f of [g1, g2]) {
      for (const p of f.pages) expect(pageLabel(f, p.code).length).toBeLessThanOrEqual(20)
    }
  })
  it('모르는 코드는 코드 그대로 (표시가 사라지지 않게)', () => {
    expect(pageLabel(g1, 'nope')).toBe('nope')
  })
})

// 담당자 테스트(2026-10-22): 문장 4번의 마지막 어절만 셋째 줄로 넘어갔다 — 문장 화면 글자 크기를 가장 긴 줄에 맞춘다(ReadingPage).
describe('sentenceFitEm — 문장 줄 하나의 폭(글자 크기 1em 기준)', () => {
  it('줄바꿈(\\n)으로 나눈 줄마다 재고 가장 긴 줄의 폭을 돌려준다 — 한글 0.92 · 공백 0.28 · 마침표 0.228', () => {
    // 「가나 다.」 = 0.92×3 + 0.28 + 0.228 = 3.268 · 「가나다라」 = 3.68 · 「가 나」 = 2.12
    expect(sentenceFitEm(['가나 다.', '가나다라\n가 나'])).toBeCloseTo(3.68, 6)
  })
  it('앞뒤 공백은 세지 않는다 — 화면이 줄 끝 공백을 그리지 않는다', () => {
    expect(sentenceFitEm([' 가나 \n 다 '])).toBeCloseTo(1.84, 6)
  })
  it('표에 없는 글자는 한글 폭으로 넉넉히 센다 — 넘쳐 접히는 쪽보다 조금 작아지는 쪽이 낫다', () => {
    expect(sentenceFitEm(['가?'])).toBeCloseTo(1.84, 6)
  })
})
