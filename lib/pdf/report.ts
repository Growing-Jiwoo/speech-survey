// lib/pdf/report.ts — 결과보고서 PDF. 담당자가 배포한 `KODYS_G*_결과보고서_양식.docx`(2026-09-28)를
// 한 장짜리 PDF로 그린다. 표·여백·색·글자 크기는 전부 그 docx에서 읽은 값이고(단위 pt), 학년마다
// 다른 값은 `SurveyForm.report`가 갖는다. 정답본(`KODYS_G*_결과보고서.docx`)과 1:1이 목표라
// 양식 사이의 서식 불일치도 "정리"하지 않고 그대로 옮겼다(사용자 확정 2026-09-28).
//
// 글꼴: 양식은 맑은 고딕(Microsoft 전용 글꼴)·Segoe UI Symbol·Times New Roman을 쓰지만 세 글꼴 모두
// 서버에 실어 배포할 수 없다(재배포 금지 EULA). 글자는 나눔고딕(OFL, assets/fonts)으로 그리되
// **줄 높이·베이스라인은 Word가 이 양식을 PDF로 낸 것을 실측한 값**(아래 LINE·ASCENT·EMPTY_LINE)으로,
// **줄바꿈은 맑은 고딕의 글자 진행 폭**(MALGUN_ADV)으로 계산한다 — 글꼴을 바꾸면서 줄 간격·줄바꿈
// 위치까지 따라 바꾸면 세로 배치가 양식과 어긋난다(맑은 고딕은 한글이 1em, 나눔고딕은 0.94em이라
// 긴 문단의 줄 수가 달라진다). 진행 폭은 글꼴 프로그램이 아니라 숫자라 여기 적어 둘 수 있다.
// 그 결과 줄은 Word와 같은 곳에서 나뉘고, 나눔고딕 글자가 조금 좁아 줄 오른쪽에 여유가 남는다.
// 확인란(☐ ☑)은 글리프 대신 선으로 그린다(나눔고딕에 없다).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { LineCapStyle, PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { finalVerdict, scoreSession, TASK_KEYS, type ScoreInput, type TaskKey, type Verdict } from '@/lib/scoring'
import type { SurveyForm } from '@/lib/forms'
import { CHECKLIST_AREAS } from '@/lib/items'
import { REGIONS, type School } from '@/lib/schools'
import { birthLabel, reportDateLabel, semesterOf } from '@/lib/format'

export interface ReportInput extends ScoreInput {
  form: SurveyForm
  session: {
    school_region: string; school_id: string; school_name: string
    grade: number; gender: string; child_name: string
    birth_ymd: string; started_at: string
    checklist: string[]
  }
}

const ASSETS = path.join(process.cwd(), 'assets')
const PUBLIC = path.join(process.cwd(), 'public')

// ── 양식 수치 (docx 실측) ────────────────────────────────────────────────────
// Letter(12240×15840 twips) · 여백 상하 620 · 좌우 940 twips.
const PAGE = { w: 612, h: 792, top: 31, left: 47 }
/** 본문 폭 = 모든 표의 폭(10360 twips) */
const TEXT_W = 518
/**
 * 줄 높이·베이스라인 — Word가 이 양식을 PDF로 낸 것(2026-09-29, Word for Mac 16.111)을 실측한 값이다.
 * 글꼴 표의 메트릭(hhea 1.33em)이 아니라 **Word가 실제로 놓은 자리**를 따른다: Word는 맑은 고딕 줄을
 * 글자 크기의 1.72배로 잡고 베이스라인을 줄 위에서 1.33em에 둔다(위쪽에 0.39em 여유). 서식 없는 빈 문단은
 * 문단 기호 글꼴(Times New Roman 10pt) 기준 11.5pt다. 표 행은 여기에 테두리 굵기(0.5pt)만큼 더 높다.
 * 값을 바꾸려면 Word 출력과 다시 겹쳐 볼 것(scratchpad의 wordcmp.py 방식 — 행 경계선·베이스라인 대조).
 */
