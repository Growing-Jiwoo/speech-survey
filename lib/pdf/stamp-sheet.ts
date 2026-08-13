// lib/pdf/stamp-sheet.ts — 원본 검사지 PDF에 채점 결과만 얹는다.
// 배경이 담당자가 배포한 PDF 그 자체라, 출력물은 정의상 공식 양식과 일치한다.
// 인쇄는 선생님이 아동 한 명당 한 장 하므로 페이지 크기·여백을 건드리지 않는다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { LineCapStyle, PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { itemsFor, type FormItems } from '@/lib/items'
import { clampWords, scoreSession, type ScoreInput } from '@/lib/scoring'
import { gradeClassLabel, sheetDateLabel } from '@/lib/format'
import type { SurveyForm } from '@/lib/forms'
import type { ChoiceGridLayout, ScoreSlot, SheetLayout, WordGridLayout } from '@/lib/forms/layout'

const ASSETS = path.join(process.cwd(), 'assets')
const INK = rgb(0.06, 0.09, 0.16)
// 채점 표시는 인쇄된 검사지 글자(먹)와 다른 색이어야 한다 — 같은 색이면 어디까지가
// 양식이고 어디부터가 채점 결과인지 한눈에 구분되지 않는다.
// 화면 결과지와 같은 의미색을 쓴다: 정반응 --color-mint, 오반응 --color-rec-deep.
const OK = rgb(0x0A / 255, 0x80 / 255, 0x62 / 255)
const ERR = rgb(0xC1 / 255, 0x3A / 255, 0x3E / 255)

export interface StampInput extends ScoreInput {
  form: SurveyForm
  session: {
    school_name: string; grade: number; class_no: number; child_name: string
    birth_ymd: string; started_at: string
    examiner_type: 'teacher' | 'expert' | null
    checklist: string[]
  }
}

export async function stampSheet(input: StampInput): Promise<Uint8Array> {
  const { form, session } = input
  const L = form.layout
  const f = itemsFor(form)

  const [srcPdf, regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(ASSETS, L.pdf)),
    readFile(path.join(ASSETS, 'fonts', 'NanumGothic.ttf')),
    readFile(path.join(ASSETS, 'fonts', 'NanumGothicBold.ttf')),
  ])
  // updateMetadata:false — pdf-lib 기본값(true)은 load 시점에 ModDate를 현재 시각으로 다시 쓴다.
  // 그러면 같은 채점 결과라도 만들 때마다 바이트가 달라져 (a) 출력이 재현 불가능해지고
  // (b) 두 출력을 비교하는 테스트가 초 경계를 넘는 순간 간헐 실패한다.
  // 임상 문서는 같은 입력이면 같은 파일이 나와야 하므로 원본 메타데이터를 그대로 둔다.
  const doc = await PDFDocument.load(srcPdf, { updateMetadata: false })
  doc.registerFontkit(fontkit)
  // 검사지 본문과 같은 서체(NanumGothic). 점수·O/X는 옆의 분모('/ 7')와 같은 굵기라야
  // 원래 인쇄된 숫자처럼 보인다 — 정체는 인적사항처럼 본문에 섞이는 값에만 쓴다.
  const font = await doc.embedFont(regularBytes, { subset: true })
  const bold = await doc.embedFont(boldBytes, { subset: true })
  const page = doc.getPages()[0]

  // 좌표는 이 크기를 전제로 뽑혔다. 개정본을 크기까지 바꿔 넣으면 전부 어긋나므로 먼저 막는다.
  const { width, height } = page.getSize()
  if (Math.round(width) !== L.pageWidth || Math.round(height) !== L.pageHeight) {
    throw new Error(
      `검사지 페이지 크기(${Math.round(width)}×${Math.round(height)})가 레이아웃(${L.pageWidth}×${L.pageHeight})과 다릅니다. ` +
      '검사지가 개정됐다면 scripts/extract-form-layout.mjs로 좌표를 다시 뽑아야 합니다.')
  }

  const r = scoreSession(form, input)
  const put = (slot: ScoreSlot, v: number) => score(page, bold, slot, v, L.fontSize)

  stampHeader(page, font, L, session)
  // 검사지 배열 순서: 의미 낱말 먼저, 그다음 무의미 낱말.
  stampGrid(page, bold, L.wordReading,
    [...f.meaningReadCodes, ...f.nonsenseReadCodes], input.marks, L.fontSize)

  // 채점이 끝나지 않은 과제는 소계·총점 칸을 비운다.
  // 없는 데이터를 0으로 세어 찍으면 "채점하지 않았다"가 "0점을 받았다"로 둔갑한다.
  // 빈칸이 곧 표기다: 별도 안내 문구를 넣지 않기로 했다.
  // 종이 검사지에서도 채점하지 않은 칸은 비워 두므로, 빈칸이 곧 올바른 표기다.
  if (r.complete.wordReading) {
    put(L.readScores.meaning, r.wordMeaning)
    put(L.readScores.nonsense, r.wordNonsense)
    put(L.readScores.total, r.wordReading)
  }
  f.sentenceItems.forEach((item, i) => {
    const v = input.sentences[item.code]
    // 미입력 문항은 0을 찍지 않는다 — 0점과 미채점은 다르다.
    // 값은 총점과 같은 clamp를 거쳐야 행의 합과 총점이 어긋나지 않는다(오입력·NaN 방지).
    if (v !== undefined && L.sentenceScores[i]) {
      put(L.sentenceScores[i], clampWords(f, item.code, v))
    }
  })
  if (r.complete.sentenceReading) put(L.sentenceTotal, r.sentenceReading)

  stampWriting(page, bold, L.writing, L.fontSize, f, input.writing, r, put)

  for (const code of session.checklist) {
    const y = L.checklist.rows[code]
    if (y !== undefined) drawCheck(page, L.checklist, y)
  }
  // Pass/Fail은 찍지 않는다 — 검사지에 해당 칸이 없고, 임시 기준 판정을 공식 문서에 남기지 않기 위함.
  return doc.save()
}

