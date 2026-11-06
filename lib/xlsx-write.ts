// lib/xlsx-write.ts — 표를 .xlsx 파일로 쓴다. 외부 라이브러리를 쓰지 않는다(읽기 `lib/xlsx.ts`와 같은 방침).
//
// 관리자 [전체 데이터 받기](app/api/admin/export.xlsx)가 쓴다. 필요한 것은 「시트 몇 개에 글자와 숫자」뿐이라
// SheetJS 같은 패키지(1MB 가까이)를 들이지 않고 필요한 만큼만 직접 만든다(개발 판단 2026-11-06).
//
// 만드는 것 — Excel·Numbers·구글 시트가 여는 가장 작은 꾸러미:
//   [Content_Types].xml · _rels/.rels · xl/workbook.xml · xl/_rels/workbook.xml.rels · xl/styles.xml · xl/worksheets/sheetN.xml
// - 글자는 **인라인 문자열**(`t="inlineStr"`)로 칸에 바로 넣는다 — 공유 문자열 표(sharedStrings)가 필요 없다.
// - 숫자는 숫자 칸(`<v>`)이라 엑셀에서 바로 합계·평균을 낼 수 있다. null·undefined·NaN은 칸을 만들지 않는다(빈 칸).
// - 첫 줄(머리글)은 굵게, 틀 고정한다 — 열이 수십 개라 내려가면 무슨 칸인지 잃는다.
// - ZIP은 **압축하지 않는다(STORE)**. 압축(deflate)은 node에서만 동기로 되고 브라우저·node 공용 코드가 아니게 된다. 수천 행이어도
//   몇 MB라 받는 데 문제없다. 압축하지 않아도 각 파일의 CRC-32는 맞아야 엑셀이 「손상된 파일」이라고 하지 않는다.
// - 같은 입력이면 같은 바이트다(파일 시각을 1980-01-01로 고정).

/** 칸 하나 — 글자·숫자, 또는 빈 칸(null·undefined). */
export type Cell = string | number | null | undefined

/** 시트 하나 — `rows[0]`이 머리글(굵게·틀 고정)이다. */
export interface SheetData {
  /** 탭 이름. 엑셀 규칙: 31자 이하, `[]:*?/\` 금지, 통합문서 안에서 대소문자 무시하고 겹치지 않을 것 */
  name: string
  rows: Cell[][]
}

const enc = new TextEncoder()

// ── CRC-32 (ZIP·PNG와 같은 다항식 0xEDB88320) ─────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── ZIP(STORE) ──────────────────────────────────────────────────
/** DOS 날짜 1980-01-01(ZIP이 나타낼 수 있는 가장 이른 날) — 시각을 고정해 같은 입력이면 같은 바이트가 나온다. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1
const DOS_TIME = 0
/** 일반 목적 비트 11 — 파일 이름이 UTF-8이다(지금 이름은 전부 ASCII지만 명시해 둔다) */
const FLAG_UTF8 = 0x0800

/** `{ 이름: 내용 }`을 압축 없는 ZIP으로. 순서는 넘긴 순서 그대로(첫 파일이 [Content_Types].xml이어야 하는 도구가 있다). */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const size = f.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)   // 로컬 헤더 서명
    lv.setUint16(4, 20, true)           // 풀 때 필요한 판(2.0)
    lv.setUint16(6, FLAG_UTF8, true)
    lv.setUint16(8, 0, true)            // 방식 0 = STORE
    lv.setUint16(10, DOS_TIME, true)
    lv.setUint16(12, DOS_DATE, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)        // 압축 크기 = 원래 크기
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)           // extra 없음
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)   // 중앙 디렉터리 서명
    cv.setUint16(4, 20, true)           // 만든 판
    cv.setUint16(6, 20, true)           // 풀 때 필요한 판
    cv.setUint16(8, FLAG_UTF8, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, DOS_TIME, true)
    cv.setUint16(14, DOS_DATE, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    // 30 extra · 32 주석 · 34 디스크 · 36 내부 속성 · 38 외부 속성 = 0
    cv.setUint32(42, offset, true)      // 로컬 헤더 위치
    central.set(name, 46)

    locals.push(local, f.data)
    centrals.push(central)
    offset += local.length + size
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)     // 끝 레코드 서명
  ev.setUint16(8, files.length, true)   // 이 디스크의 항목 수
  ev.setUint16(10, files.length, true)  // 전체 항목 수
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)        // 중앙 디렉터리 시작 위치
  return concat([...locals, ...centrals, eocd])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