const LINE = 1.72
const ASCENT = 1.33
/** 크기별 줄 높이 실측값(Word 출력의 행 높이에서 역산, 2026-09-29). 표에 없는 크기는 LINE 배수. */
const LINE_AT: Record<number, number> = { 7.5: 12.9, 8.5: 14.6, 9: 15.6, 9.5: 16.6, 10: 17.3, 10.5: 18.15, 12: 20.7, 14: 24.8, 16: 27.5 }
const lineHeightOf = (size: number) => LINE_AT[size] ?? LINE * size
/**
 * 맑은 고딕 글자 진행 폭(upm 2048 기준, malgun.ttf·malgunbd.ttf 실측 2026-09-29). 줄바꿈 계산 전용.
 * 한글 음절(가~힣)은 정체·굵은체 모두 2048(1em)이고, 아래는 ASCII 인쇄 문자와 양식에 쓰인 기호(· –)다.
 * 표에 없는 글자는 그리는 글꼴(나눔고딕)의 폭으로 물러난다.
 */
const MALGUN_HANGUL = 2048
const MALGUN_ADV: Record<'r' | 'b', Record<string, number>> = {
  r: {"0":1128,"1":1128,"2":1128,"3":1128,"4":1128,"5":1128,"6":1128,"7":1128,"8":1128,"9":1128," ":720,"!":592,"\"":809,"#":1242,"$":1128,"%":1713,"&":1675,"'":475,"(":624,")":624,"*":870,"+":1435,",":448,"-":840,".":448,"/":811,":":448,";":448,"<":1435,"=":1435,">":1435,"?":942,"@":2006,"A":1348,"B":1195,"C":1300,"D":1469,"E":1059,"F":1021,"G":1437,"H":1484,"I":553,"J":737,"K":1209,"L":983,"M":1878,"N":1567,"O":1584,"P":1169,"Q":1584,"R":1249,"S":1112,"T":1093,"U":1439,"V":1299,"W":1953,"X":1231,"Y":1154,"Z":1193,"[":624,"\\":1564,"]":624,"^":1435,"_":872,"`":557,"a":1065,"b":1230,"c":968,"d":1233,"e":1096,"f":648,"g":1233,"h":1185,"i":504,"j":504,"k":1036,"l":504,"m":1802,"n":1184,"o":1227,"p":1230,"q":1233,"r":724,"s":887,"t":706,"u":1184,"v":998,"w":1508,"x":952,"y":1009,"z":946,"{":624,"|":490,"}":624,"~":1435,"·":448,"–":1051},
  b: {"0":1187,"1":1187,"2":1187,"3":1187,"4":1187,"5":1187,"6":1187,"7":1187,"8":1187,"9":1187," ":720,"!":662,"\"":975,"#":1245,"$":1187,"%":1793,"&":1755,"'":577,"(":733,")":733,"*":934,"+":1473,",":536,"-":847,".":536,"/":899,":":536,";":536,"<":1473,"=":1473,">":1473,"?":926,"@":2005,"A":1441,"B":1305,"C":1308,"D":1527,"E":1103,"F":1074,"G":1479,"H":1576,"I":635,"J":882,"K":1321,"L":1049,"M":1975,"N":1634,"O":1590,"P":1259,"Q":1590,"R":1339,"S":1159,"T":1193,"U":1497,"V":1374,"W":2068,"X":1338,"Y":1242,"Z":1252,"[":733,"\\":1564,"]":733,"^":1473,"_":872,"`":632,"a":1112,"b":1283,"c":998,"d":1282,"e":1126,"f":763,"g":1282,"h":1243,"i":562,"j":572,"k":1137,"l":562,"m":1891,"n":1246,"o":1269,"p":1283,"q":1282,"r":806,"s":946,"t":787,"u":1246,"v":1099,"w":1629,"x":1103,"y":1097,"z":990,"{":733,"|":632,"}":733,"~":1473,"·":536,"–":1051},
}
/** 서식 없는 문단의 글자 크기(Word 기본 10pt). */
const BASE_SIZE = 10
/** 빈 문단(간격용)과 문단 기호의 줄 높이 — 문단 기호 글꼴 Times New Roman 10pt. Word 실측 11.75
 *  (표 메트릭 11.5보다 조금 크다 — Word가 줄을 트윕 단위로 올림한 결과로 보인다). */
