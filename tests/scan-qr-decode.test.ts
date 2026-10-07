import { describe, expect, it } from 'vitest'
import jsQR from 'jsqr'
import { encodeQr } from '@/lib/qr'
import { PAGE_LONG_SIDE, findSheetQr } from '@/lib/scan-pages'
import { sheetQrText } from '@/lib/writing-sheet'

// 기록지 QR이 **스캔본 조건에서 실제로 읽히는지** — lib/qr(직접 만든 부호기)와 jsQR(판독)을 이어서 본다.
// 올리기 화면은 쪽을 긴 변 PAGE_LONG_SIDE(2000px)로 그린 뒤 오른쪽 위를 먼저, 못 찾으면 쪽 전체를 읽는다
// (lib/scan-pages). 여기서는 그 크기의 A4 쪽에 기록지와 같은 자리·크기(components/start/WritingSheets:
// 인쇄 여백 12mm·10mm 안의 오른쪽 위, 26mm)로 QR을 그리고, 스캔에서 흔한 변형을 준다.
// 판독이 실패하면 선생님이 직접 고르게 되므로 치명적이지는 않지만, 흔한 조건에서 실패하면 자동 연결이 무의미해진다.

const TEXT = sheetQrText('7c1e94a2', 5)
const W = Math.round(PAGE_LONG_SIDE * 210 / 297)
const H = PAGE_LONG_SIDE
const PX_PER_MM = H / 297
/** 기록지의 QR 자리 — 오른쪽 여백 10mm, 위 여백 12mm, 한 변 26mm(여백 4칸 포함) */
const QR_MM = { x: 210 - 10 - 26, y: 12, size: 26 }

interface Distort {
  /** 도(°) — 비스듬히 넣은 종이(쪽 가운데를 축으로 돈다 — 크게 돌리면 모서리의 QR이 종이 밖으로 밀려난다) */
  rotateDeg?: number
  /** 도(°) — QR 가운데를 축으로 돈다(휴대폰으로 비스듬히 찍은 사진처럼 QR만 기울어진 경우) */
  qrRotateDeg?: number
  /** 종이를 거꾸로 넣음 */
  upsideDown?: boolean
  /** 스캔 해상도가 낮아 흐려짐 — 이 배율로 줄였다가 다시 키운다(0.5 = 절반 해상도) */
  resample?: number
  /** 회색 잡음 진폭(0~255) */
  noise?: number
  /** 흐린 인쇄 — 검은 칸의 밝기(0 = 새까맣게, 120 = 흐린 회색) */
  ink?: number
  /** 오른쪽 위 모서리를 이만큼(QR 한 변 대비) 접어 가림 */
  foldCorner?: number
}

/** 기록지 한 쪽을 RGBA로 — 쪽 좌표를 거꾸로 따라가 QR 모듈을 고른다(2×2 초과 표본으로 가장자리를 부드럽게). */
function page(d: Distort = {}): Uint8ClampedArray {
  const qr = encodeQr(TEXT)
  const n = qr.size + 8                        // 여백 4칸씩
  const size = QR_MM.size * PX_PER_MM
  const x0 = QR_MM.x * PX_PER_MM, y0 = QR_MM.y * PX_PER_MM
  const aroundQr = d.qrRotateDeg !== undefined
  const cx = aroundQr ? x0 + size / 2 : W / 2, cy = aroundQr ? y0 + size / 2 : H / 2
  const th = ((d.qrRotateDeg ?? d.rotateDeg ?? 0) + (d.upsideDown ? 180 : 0)) * Math.PI / 180
  const cos = Math.cos(-th), sin = Math.sin(-th)
  const ink = d.ink ?? 0
  const out = new Uint8ClampedArray(W * H * 4)
  let seed = 12345
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0
    for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      // 출력 픽셀 → 돌리기 전 쪽 좌표
      const px = x + sx - cx, py = y + sy - cy
      const ux = cos * px - sin * py + cx, uy = sin * px + cos * py + cy
      const mx = Math.floor((ux - x0) / size * n) - 4, my = Math.floor((uy - y0) / size * n) - 4
      const dark = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size && qr.modules[my][mx]
      const folded = d.foldCorner && ux > x0 + size * (1 - d.foldCorner) && uy < y0 + size * d.foldCorner
      v += folded ? 200 : dark ? ink : 255
    }
    v /= 4
    if (d.noise) v += (rand() - 0.5) * 2 * d.noise
    const i = (y * W + x) * 4
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255
  }
  return d.resample ? resample(out, d.resample) : out
}

