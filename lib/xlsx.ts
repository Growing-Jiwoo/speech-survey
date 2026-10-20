// lib/xlsx.ts — .xlsx 파일에서 표를 읽는다. 외부 라이브러리를 쓰지 않는다.
//
// xlsx는 ZIP 안에 XML이 든 것뿐이라, 압축 해제는 표준 DecompressionStream으로,
// XML은 우리가 읽는 파일(탭 순서를 정하는 통합문서·관계, 공유 문자열, 시트)에 맞춘 최소 스캐너로 처리한다.
// SheetJS 같은 패키지를 넣으면 번들이 1MB 가까이 늘고, 우리가 쓰는 것은 셀 값 읽기 하나뿐이다.
//
// **파일은 서버로 보내지 않는다.** 신청 화면(브라우저)에서 이 모듈로 읽어 필요한 네 칸만
// 서버에 넘긴다 — 명렬표에 주민등록번호가 들어 있어도 서버에 도달하지 않는다.
//
// DOMParser를 쓰지 않는 이유: 이 저장소의 테스트는 node 환경이라(tests/README.md)
// DOM에 의존하면 회귀 테스트를 붙일 수 없다. 스캐너는 브라우저·node 양쪽에서 같게 돈다.

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

const SIG_EOCD = 0x06054b50   // ZIP 끝 레코드
const SIG_CEN = 0x02014b50    // 중앙 디렉터리 항목

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const buf = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(ds)).arrayBuffer()
  return new Uint8Array(buf)
}

/**
 * ZIP 중앙 디렉터리를 읽어 `{ 파일이름: 내용 }`으로 푼다.
 * 로컬 헤더가 아니라 중앙 디렉터리를 쓰는 이유: 스트리밍으로 만든 zip은 로컬 헤더의
 * 크기 필드가 0이고 실제 크기가 뒤(data descriptor)에 있어, 로컬 헤더만 보면 잘린다.
 */
async function unzip(ab: ArrayBuffer): Promise<Record<string, Uint8Array>> {
  const b = new Uint8Array(ab)
  let eocd = -1
  for (let i = b.length - 22; i >= 0 && i > b.length - 66000; i--)
    if (u32(b, i) === SIG_EOCD) { eocd = i; break }
  if (eocd < 0) throw new Error('zip 형식이 아닙니다')

  const count = u16(b, eocd + 10)
  let p = u32(b, eocd + 16)
  const out: Record<string, Uint8Array> = {}
  const dec = new TextDecoder()
  for (let k = 0; k < count; k++) {
    if (u32(b, p) !== SIG_CEN) throw new Error('zip 디렉터리가 손상되었습니다')
    const method = u16(b, p + 10)
    const csize = u32(b, p + 20)
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), cmtLen = u16(b, p + 32)
    const localAt = u32(b, p + 42)
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen))
    const dataAt = localAt + 30 + u16(b, localAt + 26) + u16(b, localAt + 28)
    const raw = b.subarray(dataAt, dataAt + csize)
    out[name] = method === 0 ? raw : await inflateRaw(raw)
    p += 46 + nameLen + extraLen + cmtLen
  }
  return out
}

// ── 최소 XML 스캐너 (우리가 읽는 파일 전용) ──────────────────────
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function unescapeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1), e[1] === 'x' ? 16 : 10))
    return ENTITIES[e] ?? m
  })
}

