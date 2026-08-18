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

describe('parseRosterGrid — 번호 칸 표기(toNo)', () => {
  it('번·명 접미사와 숫자 서식 소수점 꼬리는 받는다', () => {
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['1번', '김서아', '여', '2019-03-04'],
      ['01', '이도윤', '남', '2019-03-04'],
      ['1.0', '박하윤', '여', '2019-03-04'],
    ])
    if ('error' in r) throw new Error(r.error)
    expect(r.children.map(c => c.childNo)).toEqual([1, 1, 1])
    expect(r.problems).toHaveLength(0)
  })
  it('[REGRESSION] "2-1"(반-번호) 같은 애매한 표기는 숫자만 이어붙이지 않고 거부한다', () => {
    // 예전 구현은 \D를 지워 "2-1" → 21, "12-3" → 123을 만들었다 — 다른 아이의 번호가
    // 조용히 기록되는 임상 사고. 이제는 각 줄이 problems로 빠지고 번호를 다시 채우게 한다.
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['2-1', '김서아', '여', '2019-03-04'],
      ['1.5', '이도윤', '남', '2019-03-04'],
      ['12-3', '박하윤', '여', '2019-03-04'],
    ])
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toHaveLength(0)
    expect(r.problems).toHaveLength(3)
    for (const p of r.problems) expect(p.missing).toContain('번호')
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
  it('[REGRESSION] 값 칸(이름)에 주민번호가 섞여 와도 그 칸만 버려 결과에 새지 않는다', () => {
    // 주민등록번호 열이 아니라 **성명 칸 안에 섞여 들어온** 경우 — 열 이름 매칭(1차 차단)은
    // 애초에 관여하지 않으므로, 이 테스트를 통과시키는 것은 오직 pick()의 값 검사(2차 차단)뿐이다.
    // (그 줄만 지우면 이 테스트가 곧바로 레드가 되는 것으로 확인했다 — 작업 보고 참고.)
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['1', '김서아 190304-4234567', '여', '2019-03-04'],   // 성명 칸에 주민번호가 섞임
    ])
    if ('error' in r) throw new Error(r.error)
    expect(JSON.stringify(r)).not.toMatch(/\d{6}\s*[-–]?\s*\d{7}/)
    expect(r.problems[0]).toMatchObject({ childNo: 1, missing: ['이름'] })
    expect(r.rrnSeen).toBe(true)
  })
  it('값 칸(생년월일)에 주민번호 형태가 있으면 그 칸만 버린다 — 다른 칸은 살린다', () => {
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
  it('성별 표기(한글·"남자"·숫자)가 실제로 남/여로 정확히 매핑됐는지 고정한다', async () => {
    // count 단언만으로는 1/2이 뒤바뀌어 매핑돼도 통과한다 — 값 자체를 고정한다.
    const r = parseRosterGrid(await grid('rrn-and-gaps.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toEqual([
      { childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' },
      { childNo: 2, name: '이도윤', gender: '남', birthYmd: '190122' },   // "남자"
      { childNo: 3, name: '박하윤', gender: '여', birthYmd: '191109' },   // "2"
    ])
  })
  it('번호·이름이 둘 다 빈 줄이라도 성별·생년월일 값이 있으면 문제 행으로 남긴다', () => {
    // 병합 셀이나 밀린 붙여넣기로 번호·이름만 빠지면, 예전 구현은 이 줄을 "빈 줄"로 보고
    // 통째로 건너뛰어 아이 하나가 명단에서 조용히 사라졌다.
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['', '', '여', '2019-03-04'],
    ])
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toHaveLength(0)
    expect(r.problems).toHaveLength(1)
    expect(r.problems[0].missing).toEqual(expect.arrayContaining(['번호', '이름']))
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