/** 낮은 해상도로 스캔한 뒤 키운 것처럼 — 상자 평균으로 줄이고 이중선형으로 되돌린다. */
function resample(src: Uint8ClampedArray, f: number): Uint8ClampedArray {
  const w = Math.round(W * f), h = Math.round(H * f)
  const small = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, c = 0
    for (let yy = Math.floor(y / f); yy < Math.min(H, Math.floor((y + 1) / f)); yy++)
      for (let xx = Math.floor(x / f); xx < Math.min(W, Math.floor((x + 1) / f)); xx++) { s += src[(yy * W + xx) * 4]; c++ }
    small[y * w + x] = c ? s / c : 255
  }
  const out = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const fx = Math.min(w - 1.001, x * f), fy = Math.min(h - 1.001, y * f)
    const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy
    const v = small[iy * w + ix] * (1 - ax) * (1 - ay) + small[iy * w + ix + 1] * ax * (1 - ay)
      + small[(iy + 1) * w + ix] * (1 - ax) * ay + small[(iy + 1) * w + ix + 1] * ax * ay
    const i = (y * W + x) * 4
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255
  }
  return out
}

/** 올리기 화면과 **같은 함수**로 읽는다(lib/scan-pages findSheetQr — 오른쪽 위 → 쪽 전체, 각각 그대로 → 흐리게). */
const read = (rgba: Uint8ClampedArray) => findSheetQr(jsQR, rgba, W, H)

const EXPECT = { tag: '7c1e94a2', childNo: 5 }

describe('기록지 QR — 스캔본 조건에서 읽히는가(lib/qr → jsQR)', () => {
  it('반듯한 스캔', () => {
    expect(read(page())).toEqual(EXPECT)
  })
  it('비스듬히 넣은 종이(±4°)', () => {
    expect(read(page({ rotateDeg: 4 }))).toEqual(EXPECT)
    expect(read(page({ rotateDeg: -4 }))).toEqual(EXPECT)
  })
  it('QR만 크게 기운 사진(20° · 90° · 135°)', () => {
    for (const qrRotateDeg of [20, 90, 135]) expect(read(page({ qrRotateDeg }))).toEqual(EXPECT)
  })
  it('거꾸로 넣은 종이는 QR이 왼쪽 아래로 가도 쪽 전체에서 읽힌다', () => {
    expect(read(page({ upsideDown: true }))).toEqual(EXPECT)
  })
  it('낮은 해상도로 스캔해 흐려져도', () => {
    // 2000px 긴 변 ≈ 171dpi. 그보다 거친 스캔 — 0.35배(≈60dpi)까지 내려도 읽혀야 넉넉하다
    expect(read(page({ resample: 0.85 }))).toEqual(EXPECT)
    expect(read(page({ resample: 0.35 }))).toEqual(EXPECT)
  })
  it('흐린 인쇄(토너 부족)', () => {
    expect(read(page({ ink: 110 }))).toEqual(EXPECT)
    expect(read(page({ ink: 160 }))).toEqual(EXPECT)
  })
  it('[REGRESSION] 티끌 잡음이 많으면 흐리게 한 번 더 읽는다 — 그대로는 못 읽던 수준(±30·±40)', () => {
    expect(read(page({ noise: 30 }))).toEqual(EXPECT)
    expect(read(page({ noise: 40, ink: 110 }))).toEqual(EXPECT)
  })
  it('모서리가 접혀 QR을 가리면 못 읽는다 — 그 쪽은 선생님이 고른다(엉뚱한 아이로 읽히지 않는다)', () => {
    expect(read(page({ foldCorner: 0.5 }))).toBeNull()
  })
})
