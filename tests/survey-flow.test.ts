import { describe, it, expect } from 'vitest'
import { visiblePages, canAdvance, recordingNav, skippedAfter } from '@/lib/survey-flow'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

const g1 = itemsFor(formForGrade(1))
const g2 = itemsFor(formForGrade(2))

describe('visiblePages — 연습 실시 여부 (검사자가 마이크 확인 뒤 고른다)', () => {
  it('연습을 건너뛰면 연습 페이지가 빠진다 (나머지 순서는 그대로)', () => {
    expect(visiblePages(g1, { practice: false }).map(p => p.code)).toEqual([
      'p_rw_meaning', 'p_rw_nonsense',
      'p_rs01', 'p_rs02', 'p_rs03', 'p_rs04', 'p_ww', 'p_cl',
    ])
  })
  it('연습을 실시하면(또는 값이 없으면) 연습 페이지가 첫 페이지다', () => {
    expect(visiblePages(g1, { practice: true })[0].code).toBe('p_practice_rw')
    expect(visiblePages(g1, {})[0].code).toBe('p_practice_rw')
  })
})

describe('canAdvance ([다음] 버튼 활성화 조건)', () => {
  const empty = { writing: {}, checklist: [] }

  it('현장 채점이 아닌 낱말 해독 페이지는 writing/checklist와 무관하게 항상 진행 가능', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_rw_meaning')!, empty)).toBe(true)
  })

  it('문장 읽기 페이지는 writing/checklist와 무관하게 항상 진행 가능', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_rs01')!, empty)).toBe(true)
  })

  it('낱말 쓰기 페이지: 전부 선택하면 진행 가능', () => {
    const page = g1.pageByCode.get('p_ww')!
    const allWritten = Object.fromEntries(page.items.map(i => [i.code, 1]))
    expect(canAdvance(g1, page, { ...empty, writing: allWritten })).toBe(true)
  })

  it('낱말 쓰기 페이지: 일부만 선택하면 진행 불가', () => {
    const page = g1.pageByCode.get('p_ww')!
    const firstOne = Object.fromEntries(page.items.slice(0, 1).map(i => [i.code, 1]))
    expect(canAdvance(g1, page, { ...empty, writing: firstOne })).toBe(false)
  })

  it('문장 쓰기 페이지(G2): 5문항 전부 입력해야 진행 가능', () => {
    const page = g2.pageByCode.get('p_sw')!
    expect(canAdvance(g2, page, { ...empty, writing: { sw01: 2 } })).toBe(false)
    const all = Object.fromEntries(page.items.map(i => [i.code, 2]))
    expect(canAdvance(g2, page, { ...empty, writing: all })).toBe(true)
  })

  it('체크리스트 페이지: 1개 이상 선택하면 진행 가능', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_cl')!, { ...empty, checklist: ['none'] })).toBe(true)
  })

  it('체크리스트 페이지: 아무것도 선택하지 않으면 진행 불가', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_cl')!, empty)).toBe(false)
  })
})

// 쓰기 중단(규칙 ②) 폐기는 담당자 확정(2026-08-22) — 「즉시 중단 기능 제거」가 ②를 포함한다.
// 이 describe의 전제(1번이 0점이어도 나머지를 다 입력해야 진행)는 그 확정을 고정한다.
describe('canAdvance — 쓰기는 전 문항 입력이 완료 조건이다 (중단 규칙 ② 폐기, 담당자 확정 2026-08-22)', () => {
  const wwPage = (f: typeof g1) => f.pages.find(p => p.section === f.writingSection)!
  it('G1: 1번이 0점이어도 나머지를 다 입력해야 진행 가능', () => {
    const partial = { ww01: 0 }
    expect(canAdvance(g1, wwPage(g1), { writing: partial, checklist: [] })).toBe(false)
    const all = Object.fromEntries(g1.writingItems.map(i => [i.code, 0]))
    expect(canAdvance(g1, wwPage(g1), { writing: all, checklist: [] })).toBe(true)
  })
  it('G2: 첫 문장이 0점이어도 5문항 전부 입력해야 진행 가능', () => {
    expect(canAdvance(g2, wwPage(g2), { writing: { sw01: 0 }, checklist: [] })).toBe(false)
    const all = Object.fromEntries(g2.writingItems.map(i => [i.code, 0]))
    expect(canAdvance(g2, wwPage(g2), { writing: all, checklist: [] })).toBe(true)
  })
})