const EMPTY_LINE = 11.75
/** 표 안 칸 테두리 — 단선 sz=4(0.5pt) E4E8EE */
const RULE = { color: 'E4E8EE', width: 0.5 }

const INK = '1B2330'
const MUTE = '6B7482'
const PASS = { fill: 'E5F5EA', ink: '1B7A44', rule: 'BFE3CC' }
const FAIL = { fill: 'FBE9E7', ink: 'B3261E', rule: 'F2C4BE' }

/**
 * 결과 해석 및 권고. 담당자 확정(2026-09-28) — 담당자가 `KODYS_G*_결과보고서.docx`에 최종결과
 * PASS/FAIL별로 넣어 둔 문장 그대로다(「최종결과 pass, fail인 경우 멘트는 여기에다가 넣어놨어」).
 * G1·G2가 같은 문장이다. FAIL 문구의 「2개 이상의 영역」은 최종 판정 규칙(FAIL 2개 이상 → FAIL,
 * lib/scoring finalVerdict, 담당자 확정 2026-09-29)과 맞는다.
 */
const INTERPRETATION: Record<Verdict, Run[]> = {
  pass: [
    text('본 아동은 한국 난독 선별 검사 결과, '), bold('통과'),
    text('하였습니다. 다만 본 검사는 아동의 발달 수준을 대략적으로 확인하는 선별 검사이므로, 이후에도 가정과 학급에서 읽기·쓰기 발달 상황을 꾸준히 살펴봐 주시기 바랍니다.'),
  ],
  fail: [
    text('본 아동은 한국 난독 선별 검사 결과, 2개 이상의 영역에서 또래보다 느린 수준으로 나타나 '), bold('미통과'),
    text('하였습니다. 선별 검사는 아동의 대략적인 발달 수준을 확인하는 것을 목적으로 하며, 이 결과만으로 아동의 읽기, 쓰기 어려움을 진단하는 것은 아닙니다. 아동의 정확한 읽기·쓰기 능력을 확인하기 위해 전문 기관에서의 심화 검사를 권고드립니다.'),
  ],
}

/** 결과 요약 열 — 양식의 열 순서·머리글. 판정은 lib/scoring의 과제 키를 그대로 쓴다. */
const SUMMARY_COLS: { key: TaskKey; label: string }[] = [
  { key: 'wordReading', label: '해독' },
  { key: 'sentenceReading', label: '읽기유창성' },
  { key: 'writing', label: '쓰기' },
]

/**
 * 추가 관찰 정보 행. 영역 코드는 화면과 같은 CHECKLIST_AREAS의 것이고(선생님이 체크한 것이 그대로
 * 나온다 — 담당자 확정 2026-09-28), 표기 문구는 담당자 양식의 것이라 화면의 label/hint와 다르다.
 * '인지' 행의 설명만 서식이 없는(10pt·검정) 것은 정답본이 그렇다.
 */
const OBSERVATIONS: { code: string; label: string; desc: string; plain?: boolean }[] = [
  { code: 'none', label: '특이사항 없음', desc: '' },
  { code: 'cognition', label: '인지', desc: '또래에 비해 전반적인 이해나 과제 수행에 어려움을 보임', plain: true },
  { code: 'language', label: '언어 (이해 / 표현)', desc: '말을 이해하거나 자신의 생각을 표현하는 데 어려움이 있음' },
  { code: 'speech', label: '말 (조음 / 유창성)', desc: '발음이 부정확하거나 말을 자주 더듬음' },
  { code: 'attention', label: '주의력', desc: '수업에 집중하거나 과제를 끝까지 수행하는 데 어려움이 있음' },
]

// ── 텍스트 모델 ──────────────────────────────────────────────────────────────
interface Run { t: string; size?: number; color?: string; bold?: boolean }
interface Para {
  runs: Run[]
  align?: 'center'
  /** 문단 앞·뒤 간격(pt) */
  before?: number; after?: number
  /** 줄 간격 배수 */
  lineMul?: number
}
interface Line { runs: Run[]; h: number; asc: number; w: number }
interface Fonts { r: PDFFont; b: PDFFont; glyphs: Set<number> }
/**
 * 글꼴에 없는 글자는 「?」로 바꿔 그린다. pdf-lib는 없는 글리프를 조용히 건너뛰어 글자가 사라지는데,
 * 임상 문서에서 이름 한 글자가 빈칸이 되는 것보다 「?」로 드러나는 편이 낫다. 입력 단계에서 이름은
 * 완성형 한글·영문만 받으므로(lib/schema NAME_RE) 실제로는 거의 오지 않는 경로다.
 */
