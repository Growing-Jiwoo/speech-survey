import { describe, expect, it } from 'vitest'
import { encodeQr, qrInternals, qrSvgPath, type QrEcc } from '@/lib/qr'
import vectors from './fixtures/qr-vectors.json'

// 대조 기준: 검증된 파이썬 인코더 segno(make_qr, mode='byte', boost_error=False)로 뽑은 행렬.
// 마스크를 고정해 모듈 하나까지 같은지 본다 — 배치·리드-솔로몬·끼워 넣기·형식 정보가 하나라도
// 틀리면 여기서 걸린다.
//
// ⚠️ segno는 비트열이 바이트 경계에서 끝나도 0 바이트를 하나 더 넣는다(`8 - len % 8`이 8이 된다).
// 표준(ISO/IEC 18004 7.4.10)은 경계에서 끝나면 채움 비트를 넣지 않는다 — 우리 인코더가 표준 쪽이다.
// 종단자 뒤라 판독 결과는 같지만 행렬이 달라지므로, 대조할 때만 segno식 코드어를 만들어 넣는다.
const rows = (m: boolean[][]) => m.map(r => r.map(c => (c ? '1' : '0')).join(''))
const { dataCodewords, interleave, build } = qrInternals

function segnoStyle(text: string, version: number, ecc: QrEcc): number[] {
  const bytes = new TextEncoder().encode(text)
  const std = dataCodewords(bytes, version, ecc)
  const end = 2 + bytes.length  // 모드 4 + 길이 8 + 데이터 + 종단자 4 = 정확히 (2 + n)바이트
  return end < std.length ? [...std.slice(0, end), 0x00, ...std.slice(end, std.length - 1)] : std
}

describe('QR 배치·오류 정정 — segno 출력과 모듈 단위 대조', () => {
  for (const v of vectors as { text: string; ecc: QrEcc; mask: number; version: number; rows: string[] }[]) {
    it(`${JSON.stringify(v.text.slice(0, 14))} · ${v.ecc} · 마스크 ${v.mask} → 버전 ${v.version}`, () => {
      expect(encodeQr(v.text, v.ecc, v.mask).version).toBe(v.version)
      const q = build(interleave(segnoStyle(v.text, v.version, v.ecc), v.version, v.ecc), v.version, v.ecc, v.mask)
      expect(q.size).toBe(v.rows.length)
      expect(rows(q.modules)).toEqual(v.rows)
    })
  }
})

describe('데이터 코드어 — 표준 채움 규칙', () => {
  it('「A」(버전 1-Q): 모드·길이·데이터·종단자 뒤 0xEC·0x11을 번갈아 채운다', () => {
    expect(dataCodewords(new TextEncoder().encode('A'), 1, 'Q'))
      .toEqual([0x40, 0x14, 0x10, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11])
  })

  it('용량을 꽉 채우면 채움 바이트가 없다', () => {
    const cw = dataCodewords(new TextEncoder().encode('y'.repeat(60)), 5, 'Q')
    expect(cw).toHaveLength(62)
    expect(cw.slice(-2)).not.toContain(0xec)
  })
})

describe('encodeQr — 자동 마스크와 경계', () => {
  it('마스크를 주지 않으면 0~7 중 하나를 고르고 버전은 같다', () => {
    const q = encodeQr('SHEET-W:7c1e94a2:05')
    expect(q.version).toBe(2)
    expect(q.mask).toBeGreaterThanOrEqual(0)
    expect(q.mask).toBeLessThanOrEqual(7)
  })

  it('고른 마스크로 고정해 다시 만들면 같은 행렬이다(자동 선택이 배치를 바꾸지 않는다)', () => {
    const auto = encodeQr('SHEET-W:7c1e94a2:05')
    expect(rows(encodeQr('SHEET-W:7c1e94a2:05', 'Q', auto.mask).modules)).toEqual(rows(auto.modules))
  })

  it('버전 6(Q)에 들어가지 않으면 던진다 — 조용히 잘라 넣지 않는다', () => {
    expect(() => encodeQr('z'.repeat(200))).toThrow(/너무 긴/)
  })

  it('SVG path는 검은 칸 수만큼 사각형을 만들고, viewBox는 여백을 포함한다', () => {
    const q = encodeQr('A', 'Q', 2)
    const { d, viewBox } = qrSvgPath(q, 4)
    const dark = q.modules.flat().filter(Boolean).length
    expect(d.match(/M/g)?.length).toBe(dark)
    expect(viewBox).toBe(`0 0 ${q.size + 8} ${q.size + 8}`)
  })
})
