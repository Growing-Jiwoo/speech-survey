// lib/scan-pages.ts — 올린 쓰기 기록지 스캔본(PDF·사진)을 쪽마다 JPEG로 바꾸고 QR을 읽는다. **브라우저 전용.**
// 교사 결과지의 올리기 확인 화면(components/results/ScanUpload)이 쓴다.
//
// 파일을 서버로 그대로 보내지 않고 여기서 쪽으로 나누는 이유: 반 전체 PDF는 서버리스 본문 상한(4.5MB)을
// 쉽게 넘고, 쪽마다 누구 기록지인지는 **선생님이 보는 화면에서** 확인해야 한다(QR을 못 읽은 쪽은 선생님이
// 고른다 — lib/scan-mapping). 올릴 때는 쪽 하나씩 보낸다(app/api/results/[token]/scans).
//
// pdfjs(PDF 그리기)와 jsQR(QR 읽기)은 파일을 고를 때만 불러온다 — 결과지 화면 첫 로딩을 무겁게 하지 않는다.
// 화질 검사는 하지 않는다(사용자 확정 2026-09-30) — 잘 스캔된 종이를 시스템이 잘못 경고하면 선생님만 번거롭다.
// QR을 못 읽으면 그 쪽은 「누구 기록지인지 골라 주세요」가 된다. 단 거의 흰 쪽(양면 스캔의 뒷면)은 「빈 쪽」으로
// 두어 올리지 않는다(isBlankPage) — 반의 절반이 「골라 주세요」로 뜨면 진짜 못 읽은 쪽이 묻힌다.
import { parseSheetQr } from './writing-sheet'

/** 한 번에 올릴 수 있는 쪽 수 — 양면으로 스캔하면 빈 뒷면까지 쪽 수가 두 배다. 40명 반의 양면(80쪽)도 한 번에
 *  들어가게 한다. 쪽마다 그림을 들고 있어 더 많으면 브라우저가 버겁다(PDF는 나누기 어려워 상한이 낮으면 막힌다). */
export const MAX_SCAN_PAGES = 100
/** 빈 쪽 판정 — 어두운 점(밝기 < 140)이 이 비율보다 적으면 빈 쪽. 기록지는 칸 테두리·머리말·QR만으로도 1%를
 *  넘고(QR 하나가 약 0.7%), 흰 종이의 스캔 티끌은 0.1%에 못 미친다. 쪽 그림은 남겨 선생님이 바꿀 수 있다. */
export const BLANK_INK_RATIO = 0.002
/** 올리는 그림의 긴 변(px) — A4면 약 170dpi. 손글씨 판독에 충분하고 한 장이 1MB 안팎이라 한 요청에 들어간다. */
export const PAGE_LONG_SIDE = 2000
/** 파일 하나의 상한 — 한 반 300dpi 회색조 PDF도 수십 MB다. 이보다 크면 브라우저가 통째로 읽다 멈춘다. */
export const MAX_FILE_BYTES = 150 * 1024 * 1024
/** PDF를 여는 시간 제한 — 작업자가 뜨지 않으면(구형 브라우저·보안 설정) 「여는 중」에서 영영 멈춘다 */
const PDF_OPEN_TIMEOUT_MS = 60_000
const THUMB_LONG_SIDE = 480
const JPEG_QUALITY = 0.85
const THUMB_QUALITY = 0.7

export type ScanFileKind = 'pdf' | 'image'

/** 받는 파일 — PDF와 JPG·PNG. 휴대폰 HEIC 등은 브라우저가 못 여는 경우가 많아 받지 않는다(안내로 돌린다).
 *  형식 정보는 PC마다 제각각이라(`image/jpg`·`application/octet-stream`·빈 값) 모르는 형식이면 확장자로 본다.
 *  알려진 **다른** 형식(`image/heic`·`text/plain` 등)은 확장자와 무관하게 받지 않는다. */
export function scanFileKind(f: { type: string; name: string }): ScanFileKind | null {
  const t = f.type.toLowerCase(), n = f.name.toLowerCase()
  if (t === 'application/pdf') return 'pdf'
  if (['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png'].includes(t)) return 'image'
  if (t && t !== 'application/octet-stream') return null
  if (n.endsWith('.pdf')) return 'pdf'
  return /\.(jpe?g|png)$/.test(n) ? 'image' : null
}

