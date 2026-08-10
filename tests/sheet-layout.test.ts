import { describe, it, expect } from 'vitest'
import { G1_LAYOUT } from '@/lib/forms/g1-layout'
import { G2_LAYOUT } from '@/lib/forms/g2-layout'
import { FORMS, formForGrade, type SurveyForm } from '@/lib/forms'
import { CHECKLIST_AREAS, itemsFor } from '@/lib/items'
import { itemMaxWords, scoringFor } from '@/lib/scoring'

describe('레이아웃이 양식에 연결돼 있다', () => {
  it('G1 / G2', () => {
    expect(formForGrade(1).layout).toBe(G1_LAYOUT)
    expect(formForGrade(2).layout).toBe(G2_LAYOUT)
  })
  it('배경 PDF 경로가 양식마다 다르다', () => {
    expect(new Set(FORMS.map(f => f.layout.pdf)).size).toBe(FORMS.length)
  })
})

describe.each(FORMS.map(f => [f.id, f] as const))('%s 레이아웃', (_id, form: SurveyForm) => {
  const L = form.layout
  const f = itemsFor(form)
  const { taskMax } = scoringFor(form)

  it('원본 검사지 페이지 크기 (A4가 아니다)', () => {
    expect(L.pageWidth).toBe(540)
    expect(L.pageHeight).toBe(780)
  })

  it('낱말 해독 격자 칸 수가 문항 수와 맞는다', () => {
    expect(L.wordReading.perRow * 2).toBe(taskMax.wordReading)
  })

  it('문장 점수 칸이 문항 수만큼 있다', () => {
    expect(L.sentenceScores).toHaveLength(f.sentenceItems.length)
  })

  it('쓰기 좌표가 양식의 쓰기 과제와 짝이 맞고 문항 수도 같다', () => {
    if (L.writing.kind === 'word') {
      expect(f.writingSection).toBe('word_writing')
      expect(L.writing.grid.perRow * 2).toBe(f.writingItems.length)
    } else {
      expect(f.writingSection).toBe('sentence_writing')
      expect(L.writing.choices.rows).toHaveLength(f.writingItems.length)
    }
  })

  it('체크리스트 행이 화면의 영역 코드와 정확히 대응한다', () => {
    // 화면에서 고를 수 있는 영역인데 인쇄 좌표가 없으면 그 선택은 종이에서 사라진다.
    expect(Object.keys(L.checklist.rows).sort()).toEqual(CHECKLIST_AREAS.map(a => a.code).sort())
  })

  it('모든 좌표가 페이지 안에 있다', () => {
    const xs = [L.wordReading.x0, L.checklist.boxCx,
      ...L.sentenceScores.map(s => s.slashX), L.sentenceTotal.slashX,
      ...(L.writing.kind === 'word'
        ? [L.writing.grid.x0, L.writing.scores.total.slashX]
        : [...L.writing.choices.colCx, L.writing.total.slashX])]
    const ys = [...L.wordReading.rows, ...Object.values(L.checklist.rows), L.header.baselineY,
      ...(L.writing.kind === 'word'
        ? L.writing.grid.rows
        : L.writing.choices.rows.map(r => r.baselineY))]
    xs.forEach(x => { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(L.pageWidth) })
    ys.forEach(y => { expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(L.pageHeight) })
  })

  it('낱말 격자 마지막 칸이 페이지를 넘지 않는다', () => {
    const grids = [L.wordReading, ...(L.writing.kind === 'word' ? [L.writing.grid] : [])]
    for (const g of grids) {
      expect(g.x0 + g.dx * (g.perRow - 1) + g.w).toBeLessThanOrEqual(L.pageWidth)
    }
  })

  it('머리글 열이 왼쪽에서 오른쪽으로 겹치지 않고 이어진다', () => {
    const h = L.header
    const cols = [h.school, h.grade, h.childName, h.birth, h.testedAt]
    cols.forEach(c => expect(c.hi).toBeGreaterThan(c.lo))
    for (let i = 1; i < cols.length; i++) expect(cols[i].lo).toBeGreaterThanOrEqual(cols[i - 1].hi)
  })
})

describe('G2 문장 쓰기 선택지 좌표 (인쇄된 「0 1 2」에 동그라미)', () => {
  const c = G2_LAYOUT.writing.kind === 'sentence' ? G2_LAYOUT.writing.choices : null

  it('문항마다 열·행이 지정돼 있고 열 인덱스가 유효하다', () => {
    expect(c).not.toBeNull()
    c!.rows.forEach(r => {
      expect(r.col).toBeGreaterThanOrEqual(0)
      expect(r.col).toBeLessThan(c!.colCx.length)
    })
  })

  it('검사지 배치대로 1·2·3은 왼쪽 열, 4·5는 오른쪽 열', () => {
    expect(c!.rows.map(r => r.col)).toEqual([0, 0, 0, 1, 1])
  })

  it('동그라미가 이웃 숫자를 침범하지 않는다 (반지름 < 숫자 간격의 절반)', () => {
    expect(c!.rx).toBeLessThan(c!.dx / 2)
  })

  it('최대 점수(2)의 동그라미까지 페이지 안에 들어온다', () => {
    const maxScore = Math.max(...itemsFor(formForGrade(2)).writingItems.map(itemMaxWords))
    for (const cx of c!.colCx) {
      expect(cx - c!.dx - c!.rx).toBeGreaterThan(0)
      expect(cx + (maxScore - 1) * c!.dx + c!.rx).toBeLessThan(G2_LAYOUT.pageWidth)
    }
  })
})
