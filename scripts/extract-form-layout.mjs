// scripts/extract-form-layout.mjs — 검사지 PDF에서 스탬핑 좌표를 뽑는다.
// 양식이 개정되면: assets/forms/*.pdf 교체 → 이 스크립트 실행 → lib/forms/*-layout.ts 갱신.
//   node scripts/extract-form-layout.mjs assets/forms/kodys-g1.pdf
// pdfjs-dist는 이 스크립트에서만 쓰는 개발 의존성이다(런타임 번들에 들어가지 않는다).
// v4에 고정한다 — v5+는 constructPath가 OPS.rectangle을 더 이상 내보내지 않아 셀 추출이 불가능하다.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/extract-form-layout.mjs <pdf>'); process.exit(1) }

const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise
const page = await doc.getPage(1)
const vp = page.getViewport({ scale: 1 })
console.log(`pageWidth: ${vp.width}, pageHeight: ${vp.height}`)

// ── 텍스트 앵커 (라벨 위치 확인용) ──
const tc = await page.getTextContent()
const texts = tc.items.filter(i => i.str.trim()).map(i => ({
  s: i.str.replace(/\s+/g, ''), x: +i.transform[4].toFixed(1), y: +i.transform[5].toFixed(1),
  w: +i.width.toFixed(1),
}))

// ── 셀 사각형 ──
const ops = await page.getOperatorList()
const rects = []
for (let i = 0; i < ops.fnArray.length; i++) {
  if (ops.fnArray[i] !== OPS.constructPath) continue
  const [fns, args] = ops.argsArray[i]
  let k = 0
  for (const fn of fns) {
    if (fn === OPS.rectangle) {
      const [x, y, w, h] = args.slice(k, k + 4); k += 4
      if (w > 2 && h > 2) rects.push({ x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) })
    } else if (fn === OPS.moveTo || fn === OPS.lineTo) k += 2
    else if (fn === OPS.curveTo) k += 6
  }
}
const uniq = [...new Map(rects.map(r => [`${r.x},${r.y},${r.w},${r.h}`, r])).values()]

/** 낱말이 놓인 행의 아래쪽 y — 그 낱말의 베이스라인을 품는 가장 낮은 띠가 행이다 */
function rowY(word) {
  const t = texts.find(x => x.s === word)
  if (!t) { console.warn(`  ⚠ 낱말을 찾지 못함: ${word}`); return null }
  // 페이지 배경·표 전체 테두리도 낱말을 품으므로 가장 얇은 띠를 고른다.
  const band = uniq.filter(r => t.y >= r.y && t.y <= r.y + r.h).sort((a, b) => a.h - b.h)[0]
  if (!band) console.warn(`  ⚠ 행을 찾지 못함: ${word}`)
  return band ? band.y : null
}

/**
 * 두 행의 대표 낱말로 낱말 격자를 만든다.
 * 두 행을 합쳐서 보는 이유: 검사지에 따라 한 행의 칸 일부가 사각형이 아니라
 * 선으로 그려져 있어 그 행만으로는 칸 수·간격을 알 수 없다(등간격이라 문제없다).
 */
function grid([meaningWord, nonsenseWord]) {
  const rows = [rowY(meaningWord), rowY(nonsenseWord)]
  if (rows.some(y => y === null)) return null
  const inRows = uniq.filter(r => rows.some(y => Math.abs(r.y - y) < 0.5))
  // 가장 흔한 너비 = 낱말 칸. (라벨 칸은 행마다 하나뿐이라 밀린다)
  const byW = new Map()
  for (const r of inRows) byW.set(r.w, (byW.get(r.w) ?? 0) + 1)
  const w = [...byW].sort((a, b) => b[1] - a[1])[0][0]
  const cells = inRows.filter(r => r.w === w)
  const xs = [...new Set(cells.map(r => r.x))].sort((a, b) => a - b)
  return { x0: xs[0], dx: +(xs[1] - xs[0]).toFixed(1), w, h: cells[0].h,
           rows, perRow: xs.length }
}

console.log('\n// wordReading'); console.log(JSON.stringify(grid(['어디', '아로'])))
console.log('\n// wordWriting'); console.log(JSON.stringify(grid(['우비', '오거'])))

/** '/' 글리프 위치 = 점수 빈칸 앵커 */
console.log('\n// 점수 빈칸 후보 (slashX, baselineY)')
for (const t of texts.filter(t => t.s === '/' || /^\/\d+$/.test(t.s))) console.log(`  ${t.x} ${t.y}  ${t.s}`)

console.log('\n// 체크리스트 확인란(□) 위치')
for (const t of texts.filter(t => t.s === '□')) console.log(`  x=${t.x} y=${t.y}`)

console.log('\n// 머리글 라벨 (열 중심 산출용)')
for (const t of texts.filter(t => ['학교','학년','학생명','생년월일','검사일','검사자','교사','전문가'].includes(t.s)))
  console.log(`  ${t.s}: x=${t.x} w=${t.w} y=${t.y}`)