/** 긴 변을 maxSide 이하로 줄이는 배율 — 작은 그림은 키우지 않는다. */
export function fitScale(w: number, h: number, maxSide: number): number {
  const long = Math.max(w, h)
  return long > maxSide ? maxSide / long : 1
}

/** QR을 찾아볼 영역 — 임시 기록지는 오른쪽 위다(components/start/WritingSheets). 거기서 못 찾으면 쪽 전체
 *  (거꾸로 넣은 종이·비스듬한 사진·담당자 양식에서 자리가 바뀐 경우). */
export function qrSearchRegions(w: number, h: number): { x: number; y: number; w: number; h: number }[] {
  const x = Math.floor(w * 0.5), ch = Math.max(1, Math.ceil(h * 0.3))
  return [{ x, y: 0, w: Math.max(1, w - x), h: ch }, { x: 0, y: 0, w, h }]
}

/** 3×3 상자 흐림(밝기만, RGBA 그대로 돌려준다) — 점 티끌 같은 스캔 잡음이 많은 쪽을 한 번 더 읽어 볼 때 쓴다.
 *  jsQR은 작은 구역마다 문턱을 잡는데, 흰 바탕의 티끌이 그 문턱을 흔들어 찾기 무늬를 놓친다. 가로·세로로 나눠 계산한다. */
export function boxBlur3(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const lum = new Float32Array(w * h)
  for (let i = 0, q = 0; i < w * h; i++, q += 4) lum[i] = (src[q] * 299 + src[q + 1] * 587 + src[q + 2] * 114) / 1000
  const tmp = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const l = x > 0 ? lum[i - 1] : lum[i], r = x < w - 1 ? lum[i + 1] : lum[i]
    tmp[i] = (l + lum[i] + r) / 3
  }
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    const u = y > 0 ? tmp[i - w] : tmp[i], d = y < h - 1 ? tmp[i + w] : tmp[i]
    const v = (u + tmp[i] + d) / 3, q = i * 4
    out[q] = out[q + 1] = out[q + 2] = v; out[q + 3] = 255
  }
  return out
}

/** 어두운 점의 비율(가로·세로 2칸마다 하나씩 본다 — 2000px 쪽도 몇 ms). */
export function inkRatio(rgba: Uint8ClampedArray, w: number, h: number): number {
  let dark = 0, seen = 0
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const q = (y * w + x) * 4
    if (rgba[q] * 299 + rgba[q + 1] * 587 + rgba[q + 2] * 114 < 140 * 1000) dark++
    seen++
  }
  return seen === 0 ? 0 : dark / seen
}

/** 거의 흰 쪽인가(BLANK_INK_RATIO). QR을 못 읽은 쪽에만 묻는다 — QR이 있으면 기록지다. */
export const isBlankPage = (rgba: Uint8ClampedArray, w: number, h: number) => inkRatio(rgba, w, h) < BLANK_INK_RATIO

/** jsQR과 같은 모양의 판독 함수 — 테스트가 실물 jsQR을 그대로 넘긴다 */
export type QrDecode = (data: Uint8ClampedArray, w: number, h: number, o: { inversionAttempts: 'dontInvert' }) => { data: string } | null

/**
 * 쪽 하나(RGBA)에서 우리 기록지의 QR을 찾는다 — 오른쪽 위 → 쪽 전체 순서로, 각 영역을 그대로 한 번,
 * 못 읽으면 흐리게 한 번 더(잡음이 많은 스캔). 다른 QR(우리 기록지가 아닌 것)은 못 읽은 것과 같다.
 * 순수 함수라 node 테스트가 올리기 화면과 **같은 경로**를 탄다(tests/scan-qr-decode.test.ts).
 */
export function findSheetQr(decode: QrDecode, rgba: Uint8ClampedArray, w: number, h: number): ScanPageImage['qr'] {
  for (const r of qrSearchRegions(w, h)) {
    const crop = r.x === 0 && r.y === 0 && r.w === w && r.h === h ? rgba : new Uint8ClampedArray(r.w * r.h * 4)
    if (crop !== rgba)
      for (let y = 0; y < r.h; y++) crop.set(rgba.subarray(((r.y + y) * w + r.x) * 4, ((r.y + y) * w + r.x + r.w) * 4), y * r.w * 4)
    for (const blurred of [false, true]) {
      // 기록지는 흰 종이에 검은 QR이다 — 반전 시도는 시간만 두 배로 든다
      const hit = decode(blurred ? boxBlur3(crop, r.w, r.h) : crop, r.w, r.h, { inversionAttempts: 'dontInvert' })
      const parsed = hit ? parseSheetQr(hit.data) : null
      if (parsed) return parsed
    }
  }
  return null
}