// ── XML ─────────────────────────────────────────────────────────
/** XML 1.0에 넣을 수 없는 제어 문자(탭·줄바꿈 제외)는 지운다 — 남으면 엑셀이 파일을 「복구」하겠다고 한다. */
const BAD_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g
export function escapeXml(s: string): string {
  return s.replace(BAD_XML_CHARS, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 0부터 세는 열 번호 → `A`·`Z`·`AA`… */
export function columnName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

/** 칸 → XML. 빈 칸은 '' — 칸을 만들지 않는다. `s="1"`은 굵은 글씨(styles.xml의 두 번째 서식). */
function cellXml(ref: string, v: Cell, bold: boolean): string {
  const s = bold ? ' s="1"' : ''
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : ''
  if (v == null || v === '') return ''
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`
}

/** 열 너비 — 글자 수로 어림한다(한글은 두 칸). 엑셀이 저장할 때 자동으로 맞춰 주지 않으므로 넣어 둔다. */
function colWidths(rows: Cell[][]): number[] {
  // 행이 수천 개라 Math.max(...배열) 대신 reduce — 펼치기는 인자 수 상한에 걸릴 수 있다
  const n = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const len = (v: Cell) => (v == null ? 0 : [...String(v)].reduce((k, ch) => k + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0))
  return Array.from({ length: n }, (_, c) =>
    Math.min(40, Math.max(6, rows.reduce((m, r) => Math.max(m, len(r[c])), 0) + 2)))
}

function sheetXml(rows: Cell[][]): string {
  const widths = colWidths(rows)
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const body = rows.map((r, ri) =>
    `<row r="${ri + 1}">${r.map((v, ci) => cellXml(`${columnName(ci)}${ri + 1}`, v, ri === 0)).join('')}</row>`).join('')
  // 첫 줄 틀 고정(머리글이 늘 보이게)
  const views = rows.length > 1
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : ''
  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}">${views}${cols}<sheetData>${body}</sheetData></worksheet>`
}

/** 최소 서식 표 — 0번 보통, 1번 굵게. 엑셀은 styles.xml이 없거나 모양이 어긋나면 파일을 복구하려 든다. */
const STYLES_XML = `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">`
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>'

/** 엑셀 탭 이름 규칙 — 어기면 엑셀이 파일을 열지 못하거나 복구한다. 호출부의 실수라 고쳐 주지 않고 던진다. */
function checkSheetNames(names: string[]): void {
  const seen = new Set<string>()
  for (const n of names) {
    if (n.length === 0 || n.length > 31 || /[[\]:*?/\\]/.test(n) || n.startsWith("'") || n.endsWith("'"))
      throw new Error(`엑셀 시트 이름으로 쓸 수 없다: ${n}`)
    const key = n.toLowerCase()
    if (seen.has(key)) throw new Error(`시트 이름이 겹친다: ${n}`)
    seen.add(key)
  }
}

/** 시트들 → .xlsx 바이트. 시트가 하나도 없으면 던진다(엑셀은 시트 없는 통합문서를 열지 못한다). */
export function writeXlsx(sheets: SheetData[]): Uint8Array {
  if (sheets.length === 0) throw new Error('시트가 없다')
  checkSheetNames(sheets.map(s => s.name))
  const n = sheets.map((_, i) => i + 1)
  const contentTypes = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + n.map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '</Types>'
  const rootRels = `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">`
    + `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const workbook = `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>`
    + sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
    + '</sheets></workbook>'
  const workbookRels = `${XML_HEAD}<Relationships xmlns="${NS_PKG_REL}">`
    + n.map(i => `<Relationship Id="rId${i}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')
    + `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`

  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    { name: '_rels/.rels', data: enc.encode(rootRels) },
    { name: 'xl/workbook.xml', data: enc.encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(workbookRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s.rows)) })),
  ])
}
