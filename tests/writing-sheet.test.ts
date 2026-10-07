import { describe, expect, it } from 'vitest'
import { classSheetTag, numberRange, parseSheetQr, sheetBoxNo, sheetEntries, sheetQrText } from '@/lib/writing-sheet'
import { itemsFor } from '@/lib/items'
import { formForGrade } from '@/lib/forms'

describe('classSheetTag — 반 표시', () => {
  it('학급 id마다 고정된 16진수 8자리다(같은 입력 → 같은 값)', async () => {
    const a = await classSheetTag('7f7c9d52-1111-4a2b-9c3d-000000000001')
    expect(a).toMatch(/^[0-9a-f]{8}$/)
    expect(await classSheetTag('7f7c9d52-1111-4a2b-9c3d-000000000001')).toBe(a)
  })

  it('다른 학급이면 다른 값이다 — 다른 반 기록지를 가려낸다', async () => {
    expect(await classSheetTag('a')).not.toBe(await classSheetTag('b'))
  })

  it('[REGRESSION] 학급 id가 그대로 들어가지 않는다(해시 앞자리)', async () => {
    const id = '7f7c9d52-1111-4a2b-9c3d-000000000001'
    expect(id.replace(/-/g, '')).not.toContain(await classSheetTag(id))
  })
})

describe('sheetQrText / parseSheetQr', () => {
  it('번호는 두 자리로 싣고 그대로 되읽는다', () => {
    const t = sheetQrText('7c1e94a2', 5)
    expect(t).toBe('SHEET-W:7c1e94a2:05')
    expect(parseSheetQr(t)).toEqual({ tag: '7c1e94a2', childNo: 5 })
    expect(parseSheetQr(sheetQrText('7c1e94a2', 99))).toEqual({ tag: '7c1e94a2', childNo: 99 })
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(parseSheetQr('  SHEET-W:7c1e94a2:12\n')).toEqual({ tag: '7c1e94a2', childNo: 12 })
  })

  it('우리 기록지가 아니면 null — 다른 QR·주소·형식 오류', () => {
    for (const t of ['', 'https://example.kr', 'SHEET-W:7c1e94a2:5', 'SHEET-W:7C1E94A2:05', 'SHEET-W:7c1e94a:05',
      'SHEET-X:7c1e94a2:05', 'KODYS-W:7c1e94a2:05', 'SHEET-W:7c1e94a2:05:extra'])
      expect(parseSheetQr(t)).toBeNull()
  })

  it('번호 00은 null(출석 번호는 1~99)', () => {
    expect(parseSheetQr('SHEET-W:7c1e94a2:00')).toBeNull()
  })

  it('[REGRESSION] QR 글자열에 학급 코드·이름·주소가 없다', () => {
    const t = sheetQrText('7c1e94a2', 5)
    expect(t).not.toMatch(/https?:|\/\/|[가-힣]/)
    expect(t.split(':')).toHaveLength(3)
  })
})

describe('sheetEntries — 인쇄 목록', () => {
  it('고른 학생 + 번호만 찍힌 기록지를 번호순으로 합친다', () => {
    expect(sheetEntries([{ childNo: 8, name: '오시우' }, { childNo: 7, name: '한서아' }], [9]))
      .toEqual([{ childNo: 7, name: '한서아' }, { childNo: 8, name: '오시우' }, { childNo: 9, name: null }])
  })

  it('번호가 겹치면 이름 있는 쪽 하나만 — 같은 번호 두 장이면 스캔본이 한 아이에게 두 번 붙는다', () => {
    expect(sheetEntries([{ childNo: 3, name: '박서준' }], [3, 3])).toEqual([{ childNo: 3, name: '박서준' }])
  })

  it('번호만 찍힌 기록지는 1~99의 정수만 받는다', () => {
    expect(sheetEntries([], [0, 100, 2.5, -1, 12])).toEqual([{ childNo: 12, name: null }])
  })

  it('아무것도 안 고르면 빈 목록', () => {
    expect(sheetEntries([], [])).toEqual([])
  })
})

describe('numberRange', () => {
  it('1~N번', () => { expect(numberRange(3)).toEqual([1, 2, 3]) })
  it('99에서 자른다', () => { expect(numberRange(120)).toHaveLength(99); expect(numberRange(120).at(-1)).toBe(99) })
  it('끝 번호를 적기 전(0·빈 값)·음수·소수는 빈 목록 — 0장이면 [인쇄하기]가 잠긴다', () => {
    for (const n of [0, Number(''), -2, 1.5, Number.NaN]) expect(numberRange(n)).toEqual([])
  })
})

describe('sheetBoxNo — 받아쓰기 목록·기록지 칸·담당자 채점 행이 같은 번호', () => {
  for (const grade of [1, 2]) {
    it(`${grade}학년: 쓰기 문항 순서대로 1~N(기록지 칸 수와 같다)`, () => {
      const f = itemsFor(formForGrade(grade))
      const no = sheetBoxNo(f.writingItems)
      expect(f.writingItems.map(i => no.get(i.code))).toEqual(f.writingItems.map((_, k) => k + 1))
      expect(no.size).toBe(f.writingItems.length)
    })
  }
  it('[REGRESSION] 검사지 전체 순번(orderNo)이 아니다 — G1 쓰기는 19번부터라 그 번호를 부르면 아이가 칸을 못 찾는다', () => {
    const f = itemsFor(formForGrade(1))
    expect(f.writingItems[0].orderNo).toBeGreaterThan(1)
    expect(sheetBoxNo(f.writingItems).get(f.writingItems[0].code)).toBe(1)
  })
})

