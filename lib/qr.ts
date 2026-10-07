// lib/qr.ts — QR 코드 인코더(바이트 모드 · 버전 1~6 · 오류 정정 M/Q). 의존성 없음.
//
// 쓰기 기록지 구석에 찍는 「기계용 이름표」(lib/writing-sheet.ts)를 만든다. 싣는 글자는 20자 안팎이라
// 작은 버전만 있으면 된다 — 범용 라이브러리를 들이지 않고 필요한 만큼만 둔다.
// 알고리즘은 ISO/IEC 18004 그대로다(표·다항식·배치 규칙). 결과가 표준과 같은지는
// tests/qr.test.ts가 검증된 인코더(segno)의 출력과 모듈 단위로 대조한다 — 여기를 고치면 그 대조가 지킨다.

export type QrEcc = 'M' | 'Q'

/** 버전별 블록 구성: [블록당 오류 정정 코드어 수, [블록 수, 블록당 데이터 코드어 수][]] */
const BLOCKS: Record<QrEcc, [number, [number, number][]][]> = {
  M: [[10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]]],
  Q: [[13, [[1, 13]]], [22, [[1, 22]]], [18, [[2, 17]]], [26, [[2, 24]]], [18, [[2, 15], [2, 16]]], [24, [[4, 19]]]],
}
/** 정렬 패턴 중심 좌표(버전 2~6은 하나씩 — 6과 이것) */
const ALIGN: number[] = [0, 18, 22, 26, 30, 34]
/** 형식 정보의 오류 정정 수준 비트 */
const ECC_BITS: Record<QrEcc, number> = { M: 0, Q: 3 }

export interface QrCode {
  version: number
  size: number
  mask: number
  /** modules[y][x] — true가 검은 칸. 여백(quiet zone)은 포함하지 않는다 */
  modules: boolean[][]
}

// ── GF(256) (원시 다항식 0x11D) ──
const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

/** 차수 n의 리드-솔로몬 생성 다항식 계수(최고차 1은 생략) */
function generator(n: number): number[] {
  let g = [1]
  for (let i = 0; i < n; i++) {
    const next = new Array<number>(g.length + 1).fill(0)
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]) }
    g = next
  }
  return g.slice(1)
}

function remainder(data: number[], n: number): number[] {
  const gen = generator(n)
  const r = new Array<number>(n).fill(0)
  for (const d of data) {
    const factor = d ^ r.shift()!
    r.push(0)
    for (let i = 0; i < n; i++) r[i] ^= mul(gen[i], factor)
  }
  return r
}

function dataCapacity(version: number, ecc: QrEcc): number {
  return BLOCKS[ecc][version - 1][1].reduce((s, [count, len]) => s + count * len, 0)
}

/** 바이트 모드 비트열 → 채움 바이트까지 붙인 데이터 코드어 */
function dataCodewords(bytes: Uint8Array, version: number, ecc: QrEcc): number[] {
  const cap = dataCapacity(version, ecc)
  const bits: number[] = []
  const push = (v: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1) }
  push(0b0100, 4)
  push(bytes.length, 8)          // 버전 1~9의 바이트 모드 길이 필드는 8비트
  for (const b of bytes) push(b, 8)
  push(0, Math.min(4, cap * 8 - bits.length))
  while (bits.length % 8) bits.push(0)
  const out: number[] = []
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  for (let pad = 0xec; out.length < cap; pad ^= 0xec ^ 0x11) out.push(pad)
  return out
}

/** 블록으로 나눠 오류 정정 코드어를 붙이고 표준 순서로 끼워 넣는다 */
function interleave(data: number[], version: number, ecc: QrEcc): number[] {
  const [ecLen, groups] = BLOCKS[ecc][version - 1]
  const blocks: { d: number[]; e: number[] }[] = []
  let k = 0
  for (const [count, len] of groups)
    for (let i = 0; i < count; i++) { const d = data.slice(k, k + len); k += len; blocks.push({ d, e: remainder(d, ecLen) }) }
  const out: number[] = []
  const maxD = Math.max(...blocks.map(b => b.d.length))
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i])
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i])
  return out
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function build(codewords: number[], version: number, ecc: QrEcc, mask: number): QrCode {
  const size = version * 4 + 17
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const set = (x: number, y: number, dark: boolean) => { m[y][x] = dark; fn[y][x] = true }

  // 타이밍 패턴
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  // 위치 찾기 패턴 + 분리 여백
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || y < 0 || x >= size || y >= size) continue
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      set(x, y, d !== 2 && d !== 4)
    }
  }
  // 정렬 패턴(버전 2 이상 — 이 범위에서는 하나)
  if (version >= 2) {
    const c = ALIGN[version - 1]
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(c + dx, c + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  // 형식 정보 자리 예약(값은 마스크를 정한 뒤 쓴다) + 어두운 모듈
  drawFormat(set, size, ecc, 0)

  // 데이터 배치 — 오른쪽 아래에서 두 열씩 지그재그, 세로 타이밍 열(6)은 건너뛴다
  let bit = 0
  const total = codewords.length * 8
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j
      const upward = ((right + 1) & 2) === 0
      const y = upward ? size - 1 - v : v
      if (fn[y][x] || bit >= total) continue
      m[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1
      bit++
    }
  }
  const test = MASKS[mask]
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && test(x, y)) m[y][x] = !m[y][x]
  drawFormat(set, size, ecc, mask)
  return { version, size, mask, modules: m }
}