function drawable(f: Fonts, t: string): string {
  let out = ''
  for (const ch of t) out += f.glyphs.has(ch.codePointAt(0)!) ? ch : '?'
  return out
}

function text(t: string, size?: number, color?: string): Run { return { t, size, color } }
// text()/bold()는 글꼴 로드 전에 호출되므로 치환은 그릴 때(drawPara) 한다.
function bold(t: string, size?: number, color?: string): Run { return { t, size, color, bold: true } }
const sizeOf = (r: Run) => r.size ?? BASE_SIZE
const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255)
const fontOf = (f: Fonts, r: Run) => (r.bold ? f.b : f.r)
/** 그리는 글꼴(나눔고딕)의 폭 — 글자를 실제로 놓을 때·가운데 정렬에 쓴다. */
const widthOf = (f: Fonts, r: Run, t = r.t) => fontOf(f, r).widthOfTextAtSize(drawable(f, t), sizeOf(r))
/** 맑은 고딕의 폭 — 줄바꿈 판단에만 쓴다(Word와 같은 곳에서 줄이 나뉘게). */
function layoutWidthOf(f: Fonts, r: Run, t: string): number {
  const table = MALGUN_ADV[r.bold ? 'b' : 'r']
  let units = 0
  for (const ch of t) {
    const cp = ch.codePointAt(0)!
    const u = cp >= 0xAC00 && cp <= 0xD7A3 ? MALGUN_HANGUL : table[ch]
    if (u === undefined) return widthOf(f, r, t)   // 표 밖 글자가 섞이면 그 조각은 나눔고딕 폭으로
    units += u
  }
  return units / 2048 * sizeOf(r)
}

/**
 * 줄바꿈. 한글은 글자 단위로, 라틴 문자·숫자는 낱말 단위로 끊는다(Word의 한국어 문서 동작).
 * 문장 부호(, . ) ·)는 줄 머리에 오지 않게 앞 줄에 붙인다. 줄 끝 공백은 폭에 세지 않는다.
 * 폭은 맑은 고딕 진행 폭(`layoutWidthOf`)으로 재서 Word와 같은 곳에서 나뉘게 한다.
 */
function wrap(f: Fonts, p: Para, width: number): Line[] {
  const lh = (r: Run) => lineHeightOf(sizeOf(r)) * (p.lineMul ?? 1)
  const ascOf = (r: Run) => ASCENT * sizeOf(r)
  const lineOf = (pieces: { run: Run; t: string }[]): Line => {
    const runs = pieces.filter(x => x.t !== '')
    const h = Math.max(EMPTY_LINE * (p.lineMul ?? 1), ...runs.map(x => lh(x.run)))
    const asc = Math.max(0, ...runs.map(x => ascOf(x.run)))
    // 같은 서식의 조각을 합친다 — drawText 호출 수를 줄이고 폭 계산도 한 번에 한다
    const out: Run[] = []
    for (const x of runs) {
      const last = out[out.length - 1]
      if (last && last.size === x.run.size && last.color === x.run.color && !!last.bold === !!x.run.bold) last.t += x.t
      else out.push({ ...x.run, t: x.t })
    }
    // 줄 끝 공백은 폭에 세지 않는다(Word가 줄 끝 공백을 매달아 두는 것과 같다) — 마지막 조각만.
    const w = out.reduce((n, r, i) => n + widthOf(f, r, i === out.length - 1 ? r.t.replace(/\s+$/, '') : r.t), 0)
    return { runs: out, h, asc, w }
  }
  if (p.runs.every(r => r.t === '')) return [lineOf([])]

  const lines: Line[] = []
  let cur: { run: Run; t: string }[] = []
  let curW = 0
  for (const run of p.runs) {
    for (const atom of run.t.match(/[A-Za-z0-9]+|\s|./gu) ?? []) {
      const w = layoutWidthOf(f, run, atom)
      const noStart = /^[,.)·!?:;]$/.test(atom)
      if (/^\s$/.test(atom) || curW + w <= width || curW === 0 || noStart) {
        cur.push({ run, t: atom }); curW += w
      } else {
        lines.push(lineOf(cur))
        cur = [{ run, t: atom }]; curW = w
      }
    }
  }
  lines.push(lineOf(cur))
  return lines
}

