import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { stampSheet } from '@/lib/pdf/stamp-sheet'
import { FORMS, formForGrade, type SurveyForm } from '@/lib/forms'
import { itemsFor } from '@/lib/items'

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
