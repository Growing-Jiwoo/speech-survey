import { describe, it, expect } from 'vitest'
// 브라우저 작업(캔버스·pdfjs·jsQR)은 node에서 돌리지 않는다 — 함수 안에서만 불러오므로 import는 안전하다.
import {
  BLANK_INK_RATIO, MAX_SCAN_PAGES, ScanReadError, boxBlur3, fitScale, inkRatio, isBlankPage, qrSearchRegions,
  scanFileKind, scanReadErrorText,
} from '@/lib/scan-pages'

describe('scanFileKind — 받는 파일', () => {
  it('PDF와 JPG·PNG만', () => {
    expect(scanFileKind({ type: 'application/pdf', name: 'a.pdf' })).toBe('pdf')
    expect(scanFileKind({ type: 'image/jpeg', name: 'a.jpg' })).toBe('image')
    expect(scanFileKind({ type: 'image/png', name: 'a.png' })).toBe('image')
  })
  it('형식 정보가 비어 오면(일부 PC·드래그) 확장자로 본다', () => {
    expect(scanFileKind({ type: '', name: '1-2 기록지.PDF' })).toBe('pdf')
    expect(scanFileKind({ type: '', name: 'IMG_0001.JPEG' })).toBe('image')
  })
  it('PC마다 다른 형식 이름(image/jpg · octet-stream)도 받는다', () => {
    expect(scanFileKind({ type: 'image/jpg', name: 'a.jpg' })).toBe('image')
    expect(scanFileKind({ type: 'application/octet-stream', name: 'scan.PDF' })).toBe('pdf')
  })
  it('휴대폰 HEIC·워드·확장자만 PDF인 다른 형식은 받지 않는다', () => {
    expect(scanFileKind({ type: 'image/heic', name: 'IMG_0001.HEIC' })).toBeNull()
    expect(scanFileKind({ type: 'application/msword', name: 'a.doc' })).toBeNull()
    expect(scanFileKind({ type: 'text/plain', name: 'x.pdf' })).toBeNull()
  })
})

describe('fitScale — 긴 변을 줄이는 배율(키우지 않는다)', () => {
  it('큰 사진은 긴 변을 맞춘다', () => {
    expect(fitScale(4000, 3000, 2000)).toBe(0.5)
    expect(fitScale(2480, 3508, 2000)).toBeCloseTo(2000 / 3508)
  })
  it('작으면 1', () => {
    expect(fitScale(800, 600, 2000)).toBe(1)
  })
})

describe('qrSearchRegions — 오른쪽 위 먼저, 못 찾으면 쪽 전체', () => {
  it('첫 영역은 오른쪽 절반 · 위 30%(임시 기록지의 QR 자리), 둘째는 쪽 전체', () => {
    const [corner, full] = qrSearchRegions(1414, 2000)
    expect(corner).toEqual({ x: 707, y: 0, w: 707, h: 600 })
    expect(full).toEqual({ x: 0, y: 0, w: 1414, h: 2000 })
  })
  it('홀수 폭도 오른쪽 끝까지 덮는다(1px도 빠지지 않게)', () => {
    const [corner] = qrSearchRegions(1001, 999)
    expect(corner.x + corner.w).toBe(1001)
  })
})

describe('scanReadErrorText — 무엇을 하면 되는지까지', () => {
  it('파일 이름을 넣어 알려 준다', () => {
    expect(scanReadErrorText(new ScanReadError('type', 'a.heic'))).toMatch(/「a.heic」.*PDF나 JPG·PNG/)
    expect(scanReadErrorText(new ScanReadError('password', 'b.pdf'))).toMatch(/암호/)
  })
  it('너무 큰 파일은 크기를 알려 준다', () => {
    expect(scanReadErrorText(new ScanReadError('tooBig', 'class.pdf'))).toMatch(/「class.pdf」.*150MB/)
  })
  it('쪽 수 상한을 알려 준다', () => {
    expect(scanReadErrorText(new ScanReadError('tooMany'))).toContain(`${MAX_SCAN_PAGES}쪽`)
  })
})

describe('boxBlur3 — 잡음 많은 쪽을 다시 읽을 때의 흐림', () => {
  const rgba = (vals: number[]) => new Uint8ClampedArray(vals.flatMap(v => [v, v, v, 255]))
  it('고른 밝기는 그대로, 가장자리도 칸 밖을 읽지 않는다', () => {
    const out = boxBlur3(rgba(Array(9).fill(200)), 3, 3)
    expect([...out].filter((_, i) => i % 4 === 0)).toEqual(Array(9).fill(200))
    expect(out[3]).toBe(255)
  })
  it('한 점 티끌은 주변과 섞여 옅어진다', () => {
    const vals = Array(25).fill(255); vals[12] = 0
    const out = boxBlur3(rgba(vals), 5, 5)
    expect(out[12 * 4]).toBeGreaterThan(200)
  })
})


describe('isBlankPage — 빈 쪽(양면 스캔의 뒷면)', () => {
  const W = 200, H = 280
  const page = (paint: (put: (x: number, y: number) => void) => void) => {
    const a = new Uint8ClampedArray(W * H * 4).fill(250)
    paint((x, y) => { const q = (y * W + x) * 4; a[q] = a[q + 1] = a[q + 2] = 20 })
    return a
  }
  it('흰 종이는 빈 쪽', () => {
    expect(inkRatio(page(() => {}), W, H)).toBe(0)
    expect(isBlankPage(page(() => {}), W, H)).toBe(true)
  })
  it('흩어진 티끌(0.1% 미만)은 빈 쪽으로 본다', () => {
    const a = page(put => { for (let i = 0; i < 20; i++) put((i * 37) % W, (i * 53) % H) })
    expect(inkRatio(a, W, H)).toBeLessThan(BLANK_INK_RATIO)
    expect(isBlankPage(a, W, H)).toBe(true)
  })
  it('칸 테두리·글씨가 있으면(1%대) 빈 쪽이 아니다 — QR을 못 읽은 기록지가 「올리지 않음」으로 빠지지 않게', () => {
    // 가로줄 몇 개 = 쓰는 칸 테두리(실제 기록지는 아무것도 안 써도 약 1%, 쓰면 약 2%)
    const a = page(put => { for (const y of [40, 41, 120, 121, 200, 201]) for (let x = 10; x < W - 10; x++) put(x, y) })
    expect(inkRatio(a, W, H)).toBeGreaterThan(BLANK_INK_RATIO)
    expect(isBlankPage(a, W, H)).toBe(false)
  })
})

describe('MAX_SCAN_PAGES — 양면 스캔도 한 번에', () => {
  it('40명 반의 양면(80쪽)이 들어간다 — PDF는 나누기 어려워 상한이 낮으면 막힌다', () => {
    expect(MAX_SCAN_PAGES).toBeGreaterThanOrEqual(80)
    expect(scanReadErrorText(new ScanReadError('tooMany'))).toContain(`${MAX_SCAN_PAGES}쪽`)
  })
})