/**
 * 쓰기 과제. 검사지가 두 종류라 표기 방식도 다르다:
 * · 낱말 쓰기(G1)  — 낱말 격자에 O/X를 찍고 의미·무의미·총점 소계를 채운다.
 * · 문장 쓰기(G2)  — **인쇄된 「0 1 2」 중 획득 점수에 동그라미**를 치고 총점만 채운다.
 */
function stampWriting(
  page: PDFPage, bold: PDFFont, layout: SheetLayout['writing'], fontSize: number, f: FormItems,
  writing: Partial<Record<string, number>>, r: ReturnType<typeof scoreSession>,
  put: (slot: ScoreSlot, v: number) => void,
) {
  if (layout.kind === 'word') {
    // 낱말 쓰기 값은 문항 만점이 1이라 1=정반응, 0=오반응이다.
    const marks = Object.fromEntries(
      Object.entries(writing).map(([code, v]) => [code, v === undefined ? undefined : v >= 1]),
    )
    stampGrid(page, bold, layout.grid,
      [...f.meaningWriteCodes, ...f.nonsenseWriteCodes], marks, fontSize)
    if (r.complete.writing) {
      put(layout.scores.meaning, r.writeMeaning)
      put(layout.scores.nonsense, r.writeNonsense)
      put(layout.scores.total, r.writing)
    }
    return
  }
  f.writingItems.forEach((item, i) => {
    const v = writing[item.code]
    if (v === undefined) return   // 미채점은 비워 둔다 (0점과 다르다)
    circleChoice(page, layout.choices, i, clampWords(f, item.code, v))
  })
  if (r.complete.writing) put(layout.total, r.writing)
}

/** 낱말 격자: 낱말 오른쪽 여백에 O/X. 미채점(undefined)은 비워 둔다.
 *  베이스라인을 낱말과 맞춘다 — 칸 위쪽에 찍으면 채점 대상보다 떠 보인다. */
function stampGrid(
  page: PDFPage, font: PDFFont, g: WordGridLayout,
  codes: string[], marks: Partial<Record<string, boolean>>, size: number,
) {
  codes.forEach((code, i) => {
    const ok = marks[code]
    if (ok === undefined) return
    const col = i % g.perRow
    const cellY = g.rows[Math.floor(i / g.perRow)]
    if (cellY === undefined) return
    const s = ok ? 'O' : 'X'
    const w = font.widthOfTextAtSize(s, size)
    page.drawText(s, {
      x: g.x0 + g.dx * col + g.w - w - 5,
      y: cellY + g.baselineDy,
      size, font, color: ok ? OK : ERR,
    })
  })
}

/**
 * 인쇄된 「0 1 2」 중 획득 점수에 동그라미.
 *
 * 점수와 무관하게 한 색이다. 낱말 격자의 O/X는 정오 **판정**이라 색이 뜻을 갖지만,
 * 이 동그라미는 받은 점수를 **표기**하는 것뿐이라 0점을 오반응색으로 칠하면 판단을
 * 얹게 된다(0점은 두 어절 다 틀린 것이지 문항을 틀린 것이 아니다).
 */
