// lib/pdf/report.ts — 결과보고서 PDF. 담당자가 배포한 `KODYS_G*_결과보고서_양식.docx`(2026-09-28)를
// 한 장짜리 PDF로 그린다. 표·여백·색·글자 크기는 전부 그 docx에서 읽은 값이고(단위 pt), 학년마다
// 다른 값은 `SurveyForm.report`가 갖는다. 정답본(`KODYS_G*_결과보고서.docx`)과 1:1이 목표라
// 양식 사이의 서식 불일치도 "정리"하지 않고 그대로 옮겼다(사용자 확정 2026-09-28).
//
// 글꼴: 양식은 맑은 고딕(Microsoft 전용 글꼴)·Segoe UI Symbol·Times New Roman을 쓰지만 세 글꼴 모두
// 서버에 실어 배포할 수 없다(재배포 금지 EULA). 글자는 나눔고딕(OFL, assets/fonts)으로 그리되
// **줄 높이는 맑은 고딕의 세로 메트릭으로 계산**한다 — 글꼴을 바꾸면서 줄 간격까지 따라 바꾸면
// 세로 배치가 양식과 어긋난다. 글자 폭은 글꼴마다 달라 긴 문단의 줄바꿈 위치는 Word와 조금 다를 수 있다.
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
/** 맑은 고딕 세로 메트릭(hhea ascender 2229 · descender −495 · upm 2048). 줄 높이 1.330em, 베이스라인 1.088em. */
const LINE = 2724 / 2048
const ASCENT = 2229 / 2048
/** 서식 없는 문단·빈 문단의 글자 크기(Word 기본 10pt). 빈 줄(간격용 문단)의 높이도 여기서 나온다. */
const BASE_SIZE = 10
const EMPTY_LINE = LINE * BASE_SIZE
/** 표 안 칸 테두리 — 단선 sz=4(0.5pt) E4E8EE */
const RULE = { color: 'E4E8EE', width: 0.5 }

const INK = '1B2330'
const MUTE = '6B7482'
const PASS = { fill: 'E5F5EA', ink: '1B7A44', rule: 'BFE3CC' }
const FAIL = { fill: 'FBE9E7', ink: 'B3261E', rule: 'F2C4BE' }

/**
 * 결과 해석 및 권고. 담당자 확정(2026-09-28) — 담당자가 `KODYS_G*_결과보고서.docx`에 최종결과
 * PASS/FAIL별로 넣어 둔 문장 그대로다(「최종결과 pass, fail인 경우 멘트는 여기에다가 넣어놨어」).
 * G1·G2가 같은 문장이다. ⚠️ FAIL 문구의 「2개 이상의 영역」은 최종 판정 규칙(하나라도 FAIL → FAIL,
 * lib/scoring finalVerdict)과 어긋난다 — 담당자에게 되물을 항목이며 문구는 임의로 고치지 않는다.
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
interface Fonts { r: PDFFont; b: PDFFont }

function text(t: string, size?: number, color?: string): Run { return { t, size, color } }
function bold(t: string, size?: number, color?: string): Run { return { t, size, color, bold: true } }
const sizeOf = (r: Run) => r.size ?? BASE_SIZE
const hex = (h: string) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255)
const fontOf = (f: Fonts, r: Run) => (r.bold ? f.b : f.r)
const widthOf = (f: Fonts, r: Run, t = r.t) => fontOf(f, r).widthOfTextAtSize(t, sizeOf(r))

/**
 * 줄바꿈. 한글은 글자 단위로, 라틴 문자·숫자는 낱말 단위로 끊는다(Word의 한국어 문서 동작).
 * 문장 부호(, . ) ·)는 줄 머리에 오지 않게 앞 줄에 붙인다. 줄 끝 공백은 폭에 세지 않는다.
 */
