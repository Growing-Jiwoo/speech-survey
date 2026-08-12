import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { stampSheet } from '@/lib/pdf/stamp-sheet'
import { FORMS, formForGrade, type SurveyForm } from '@/lib/forms'
import { itemsFor } from '@/lib/items'
import type { ScoreSlot, WordGridLayout } from '@/lib/forms/layout'

/** PDF 1쪽의 글자 조각 — 위치를 가진 것만.
 *  빈 문자열은 버린다: pdfjs가 글자 사이에 폭 0짜리 조각을 끼워 넣는다. */
async function textItems(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  const { items } = await (await doc.getPage(1)).getTextContent()
  return items.flatMap(i => ('str' in i && i.str !== '' ? [{ str: i.str, x: i.transform[4], y: i.transform[5] }] : []))
}

/** 점수 칸('/' 왼쪽 20pt 안)에 **우리가 찍은** 숫자, 없으면 null.
 *  중단 표기는 "빈칸"이라 바이트 크기 비교로는 확인할 수 없다 — 좌표로 읽어야 한다.
 *  베이스라인 y가 레이아웃 값과 정확히 같은 것만 센다: 검사지에 원래 인쇄된 '/ 7'은
 *  같은 줄이어도 y가 미세하게 다르므로(577.58 vs 577.6) 이걸로 갈린다. */
async function stampedAt(bytes: Uint8Array, slot: ScoreSlot): Promise<string | null> {
  const items = await textItems(bytes)
  const hit = items.find(i => i.y === slot.baselineY && i.x < slot.slashX && i.x > slot.slashX - 20)
  return hit ? hit.str : null
}

/** 낱말 격자의 행별 O/X 개수 — [의미 행, 무의미 행].
 *  실시하지 않은 문항은 O/X 자체가 없어야 한다(빈칸이 곧 표기다). */
async function gridMarkCount(bytes: Uint8Array, g: WordGridLayout): Promise<number[]> {
  const items = await textItems(bytes)
  return g.rows.map(rowY =>
    items.filter(i => i.y === rowY + g.baselineDy && (i.str === 'O' || i.str === 'X')).length)
}

const baseSession = {
  school_name: '경기초등학교', class_no: 3, child_name: '홍길동',
  birth_ymd: '170310', started_at: '2026-08-07T06:25:08.000Z',
  examiner_type: 'expert' as const, checklist: ['cognition'],
}
const sessionFor = (form: SurveyForm) => ({ ...baseSession, grade: form.grades[0] })
const blank = { marks: {}, sentences: {}, writing: {} }

