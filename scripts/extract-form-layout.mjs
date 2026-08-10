// scripts/extract-form-layout.mjs — 검사지 PDF에서 스탬핑 좌표를 뽑는다.
// 양식이 개정되면: assets/forms/*.pdf 교체 → 이 스크립트 실행 → lib/forms/*-layout.ts 갱신.
//
//   node scripts/extract-form-layout.mjs assets/forms/kodys-g1.pdf 어디 아로 우비 오거
//   node scripts/extract-form-layout.mjs assets/forms/kodys-g2.pdf 친구 고춘
//
// 인자: <pdf> <낱말해독 의미 첫낱말> <무의미 첫낱말> [낱말쓰기 의미 첫낱말] [무의미 첫낱말]
// 격자 행은 "그 낱말을 품는 가장 얇은 띠"로 찾으므로, 각 행의 아무 낱말이나 앵커로 쓰면 된다.
// 낱말 쓰기 앵커를 생략하면 낱말 쓰기가 없는 양식(G2 문장 쓰기)으로 보고 건너뛴다.
//
// ⚠️ 텍스트 레이어로 뽑을 수 없는 두 값은 **600dpi 렌더링에서 실측**해야 한다
//    (글리프 박스 ≠ 글자 진행 폭이라 여기서 나오는 x·w로는 정확하지 않다):
//      · 체크리스트 □의 중심·한 변            → checklist.boxCx / boxDy / boxSize
//      · 문장 쓰기 「0 1 2」의 숫자 간격        → writing.choices.dx / cy
//    아래가 출력하는 앵커(행 y·칸 중심)를 기준으로 그 두 값만 재면 된다.
//      pdftoppm -r 600 -png -f 1 -l 1 <pdf> /tmp/sheet
//
// pdfjs-dist는 이 스크립트에서만 쓰는 개발 의존성이다(런타임 번들에 들어가지 않는다).
// v4에 고정한다 — v5+는 constructPath가 OPS.rectangle을 더 이상 내보내지 않아 셀 추출이 불가능하다.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { readFileSync } from 'node:fs'

const [file, readMeaning, readNonsense, writeMeaning, writeNonsense] = process.argv.slice(2)
if (!file || !readMeaning || !readNonsense) {
  console.error('usage: node scripts/extract-form-layout.mjs <pdf> <의미 첫낱말> <무의미 첫낱말> [쓰기 의미] [쓰기 무의미]')
  process.exit(1)
}

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
 * baselineDy는 낱말 베이스라인 − 칸 아래쪽 y (O/X를 낱말과 같은 줄에 앉히는 값).
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
  const baselineDy = +(texts.find(t => t.s === meaningWord).y - rows[0]).toFixed(1)
  return { x0: xs[0], dx: +(xs[1] - xs[0]).toFixed(1), w, h: cells[0].h,
           rows, perRow: xs.length, baselineDy }
}

console.log('\n// wordReading'); console.log(JSON.stringify(grid([readMeaning, readNonsense])))
if (writeMeaning && writeNonsense) {
  console.log('\n// writing.grid (낱말 쓰기)')
  console.log(JSON.stringify(grid([writeMeaning, writeNonsense])))
}

/**
 * 문장 쓰기의 선택지 칸 — 검사지에 「0 1 2」가 미리 인쇄돼 있고 획득 점수에 동그라미를 친다.
 * 한 덩어리로 그려져 있어 글리프별 x를 뽑을 수 없으므로, **칸 중심과 행 베이스라인**만 낸다.
 * colCx는 인쇄된 「1」의 중심이기도 하다(칸 안에서 가운데 정렬).
 */
const choices = texts.filter(t => /^0+1+2+$/.test(t.s)).map(t => ({
  cx: +(t.x + t.w / 2).toFixed(2), baselineY: t.y,
}))
if (choices.length > 0) {
  // 같은 열이라도 글자 진행 폭이 0.1pt쯤 흔들려 중심이 미세하게 달라진다 — 1pt 이내는 한 열로 본다.
  const cluster = (vs) => vs.sort((a, b) => a - b).reduce((out, v) => {
    if (out.length > 0 && v - out[out.length - 1].at(-1) < 1) out[out.length - 1].push(v)
    else out.push([v])
    return out
  }, []).map(g => +(g.reduce((a, b) => a + b, 0) / g.length).toFixed(2))
  const colCx = cluster([...new Set(choices.map(c => c.cx))])
  const colOf = (cx) => colCx.findIndex(c => Math.abs(c - cx) < 1)
  const rowsY = [...new Set(choices.map(c => c.baselineY))].sort((a, b) => b - a)
  console.log('\n// writing.choices (문장 쓰기) — dx·cy·rx·ry는 600dpi 실측 필요')
  console.log(`colCx: ${JSON.stringify(colCx)}`)
  console.log('rows(문항 순서 = 왼쪽 열 위→아래, 그다음 오른쪽 열):')
  for (const col of colCx.keys()) {
    for (const y of rowsY) {
      if (choices.some(c => colOf(c.cx) === col && c.baselineY === y))
        console.log(`  { col: ${col}, baselineY: ${y} },`)
    }
  }
}

/** '/' 글리프 위치 = 점수 빈칸 앵커 */
console.log('\n// 점수 빈칸 후보 (slashX, baselineY)')
for (const t of texts.filter(t => t.s === '/' || /^\/\d+$/.test(t.s))) console.log(`  ${t.x} ${t.y}  ${t.s}`)

console.log('\n// 체크리스트 확인란(□) 행 베이스라인 — boxCx·boxDy·boxSize는 600dpi 실측 필요')
for (const t of texts.filter(t => t.s === '□')) console.log(`  x=${t.x} y=${t.y}`)

/**
 * 머리글 인적사항 열 경계.
 * 값은 라벨 아래 빈칸에 가운데 정렬로 찍히고, 칸 사이에 괘선이 없다. 그래서 경계는
 * **이웃 라벨 중심의 중점**으로 잡는다(첫 칸의 왼쪽은 첫 간격을 대칭으로 되짚는다).
 */
const HEADER = ['학교', '학년', '학생명', '생년월일', '검사일', '검사자']
const KEYS = ['school', 'grade', 'childName', 'birth', 'testedAt']
const labels = HEADER.map(s => texts.find(t => t.s === s)).filter(Boolean)
if (labels.length === HEADER.length) {
  const cx = labels.map(t => t.x + t.w / 2)
  const mid = cx.slice(1).map((c, i) => +((c + cx[i]) / 2).toFixed(1))
  const bounds = [+(cx[0] - (mid[0] - cx[0])).toFixed(1), ...mid]
  console.log('\n// header (baselineY는 라벨 아래 괘선 사이 — G1 기준 라벨 y − 23.6)')
  console.log(`baselineY: ${+(labels[0].y - 23.6).toFixed(1)}`)
  KEYS.forEach((k, i) => console.log(`${k}: { lo: ${bounds[i]}, hi: ${bounds[i + 1]} },`))
}

console.log('\n// 검사자 구분 (교사 / 전문가) — cx는 낱말 중심, rx는 낱말 반폭 + 여백')
for (const t of texts.filter(t => t.s === '교사' || t.s === '전문가'))
  console.log(`  ${t.s}: cx=${+(t.x + t.w / 2).toFixed(1)} halfWidth=${+(t.w / 2).toFixed(2)} y=${t.y}`)