export interface ScanPageImage {
  /** 고른 파일들을 이어 붙인 순서(0부터) */
  index: number
  /** 파일 이름과 그 파일 안의 쪽(1부터) — 여러 파일을 올렸을 때 선생님이 어느 종이인지 찾는다 */
  source: string
  pageNo: number
  /** 올릴 그림(JPEG) */
  blob: Blob
  /** 미리보기·크게 보기 — object URL이라 다 쓰면 releasePages로 풀어야 한다 */
  thumbUrl: string
  fullUrl: string
  /** 읽은 QR(우리 기록지일 때만). 못 읽었거나 다른 QR이면 null */
  qr: { tag: string; childNo: number } | null
  /** QR이 없고 거의 흰 쪽(isBlankPage) */
  blank: boolean
}

export type ScanReadErrorCode = 'type' | 'pdf' | 'password' | 'image' | 'tooMany' | 'tooBig' | 'empty'

export class ScanReadError extends Error {
  constructor(readonly code: ScanReadErrorCode, readonly file?: string) { super(code) }
}

/** 오류 안내 문구 — 무엇을 하면 되는지까지 말한다. */
export function scanReadErrorText(e: ScanReadError): string {
  const f = e.file ? `「${e.file}」` : '파일'
  switch (e.code) {
    case 'type': return `${f}은(는) 올릴 수 없는 형식이에요. PDF나 JPG·PNG 사진으로 올려 주세요.`
    case 'password': return `${f}에 암호가 걸려 있어 열 수 없어요. 암호 없이 다시 스캔해 주세요.`
    case 'pdf': return `${f}을(를) 열지 못했어요. 파일이 손상되지 않았는지 확인하고, 계속 안 되면 브라우저를 최신으로 바꿔 주세요.`
    case 'image': return `${f}을(를) 열지 못했어요. JPG·PNG 사진인지 확인해 주세요.`
    case 'tooMany': return `한 번에 ${MAX_SCAN_PAGES}쪽까지 올릴 수 있어요. 나눠서 올려 주세요.`
    case 'tooBig': return `${f}이(가) 너무 커요(${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 넘음). 나눠서 스캔해 주세요.`
    case 'empty': return '파일에 쪽이 없어요.'
  }
}

export function releasePages(pages: ScanPageImage[]): void {
  for (const p of pages) { URL.revokeObjectURL(p.thumbUrl); URL.revokeObjectURL(p.fullUrl) }
}

// ---------- 브라우저 작업 ----------

type Canvas = HTMLCanvasElement

function newCanvas(w: number, h: number): { c: Canvas; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  // QR을 읽으려고 픽셀을 다시 꺼낸다 — 처음 얻을 때 알려 둬야 브라우저가 CPU 쪽에 둔다
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas')
  // JPEG에는 투명이 없다 — 투명 PNG가 검게 나오지 않게 흰 바탕부터 깐다
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  return { c, ctx }
}

function toJpeg(c: Canvas, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', quality))
}

type JsQR = typeof import('jsqr').default
let jsqrLoad: Promise<JsQR> | null = null
const loadJsQR = () => (jsqrLoad ??= import('jsqr').then(m => m.default))

type PdfJs = typeof import('pdfjs-dist')
let pdfjsLoad: Promise<PdfJs> | null = null
function loadPdfJs(): Promise<PdfJs> {
  return (pdfjsLoad ??= import('pdfjs-dist').then(pdfjs => {
    // 작업자(worker) — 번들러가 `new Worker(new URL(…, import.meta.url))`를 보고 따로 묶는다(같은 출처 파일).
    // CSP는 proxy.ts의 `worker-src 'self'`가 허용한다 — script-src의 strict-dynamic에 기대지 않는다.
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
    return pdfjs
  }))
}

async function readQr(c: Canvas, ctx: CanvasRenderingContext2D): Promise<Pick<ScanPageImage, 'qr' | 'blank'>> {
  const decode = await loadJsQR()
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const qr = findSheetQr(decode, img.data, c.width, c.height)
  return { qr, blank: !qr && isBlankPage(img.data, c.width, c.height) }
}