function paraHeight(f: Fonts, p: Para, width: number): number {
  return (p.before ?? 0) + wrap(f, p, width).reduce((n, l) => n + l.h, 0) + (p.after ?? 0)
}

// ── 그리기 ───────────────────────────────────────────────────────────────────
/** 좌표는 위에서 아래로 잰다(docx와 같은 방향). pdf-lib 원점은 좌하단이라 여기서 뒤집는다. */
const Y = (top: number) => PAGE.h - top

function drawPara(page: PDFPage, f: Fonts, p: Para, x: number, top: number, width: number): number {
  let y = top + (p.before ?? 0)
  for (const line of wrap(f, p, width)) {
    let cx = p.align === 'center' ? x + (width - line.w) / 2 : x
    // 줄 간격 배수로 늘어난 몫은 글자 위아래에 반씩 둔다(Word 정답본 실측 — 1.15배 문단에서 위에만 두면 1.3pt 낮다).
    const unscaled = line.h / (p.lineMul ?? 1)
    const baseline = y + (line.h - unscaled) / 2 + line.asc
    for (const r of line.runs) {
      const t = drawable(f, r.t)
      page.drawText(t, { x: cx, y: Y(baseline), size: sizeOf(r), font: fontOf(f, r), color: hex(r.color ?? '000000') })
      cx += widthOf(f, r, t)
    }
    y += line.h
  }
  return y + (p.after ?? 0)
}

interface Cell {
  w: number
  fill?: string
  /** null이면 테두리 없음(머리글 띠). 생략하면 기본 칸 테두리. */
  border?: { color: string; width: number } | null
  /** 안쪽 여백 [위, 오른쪽, 아래, 왼쪽] */
  mar: [number, number, number, number]
  valign?: 'center'
  paras: Para[]
  /** 확인란 — 문단 대신 네모(와 체크)를 가운데 그린다 */
  box?: 'checked' | 'unchecked'
}

function cellContentH(f: Fonts, c: Cell): number {
  if (c.box) return lineHeightOf(9.5)   // ☐ 글리프 한 줄(9.5pt)의 높이
  return c.paras.reduce((n, p) => n + paraHeight(f, p, c.w - c.mar[1] - c.mar[3]), 0)
}

/** 표 한 행. 행 높이는 가장 높은 칸이 정하고, 테두리가 있으면 그 굵기(0.5pt)만큼 더 높다(Word 실측 —
 *  행 경계선 사이 거리가 여백+내용보다 테두리 하나만큼 길다). 돌려주는 값은 행 아래쪽 y. */
function drawRow(page: PDFPage, f: Fonts, cells: Cell[], top: number): number {
  const bordered = cells.some(c => c.border !== null)
  const h = Math.max(...cells.map(c => c.mar[0] + cellContentH(f, c) + c.mar[2])) + (bordered ? RULE.width : 0)
  let x = PAGE.left
  // 채우기·테두리를 먼저 전부 그리고 글자를 얹는다 — 옆 칸의 굵은 테두리가 글자를 덮지 않게.
  for (const c of cells) {
    if (c.fill) page.drawRectangle({ x, y: Y(top + h), width: c.w, height: h, color: hex(c.fill) })
    x += c.w
  }
  x = PAGE.left
  for (const c of cells) {
    const b = c.border === undefined ? RULE : c.border
    if (b) page.drawRectangle({ x, y: Y(top + h), width: c.w, height: h, borderColor: hex(b.color), borderWidth: b.width })
    x += c.w
  }
  x = PAGE.left
  for (const c of cells) {
    const inner = c.w - c.mar[1] - c.mar[3]
    const contentH = cellContentH(f, c)
    let y = top + c.mar[0] + (c.valign === 'center' ? (h - c.mar[0] - c.mar[2] - contentH) / 2 : 0)
    if (c.box) drawBox(page, x + c.w / 2, y + lineHeightOf(9.5) / 2, c.box === 'checked')
    else for (const p of c.paras) y = drawPara(page, f, p, x + c.mar[3], y, inner)
    x += c.w
  }
  return top + h
}

