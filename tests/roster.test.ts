// 명단 파싱 — 업로드된 그리드(readXlsx 결과 또는 CSV)를 명단으로 바꾼다.
// 열 역할을 짐작하지 않는다: 알려진 머리글 이름만 찾고, 못 찾으면 거부한다(스펙).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readXlsx } from '@/lib/xlsx'
import { cutText, parseRosterGrid } from '@/lib/roster'

const grid = async (name: string) => {
  const b = readFileSync(join(__dirname, 'fixtures', name))
  return readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}

describe('parseRosterGrid — 나이스 명렬표', () => {
  it('제목 행을 건너뛰고 머리글로 열을 찾아 5명을 읽는다', async () => {
    const r = parseRosterGrid(await grid('neis-roster.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toHaveLength(5)
    expect(r.children[0]).toEqual({ childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' })
  })
  it('반·비고처럼 모르는 열은 무시한다', async () => {
    const r = parseRosterGrid(await grid('neis-roster.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.problems).toHaveLength(0)
  })
})

describe('parseRosterGrid — 배포 양식', () => {
  it('안내 문구 5줄 아래의 머리글을 찾는다', async () => {
    const r = parseRosterGrid(await grid('template-filled.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toHaveLength(3)
  })
})

describe('parseRosterGrid — 주민번호 2중 차단', () => {
  it('[REGRESSION] 주민등록번호 열은 머리글 이름으로 아예 읽지 않는다', async () => {
    const r = parseRosterGrid(await grid('rrn-and-gaps.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(JSON.stringify(r)).not.toMatch(/\d{6}-\d{7}/)
    expect(r.rrnSeen).toBe(true)      // 파일에 있었다는 사실은 알려 안내를 띄운다
  })
  it('값 칸에 주민번호 형태가 있으면 그 칸만 버린다 — 다른 칸은 살린다', () => {
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['1', '김서아', '여', '190304-4234567'],   // 생년월일 칸에 주민번호
    ])
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toHaveLength(0)
    expect(r.problems[0]).toMatchObject({ childNo: 1, name: '김서아' })
    expect(r.rrnSeen).toBe(true)
  })
})

describe('parseRosterGrid — 문제 행 보고', () => {
  it('이름·생년월일 누락 행은 problems로 분리하고 이유를 적는다', async () => {
    const r = parseRosterGrid(await grid('rrn-and-gaps.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.children.length + r.problems.length).toBe(5)
    expect(r.problems.some(p => p.missing.includes('이름'))).toBe(true)
    expect(r.problems.some(p => p.missing.includes('생년월일'))).toBe(true)
  })
  it('성별·생년월일 열 자체가 없으면 missingCols로 알린다', async () => {
    const r = parseRosterGrid(await grid('missing-columns.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.missingCols).toEqual(['성별', '생년월일'])
    expect(r.problems).toHaveLength(3)     // 3명 전원이 성별·생년월일 없음
  })
  it('번호·이름 머리글을 못 찾으면 error를 돌려준다', () => {
    const r = parseRosterGrid([['아무', '표'], ['1', '2']])
    expect(r).toHaveProperty('error')
  })
})

describe('cutText — CSV·붙여넣기 텍스트를 그리드로', () => {
  it('콤마 구분을 읽는다', () => {
    expect(cutText('번호,성명\n1,김서아')).toEqual([['번호', '성명'], ['1', '김서아']])
  })
  it('탭 구분이 콤마보다 우선한다 (엑셀 복사는 탭)', () => {
    expect(cutText('번호\t성,명\n1\t김서아')).toEqual([['번호', '성,명'], ['1', '김서아']])
  })
})
