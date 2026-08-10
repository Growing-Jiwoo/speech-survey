import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { stampSheet } from '@/lib/pdf/stamp-sheet'
import { formForGrade } from '@/lib/forms'
import { MEANING_READ_CODES } from '@/lib/items'

const form = formForGrade(1)
const session = {
  school_name: '경기초등학교', grade: 1, class_no: 3, child_name: '홍길동',
  birth_ymd: '170310', started_at: '2026-08-07T06:25:08.000Z',
  examiner_type: 'expert' as const, checklist: ['cognition'],
}

describe('stampSheet', () => {
  it('원본 검사지 위에 그린 단일 페이지 PDF를 만든다', async () => {
    const bytes = await stampSheet({ form, session, marks: {}, sentences: {}, writing: {} })
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
      marks: {}, sentences: {}, writing: {},
    })
    expect(bytes.byteLength).toBeGreaterThan(1000)
  })

  it('채점 결과가 있으면 원본보다 커진다 (실제로 뭔가 그려진다)', async () => {
    const empty = await stampSheet({ form, session, marks: {}, sentences: {}, writing: {} })
    const marks = Object.fromEntries(MEANING_READ_CODES.map(c => [c, true]))
    const filled = await stampSheet({
      form, session, marks,
      sentences: { rs01: 7, rs02: 5, rs03: 8, rs04: 14 },
      writing: { ww01: true, ww02: true },
    })
    expect(filled.byteLength).toBeGreaterThan(empty.byteLength)
  })

  it('페이지 크기가 레이아웃과 다르면 좌표가 어긋나므로 거부한다', async () => {
    const bad = { ...form, layout: { ...form.layout, pageWidth: 999 } }
    await expect(stampSheet({ form: bad, session, marks: {}, sentences: {}, writing: {} }))
      .rejects.toThrow(/페이지 크기/)
  })
})