/**
 * 확인란. 양식은 Segoe UI Symbol의 ☐(1B2330)·☑(16335A) 9.5pt인데 그 글꼴을 실을 수 없어 선으로 그린다.
 * 한 변 7pt — 9.5pt 글리프의 네모 크기에 맞춘 값.
 */
function drawBox(page: PDFPage, cx: number, cy: number, checked: boolean) {
  const s = 7, half = s / 2
  const color = hex(checked ? '16335A' : INK)
  page.drawRectangle({ x: cx - half, y: Y(cy + half), width: s, height: s, borderColor: color, borderWidth: 0.7 })
  if (!checked) return
  const pad = 1.4
  const opts = { thickness: 0.9, color, lineCap: LineCapStyle.Round }
  const knee = { x: cx - half + pad + (s - 2 * pad) * 0.36, y: Y(cy + half - pad) }
  page.drawLine({ start: { x: cx - half + pad, y: Y(cy + 0.2) }, end: knee, ...opts })
  page.drawLine({ start: knee, end: { x: cx + half - pad, y: Y(cy - half + pad) }, ...opts })
}

/** 소제목 — 왼쪽 세로 띠(pBdr left sz=24 → 3pt)와 들여쓰기 6pt. Word 실측: 띠는 문단 앞·뒤 간격까지 덮고
 *  (7 + 줄 + 4.5), 본문 왼쪽 여백에서 4.3pt 왼쪽에 2.9pt 폭으로 그려진다. */
function drawHeading(page: PDFPage, f: Fonts, label: string, accent: string, top: number): number {
  const p: Para = { runs: [bold(label, 10.5, accent)], before: 7, after: 4.5 }
  const h = 7 + lineHeightOf(10.5) + 4.5
  page.drawRectangle({ x: PAGE.left - 4.3, y: Y(top + h), width: 2.9, height: h, color: hex(accent) })
  return drawPara(page, f, p, PAGE.left + 6, top, TEXT_W - 6)
}

// ── 학교 소재지 ──────────────────────────────────────────────────────────────
const SCHOOLS = new Map<string, Promise<School[]>>()
/**
 * 머리글 「지역 / 학교」의 지역. 담당자 예시가 「춘천 교동초등학교」(시·군 이름, 「시」 없이)라 같은 꼴로 만든다.
 * · 도(강원·경기·충북…): 학교 목록의 소재지 `addr`(춘천시·철원군)에서 끝의 시·군을 뗀다 → 춘천·철원.
 * · 특별시·광역시·세종: `addr`이 구·면·동(동구·연서면)이라 지역으로 읽히지 않으므로 도시 이름(부산·세종)을 쓴다.
 * 사용자 확정(2026-09-29) — 담당자 회신이 아니다. 목록에 없는 학교(옛 세션·수동 입력)는 시도 약칭으로 물러난다.
 */
/** 소재지가 시·군인 지역(도). 나머지(특별시·광역시·세종)는 소재지가 구·면·동이라 도시 이름을 쓴다. */
const PROVINCES = new Set(['강원', '경기', '충북', '충남', '전북', '전남', '경북', '경남', '제주'])
export function placeLabel(regionShort: string, addr: string | undefined): string {
  if (!addr || !PROVINCES.has(regionShort)) return regionShort
  return addr.length >= 3 ? addr.replace(/[시군]$/, '') : addr
}
/** 「지역 학교명」. 학교 이름이 지역으로 시작하면(대구성지초등학교·전주서일초등학교) 지역을 겹쳐 적지 않는다. */
export function schoolLabel(place: string, schoolName: string): string {
  return !place || schoolName.startsWith(place) ? schoolName : `${place} ${schoolName}`
}
async function schoolPlace(region: string, schoolId: string): Promise<string> {
  const r = REGIONS.find(x => x.name === region)
  if (!r) return ''
  let p = SCHOOLS.get(r.slug)
  if (!p) {
    p = readFile(path.join(PUBLIC, 'schools', `${r.slug}.json`), 'utf8').then(s => JSON.parse(s) as School[])
    // 실패한 읽기를 캐시에 남기면 그 지역의 모든 PDF가 프로세스가 죽을 때까지 500이다 —
    // 교사 라우트는 한 학급 25장을 병렬로 만들므로 한 번의 실패가 학급 전체를 막는다.
    // 캐시에서 빼고 시도 약칭으로 물러난다(소재지는 표기일 뿐 판정이 아니다).
    p = p.catch(e => { SCHOOLS.delete(r.slug); console.error('[report] 학교 목록 읽기 실패', r.slug, e); return [] })
    SCHOOLS.set(r.slug, p)
  }
  return placeLabel(r.short, (await p).find(s => s.id === schoolId)?.addr)
}

