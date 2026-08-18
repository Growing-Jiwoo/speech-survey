// 명단 파싱 — 업로드된 그리드(readXlsx 결과 또는 CSV)를 명단으로 바꾼다.
// 열 역할을 짐작하지 않는다: 알려진 머리글 이름만 찾고, 못 찾으면 거부한다(스펙).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readXlsx } from '@/lib/xlsx'
import { badCells, cutText, dupChildNos, parseRosterGrid, toChild, type ParsedRoster } from '@/lib/roster'

const grid = async (name: string) => {
  const b = readFileSync(join(__dirname, 'fixtures', name))
  return readXlsx(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}

/** 파서는 이제 줄을 나누지 않고 **파일 순서 그대로** 돌려준다 — 통과한 줄(= 서버로 나갈
 *  아동)과 못 채운 줄은 `toChild`/`badCells`로 갈라 본다. 화면이 하는 것과 같은 방법이다. */
const kids = (r: ParsedRoster) => r.rows.map(toChild).filter(c => c !== null)
const broken = (r: ParsedRoster) => r.rows.map(badCells).filter(b => b.length > 0)

describe('parseRosterGrid — 나이스 명렬표', () => {
  it('제목 행을 건너뛰고 머리글로 열을 찾아 5명을 읽는다', async () => {
    const r = parseRosterGrid(await grid('neis-roster.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(kids(r)).toHaveLength(5)
    expect(kids(r)[0]).toEqual({ childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' })
  })
  it('반·비고처럼 모르는 열은 무시한다', async () => {
    const r = parseRosterGrid(await grid('neis-roster.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(broken(r)).toHaveLength(0)
  })
})

describe('parseRosterGrid — 번호 칸 표기(toNo)', () => {
  it('번·명 접미사(공백 포함)·숫자 서식 소수점 꼬리·전각 숫자는 받는다', () => {
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['1번', '김서아', '여', '2019-03-04'],
      ['01', '이도윤', '남', '2019-03-04'],
      ['1.0', '박하윤', '여', '2019-03-04'],
      ['1 번', '최시우', '남', '2019-03-04'],   // 접미사 앞 공백
      ['１', '정지아', '여', '2019-03-04'],     // 전각 숫자(한글 IME)
    ])
    if ('error' in r) throw new Error(r.error)
    expect(kids(r).map(c => c.childNo)).toEqual([1, 1, 1, 1, 1])
    expect(broken(r)).toHaveLength(0)
  })
  it('[REGRESSION] "2-1"(반-번호) 같은 애매한 표기는 숫자만 이어붙이지 않고 거부한다', () => {
    // 예전 구현은 \D를 지워 "2-1" → 21, "12-3" → 123을 만들었다 — 다른 아이의 번호가
    // 조용히 기록되는 임상 사고. 이제는 각 줄이 problems로 빠지고 번호를 다시 채우게 한다.
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['2-1', '김서아', '여', '2019-03-04'],
      ['1.5', '이도윤', '남', '2019-03-04'],
      ['12-3', '박하윤', '여', '2019-03-04'],
      ['0', '최시우', '남', '2019-03-04'],
      ['100', '정지아', '여', '2019-03-04'],
      ['일', '김하람', '남', '2019-03-04'],
      ['1-', '이서준', '남', '2019-03-04'],
      ['no.1', '박다인', '여', '2019-03-04'],
      ['1.0.0', '최유나', '여', '2019-03-04'],
      ['+1', '정하은', '여', '2019-03-04'],
    ])
    if ('error' in r) throw new Error(r.error)
    expect(kids(r)).toHaveLength(0)
    expect(broken(r)).toHaveLength(10)
    for (const b of broken(r)) expect(b).toContain('번호')
  })
})

describe('parseRosterGrid — 배포 양식', () => {
  it('안내 문구 5줄 아래의 머리글을 찾는다', async () => {
    const r = parseRosterGrid(await grid('template-filled.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(kids(r)).toHaveLength(3)
  })
})

describe('parseRosterGrid — 주민번호 2중 차단', () => {
  it('주민등록번호 열의 값은 결과에 나타나지 않고, rrnSeen만 켠다', async () => {
    // 이 열은 어떤 별칭에도 매치되지 않아 애초에 읽히지 않는다 — bannedCols를 꺼도
    // 그 사실은 그대로다(별칭 완전 일치라 값이 새는 경로 자체가 없다, finding 7 참고).
    // 그래서 이름은 "머리글 이름으로 읽지 않는다"가 아니라 "값이 결과에 없다"로 둔다.
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
    expect(badCells(r.rows[0])).toEqual(['이름'])
    expect(r.rows[0].childNo).toBe('1')
    expect(r.rrnSeen).toBe(true)
  })
  it('값 칸(생년월일)에 주민번호 형태가 있으면 그 칸만 버린다 — 다른 칸은 살린다', () => {
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['1', '김서아', '여', '190304-4234567'],   // 생년월일 칸에 주민번호
    ])
    if ('error' in r) throw new Error(r.error)
    expect(kids(r)).toHaveLength(0)
    expect(r.rows[0]).toMatchObject({ childNo: '1', name: '김서아', gender: '여', birth: '' })
    expect(r.rrnSeen).toBe(true)
  })
  it('[REGRESSION] 대시 없는 주민번호도 값 칸에서 걸러 새지 않고 rrnSeen을 켠다', () => {
    // 대시가 반드시 있어야 잡는다면(round 1 구현) 이 값은 그대로 통과해 이름 칸에 남는다.
    // isRrn이 13자리 뭉치의 앞 6자리를 날짜로 검증하기 때문에 잡힌다 — 대시를 다시 필수로
    // 만들면 이 테스트가 레드가 되는 것으로 확인했다(작업 보고 참고).
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['1', '김서아 1903044234567', '여', '2019-03-04'],   // 성명 칸에 대시 없는 주민번호가 섞임
    ])
    if ('error' in r) throw new Error(r.error)
    expect(JSON.stringify(r)).not.toMatch(/\d{13}/)
    expect(badCells(r.rows[0])).toEqual(['이름'])
    expect(r.rrnSeen).toBe(true)
  })
  it('13자리 학번처럼 앞 6자리가 날짜가 아닌 숫자열은 주민번호로 오인해 경고를 켜지 않는다', () => {
    // 202601은 26월이 되어 날짜가 아니다 — 학번을 주민번호로 잘못 알려 교사를 헷갈리게 하지 않는다.
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일', '비고'],
      ['1', '김서아', '여', '2019-03-04', '2026010112345'],
    ])
    if ('error' in r) throw new Error(r.error)
    expect(r.rrnSeen).toBe(false)
  })
})

