// lib/pdf/stamp-sheet.ts — 원본 검사지 PDF에 채점 결과만 얹는다.
// 배경이 담당자가 배포한 PDF 그 자체라, 출력물은 정의상 공식 양식과 일치한다.
// 인쇄는 선생님이 아동 한 명당 한 장 하므로 페이지 크기·여백을 건드리지 않는다.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { ITEMS, MEANING_READ_CODES, MEANING_WRITE_CODES, WRITING_ITEMS } from '@/lib/items'
import { scoreSession } from '@/lib/scoring'
import { gradeClassLabel, sheetDateLabel } from '@/lib/format'
import type { SurveyForm } from '@/lib/forms'
import type { ScoreSlot, SheetLayout, WordGridLayout } from '@/lib/forms/layout'

const ASSETS = path.join(process.cwd(), 'assets')
const INK = rgb(0.06, 0.09, 0.16)
const ERR = rgb(0.78, 0.13, 0.13)

const READ_CODES = ITEMS.filter(i => i.section === 'word_reading').map(i => i.code)
const SENTENCE_CODES = ITEMS.filter(i => i.section === 'sentence_reading').map(i => i.code)
const WRITE_CODES = WRITING_ITEMS.map(i => i.code)
/** 검사지 배열 순서: 의미 낱말 먼저, 그다음 무의미 낱말 */
const readOrder = [...MEANING_READ_CODES, ...READ_CODES.filter(c => !MEANING_READ_CODES.includes(c))]
const writeOrder = [...MEANING_WRITE_CODES, ...WRITE_CODES.filter(c => !MEANING_WRITE_CODES.includes(c))]

export interface StampInput {
  form: SurveyForm
  session: {
    school_name: string; grade: number; class_no: number; child_name: string
    birth_ymd: string; started_at: string
    examiner_type: 'teacher' | 'expert' | null
    checklist: string[]
  }
  marks: Partial<Record<string, boolean>>
  sentences: Partial<Record<string, number>>
  writing: Partial<Record<string, boolean>>
}

export async function stampSheet(input: StampInput): Promise<Uint8Array> {
  const { form, session } = input
  const L = form.layout

  const [srcPdf, regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(ASSETS, L.pdf)),
    readFile(path.join(ASSETS, 'fonts', 'NanumGothic.ttf')),
    readFile(path.join(ASSETS, 'fonts', 'NanumGothicBold.ttf')),
  ])
  const doc = await PDFDocument.load(srcPdf)
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

  const r = scoreSession({ marks: input.marks, sentences: input.sentences, writing: input.writing })

  const put = (slot: Parameters<typeof score>[2], v: number) => score(page, bold, slot, v, L.fontSize)

  stampHeader(page, font, L, session)
  stampGrid(page, bold, L.wordReading, readOrder, input.marks, L.fontSize)
  stampGrid(page, bold, L.wordWriting, writeOrder, input.writing, L.fontSize)
  put(L.readScores.meaning, r.wordMeaning)
  put(L.readScores.nonsense, r.wordNonsense)
  put(L.readScores.total, r.wordReading)
  SENTENCE_CODES.forEach((code, i) => {
    const v = input.sentences[code]
    // 미입력 문항은 0을 찍지 않는다 — 0점과 미채점은 다르다.
    if (v !== undefined && L.sentenceScores[i]) put(L.sentenceScores[i], v)
  })
  put(L.sentenceTotal, r.sentenceReading)
  put(L.writeScores.meaning, r.writeMeaning)
  put(L.writeScores.nonsense, r.writeNonsense)
  put(L.writeScores.total, r.wordWriting)
  for (const code of session.checklist) {
    const y = L.checklist.rows[code]
    if (y !== undefined) drawCheck(page, L.checklist, y)
  }
  // Pass/Fail은 찍지 않는다 — 검사지에 해당 칸이 없고, 임시 기준 판정을 공식 문서에 남기지 않기 위함.
  return doc.save()
}

/** 낱말 격자: 낱말 오른쪽 여백에 O/X. 미실시(undefined)는 비워 둔다.
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
      size, font, color: ok ? INK : ERR,
    })
  })
}

/** 점수: '/' 왼쪽에 오른쪽 정렬 */
function score(page: PDFPage, font: PDFFont, slot: ScoreSlot, value: number, size: number) {
  const s = String(value)
  const w = font.widthOfTextAtSize(s, size)
  page.drawText(s, { x: slot.slashX - 6 - w, y: slot.baselineY, size, font, color: INK })
}

function stampHeader(page: PDFPage, font: PDFFont, L: SurveyForm['layout'], s: StampInput['session']) {
  const h = L.header
  const put = (text: string, col: { lo: number; hi: number }) => {
    if (!text) return
    // 열이 좁아 학교명이 넘칠 수 있다 — 칸 안에 들어갈 때까지 줄인다(최소 6pt).
    let size = 9
    while (size > 6 && font.widthOfTextAtSize(text, size) > col.hi - col.lo - 4) size -= 0.5
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (col.lo + col.hi) / 2 - w / 2, y: h.baselineY, size, font, color: INK })
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

/** 확인란(□) 안에 체크 표시. 네모의 실측 사각형 안쪽에만 그린다. */
function drawCheck(page: PDFPage, cl: SheetLayout['checklist'], baselineY: number) {
  const cy = baselineY + cl.boxDy
  const half = cl.boxSize / 2
  const pad = cl.boxSize * 0.18          // 선이 네모 변에 닿지 않도록 안쪽 여백
  const left = cl.boxCx - half + pad
  const right = cl.boxCx + half - pad
  const top = cy + half - pad
  const bottom = cy - half + pad
  const kneeX = left + (right - left) * 0.36
  page.drawLine({ start: { x: left, y: cy }, end: { x: kneeX, y: bottom }, thickness: 1.1, color: INK })
  page.drawLine({ start: { x: kneeX, y: bottom }, end: { x: right, y: top }, thickness: 1.1, color: INK })
}
