// xlsx 쓰기 — 라이브러리 없이 만든 파일을 같은 저장소의 읽기(lib/xlsx readXlsx)로 다시 읽어 왕복을 본다.
// ZIP 구조(중앙 디렉터리·CRC)는 node:zlib의 crc32와 대조한다 — CRC가 틀리면 엑셀이 「손상된 파일」이라고 한다.
import { crc32 as zlibCrc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readXlsx } from '@/lib/xlsx'
import { columnName, crc32, escapeXml, writeXlsx, zipStore } from '@/lib/xlsx-write'

const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

/** 중앙 디렉터리를 따라 `{ 이름: 내용 }` — STORE만 다룬다(이 모듈이 압축하지 않으므로). CRC도 함께 돌려준다. */
function entries(u: Uint8Array): Map<string, { data: Uint8Array; crc: number; method: number }> {
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength)
  const eocd = u.length - 22
  expect(v.getUint32(eocd, true)).toBe(0x06054b50)
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out = new Map<string, { data: Uint8Array; crc: number; method: number }>()
  for (let k = 0; k < count; k++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50)
    const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true), local = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nameLen))
    expect(v.getUint32(local, true)).toBe(0x04034b50)
    const at = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    out.set(name, { data: u.subarray(at, at + size), crc, method })
    p += 46 + nameLen
  }
  return out
}

describe('crc32 — ZIP이 요구하는 값', () => {
  it('node:zlib crc32와 같다(빈 값·ASCII·한글)', () => {
    for (const s of ['', 'a', 'The quick brown fox', '아동 코드 017-03'])
      expect(crc32(new TextEncoder().encode(s))).toBe(zlibCrc32(Buffer.from(s, 'utf8')))
  })
})

describe('columnName', () => {
  it('A · Z · AA · AZ · BA · ZZ · AAA', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA'])
  })
})

describe('escapeXml', () => {
  it('& < > " 를 바꾸고 XML에 못 넣는 제어 문자는 지운다(탭·줄바꿈은 둔다)', () => {
    expect(escapeXml('a&b<c>"d"\u0001\te\n')).toBe('a&amp;b&lt;c&gt;&quot;d&quot;\te\n')
  })
})

describe('writeXlsx — 왕복(lib/xlsx readXlsx)', () => {
  it('글자·숫자·빈 칸이 같은 자리로 돌아온다', async () => {
    const bytes = writeXlsx([{ name: 'KODYS-G1-S2', rows: [
      ['아동 코드', '학년', '낱말01', '문장1 초'],
      ['017-03', 1, 'O', 12.3],
      ['017-04', 1, null, undefined],       // 빈 칸은 칸을 만들지 않는다 → 읽으면 줄 끝이 잘린다
      ['A&B <x>', 2, '', 0],                // 특수 문자 · 빈 글자 · 숫자 0
    ] }])
    expect(await readXlsx(ab(bytes))).toEqual([
      ['아동 코드', '학년', '낱말01', '문장1 초'],
      ['017-03', '1', 'O', '12.3'],
      ['017-04', '1'],
      ['A&B <x>', '2', '', '0'],
    ])
  })

  it('가운데 빈 칸은 자리를 지킨다 — 열이 밀리면 다른 문항 점수가 된다', async () => {
    const bytes = writeXlsx([{ name: 'S', rows: [['a', 'b', 'c'], ['x', null, 'z']] }])
    expect(await readXlsx(ab(bytes))).toEqual([['a', 'b', 'c'], ['x', '', 'z']])
  })

  it('숫자는 숫자 칸(<v>), 글자는 인라인 문자열 · 머리글은 굵게', () => {
    const files = entries(writeXlsx([{ name: 'S', rows: [['머리'], [7], ['칸']] }]))
    const xml = new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml')!.data)
    expect(xml).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">머리</t></is></c>')
    expect(xml).toContain('<c r="A2"><v>7</v></c>')
    expect(xml).toContain('<c r="A3" t="inlineStr">')
    expect(xml).toContain('state="frozen"')   // 첫 줄 틀 고정
  })

  it('NaN·Infinity는 빈 칸이다(엑셀이 못 읽는 값을 쓰지 않는다)', async () => {
    const bytes = writeXlsx([{ name: 'S', rows: [['a', 'b', 'c'], [NaN, Infinity, 1]] }])
    expect(await readXlsx(ab(bytes))).toEqual([['a', 'b', 'c'], ['', '', '1']])
  })

  it('시트 여러 개 — 탭 순서대로 통합문서에 오르고, 각 시트 파일이 따로 있다', async () => {
    const bytes = writeXlsx([
      { name: 'KODYS-G1', rows: [['h'], ['one']] },
      { name: 'KODYS-G2-S2', rows: [['h'], ['two']] },
    ])
    const files = entries(bytes)
    const wb = new TextDecoder().decode(files.get('xl/workbook.xml')!.data)
    expect(wb.indexOf('name="KODYS-G1"')).toBeLessThan(wb.indexOf('name="KODYS-G2-S2"'))
    expect(new TextDecoder().decode(files.get('xl/worksheets/sheet2.xml')!.data)).toContain('two')
    // readXlsx는 탭 순서 첫 시트를 읽는다
    expect(await readXlsx(ab(bytes))).toEqual([['h'], ['one']])
  })

  it('ZIP 항목마다 STORE이고 CRC가 내용과 맞다 · 첫 항목은 [Content_Types].xml', () => {
    const files = entries(writeXlsx([{ name: 'S', rows: [['가'], [1]] }]))
    expect([...files.keys()][0]).toBe('[Content_Types].xml')
    for (const [name, f] of files) {
      expect(f.method, name).toBe(0)
      expect(f.crc, name).toBe(zlibCrc32(Buffer.from(f.data)))
    }
    const ct = new TextDecoder().decode(files.get('[Content_Types].xml')!.data)
    expect(ct).toContain('/xl/worksheets/sheet1.xml')
    expect(ct).toContain('/xl/styles.xml')
  })

  it('같은 입력이면 같은 바이트다(파일 시각 고정)', () => {
    const sheets = [{ name: 'S', rows: [['a'], [1]] }]
    expect(Buffer.from(writeXlsx(sheets)).equals(Buffer.from(writeXlsx(sheets)))).toBe(true)
  })

  it('엑셀이 거부하는 시트 이름·겹치는 이름·시트 없음은 던진다', () => {
    expect(() => writeXlsx([])).toThrow()
    expect(() => writeXlsx([{ name: 'a/b', rows: [] }])).toThrow()
    expect(() => writeXlsx([{ name: 'x'.repeat(32), rows: [] }])).toThrow()
    expect(() => writeXlsx([{ name: 'Same', rows: [] }, { name: 'same', rows: [] }])).toThrow()
  })
})

describe('zipStore', () => {
  it('빈 파일도 담는다', () => {
    const files = entries(zipStore([{ name: 'a.txt', data: new Uint8Array() }]))
    expect(files.get('a.txt')!.data.length).toBe(0)
  })
})
