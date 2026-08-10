import { describe, it, expect } from 'vitest'
import { G1_LAYOUT } from '@/lib/forms/g1-layout'
import { formForGrade } from '@/lib/forms'
import { CHECKLIST_AREAS } from '@/lib/items'
import { TASK_MAX } from '@/lib/scoring'

describe('G1 레이아웃', () => {
  const L = G1_LAYOUT
  it('양식에 연결돼 있다', () => {
    expect(formForGrade(1).layout).toBe(L)
  })
  it('원본 검사지 페이지 크기 (A4가 아니다)', () => {
    expect(L.pageWidth).toBe(540)
    expect(L.pageHeight).toBe(780)
  })
  it('낱말 격자 칸 수가 문항 수와 맞는다', () => {
    expect(L.wordReading.perRow * 2).toBe(TASK_MAX.wordReading)
    expect(L.wordWriting.perRow * 2).toBe(TASK_MAX.wordWriting)
  })
  it('문장 점수 칸이 문항 수만큼 있다', () => {
    expect(L.sentenceScores).toHaveLength(4)
  })
  it('체크리스트 행이 화면의 영역 코드와 정확히 대응한다', () => {
    // 화면에서 고를 수 있는 영역인데 인쇄 좌표가 없으면 그 선택은 종이에서 사라진다.
    expect(Object.keys(L.checklist.rows).sort()).toEqual(CHECKLIST_AREAS.map(a => a.code).sort())
  })
  it('모든 좌표가 페이지 안에 있다', () => {
    const xs = [L.wordReading.x0, L.wordWriting.x0, L.checklist.boxCx,
      ...L.sentenceScores.map(s => s.slashX), L.sentenceTotal.slashX]
    const ys = [...L.wordReading.rows, ...L.wordWriting.rows,
      ...Object.values(L.checklist.rows), L.header.baselineY]
    xs.forEach(x => { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(L.pageWidth) })
    ys.forEach(y => { expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(L.pageHeight) })
  })
  it('낱말 격자 마지막 칸이 페이지를 넘지 않는다', () => {
    for (const g of [L.wordReading, L.wordWriting]) {
      expect(g.x0 + g.dx * (g.perRow - 1) + g.w).toBeLessThanOrEqual(L.pageWidth)
    }
  })
})