/** `<tag …>…</tag>` 덩어리를 순서대로 뽑는다(자기닫힘 `<tag/>`도 빈 내용으로 포함). */
function* blocks(xml: string, tag: string): Generator<{ attrs: string; inner: string }> {
  const re = new RegExp(`<${tag}(\\s[^>]*?)?(/)?>`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? ''
    if (m[2]) { yield { attrs, inner: '' }; continue }
    const close = xml.indexOf(`</${tag}>`, re.lastIndex)
    if (close < 0) return
    yield { attrs, inner: xml.slice(re.lastIndex, close) }
    re.lastIndex = close + tag.length + 3
  }
}
const attr = (attrs: string, name: string): string => {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`))
  return m ? m[1] : ''
}
/** 한 셀 안의 모든 `<t>` 조각을 이어 붙인다 — 서식이 섞인 문자열은 조각으로 쪼개져 저장된다. */
const textOf = (xml: string): string =>
  [...blocks(xml, 't')].map(t => unescapeXml(t.inner)).join('')

/** `A1` 형태의 셀 주소 → 0부터 세는 열 번호. */
function columnOf(ref: string): number {
  let c = 0, i = 0
  for (; i < ref.length && ref[i] >= 'A' && ref[i] <= 'Z'; i++) c = c * 26 + (ref.charCodeAt(i) - 64)
  return c - 1
}

/** 엑셀 날짜 일련번호로 보이는 값 — 실제 날짜 변환은 lib/birth.ts가 한다. */

/** `xl/` 기준 상대 경로(`worksheets/sheet1.xml`, `../xl/…`)나 `/`로 시작하는 절대 경로를 zip 안의 이름으로. */
function resolvePart(target: string): string {
  const parts = (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/')
  const out: string[] = []
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p) }
  return out.join('/')
}

/**
 * 통합문서의 **탭 순서 첫 시트**(숨긴 시트는 건너뛴다)의 zip 안 경로. 탭 순서는 `xl/workbook.xml`의 `<sheet>` 순서이고,
 * 그 시트의 파일은 `r:id`로 `xl/_rels/workbook.xml.rels`에서 찾는다. 파일 이름(`sheetN.xml`)의 번호는 시트를 만든
 * 순서라 탭을 옮기면 탭 순서와 갈린다 — 교사가 명단 시트를 맨 앞으로 옮겨도 다른 시트를 읽었다(2026-10-12 점검).
 * 어느 하나라도 없거나 못 읽으면 null(호출부가 파일 이름 순서로 물러난다).
 */
function firstSheetPart(files: Record<string, Uint8Array>, dec: TextDecoder): string | null {
  const wb = files['xl/workbook.xml'], rels = files['xl/_rels/workbook.xml.rels']
  if (!wb || !rels) return null
  const relXml = dec.decode(rels)
  for (const sheet of blocks(dec.decode(wb), 'sheet')) {
    if (/\sstate="(hidden|veryHidden)"/.test(sheet.attrs)) continue
    // 관계 id 속성의 접두어는 보통 `r:`이지만 만든 프로그램마다 다를 수 있다 — 접두어를 따지지 않는다
    const rid = sheet.attrs.match(/\s[\w.-]+:id="([^"]*)"/)?.[1]
    if (!rid) return null
    const rel = [...blocks(relXml, 'Relationship')].find(r => attr(r.attrs, 'Id') === rid)
    if (!rel) return null
    // 차트 시트처럼 표가 아닌 탭은 건너뛴다
    if (!attr(rel.attrs, 'Type').endsWith('/worksheet')) continue
    const part = resolvePart(attr(rel.attrs, 'Target'))
    return files[part] ? part : null
  }
  return null
}

/** 1904 날짜 체계와 1900 체계의 일련번호 차이 — 같은 날을 1904 체계는 1462 작게 저장한다(1904-01-01 = 1900 체계 1462). */
const DATE1904_OFFSET = 1462
/** 기본 제공 날짜 서식 번호 — 14~17·22, 동아시아 날짜 27~36·50~58(시각만인 18~21·45~47은 날짜가 아니다) */
const BUILTIN_DATES = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58])
/** 사용자 서식 코드가 날짜인지 — 따옴표 글자·[색·조건]·\ 이스케이프를 걷어 낸 뒤 연·일이 있거나, 시·초 없이 월(m)만 있으면 날짜 */
function isDateCode(code: string): boolean {
  const c = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
  return /[yd]/i.test(c) || (/m/i.test(c) && !/[hs]/i.test(c))
}
/** 날짜 서식을 쓰는 셀 서식(`cellXfs`의 순번, 셀의 `s`) 집합 */
function dateStyles(xml: string): Set<number> {
  const custom = new Map<number, string>()
  for (const f of blocks(xml, 'numFmt')) custom.set(Number(attr(f.attrs, 'numFmtId')), unescapeXml(attr(f.attrs, 'formatCode')))
  const out = new Set<number>()
  const xfs = [...blocks(xml, 'cellXfs')][0]
  if (xfs) [...blocks(xfs.inner, 'xf')].forEach((xf, i) => {
    const id = Number(attr(xf.attrs, 'numFmtId'))
    if (custom.has(id) ? isDateCode(custom.get(id)!) : BUILTIN_DATES.has(id)) out.add(i)
  })
  return out
}

/**
 * .xlsx의 **첫 시트**(엑셀 탭 순서 — `firstSheetPart`)를 문자열 표로 읽는다. 빈 행은 버린다.
 * 값은 셀에 저장된 그대로다(날짜 일련번호도 숫자 문자열) — 해석은 호출부(normBirth 등)가 한다.
 * 단 **1904 날짜 체계 통합문서**(옛 맥 엑셀, `workbookPr date1904`)의 날짜 서식 칸은 1900 체계 일련번호로 바꿔 돌려준다 —
 * normBirth는 1900 체계로 읽으므로 그대로 두면 생년월일이 4년 1일 이르게 읽혔고, 멀쩡한 날짜라 붉은 칸도 뜨지 않았다
 * (2026-10-20). 날짜 서식이 아닌 숫자(번호)는 건드리지 않는다.
 */
export async function readXlsx(ab: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(ab)
  const dec = new TextDecoder()

  const shared: string[] = []
  const ss = files['xl/sharedStrings.xml']
  if (ss) for (const si of blocks(dec.decode(ss), 'si')) shared.push(textOf(si.inner))

  const sheetNo = (n: string) => Number(n.match(/sheet(\d+)\.xml$/)?.[1])
  const sheetName = firstSheetPart(files, dec) ?? Object.keys(files)
    .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => sheetNo(a) - sheetNo(b))[0]
  if (!sheetName) throw new Error('시트를 찾지 못했습니다')
  const wb = files['xl/workbook.xml']
  const date1904 = !!wb && /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(dec.decode(wb))
  const dateXf = date1904 && files['xl/styles.xml'] ? dateStyles(dec.decode(files['xl/styles.xml'])) : new Set<number>()

  const rows: string[][] = []
  for (const row of blocks(dec.decode(files[sheetName]), 'row')) {
    const cells: string[] = []
    for (const c of blocks(row.inner, 'c')) {
      const ci = columnOf(attr(c.attrs, 'r') || 'A1')
      const type = attr(c.attrs, 't')
      let v: string
      if (type === 'inlineStr') v = textOf(c.inner)
      else {
        const val = [...blocks(c.inner, 'v')][0]
        v = val ? unescapeXml(val.inner) : ''
        if (type === 's') v = shared[+v] ?? ''
        else if ((type === '' || type === 'n') && v !== '' && dateXf.has(Number(attr(c.attrs, 's') || 0)))
          v = String(Number(v) + DATE1904_OFFSET)
      }
      while (cells.length < ci) cells.push('')
      cells[ci] = v.trim()
    }
    rows.push(cells)
  }
  return rows.filter(r => r.some(c => c !== ''))
}
