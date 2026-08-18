// xlsx 읽기 — 실제 엑셀 파일을 넣어 결과를 고정한다.
// 표본은 tests/fixtures/ 참고(가짜 데이터). 라이브러리 없이 ZIP+XML을 직접 읽으므로,
// 압축 방식·공유 문자열·날짜 셀 같은 구조가 깨지면 여기서 잡힌다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readXlsx } from '@/lib/xlsx'
import { normBirth } from '@/lib/birth'

const load = (name: string): ArrayBuffer => {
  const b = readFileSync(join(__dirname, 'fixtures', name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('readXlsx — 나이스 명렬표 모사', () => {
  it('제목 행과 머리글, 학생 줄을 순서대로 돌려준다', async () => {
    const rows = await readXlsx(load('neis-roster.xlsx'))
    expect(rows[0]).toEqual(['2026학년도 1학년 2반 학생명렬표'])
    expect(rows[1]).toEqual(['반', '번호', '성명', '성별', '생년월일', '비고'])
    expect(rows).toHaveLength(7)
  })

  it('엑셀이 날짜 타입으로 저장한 셀은 일련번호 문자열로 나오고, normBirth가 날짜로 푼다', async () => {
    const rows = await readXlsx(load('neis-roster.xlsx'))
    const first = rows[2]
    expect(first.slice(0, 4)).toEqual(['2', '1', '김서아', '여'])
    expect(normBirth(first[4])).toBe('2019-03-04')
  })

  it('한글이 깨지지 않는다 (공유 문자열 UTF-8)', async () => {
    const rows = await readXlsx(load('neis-roster.xlsx'))
    expect(rows.flat()).toContain('박하윤')
  })
})

describe('readXlsx — 배포용 양식', () => {
  it('안내 문구 5줄 뒤의 머리글과 학생 줄을 모두 읽는다', async () => {
    const rows = await readXlsx(load('template-filled.xlsx'))
    const head = rows.findIndex(r => r[0] === '번호')
    expect(head).toBeGreaterThan(0)                       // 앞에 안내 문구가 있다
    expect(rows[head]).toEqual(['번호', '이름', '성별', '생년월일'])
    expect(rows.slice(head + 1)).toHaveLength(3)
  })
})

describe('readXlsx — 지저분한 파일', () => {
  it('주민등록번호 열도 그대로 읽어 온다 — 걸러내는 것은 호출부의 몫', async () => {
    const rows = await readXlsx(load('rrn-and-gaps.xlsx'))
    expect(rows[1]).toContain('주민등록번호')
    expect(rows[2].some(c => /\d{6}-\d{7}/.test(c))).toBe(true)
  })

  it('빈 칸은 빈 문자열로 자리를 지킨다 — 열이 밀리지 않는다', async () => {
    const rows = await readXlsx(load('rrn-and-gaps.xlsx'))
    const head = rows[1]
    const nameAt = head.indexOf('성명')
    expect(rows[5][nameAt]).toBe('')                      // 이름이 비어 있는 줄
    expect(rows[5]).toHaveLength(head.length)
  })

  it('성별·생년월일 열이 없는 파일도 읽힌다', async () => {
    const rows = await readXlsx(load('missing-columns.xlsx'))
    expect(rows[0]).toEqual(['반', '번호', '성명', '비고'])
    expect(rows).toHaveLength(4)
  })
})

describe('readXlsx — 잘못된 입력', () => {
  it('[REGRESSION] zip이 아닌 파일은 명확한 오류를 낸다 (Numbers 파일 등)', async () => {
    const notZip = new TextEncoder().encode('이건 엑셀이 아닙니다').buffer
    await expect(readXlsx(notZip as ArrayBuffer)).rejects.toThrow('zip 형식이 아닙니다')
  })
})