// ── 본체 ─────────────────────────────────────────────────────────────────────
export async function renderReport(input: ReportInput): Promise<Uint8Array> {
  const { form, session } = input
  const R = form.report
  const [regularBytes, boldBytes, place] = await Promise.all([
    readFile(path.join(ASSETS, 'fonts', 'NanumGothic.ttf')),
    readFile(path.join(ASSETS, 'fonts', 'NanumGothicBold.ttf')),
    schoolPlace(session.school_region, session.school_id),
  ])

  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  // 같은 입력이면 같은 바이트 — 임상 문서는 재현 가능해야 한다. 생성 시각을 검사 시각으로 고정하고
  // 서브셋 글꼴 이름도 고정한다(pdf-lib 기본값은 둘 다 호출마다 달라진다).
  const at = new Date(session.started_at)
  doc.setCreationDate(at); doc.setModificationDate(at)
  doc.setProducer('kids-speech-survey'); doc.setCreator('kids-speech-survey')
  const regular = await doc.embedFont(regularBytes, { subset: true, customName: 'NanumGothic' })
  const f: Fonts = {
    r: regular, b: await doc.embedFont(boldBytes, { subset: true, customName: 'NanumGothicBold' }),
    glyphs: new Set(regular.getCharacterSet()),
  }
  const page = doc.addPage([PAGE.w, PAGE.h])

  const r = scoreSession(form, input)
  // 채점이 끝나지 않은 과제는 판정 칸을 비운다(양식 상태). 없는 값을 FAIL로 찍으면
  // "채점하지 않았다"가 "미통과했다"로 둔갑한다. 최종결과·해석도 세 과제가 다 끝나야 채운다.
  const allScored = TASK_KEYS.every(k => r.complete[k])
  const final: Verdict | null = allScored ? finalVerdict(r.verdict) : null

  let y = PAGE.top

  // 1. 머리글 띠
  y = drawRow(page, f, [{
    w: TEXT_W, fill: R.accent, border: null, mar: [10, 16, 10, 16],
    paras: [
      { runs: [bold('한국 난독 선별 검사', 16, 'FFFFFF')], after: 2 },
      { runs: [text(`KODYS – ${form.id.replace('KODYS-', '')} · Korean Dyslexia Screening Test`, 9, R.accentTint)] },
    ],
  }], y)
  y += EMPTY_LINE + 7

  // 2. 인적사항 2×3
  const info = (label: string, value: string, w: number): Cell => ({
    w, fill: 'FCFDFE', mar: [5, 8, 5, 8],
    paras: [{ runs: [bold(label, 7.5, MUTE)], after: 1 }, { runs: [bold(value, 10.5, INK)] }],
  })
  const [c1, c2, c3] = [172.65, 172.65, 172.7]
  y = drawRow(page, f, [
    info('지역 / 학교', schoolLabel(place, session.school_name), c1),
    info('학년 / 학기', `${session.grade}학년 ${semesterOf(session.started_at)}학기`, c2),
    info('이름', session.child_name, c3),
  ], y)
  y = drawRow(page, f, [
    info('성별', session.gender, c1),
    info('생년월일', birthLabel(session.birth_ymd), c2),
    info('검사일', reportDateLabel(session.started_at), c3),
  ], y)
  y += 2 * (3.5 + EMPTY_LINE)

  // 3. 결과 요약
  y = drawHeading(page, f, '결과 요약', R.accent, y)
  const colW = TEXT_W / 4
  y = drawRow(page, f, [...SUMMARY_COLS.map(c => c.label), '최종결과'].map(label => ({
    w: colW, fill: 'EEF2F6', mar: [4, 3, 4, 3], valign: 'center' as const,
    paras: [{ runs: [bold(label, 9.5, '33404F')], align: 'center' as const }],
  })), y)
  const verdictCell = (v: Verdict | null, size: number, thick: boolean): Cell => {
    const tone = v === 'pass' ? PASS : v === 'fail' ? FAIL : null
    return {
      w: colW, fill: tone?.fill ?? 'FFFFFF', mar: [7, 3, 7, 3], valign: 'center',
      border: thick && tone ? { color: tone.rule, width: 1.25 } : undefined,
      paras: [{ runs: [bold(v ? v.toUpperCase() : '', size, tone?.ink)], align: 'center' }],
    }
  }
  y = drawRow(page, f, [
    ...SUMMARY_COLS.map(c => verdictCell(r.complete[c.key] ? r.verdict[c.key] : null, 12, false)),
    verdictCell(final, 14, true),
  ], y)
  y += 2 * (3.5 + EMPTY_LINE)

  // 4. 결과 해석 및 권고
  y = drawHeading(page, f, '결과 해석 및 권고', R.accent, y)
  y = drawRow(page, f, [{
    w: TEXT_W, fill: 'FCFDFE', mar: [8, 10, 8, 10],
    paras: [{ runs: final ? INTERPRETATION[final].map(run => ({ ...run, color: INK })) : [text('')], after: 2, lineMul: R.interpretationLine }],
  }], y)
  y += R.gapAfterInterpretation * (EMPTY_LINE + 7)

  // 5. 추가 관찰 정보
  const checked = new Set(session.checklist)
  y = drawRow(page, f, [{
    w: TEXT_W, fill: 'F2F5F8', mar: [5, 8, 5, 8],
    paras: [
      { runs: [bold('추가 관찰 정보', 10.5, INK)] },
      { runs: [text(`이 체크리스트는 선별 검사 결과에 반영되지 않으며, 아동의 전반적 발달을 이해하기 위한 참고 자료입니다${R.notePeriod ? '.' : ''}`)] },
    ],
  }], y)
  const [o1, o2, o3] = [135, 75, 308]
  const head = (label: string, w: number, center = false): Cell => ({
    w, fill: 'FAFBFC', mar: [3, 7, 3, 7], valign: 'center',
    paras: [{ runs: [bold(label, 8.5, MUTE)], align: center ? 'center' : undefined }],
  })
  y = drawRow(page, f, [head('영역', o1), head('확인란', o2, true), head(R.observationHeader, o3)], y)
  for (const o of OBSERVATIONS) {
    // 영역 코드가 화면과 같은지는 컴파일 시점에 보장되지 않으므로 여기서 한 번 확인한다.
    if (!CHECKLIST_AREAS.some(a => a.code === o.code)) throw new Error(`알 수 없는 체크리스트 영역: ${o.code}`)
    y = drawRow(page, f, [
      { w: o1, mar: [3.5, 7, 3.5, 7], valign: 'center', paras: [{ runs: [bold(o.label, 9.5, INK)] }] },
      { w: o2, mar: [3.5, 7, 3.5, 7], valign: 'center', paras: [], box: checked.has(o.code) ? 'checked' : 'unchecked' },
      { w: o3, mar: [3.5, 7, 3.5, 7], valign: 'center',
        paras: [{ runs: [o.plain ? text(o.desc) : text(o.desc, 9.5, INK)] }] },
    ], y)
  }

  // 6. 꼬리말 — 위에 0.5pt 선(E4E8EE), 선과 글자 사이 8pt(선 굵기는 별도로 더한다 — Word 실측)
  y += 8
  page.drawLine({ start: { x: PAGE.left, y: Y(y + RULE.width / 2) }, end: { x: PAGE.left + TEXT_W, y: Y(y + RULE.width / 2) }, thickness: RULE.width, color: hex('E4E8EE') })
  y += RULE.width + 8
  drawPara(page, f, { runs: [text('KODYS · Korean Dyslexia Screening Test', 7.5, '97A1AE')], align: 'center' }, PAGE.left, y, TEXT_W)

  return doc.save()
}
