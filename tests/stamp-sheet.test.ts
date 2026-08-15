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
 *  미채점 표기는 "빈칸"이라 바이트 크기 비교로는 확인할 수 없다 — 좌표로 읽어야 한다.
 *  베이스라인 y가 레이아웃 값과 정확히 같은 것만 센다: 검사지에 원래 인쇄된 '/ 7'은
 *  같은 줄이어도 y가 미세하게 다르므로(577.58 vs 577.6) 이걸로 갈린다. */
async function stampedAt(bytes: Uint8Array, slot: ScoreSlot): Promise<string | null> {
  const items = await textItems(bytes)
  const hit = items.find(i => i.y === slot.baselineY && i.x < slot.slashX && i.x > slot.slashX - 20)
  return hit ? hit.str : null
}

/** 낱말 격자의 행별 O/X 개수 — [의미 행, 무의미 행].
 *  채점하지 않은 문항은 O/X 자체가 없어야 한다(빈칸이 곧 표기다). */
async function gridMarkCount(bytes: Uint8Array, g: WordGridLayout): Promise<number[]> {
  const items = await textItems(bytes)
  return g.rows.map(rowY =>
    items.filter(i => i.y === rowY + g.baselineDy && (i.str === 'O' || i.str === 'X')).length)
}

const baseSession = {
  school_name: '경기초등학교', class_no: 3, child_name: '홍길동',
  birth_ymd: '170310', started_at: '2026-08-07T06:25:08.000Z',
  checklist: ['cognition'],
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

describe('stampSheet — 저장된 채점은 전부 찍힌다 (중단 규칙 폐기 — 담당자 확정 2026-08-13)', () => {
  const G1 = FORMS.find(f => f.id === 'KODYS-G1')!
  const f1 = itemsFor(G1)
  const session = {
    school_name: '가나초', grade: 1, class_no: 1, child_name: '테스트',
    birth_ymd: '2019-01-01', started_at: '2026-08-11T00:00:00Z',
    checklist: ['none'],
  }
  // 예전에 중단 규칙 ①이 걸리던 입력: 의미 첫 3개 X, 나머지 4개 O.
  const ceilingMarks = Object.fromEntries(f1.meaningReadCodes.map((c, i) => [c, i >= 3]))
  const allNonsense = Object.fromEntries(f1.nonsenseReadCodes.map(c => [c, true]))

  it('무의미 낱말 O/X는 그대로 찍힌다', async () => {
    const marks = Object.fromEntries(f1.readItems.map(i => [i.code, true]))
    const bytes = await stampSheet({ form: G1, session, marks, sentences: {}, writing: {} })
    expect(await gridMarkCount(bytes, G1.layout.wordReading))
      .toEqual([f1.meaningReadCodes.length, f1.nonsenseReadCodes.length])
  })

  it('[REGRESSION] 의미 첫 3개가 X인 세션도 무의미·문장·총점이 전부 찍힌다 (중단 규칙 폐기)', async () => {
    const sentences = Object.fromEntries(f1.sentenceItems.map(i => [i.code, 1]))
    const bytes = await stampSheet({
      form: G1, session, marks: { ...ceilingMarks, ...allNonsense }, sentences, writing: {},
    })
    expect(await gridMarkCount(bytes, G1.layout.wordReading))
      .toEqual([f1.meaningReadCodes.length, f1.nonsenseReadCodes.length])
    expect(await stampedAt(bytes, G1.layout.readScores.meaning)).toBe('4')
    expect(await stampedAt(bytes, G1.layout.readScores.nonsense)).toBe('7')
    expect(await stampedAt(bytes, G1.layout.readScores.total)).toBe('11')
    expect(await stampedAt(bytes, G1.layout.sentenceScores[0])).toBe('1')
    expect(await stampedAt(bytes, G1.layout.sentenceTotal)).toBe('4')
  })

  it('[REGRESSION] 쓰기 1번이 X여도 2~10번 O/X와 소계 3칸이 전부 찍힌다 (중단 규칙 폐기)', async () => {
    const writing = Object.fromEntries(f1.writingItems.map((i, n) => [i.code, n === 0 ? 0 : 1]))
    const out = await stampSheet({ form: G1, session, marks: {}, sentences: {}, writing })
    const w = G1.layout.writing
    expect(w.kind).toBe('word')
    if (w.kind !== 'word') return
    expect(await gridMarkCount(out, w.grid))
      .toEqual([f1.meaningWriteCodes.length, f1.nonsenseWriteCodes.length])
    expect(await stampedAt(out, w.scores.meaning)).toBe('4')
    expect(await stampedAt(out, w.scores.nonsense)).toBe('5')
    expect(await stampedAt(out, w.scores.total)).toBe('9')
  })

  it('[REGRESSION] G2도 첫 문장이 0점이면 나머지 어절 점수까지 합산해 총점을 찍는다', async () => {
    const G2 = formForGrade(2)
    const f2 = itemsFor(G2)
    const w = G2.layout.writing
    expect(w.kind).toBe('sentence')
    if (w.kind !== 'sentence') return
    const writing = Object.fromEntries(f2.writingItems.map((i, n) => [i.code, n === 0 ? 0 : 2]))
    const out = await stampSheet({ form: G2, session: sessionFor(G2), marks: {}, sentences: {}, writing })
    expect(await stampedAt(out, w.total)).toBe('8')
  })
})

describe('stampSheet — 같은 입력이면 언제 만들어도 같은 바이트다 (재현 가능성)', () => {
  const form = formForGrade(1)
  const session = sessionFor(form)

  // pdf-lib의 PDFDocument.load는 기본값(updateMetadata: true)이면 load 시점에 ModDate를
  // 현재 시각으로 다시 쓴다. 그러면 같은 채점 결과라도 만들 때마다 바이트가 달라져
  // (a) 임상 문서가 재현 불가능해지고 (b) 위 블록의 바이트 비교 테스트가 두 호출 사이에
  // 초 경계를 넘는 순간 간헐 실패한다(실제로 전체 스위트에서 재발했다).
  // 1초 이상 벌려 초 경계를 강제로 넘겨, 그 조건에서도 출력이 같은지 고정한다.
  it('1초 넘게 벌려 두 번 만들어도 바이트가 같다 (ModDate가 끼어들지 않는다)', async () => {
    const a = await stampSheet({ form, session, ...blank })
    await new Promise(r => setTimeout(r, 1100))
    const b = await stampSheet({ form, session, ...blank })
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0)
  }, 20_000)
})

