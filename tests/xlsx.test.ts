// xlsx 읽기 — 실제 엑셀 파일을 넣어 결과를 고정한다.
// 표본은 tests/fixtures/ 참고(가짜 데이터). 라이브러리 없이 ZIP+XML을 직접 읽으므로,
// 압축 방식·공유 문자열·날짜 셀 같은 구조가 깨지면 여기서 잡힌다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readXlsx } from '@/lib/xlsx'
import { normBirth } from '@/lib/birth'

const load = (name: string): ArrayBuffer => {
  const b = readFileSync(join(__dirname, 'fixtures', name))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

/** 파일 몇 개를 무압축(stored) zip으로 묶는다 — 시트 구성을 테스트마다 바꿔야 해서 픽스처 대신 여기서 만든다.
 *  readXlsx는 중앙 디렉터리를 읽으므로(lib/xlsx unzip) 그것까지 쓴다. */
function zipOf(files: Record<string, string>): ArrayBuffer {
  const local: Buffer[] = [], central: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8'), data = Buffer.from(text, 'utf8'), crc = crc32(data)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    local.push(lh, nameBuf, data)
    const ce = Buffer.alloc(46)
    ce.writeUInt32LE(0x02014b50, 0); ce.writeUInt16LE(20, 4); ce.writeUInt16LE(20, 6); ce.writeUInt16LE(0x0800, 8)
    ce.writeUInt32LE(crc, 16); ce.writeUInt32LE(data.length, 20); ce.writeUInt32LE(data.length, 24)
    ce.writeUInt16LE(nameBuf.length, 28); ce.writeUInt32LE(offset, 42)
    central.push(ce, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const body = Buffer.concat(local), dir = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  const count = Object.keys(files).length
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(count, 8); eocd.writeUInt16LE(count, 10)
  eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(body.length, 16)
  const out = Buffer.concat([body, dir, eocd])
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
/** 셀 하나(A1)짜리 시트 — 어느 시트를 읽었는지 이 글자로 가린다 */
const sheetXml = (text: string) =>
  `<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${text}</t></is></c></row></sheetData></worksheet>`
/** 탭 순서대로 시트를 적은 통합문서. 시트마다 [이름, 관계 id, 숨김?] */
const workbookXml = (sheets: [string, string, boolean?][]) =>
  `<workbook ${NS} xmlns:r="${REL}"><sheets>${sheets.map(([name, rid, hidden], i) =>
    `<sheet name="${name}" sheetId="${i + 1}"${hidden ? ' state="hidden"' : ''} r:id="${rid}"/>`).join('')}</sheets></workbook>`
const relsXml = (rels: [string, string, string?][]) =>
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map(([id, target, type]) =>
    `<Relationship Id="${id}" Type="${REL}/${type ?? 'worksheet'}" Target="${target}"/>`).join('')}</Relationships>`

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

// 「첫 시트」는 교사가 엑셀에서 보는 **탭 순서**의 첫 시트다. 파일 이름(sheetN.xml)의 번호는 시트를 만든 순서라
// 탭을 옮기면 갈린다 — 명단 시트를 맨 앞으로 옮겨도 다른 시트를 읽었다(2026-10-12 점검).
describe('readXlsx — 탭 순서 첫 시트', () => {
  it('[REGRESSION] 탭 순서와 파일 이름 순서가 다르면 탭 순서 첫 시트를 읽는다', async () => {
    const rows = await readXlsx(zipOf({
      'xl/workbook.xml': workbookXml([['명단', 'rId2'], ['메모', 'rId1']]),
      'xl/_rels/workbook.xml.rels': relsXml([['rId1', 'worksheets/sheet1.xml'], ['rId2', 'worksheets/sheet2.xml']]),
      'xl/worksheets/sheet1.xml': sheetXml('메모 시트'),
      'xl/worksheets/sheet2.xml': sheetXml('명단 시트'),
    }))
    expect(rows).toEqual([['명단 시트']])
  })
  it('숨긴 시트와 표가 아닌 탭(차트 시트)은 건너뛴다', async () => {
    const rows = await readXlsx(zipOf({
      'xl/workbook.xml': workbookXml([['숨김', 'rId1', true], ['차트', 'rId3'], ['명단', 'rId2']]),
      'xl/_rels/workbook.xml.rels': relsXml([
        ['rId1', 'worksheets/sheet1.xml'], ['rId2', 'worksheets/sheet2.xml'], ['rId3', 'chartsheets/sheet1.xml', 'chartsheet']]),
      'xl/worksheets/sheet1.xml': sheetXml('숨긴 시트'),
      'xl/worksheets/sheet2.xml': sheetXml('명단 시트'),
      'xl/chartsheets/sheet1.xml': '<chartsheet/>',
    }))
    expect(rows).toEqual([['명단 시트']])
  })
  it('관계 파일의 대상이 절대 경로(/xl/…)여도 찾는다', async () => {
    const rows = await readXlsx(zipOf({
      'xl/workbook.xml': workbookXml([['명단', 'rId1']]),
      'xl/_rels/workbook.xml.rels': relsXml([['rId1', '/xl/worksheets/sheet3.xml']]),
      'xl/worksheets/sheet1.xml': sheetXml('다른 시트'),
      'xl/worksheets/sheet3.xml': sheetXml('명단 시트'),
    }))
    expect(rows).toEqual([['명단 시트']])
  })
  it('관계 파일이 없으면 파일 이름의 번호 순서로 물러난다 — sheet10이 sheet2보다 앞서지 않는다', async () => {
    const rows = await readXlsx(zipOf({
      'xl/workbook.xml': workbookXml([['명단', 'rId1']]),
      'xl/worksheets/sheet10.xml': sheetXml('열 번째'),
      'xl/worksheets/sheet2.xml': sheetXml('두 번째'),
    }))
    expect(rows).toEqual([['두 번째']])
  })
})

describe('readXlsx — 잘못된 입력', () => {
  it('[REGRESSION] zip이 아닌 파일은 명확한 오류를 낸다 (Numbers 파일 등)', async () => {
    const notZip = new TextEncoder().encode('이건 엑셀이 아닙니다').buffer
    await expect(readXlsx(notZip as ArrayBuffer)).rejects.toThrow('zip 형식이 아닙니다')
  })
})