/**
 * 고른 파일들 → 쪽 그림들(고른 순서, PDF는 쪽 순서). 하나라도 못 열면 전부 버리고 던진다 —
 * 반 파일의 일부만 올라가면 빠진 아이를 알아채기 어렵다.
 * `onProgress(읽은 쪽, 지금까지 알려진 전체 쪽)` — PDF는 열어 봐야 쪽 수를 알아 전체가 늘어날 수 있다.
 */
export async function readScanFiles(
  files: File[], onProgress: (done: number, total: number) => void, signal: AbortSignal,
): Promise<ScanPageImage[]> {
  const kinds = files.map(scanFileKind)
  const badIdx = kinds.findIndex(k => k === null)
  if (badIdx >= 0) throw new ScanReadError('type', files[badIdx].name)
  if (files.length > MAX_SCAN_PAGES) throw new ScanReadError('tooMany')
  const big = files.find(f => f.size > MAX_FILE_BYTES)
  if (big) throw new ScanReadError('tooBig', big.name)

  const out: ScanPageImage[] = []
  let total = kinds.filter(k => k === 'image').length
  const addPage = async (c: Canvas, ctx: CanvasRenderingContext2D, source: string, pageNo: number) => {
    const { qr, blank } = await readQr(c, ctx)
    const blob = await toJpeg(c, JPEG_QUALITY)
    const s = fitScale(c.width, c.height, THUMB_LONG_SIDE)
    const t = newCanvas(c.width * s, c.height * s)
    t.ctx.imageSmoothingQuality = 'high'
    t.ctx.drawImage(c, 0, 0, t.c.width, t.c.height)
    const thumb = await toJpeg(t.c, THUMB_QUALITY)
    // 캔버스 메모리를 바로 돌려준다(쪽마다 수십 MB)
    c.width = 0; t.c.width = 0
    out.push({ index: out.length, source, pageNo, blob, thumbUrl: URL.createObjectURL(thumb), fullUrl: URL.createObjectURL(blob), qr, blank })
    onProgress(out.length, total)
  }

  try {
    for (let i = 0; i < files.length; i++) {
      signal.throwIfAborted()
      const file = files[i]
      if (kinds[i] === 'image') {
        let bmp: ImageBitmap
        try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
        catch { throw new ScanReadError('image', file.name) }
        const s = fitScale(bmp.width, bmp.height, PAGE_LONG_SIDE)
        const { c, ctx } = newCanvas(bmp.width * s, bmp.height * s)
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(bmp, 0, 0, c.width, c.height)
        bmp.close()
        await addPage(c, ctx, file.name, 1)
        continue
      }
      const pdfjs = await loadPdfJs()
      let doc: Awaited<ReturnType<PdfJs['getDocument']>['promise']>
      try {
        // isEvalSupported:false — 글꼴 처리에 eval을 쓰지 않게(CSP가 막는다. 스캔본은 그림이라 차이가 없다)
        const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false })
        let timer: ReturnType<typeof setTimeout> | undefined
        doc = await Promise.race([
          task.promise,
          new Promise<never>((_, reject) => { timer = setTimeout(() => { void task.destroy(); reject(new Error('timeout')) }, PDF_OPEN_TIMEOUT_MS) }),
        ]).finally(() => clearTimeout(timer))
      } catch (e) {
        throw new ScanReadError((e as { name?: string } | null)?.name === 'PasswordException' ? 'password' : 'pdf', file.name)
      }
      try {
        total += doc.numPages
        if (total > MAX_SCAN_PAGES) throw new ScanReadError('tooMany')
        onProgress(out.length, total)
        for (let n = 1; n <= doc.numPages; n++) {
          signal.throwIfAborted()
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: PAGE_LONG_SIDE / Math.max(base.width, base.height) })
          const { c, ctx } = newCanvas(viewport.width, viewport.height)
          try {
            await page.render({ canvasContext: ctx, viewport }).promise
          } catch {
            throw new ScanReadError('pdf', file.name)
          }
          page.cleanup()
          await addPage(c, ctx, file.name, n)
        }
      } finally {
        await doc.destroy()
      }
    }
  } catch (e) {
    releasePages(out)
    throw e
  }
  if (out.length === 0) throw new ScanReadError('empty')
  return out
}
