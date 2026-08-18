// lib/xlsx.ts — .xlsx 파일에서 표를 읽는다. 외부 라이브러리를 쓰지 않는다.
//
// xlsx는 ZIP 안에 XML이 든 것뿐이라, 압축 해제는 표준 DecompressionStream으로,
// XML은 우리가 읽는 두 파일(공유 문자열·시트)에 맞춘 최소 스캐너로 처리한다.
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

// ── 최소 XML 스캐너 (우리가 읽는 두 파일 전용) ──────────────────────
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

/**
 * .xlsx의 **첫 시트**를 문자열 표로 읽는다. 빈 행은 버린다.
 * 값은 셀에 저장된 그대로다(날짜 일련번호도 숫자 문자열) — 해석은 호출부(normBirth 등)가 한다.
 */
export async function readXlsx(ab: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(ab)
  const dec = new TextDecoder()

  const shared: string[] = []
  const ss = files['xl/sharedStrings.xml']
  if (ss) for (const si of blocks(dec.decode(ss), 'si')) shared.push(textOf(si.inner))

  const sheetName = Object.keys(files)
    .filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0]
  if (!sheetName) throw new Error('시트를 찾지 못했습니다')

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
      }
      while (cells.length < ci) cells.push('')
      cells[ci] = v.trim()
    }
    rows.push(cells)
  }
  return rows.filter(r => r.some(c => c !== ''))
}
