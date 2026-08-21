// scripts/build-roster-template.ts — 교사가 /apply에서 내려받는 학급 명단 양식(.xlsx) 생성.
// 사용: npm run build:roster-template  → public/roster-template.xlsx
//
// 왜 스크립트인가(런타임 생성이 아니라):
//  · xlsx는 ZIP 안에 XML 여섯 개를 조립하는 일이다. 내용이 배포마다 고정이므로 빌드
//    산출물이 맞고, 그 코드가 앱 번들·서버 라우트에 살 이유가 없다.
//  · `scripts/vendor-fonts.mjs`(폰트)·`scripts/build-schools.ts`(학교 JSON)와 같은 관례다.
//    **public/roster-template.xlsx는 생성물이니 직접 고치지 말 것.**
//
// 왜 CSV가 아닌가: CSV는 열 너비도 서식도 담지 못한다. 안내 문구가 든 A열이 늘어나
// `번호` 칸만 다섯 배 넓은 표가 나왔고, 교사가 "이게 맞나?" 하고 물었다(2026-08-21).
//
// **이 파일은 교사가 손으로 채우는 서식이다.** 데이터를 덤프한 격자가 아니라 폼으로 보여야
// 한다(2026-08-22 재작업). 그래서 아래를 갖춘다:
//  · 안내 문구는 A:D 병합 + 자동 줄바꿈 — 종전에는 옆 칸에 잘려 "…늘려도 됩니다"가 사라졌다
//  · 격자선을 끄고 표에만 테두리 — 어디에 쓰는지가 한눈에 보인다
//  · 머리글 고정(freeze) — 30줄을 채우며 스크롤해도 열 이름이 남는다
//  · 성별은 드롭다운(남/여) — 파서가 `1`·`남자`도 받지만 애초에 흔들릴 여지를 없앤다
//  · 빈 데이터 칸 35줄을 미리 그려 둔다 — 한 학급 규모(파서 상한 99)를 덮는다
//  · 색·서체는 앱의 디자인 토큰(app/globals.css)을 그대로 쓴다 — 같은 제품으로 느껴지게
//
// 머리글은 `lib/roster`의 COL_LABEL에서 가져온다 — 양식과 파서가 어긋날 수 없게.
// 어긋남은 tests/roster.test.ts가 이 산출물을 실제 파서에 물려 검증한다.
import { deflateRawSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { COL_LABEL } from '../lib/roster'

const OUT = 'public/roster-template.xlsx'

/** 앱 디자인 토큰(app/globals.css @theme) — xlsx는 `#` 없이 ARGB로 쓴다. */
const C = {
  blue: 'FF2F6BFF', blueDeep: 'FF1E4FCC', ink: 'FF0E1526', inkSoft: 'FF3A4256',
  inkMute: 'FF6E7994', line: 'FFE3E8F3', well: 'FFF7F9FE', amber: 'FF96660C',
  white: 'FFFFFFFF', gridLine: 'FFC9D3EA',
}

/** 교사 현장은 윈도우다(README) — 맑은 고딕이 기본값이라 서체가 흔들리지 않는다. */
const FONT = '맑은 고딕'

const HEADERS = [COL_LABEL.childNo, COL_LABEL.name, COL_LABEL.gender, COL_LABEL.birthYmd]

/** 미리 그려 두는 빈 줄 수. 한 학급이 다 들어가고(파서 상한 99) 스크롤이 과하지 않은 선. */
const BLANK_ROWS = 35

/**
 * 안내 줄 — **"어떻게 적는가"만** 담는다(사용자 확정 2026-08-22).
 *
 * 빼기로 한 것과 이유:
 *  · "보호자 서면 동의를 받은 학생만" — 신청 화면에 같은 뜻의 필수 체크가 이미 있다(중복)
 *  · "주민등록번호는 넣지 마세요" — 이 양식엔 그 칸이 아예 없다. 묻지 않은 질문에 답하는 셈
 *  · "줄이 부족하면 늘려도 됩니다" — 빈 줄 35개를 미리 그려 두었으니 말할 필요가 없다
 *
 * 남긴 셋은 **파서가 실제로 거부하는 표기**다(2026-08-22 실측):
 *  · 열 이름·순서를 바꾸면 머리글을 못 찾아 파일 전체가 거부된다(가장 파괴적 → 경고색)
 *  · 번호 `2-1`(반-번호) → 거부. 숫자만 뽑아 붙이면 21이 되어 **다른 아이의 번호**가 되므로
 *    파서가 일부러 받지 않는다(lib/roster의 toNo)
 *  · 생년월일은 **연도를 먼저** 적기만 하면 거의 다 받는다(2026-08-22 실측):
 *    `2019-03-04` `190304` `20190304` `2019.3.4` `2019. 3. 4.` `2019/3/4` `2019년 3월 4일`
 *    `19-3-4`, 엑셀 날짜 일련번호까지. 거부되는 것은 `3/4/2019`(연도가 뒤라 월·일 순서를
 *    알 수 없다)·달력에 없는 날·미래뿐이다.
 *    ⚠️ 그래서 "2019-03-04처럼 적어 주세요"라고 쓰면 **사실보다 좁게** 말하는 것이다 —
 *    `190304`로 적은 교사가 잘못한 줄 알고 다시 고친다(사용자 지적 2026-08-22).
 *    안내는 진짜 규칙 하나("연도를 먼저")만 말하고 예시를 둘 보여 준다.
 *
 * **한 줄이 길어지면 병합 폭을 넘어 잘린다** — 아래 열 너비 합(약 27자)에 맞춰 짧게 끊는다.
 * `wrapText`가 켜져 있어도 병합 셀은 엑셀이 높이를 자동 조절하지 않으므로 줄 길이로 관리한다.
 */
const GUIDE: { text: string; warn?: boolean }[] = [
  { text: '4개 열의 이름과 순서를 바꾸면 파일을 읽을 수 없어요.', warn: true },
  { text: '번호는 숫자만 적어 주세요 — 2-1처럼 반을 붙이면 안 돼요.' },
  { text: '생년월일은 연도를 먼저 — 2019-03-04 · 190304 다 괜찮아요.' },
]

const TITLE = '읽기 선별검사 · 학급 명단'

// ── 스타일 인덱스 ────────────────────────────────────────────────────
const S = { title: 1, guide: 2, warn: 3, header: 4, dataCenter: 5, dataLeft: 6 } as const

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const colLetter = (i: number) => String.fromCharCode(65 + i)

/** 셀 하나. 전부 inlineStr로 쓴다 — sharedStrings 파일이 필요 없고, 생년월일을 문자열로
 *  두면 엑셀이 날짜 서식으로 바꿔 표기를 흔드는 일도 없다. */
const cell = (row: number, i: number, text: string, style?: number) =>
  `<c r="${colLetter(i)}${row}"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t>${esc(text)}</t></is></c>`

/** 값 없이 서식만 있는 칸 — 빈 데이터 줄의 테두리를 그리려면 셀이 실제로 있어야 한다. */
const blank = (row: number, i: number, style: number) =>
  `<c r="${colLetter(i)}${row}" s="${style}"/>`

function sheetXml(): { xml: string; headerRow: number } {
  const rows: string[] = []
  const merges: string[] = []
  let r = 1

  // 제목
  rows.push(`<row r="${r}" ht="34" customHeight="1">${cell(r, 0, TITLE, S.title)}${
    [1, 2, 3].map(i => blank(r, i, S.title)).join('')}</row>`)
  merges.push(`<mergeCell ref="A${r}:D${r}"/>`)
  r++

  // 안내
  for (const g of GUIDE) {
    const st = g.warn ? S.warn : S.guide
    rows.push(`<row r="${r}" ht="26" customHeight="1">${cell(r, 0, g.text, st)}${
      [1, 2, 3].map(i => blank(r, i, st)).join('')}</row>`)
    merges.push(`<mergeCell ref="A${r}:D${r}"/>`)
    r++
  }

  // 안내와 표 사이에 여백 줄을 두지 않는다. 셀 없는 빈 줄을 끼우면 위(안내)·아래(머리글)
  // 테두리에 끼여 **정체불명의 빈 칸**으로 읽힌다(사용자 지적 2026-08-22 — "빈 열이 하나
  // 있는데"). 구역 구분은 배경색이 이미 하고 있다: 안내는 well, 머리글은 blue다.

  // 머리글
  const headerRow = r
  rows.push(`<row r="${r}" ht="26" customHeight="1">${
    HEADERS.map((h, i) => cell(r, i, h, S.header)).join('')}</row>`)
  r++

  // 빈 데이터 줄 — 테두리를 그려 "여기에 쓰세요"가 보이게 한다.
  // 예시 아동을 넣지 않는다: 교사가 그대로 제출해 가짜 아동이 명단에 섞인다.
  const firstData = r
  for (let k = 0; k < BLANK_ROWS; k++, r++) {
    rows.push(`<row r="${r}" ht="20" customHeight="1">${
      [S.dataCenter, S.dataLeft, S.dataCenter, S.dataCenter]
        .map((st, i) => blank(r, i, st)).join('')}</row>`)
  }
  const lastData = r - 1

  const cols = [
    `<col min="1" max="1" width="9" customWidth="1"/>`,
    `<col min="2" max="2" width="18" customWidth="1"/>`,
    `<col min="3" max="3" width="10" customWidth="1"/>`,
    `<col min="4" max="4" width="18" customWidth="1"/>`,
  ].join('')

  // 격자선을 끄면 위에서 그린 테두리만 남아 표가 폼처럼 도드라진다.
  // 머리글 아래를 고정해 35줄을 채우며 스크롤해도 열 이름이 보인다.
  const view = `<sheetView showGridLines="0" tabSelected="1" workbookViewId="0">`
    + `<pane ySplit="${headerRow}" topLeftCell="A${firstData}" activePane="bottomLeft" state="frozen"/>`
    + `<selection pane="bottomLeft" activeCell="A${firstData}" sqref="A${firstData}"/></sheetView>`

  // 성별은 목록에서 고르게 한다 — 파서가 `1`·`남자`도 받지만(lib/roster의 toGender)
  // 애초에 흔들릴 여지를 없애는 편이 임상 기록에 맞다.
  const validation = `<dataValidations count="1"><dataValidation type="list" allowBlank="1"`
    + ` showInputMessage="1" showErrorMessage="1" sqref="C${firstData}:C${lastData}">`
    + `<formula1>"남,여"</formula1></dataValidation></dataValidations>`

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<dimension ref="A1:D${lastData}"/><sheetViews>${view}</sheetViews>`
    + `<sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols>`
    + `<sheetData>${rows.join('')}</sheetData>`
    + `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>`
    + validation
    + `</worksheet>`
  return { xml, headerRow }
}

const font = (size: number, color: string, bold = false) =>
  `<font>${bold ? '<b/>' : ''}<sz val="${size}"/><color rgb="${color}"/><name val="${FONT}"/></font>`

const solid = (rgb: string) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`

/** thin 테두리 4면. 두 가지를 쓴다:
 *  · 데이터 칸(gridLine) — 흰 배경에서 "여기에 쓰세요"가 보여야 하니 조금 진하게
 *  · 안내 블록(line) — 한 톤 연하게. 안내 줄 사이 **구분선**이 없으면 네 문장이 한 덩이로
 *    뭉쳐 어색하다(사용자 지적 2026-08-22). 이웃한 줄의 위·아래 테두리가 한 선으로 만나
 *    문장마다 칸이 나뉘고, 블록 전체도 표처럼 닫힌다. */
const border4 = (rgb: string) => `<border>${['left', 'right', 'top', 'bottom']
  .map(s => `<${s} style="thin"><color rgb="${rgb}"/></${s}>`).join('')}<diagonal/></border>`

/** fills는 0=none, 1=gray125가 **반드시** 먼저 와야 엑셀이 파일을 연다(스펙 관례). */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<fonts count="5">`
    + font(11, C.ink)                    // 0 기본(데이터 칸)
    + font(15, C.white, true)            // 1 제목
    // 안내는 **데이터 칸보다 크고 굵게** 둔다. 10pt로 뒀더니 채워 넣는 칸(11pt)보다도
    // 작아 눈에 걸리지 않았다(사용자 지적 2026-08-22) — 읽고 나서 적어야 하는 순서를
    // 글자 크기가 거스르면 안 된다.
    + font(12, C.ink, true)              // 2 안내
    + font(12, C.amber, true)            // 3 안내(경고)
    + font(11, C.white, true)            // 4 머리글
  + `</fonts>`
  + `<fills count="5"><fill><patternFill patternType="none"/></fill>`
    + `<fill><patternFill patternType="gray125"/></fill>`
    + solid(C.blueDeep)                  // 2 제목 배경
    + solid(C.blue)                      // 3 머리글 배경
    + solid(C.well)                      // 4 안내 배경
  + `</fills>`
  + `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>${border4(C.gridLine)}${border4(C.line)}</borders>`
  + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
  + `<cellXfs count="7">`
    + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
    // 1 제목 — 가운데, 세로 중앙
    + `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
    // 2 안내 — 왼쪽, 세로 중앙, 자동 줄바꿈, 연한 테두리(줄 사이 구분선)
    + `<xf numFmtId="0" fontId="2" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf>`
    // 3 안내(경고)
    + `<xf numFmtId="0" fontId="3" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf>`
    // 4 머리글 — 가운데, 테두리
    + `<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
    // 5 데이터(가운데) — 번호·성별·생년월일
    + `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
    // 6 데이터(왼쪽) — 이름
    + `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" indent="1"/></xf>`
  + `</cellXfs>`
  + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
  + `</styleSheet>`

const sheet = sheetXml()

const FILES: [string, string][] = [
  ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
  ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="학급 명단" sheetId="1" r:id="rId1"/></sheets></workbook>`],
  ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml', STYLES],
  ['xl/worksheets/sheet1.xml', sheet.xml],
]

// ── ZIP 쓰기 ────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (b: Buffer) => {
  let c = 0xFFFFFFFF
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// 고정 타임스탬프(1980-01-01) — 같은 입력이면 같은 바이트가 나와야 한다. 시각을 넣으면
// 만들 때마다 파일이 달라져 커밋에 잡음이 끼고 재현 확인도 못 한다
// (lib/pdf/stamp-sheet.ts가 updateMetadata:false로 같은 것을 지킨다).
const DOS_TIME = 0, DOS_DATE = 33

const local: Buffer[] = []
const central: Buffer[] = []
let offset = 0

for (const [name, content] of FILES) {
  const nameBuf = Buffer.from(name, 'utf8')
  const raw = Buffer.from(content, 'utf8')
  const deflated = deflateRawSync(raw)
  const crc = crc32(raw)

  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0)
  lh.writeUInt16LE(20, 4)              // version needed
  lh.writeUInt16LE(0x0800, 6)          // flag: 파일명 UTF-8
  lh.writeUInt16LE(8, 8)               // method: deflate
  lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12)
  lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(deflated.length, 18)
  lh.writeUInt32LE(raw.length, 22)
  lh.writeUInt16LE(nameBuf.length, 26)
  local.push(lh, nameBuf, deflated)

  const ce = Buffer.alloc(46)
  ce.writeUInt32LE(0x02014b50, 0)
  ce.writeUInt16LE(20, 4)              // version made by
  ce.writeUInt16LE(20, 6)
  ce.writeUInt16LE(0x0800, 8)
  ce.writeUInt16LE(8, 10)
  ce.writeUInt16LE(DOS_TIME, 12); ce.writeUInt16LE(DOS_DATE, 14)
  ce.writeUInt32LE(crc, 16)
  ce.writeUInt32LE(deflated.length, 20)
  ce.writeUInt32LE(raw.length, 24)
  ce.writeUInt16LE(nameBuf.length, 28)
  ce.writeUInt32LE(offset, 42)
  central.push(ce, nameBuf)

  offset += 30 + nameBuf.length + deflated.length
}

const body = Buffer.concat(local)
const dir = Buffer.concat(central)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
eocd.writeUInt16LE(FILES.length, 8)
eocd.writeUInt16LE(FILES.length, 10)
eocd.writeUInt32LE(dir.length, 12)
eocd.writeUInt32LE(body.length, 16)

mkdirSync('public', { recursive: true })
const out = Buffer.concat([body, dir, eocd])
writeFileSync(OUT, out)
console.log(`${OUT} — ${out.length} bytes`)
console.log(`  머리글 ${sheet.headerRow}행 [${HEADERS.join(' · ')}] · 빈 줄 ${BLANK_ROWS} · 성별 드롭다운(남/여)`)