describe('canAdvance — 쓰기 방식(스캔본, 2026-09-30)', () => {
  const empty = { writing: {}, checklist: [] }
  it('스캔본 방식이면 쓰기 페이지를 표시 없이 넘어간다 — 아이가 기록지에 쓰고 담당자가 채점한다', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_ww')!, { ...empty, writingMode: 'scan' })).toBe(true)
    expect(canAdvance(g2, g2.pageByCode.get('p_sw')!, { ...empty, writingMode: 'scan' })).toBe(true)
  })
  it('화면 방식(또는 값 없음)은 종전대로 전 문항 입력이 필요하다', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_ww')!, { ...empty, writingMode: 'screen' })).toBe(false)
    expect(canAdvance(g1, g1.pageByCode.get('p_ww')!, empty)).toBe(false)
  })
  it('스캔본 방식이어도 체크리스트 조건은 그대로다', () => {
    expect(canAdvance(g1, g1.pageByCode.get('p_cl')!, { ...empty, writingMode: 'scan' })).toBe(false)
  })
})


// 담당자 요청(2026-10-22): 녹음을 멈춘 뒤에도 [모르겠어요]를 누를 수 있게 — 「이전, 모르겠어요, 다음」.
describe('recordingNav — 녹음 페이지 아래 [모르겠어요]·[다음]', () => {
  const page = g1.pageByCode.get('p_rw_meaning')!
  const fresh = { recorded: {}, attempted: [] }
  const base = { fromReview: false, isLast: false, retrying: false }

  it('녹음 전: [모르겠어요]만 누를 수 있다 — [다음]은 꺼진다(오터치 한 번으로 조용히 넘어가지 않게)', () => {
    expect(recordingNav(page, fresh, base)).toEqual({ skip: true, next: false })
  })
  it('녹음 뒤: [모르겠어요]와 [다음]을 둘 다 누를 수 있다', () => {
    expect(recordingNav(page, { recorded: { p_rw_meaning: 1 }, attempted: ['p_rw_meaning'] }, base))
      .toEqual({ skip: true, next: true })
  })
  it('올리기에 실패해 다시 보낼 녹음이 있는 화면은 [모르겠어요]가 없다 — 아이는 읽었다', () => {
    expect(recordingNav(page, fresh, { ...base, retrying: true })).toEqual({ skip: false, next: true })
  })
  it('녹음을 시도했는데 저장된 것이 없는 화면도 [모르겠어요]가 없다 — 다시 녹음할 화면이다', () => {
    expect(recordingNav(page, { recorded: {}, attempted: ['p_rw_meaning'] }, base)).toEqual({ skip: false, next: true })
  })
  it('연습 화면·검토에서 온 화면·녹음 없는 화면은 [모르겠어요]가 없다', () => {
    expect(recordingNav(g1.pageByCode.get('p_practice_rw')!, fresh, base)).toEqual({ skip: false, next: true })
    expect(recordingNav(page, fresh, { ...base, fromReview: true })).toEqual({ skip: false, next: true })
    expect(recordingNav(g1.pageByCode.get('p_cl')!, fresh, base)).toEqual({ skip: false, next: true })
  })
})

describe('skippedAfter — [모르겠어요]를 누른 뒤 남길 「모르겠어요」 표시', () => {
  it('녹음이 없으면 그 화면을 남긴다(한 번만)', () => {
    expect(skippedAfter({ recorded: {}, skipped: ['p_rs01'] }, 'p_rs02')).toEqual(['p_rs01', 'p_rs02'])
    expect(skippedAfter({ recorded: {}, skipped: ['p_rs02'] }, 'p_rs02')).toEqual(['p_rs02'])
  })
  it('녹음이 있으면 남기지 않는다 — 녹음이 채점 근거다. 남기면 그 녹음 올리기가 실패했을 때 검토가 빠진 화면으로 세지 않는다', () => {
    expect(skippedAfter({ recorded: { p_rs02: 1 }, skipped: [] }, 'p_rs02')).toEqual([])
  })
})