function wrap(f: Fonts, p: Para, width: number): Line[] {
  const lh = (r: Run) => LINE * sizeOf(r) * (p.lineMul ?? 1)
  const lineOf = (pieces: { run: Run; t: string }[]): Line => {
    const runs = pieces.filter(x => x.t !== '')
    const h = Math.max(EMPTY_LINE * (p.lineMul ?? 1), ...runs.map(x => lh(x.run)))
    const asc = Math.max(ASCENT * BASE_SIZE, ...runs.map(x => ASCENT * sizeOf(x.run)))
    // 같은 서식의 조각을 합친다 — drawText 호출 수를 줄이고 폭 계산도 한 번에 한다
    const out: Run[] = []
    for (const x of runs) {
      const last = out[out.length - 1]
      if (last && last.size === x.run.size && last.color === x.run.color && !!last.bold === !!x.run.bold) last.t += x.t
      else out.push({ ...x.run, t: x.t })
    }
    const w = out.reduce((n, r) => n + widthOf(f, r, r.t.replace(/\s+$/, '')), 0)
    return { runs: out, h, asc, w }
  }
  if (p.runs.every(r => r.t === '')) return [lineOf([])]

  const lines: Line[] = []
  let cur: { run: Run; t: string }[] = []
  let curW = 0
  for (const run of p.runs) {
    for (const atom of run.t.match(/[A-Za-z0-9]+|\s|./gu) ?? []) {
      const w = widthOf(f, run, atom)
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
    // 줄 간격 배수로 늘어난 몫은 글자 위에 둔다(Word).
    const baseline = y + (line.h - Math.max(EMPTY_LINE, ...line.runs.map(r => LINE * sizeOf(r)))) + line.asc
    for (const r of line.runs) {
      page.drawText(r.t, { x: cx, y: Y(baseline), size: sizeOf(r), font: fontOf(f, r), color: hex(r.color ?? '000000') })
      cx += widthOf(f, r)
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
  if (c.box) return LINE * 9.5   // ☐ 글리프 한 줄(9.5pt)의 높이
  return c.paras.reduce((n, p) => n + paraHeight(f, p, c.w - c.mar[1] - c.mar[3]), 0)
}

/** 표 한 행. 행 높이는 가장 높은 칸이 정한다. 돌려주는 값은 행 아래쪽 y. */
function drawRow(page: PDFPage, f: Fonts, cells: Cell[], top: number): number {
  const h = Math.max(...cells.map(c => c.mar[0] + cellContentH(f, c) + c.mar[2]))
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
    if (c.box) drawBox(page, x + c.w / 2, y + LINE * 9.5 / 2, c.box === 'checked')
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

/** 소제목 — 왼쪽에 3pt 굵기의 세로 띠(pBdr left sz=24), 띠와 글자 사이 6pt, 들여쓰기 6pt. */
function drawHeading(page: PDFPage, f: Fonts, label: string, accent: string, top: number): number {
  const p: Para = { runs: [bold(label, 10.5, accent)], before: 7, after: 4.5 }
  const lineTop = top + 7
  const lineH = LINE * 10.5
  page.drawRectangle({ x: PAGE.left + 6 - 6 - 3, y: Y(lineTop + lineH), width: 3, height: lineH, color: hex(accent) })
  return drawPara(page, f, p, PAGE.left + 6, top, TEXT_W - 6)
}

// ── 학교 소재지 ──────────────────────────────────────────────────────────────
const SCHOOLS = new Map<string, Promise<School[]>>()
/**
 * 머리글 「지역 / 학교」의 지역. 담당자 예시가 「춘천 교동초등학교」(시·군 단위)라 학교 목록의
 * 소재지(`addr`, 예: 춘천시)를 쓴다. 사용자 확정(2026-09-28) — 담당자 회신이 아니다. 목록에 없는
 * 학교(옛 세션·수동 입력)는 시도 약칭으로 물러난다.
 */
async function schoolPlace(region: string, schoolId: string): Promise<string> {
  const r = REGIONS.find(x => x.name === region)
  if (!r) return ''
  let p = SCHOOLS.get(r.slug)
  if (!p) {
    p = readFile(path.join(PUBLIC, 'schools', `${r.slug}.json`), 'utf8').then(s => JSON.parse(s) as School[])
    SCHOOLS.set(r.slug, p)
  }
  return (await p).find(s => s.id === schoolId)?.addr ?? r.short
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
  const f: Fonts = {
    r: await doc.embedFont(regularBytes, { subset: true, customName: 'NanumGothic' }),
    b: await doc.embedFont(boldBytes, { subset: true, customName: 'NanumGothicBold' }),
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
    info('지역 / 학교', `${place} ${session.school_name}`.trim(), c1),
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

  // 6. 꼬리말 — 위에 0.5pt 선(E4E8EE), 선과 글자 사이 8pt
  y += 8
  page.drawLine({ start: { x: PAGE.left, y: Y(y) }, end: { x: PAGE.left + TEXT_W, y: Y(y) }, thickness: 0.5, color: hex('E4E8EE') })
  y += 8
  drawPara(page, f, { runs: [text('KODYS · Korean Dyslexia Screening Test', 7.5, '97A1AE')], align: 'center' }, PAGE.left, y, TEXT_W)

  return doc.save()
}