describe('parseRosterGrid — 문제 행 보고', () => {
  it('이름·생년월일 누락 행은 problems로 분리하고 이유를 적는다', async () => {
    const r = parseRosterGrid(await grid('rrn-and-gaps.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.rows).toHaveLength(5)
    expect(broken(r).some(b => b.includes('이름'))).toBe(true)
    expect(broken(r).some(b => b.includes('생년월일'))).toBe(true)
  })
  it('성별 표기(한글·"남자"·숫자)가 실제로 남/여로 정확히 매핑됐는지 고정한다', async () => {
    // count 단언만으로는 1/2이 뒤바뀌어 매핑돼도 통과한다 — 값 자체를 고정한다.
    const r = parseRosterGrid(await grid('rrn-and-gaps.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(kids(r)).toEqual([
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
    expect(kids(r)).toHaveLength(0)
    expect(r.rows).toHaveLength(1)
    expect(badCells(r.rows[0])).toEqual(expect.arrayContaining(['번호', '이름']))
  })
  it('성별·생년월일 열 자체가 없으면 missingCols로 알린다', async () => {
    const r = parseRosterGrid(await grid('missing-columns.xlsx'))
    if ('error' in r) throw new Error(r.error)
    expect(r.missingCols).toEqual(['성별', '생년월일'])
    expect(broken(r)).toHaveLength(3)     // 3명 전원이 성별·생년월일 없음
  })
  it('번호·이름 머리글을 못 찾으면 error를 돌려준다', () => {
    const r = parseRosterGrid([['아무', '표'], ['1', '2']])
    expect(r).toHaveProperty('error')
  })
})

describe('parseRosterGrid — 못 읽은 줄도 나머지 칸을 잃지 않는다', () => {
  it('[REGRESSION] 한 칸이 틀린 줄의 다른 세 칸은 파일 값 그대로 남는다', async () => {
    // 예전 모양(RosterProblem)은 번호·이름만 들고 나와, 이름이 빠진 줄의 **성별까지** 빈칸이
    // 됐다. 생년월일은 파일을 다시 열면 되지만 성별은 교사가 기억으로 채우게 되고, 그 오기는
    // 임상 기록에 그대로 남는다. rrn-and-gaps.xlsx 5줄 중 2줄이 이 손실을 겪었다.
    const r = parseRosterGrid(await grid('rrn-and-gaps.xlsx'))
    if ('error' in r) throw new Error(r.error)
    // 4번: 이름만 비었다 — 성별·생년월일은 살아 있어야 한다(파일의 엑셀 날짜 일련번호 43633)
    expect(r.rows[3]).toEqual({ childNo: '4', name: '', gender: '여', birth: '2019-06-17' })
    expect(badCells(r.rows[3])).toEqual(['이름'])
    // 5번: 생년월일만 비었다 — 성별은 살아 있어야 한다
    expect(r.rows[4]).toEqual({ childNo: '5', name: '정지아', gender: '여', birth: '' })
    expect(badCells(r.rows[4])).toEqual(['생년월일'])
  })
  it('줄 순서는 파일 그대로다 — 문제 있는 줄을 아래로 몰지 않는다', () => {
    // 교사가 엑셀을 옆에 띄워 놓고 대조하므로 순서가 어긋나면 어느 줄을 고치는 중인지 잃는다.
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['1', '김서아', '여', '2019-03-04'],
      ['2', '', '남', '2019-01-22'],          // 이름 없음
      ['3', '박하윤', '여', '2019-11-09'],
    ])
    if ('error' in r) throw new Error(r.error)
    expect(r.rows.map(c => c.childNo)).toEqual(['1', '2', '3'])
  })
  it('읽지 못한 값은 지우지 않고 파일 원문을 남긴다 — 빈칸(값 없음)과 구분되게', () => {
    const r = parseRosterGrid([
      ['번호', '성명', '성별', '생년월일'],
      ['2-1', '김서아', '남녀', '5/9/2019'],   // 셋 다 읽을 수 없는 표기
      ['2', '이도윤', '', ''],                 // 파일에 값이 아예 없음
    ])
    if ('error' in r) throw new Error(r.error)
    expect(r.rows[0]).toEqual({ childNo: '2-1', name: '김서아', gender: '남녀', birth: '5/9/2019' })
    expect(r.rows[1]).toEqual({ childNo: '2', name: '이도윤', gender: '', birth: '' })
  })
})

describe('dupChildNos — 같은 번호가 두 번', () => {
  it('겹친 번호만 돌려주고, 01과 1은 같은 번호로 본다', () => {
    const cells = ['1', '01', '3', '4'].map(childNo =>
      ({ childNo, name: '김서아', gender: '여', birth: '2019-03-04' }))
    expect(dupChildNos(cells)).toEqual(new Set([1]))
  })
  it('읽을 수 없는 번호는 세지 않는다 — 그 줄은 이미 번호 오류로 잡힌다', () => {
    const cells = ['2-1', '2-1'].map(childNo =>
      ({ childNo, name: '김서아', gender: '여', birth: '2019-03-04' }))
    expect(dupChildNos(cells).size).toBe(0)
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