describe.each(FORMS.map(f => [f.id, f] as const))('stampSheet — %s', (_id, form: SurveyForm) => {
  const session = sessionFor(form)
  const f = itemsFor(form)

  it('원본 검사지 위에 그린 단일 페이지 PDF를 만든다', async () => {
    const bytes = await stampSheet({ form, session, ...blank })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(1)
    const { width, height } = out.getPages()[0].getSize()
    // 원본 크기를 그대로 유지해야 한다 — 크기가 변하면 좌표가 전부 어긋난 것이다.
    expect(Math.round(width)).toBe(form.layout.pageWidth)
    expect(Math.round(height)).toBe(form.layout.pageHeight)
  })

  it('한글 이름·학교명이 있어도 실패하지 않는다 (폰트 임베딩)', async () => {
    const bytes = await stampSheet({
      form, session: { ...session, child_name: '김철수', school_name: '서울대치초등학교' },
      ...blank,
    })
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it('채점 결과가 있으면 원본보다 커진다 (실제로 뭔가 그려진다)', async () => {
    const empty = await stampSheet({ form, session, ...blank })
    const filled = await stampSheet({
      form, session,
      marks: Object.fromEntries(f.meaningReadCodes.map(c => [c, true])),
      sentences: Object.fromEntries(f.sentenceItems.map(i => [i.code, 1])),
      writing: Object.fromEntries(f.writingItems.map(i => [i.code, 1])),
    })
    expect(filled.byteLength).toBeGreaterThan(empty.byteLength)
  })

  it('페이지 크기가 레이아웃과 다르면 좌표가 어긋나므로 거부한다', async () => {
    const bad = { ...form, layout: { ...form.layout, pageWidth: 999 } }
    await expect(stampSheet({ form: bad, session, ...blank })).rejects.toThrow(/페이지 크기/)
  })

  it('다른 양식의 문항 코드를 넣어도 던지지 않는다 (좌표 조회 실패 시 조용히 건너뛴다)', async () => {
    const other = FORMS.find(x => x !== form)!
    const foreign = itemsFor(other)
    const bytes = await stampSheet({
      form, session,
      marks: {},
      sentences: {},
      writing: Object.fromEntries(foreign.writingItems.map(i => [i.code, 1])),
    })
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })
})

describe('stampSheet — G2 문장 쓰기 동그라미', () => {
  const form = formForGrade(2)
  const session = sessionFor(form)
  const f = itemsFor(form)

  it('점수마다 다른 위치에 그린다 (0점과 2점의 출력이 다르다)', async () => {
    const at = async (v: number) => stampSheet({
      form, session, marks: {}, sentences: {},
      writing: Object.fromEntries(f.writingItems.map(i => [i.code, v])),
    })
    const zero = await at(0)
    const two = await at(2)
    expect(Buffer.compare(Buffer.from(zero), Buffer.from(two))).not.toBe(0)
  })

  it('미채점 문항은 아무것도 그리지 않는다 (0점과 다르다)', async () => {
    const none = await stampSheet({ form, session, ...blank })
    const zeros = await stampSheet({
      form, session, marks: {}, sentences: {},
      writing: Object.fromEntries(f.writingItems.map(i => [i.code, 0])),
    })
    expect(zeros.byteLength).toBeGreaterThan(none.byteLength)
  })
})

describe('stampSheet — 중단 규칙: 중단 이후는 점수를 적지 않는다 (담당자 확정)', () => {
  const G1 = FORMS.find(f => f.id === 'KODYS-G1')!
  const f1 = itemsFor(G1)
  const session = {
    school_name: '가나초', grade: 1, class_no: 1, child_name: '테스트',
    birth_ymd: '2019-01-01', started_at: '2026-08-11T00:00:00Z',
    examiner_type: 'teacher' as const, checklist: ['none'],
  }
  // ① 성립: 의미 첫 3개 X, 나머지 4개 O — 무의미는 미채점(미실시)
  const ceilingMarks = Object.fromEntries(f1.meaningReadCodes.map((c, i) => [c, i >= 3]))
  // Task 7(입력 잠금)이 끝나기 전까지 관리자가 미실시 문항을 채점할 수 있다.
  // 그런 값이 남아 있어도 인쇄물에는 나오면 안 되므로, 일부러 채운 입력으로 검증한다.
  const strayNonsense = Object.fromEntries(f1.nonsenseReadCodes.map(c => [c, true]))

  it('① 세션: 의미 점수는 찍히고 무의미·총점은 빈다', async () => {
    const bytes = await stampSheet({ form: G1, session, marks: ceilingMarks, sentences: {}, writing: {} })
    expect(await stampedAt(bytes, G1.layout.readScores.meaning)).toBe('4')
    expect(await stampedAt(bytes, G1.layout.readScores.nonsense)).toBeNull()
    expect(await stampedAt(bytes, G1.layout.readScores.total)).toBeNull()
  })

  it('① 세션: 무의미 낱말 O/X는 값이 남아 있어도 찍지 않는다', async () => {
    const bytes = await stampSheet({
      form: G1, session, marks: { ...ceilingMarks, ...strayNonsense }, sentences: {}, writing: {},
    })
    expect(await gridMarkCount(bytes, G1.layout.wordReading)).toEqual([f1.meaningReadCodes.length, 0])
  })

  it('중단 없는 세션: 무의미 낱말 O/X는 그대로 찍힌다', async () => {
    const marks = Object.fromEntries(f1.readItems.map(i => [i.code, true]))
    const bytes = await stampSheet({ form: G1, session, marks, sentences: {}, writing: {} })
    expect(await gridMarkCount(bytes, G1.layout.wordReading))
      .toEqual([f1.meaningReadCodes.length, f1.nonsenseReadCodes.length])
  })

  it('① 세션: 문장 읽기유창성은 문항별 점수도 총점도 빈다 (미실시)', async () => {
    // 문장은 아예 미실시라 sentences가 비어 complete도 false지만, 채워 넣어도 비어야 한다.
    const sentences = Object.fromEntries(f1.sentenceItems.map(i => [i.code, 1]))
    const bytes = await stampSheet({ form: G1, session, marks: ceilingMarks, sentences, writing: {} })
    expect(await stampedAt(bytes, G1.layout.sentenceScores[0])).toBeNull()
    expect(await stampedAt(bytes, G1.layout.sentenceTotal)).toBeNull()
  })

  it('② 세션(G1): 쓰기 1번 X만 찍히고 2~5번과 소계 3칸은 전부 빈다', async () => {
    // 1번 오반응 + 2~5번에 값이 남아 있는 상태 — 2~5번은 실시하지 않은 문항이다.
    const writing = Object.fromEntries(f1.writingItems.map((i, n) => [i.code, n === 0 ? 0 : 1]))
    const out = await stampSheet({ form: G1, session, marks: {}, sentences: {}, writing })
    const w = G1.layout.writing
    expect(w.kind).toBe('word')
    if (w.kind !== 'word') return
    expect(await gridMarkCount(out, w.grid)).toEqual([1, 0])   // ww01의 X 하나뿐
    expect(await stampedAt(out, w.scores.meaning)).toBeNull()
    expect(await stampedAt(out, w.scores.nonsense)).toBeNull()
    expect(await stampedAt(out, w.scores.total)).toBeNull()
  })

  it('①만 걸림(G1): 쓰기는 실시하는 과제라 O/X·소계·총점이 다 찍힌다', async () => {
    const writing = Object.fromEntries(f1.writingItems.map(i => [i.code, 1]))  // 전부 정답, ②는 안 걸림
    const out = await stampSheet({ form: G1, session, marks: ceilingMarks, sentences: {}, writing })
    const w = G1.layout.writing
    expect(w.kind).toBe('word')
    if (w.kind !== 'word') return
    expect(await gridMarkCount(out, w.grid))
      .toEqual([f1.meaningWriteCodes.length, f1.nonsenseWriteCodes.length])
    expect(await stampedAt(out, w.scores.meaning)).not.toBeNull()
    expect(await stampedAt(out, w.scores.total)).not.toBeNull()
  })

  it('② 세션(G2): 문장 쓰기 총점도 빈다', async () => {
    const G2 = formForGrade(2)
    const f2 = itemsFor(G2)
    const w = G2.layout.writing
    expect(w.kind).toBe('sentence')
    if (w.kind !== 'sentence') return
    // 1번만 0점, 나머지는 만점 — 중단이 없었다면 총점이 찍힐 조건이다.
    const writing = Object.fromEntries(f2.writingItems.map((i, n) => [i.code, n === 0 ? 0 : 2]))
    const out = await stampSheet({ form: G2, session: sessionFor(G2), marks: {}, sentences: {}, writing })
    expect(await stampedAt(out, w.total)).toBeNull()

    // 2~5번 동그라미도 치지 않는다. 동그라미는 글자가 아니라 도형이라 좌표로 읽을 수 없으므로,
    // 1번만 남긴 입력과 출력이 **완전히 같은지**로 확인한다 — 다르면 2~5번이 그려진 것이다.
    const only1 = await stampSheet({
      form: G2, session: sessionFor(G2), marks: {}, sentences: {}, writing: { [f2.writingItems[0].code]: 0 },
    })
    expect(Buffer.compare(Buffer.from(out), Buffer.from(only1))).toBe(0)
  })
})