function drawFormat(set: (x: number, y: number, dark: boolean) => void, size: number, ecc: QrEcc, mask: number) {
  const data = (ECC_BITS[ecc] << 3) | mask
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const bits = ((data << 10) | rem) ^ 0x5412
  const b = (i: number) => ((bits >>> i) & 1) === 1
  for (let i = 0; i <= 5; i++) set(8, i, b(i))
  set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, b(i))
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i))
  set(8, size - 8, true)
}

/** 표준 벌점(N1 연속 · N2 2×2 · N3 찾기 패턴 닮은꼴 · N4 명암 비율) — 가장 낮은 마스크를 고른다 */
function penalty(q: QrCode): number {
  const { size, modules: m } = q
  let score = 0
  const line = (get: (i: number) => boolean) => {
    let s = 0, run = 1
    for (let i = 1; i < size; i++) {
      if (get(i) === get(i - 1)) run++
      else { if (run >= 5) s += run - 2; run = 1 }
    }
    if (run >= 5) s += run - 2
    const bits = Array.from({ length: size }, (_, i) => get(i))
    const pat = [true, false, true, true, true, false, true]
    for (let i = 0; i + 7 <= size; i++) {
      if (!pat.every((p, k) => bits[i + k] === p)) continue
      const before = i >= 4 && bits.slice(i - 4, i).every(v => !v)
      const after = i + 11 <= size && bits.slice(i + 7, i + 11).every(v => !v)
      if (before || after) s += 40
    }
    return s
  }
  for (let y = 0; y < size; y++) score += line(i => m[y][i])
  for (let x = 0; x < size; x++) score += line(i => m[i][x])
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
    const c = m[y][x]
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3
  }
  const dark = m.reduce((s, row) => s + row.filter(Boolean).length, 0)
  const k = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1
  return score + Math.max(0, k) * 10
}

/**
 * 글자열을 QR로. 들어가는 가장 작은 버전(1~6)을 고른다.
 * `mask`를 주면 그 마스크로 고정한다(대조 테스트용) — 없으면 벌점이 가장 낮은 것.
 */
export function encodeQr(text: string, ecc: QrEcc = 'Q', mask?: number): QrCode {
  const bytes = new TextEncoder().encode(text)
  let version = 0
  for (let v = 1; v <= 6 && !version; v++) if (dataCapacity(v, ecc) * 8 >= 4 + 8 + bytes.length * 8) version = v
  if (!version) throw new Error(`QR에 담기에 너무 긴 글자열입니다(${bytes.length}바이트)`)
  const codewords = interleave(dataCodewords(bytes, version, ecc), version, ecc)
  if (mask !== undefined) return build(codewords, version, ecc, mask)
  let best: QrCode | null = null
  let bestScore = Infinity
  for (let k = 0; k < 8; k++) {
    const q = build(codewords, version, ecc, k)
    const s = penalty(q)
    if (s < bestScore) { best = q; bestScore = s }
  }
  return best!
}

/** 대조 테스트용 내부 단계(tests/qr.test.ts). 화면 코드는 encodeQr만 쓴다. */
export const qrInternals = { dataCodewords, interleave, build }

/** 검은 칸을 SVG path 하나로(1칸 = 1단위). viewBox는 여백 `border`칸을 포함한 정사각형이다. */
export function qrSvgPath(q: QrCode, border = 4): { d: string; viewBox: string } {
  const parts: string[] = []
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++)
    if (q.modules[y][x]) parts.push(`M${x + border} ${y + border}h1v1h-1z`)
  const n = q.size + border * 2
  return { d: parts.join(''), viewBox: `0 0 ${n} ${n}` }
}