function circleChoice(page: PDFPage, c: ChoiceGridLayout, itemIndex: number, value: number) {
  const row = c.rows[itemIndex]
  if (!row) return
  const cx = c.colCx[row.col]
  if (cx === undefined) return
  page.drawEllipse({
    x: cx + (value - 1) * c.dx,
    y: row.baselineY + c.cy,
    xScale: c.rx, yScale: c.ry,
    borderColor: OK, borderWidth: 1.1, opacity: 0,
  })
}

/** 점수: '/' 왼쪽에 오른쪽 정렬 */
function score(page: PDFPage, font: PDFFont, slot: ScoreSlot, value: number, size: number) {
  const s = String(value)
  const w = font.widthOfTextAtSize(s, size)
  page.drawText(s, { x: slot.slashX - 6 - w, y: slot.baselineY, size, font, color: INK })
}

function stampHeader(page: PDFPage, font: PDFFont, L: SheetLayout, s: StampInput['session']) {
  const h = L.header
  const put = (text: string, col: { lo: number; hi: number }) => {
    if (!text) return
    const avail = col.hi - col.lo - 4
    // 칸이 좁아 긴 학교명은 들어가지 않는다 — 먼저 줄이고(최소 6pt), 그래도 넘치면 잘라낸다.
    // 실제 학교 목록 6,320곳 중 250곳이 6pt에서도 넘치는데, 가운데 정렬로 흘려보내면
    // 양옆 칸(제목·학년/반)을 덮어 아동의 학년이 읽히지 않는다. 이름이 잘리는 편이 낫다.
    let size = 9
    while (size > 6 && font.widthOfTextAtSize(text, size) > avail) size -= 0.5
    let t = text
    if (font.widthOfTextAtSize(t, size) > avail) {
      while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > avail) t = t.slice(0, -1)
      t += '…'
    }
    const w = font.widthOfTextAtSize(t, size)
    // 잘린 경우에도 칸을 넘지 않도록 좌우 경계 안으로 가둔다.
    const x = Math.max(col.lo + 2, (col.lo + col.hi) / 2 - w / 2)
    page.drawText(t, { x, y: h.baselineY, size, font, color: INK })
  }
  put(s.school_name, h.school)
  put(gradeClassLabel(s.grade, s.class_no), h.grade)
  put(s.child_name, h.childName)
  put(s.birth_ymd, h.birth)
  put(sheetDateLabel(s.started_at), h.testedAt)
  // 검사지 머리글의 "교사 / 전문가" 중 해당 낱말에 동그라미
  const pick = s.examiner_type === 'expert' ? h.examiner.expert
    : s.examiner_type === 'teacher' ? h.examiner.teacher : null
  if (pick) {
    page.drawEllipse({
      x: pick.cx, y: h.examiner.cy, xScale: pick.rx, yScale: 8.5,
      borderColor: INK, borderWidth: 1.1, opacity: 0,
    })
  }
}

/**
 * 확인란(□) 안에 체크 표시. 네모의 실측 사각형 안쪽에만 그린다.
 * 두 선분을 각진 마감(Butt)으로 이으면 꺾이는 지점 바깥쪽이 패여 "작대기 두 개를
 * 붙여 놓은" 모양이 된다. 둥근 마감으로 이어 한 획처럼 보이게 한다.
 */
function drawCheck(page: PDFPage, cl: SheetLayout['checklist'], baselineY: number) {
  const cy = baselineY + cl.boxDy
  const half = cl.boxSize / 2
  const pad = cl.boxSize * 0.2           // 선이 네모 변에 닿지 않도록 안쪽 여백
  const left = cl.boxCx - half + pad
  const right = cl.boxCx + half - pad
  const top = cy + half - pad
  const bottom = cy - half + pad
  // 짧은 팔은 왼쪽 중간 높이에서 내려오고, 긴 팔이 오른쪽 위로 뻗는 표준 체크 비율
  const knee = { x: left + (right - left) * 0.34, y: bottom }
  const start = { x: left, y: cy + (top - cy) * 0.15 }
  const opts = { thickness: 1.15, color: INK, lineCap: LineCapStyle.Round }
  page.drawLine({ start, end: knee, ...opts })
  page.drawLine({ start: knee, end: { x: right, y: top }, ...opts })
}