// 학교명은 이 문서가 어느 아이의 기록인지 특정하는 정보다. 종전에는 칸이 좁으면
// "부산해운대초등…"으로 잘라냈는데, 잘린 검사지는 임상 문서로서 결함이다
// (사용자 보고 2026-08-15 — 실제 인쇄물에서 발견).
describe('머리글 학교명 — 생략하지 않는다', () => {
  const g1 = formForGrade(1)
  const empty = { marks: {}, sentences: {}, writing: {} }
  const stamp = (school: string) => stampSheet({
    form: g1, session: { ...sessionFor(g1), school_name: school } as never, ...empty,
  })
  /** 머리글 학교 칸에 **우리가 찍은** 글자 조각들. 공백만인 조각은 검사지에 원래 인쇄된
   *  것이라 뺀다 — 넣으면 두 줄 판정과 문자열 비교가 둘 다 어긋난다. */
  const schoolPieces = (items: { str: string; x: number; y: number }[]) => {
    const { header } = g1.layout
    return items.filter(i => i.str.trim() !== ''
      && i.x >= header.school.lo - 1 && i.x < header.school.hi
      && i.y > header.baselineY - 12 && i.y < header.baselineY + 12)
  }
  /** 두 줄이면 위→아래, 같은 줄이면 왼→오른쪽으로 이어 붙여 원래 이름을 복원한다. */
  async function headerSchool(bytes: Uint8Array): Promise<string> {
    return schoolPieces(await textItems(bytes))
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map(i => i.str).join('')
  }

  it('[REGRESSION] 칸보다 긴 학교명도 한 글자도 빠지지 않는다', async () => {
    for (const name of ['경기초등학교', '부산해운대초등학교', '서울대학교사범대학부설초등학교']) {
      const got = await headerSchool(await stamp(name))
      expect(got, `${name}이(가) 온전히 찍히지 않았다`).toBe(name)
      expect(got).not.toContain('…')
    }
  })

  // 칸을 넘겨 흘려보내면 옆 칸(학년/반)을 덮어 아동의 학년이 읽히지 않는다.
  it('[REGRESSION] 긴 학교명이 옆 칸(학년/반)을 침범하지 않는다', async () => {
    const { header } = g1.layout
    const pieces = schoolPieces(await textItems(await stamp('서울대학교사범대학부설초등학교')))
    expect(pieces.length).toBeGreaterThan(0)
    // 학년 칸 시작 지점을 넘어선 학교명 조각이 없어야 한다
    for (const p of pieces) expect(p.x).toBeLessThan(header.grade.lo)
  })

  // 학교명이 긴 아동의 검사지만 다른 높이로 찍히면 인쇄물이 들쭉날쭉해진다.
  it('짧은 학교명은 종전대로 한 줄, 기존 베이스라인에 찍힌다', async () => {
    const pieces = schoolPieces(await textItems(await stamp('경기초등학교')))
    expect(pieces).toHaveLength(1)
    expect(pieces[0].y).toBe(g1.layout.header.baselineY)
  })
})
