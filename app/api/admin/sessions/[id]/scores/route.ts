// PUT /api/admin/sessions/[id]/scores — 관리자 채점 저장(낱말 O/X · 문장 어절 수).
// 인증은 middleware가 /api/admin/* 전체에 걸어 둔다(다른 admin 라우트와 동일).
import { NextResponse } from 'next/server'
import { saveScores, type ReadingMark, type SentenceScore } from '@/lib/db'
import { ITEMS, itemByCode } from '@/lib/items'
import { sentenceMaxWords } from '@/lib/scoring'
import { UUID_RE, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const READ_CODES = new Set(ITEMS.filter(i => i.section === 'word_reading').map(i => i.code))
const SENTENCE_CODES = new Set(ITEMS.filter(i => i.section === 'sentence_reading').map(i => i.code))
const bad = (msg: string) => jsonError(msg, 400)

/** 본문의 객체형 필드(코드 → 값)를 안전하게 꺼낸다. 배열·null은 객체가 아니므로 null. */
function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 세션 id입니다.', 400)

  const b = await req.json().catch(() => ({}))
  const rawMarks = asRecord(b.marks)
  const rawSentences = asRecord(b.sentences)
  if (!rawMarks || !rawSentences) return bad('채점 형식 오류')

  const marks: ReadingMark[] = []
  for (const [itemCode, correct] of Object.entries(rawMarks)) {
    if (!READ_CODES.has(itemCode) || typeof correct !== 'boolean') return bad('낱말 채점 형식 오류')
    marks.push({ itemCode, correct })
  }

  const sentences: SentenceScore[] = []
  for (const [itemCode, words] of Object.entries(rawSentences)) {
    const item = SENTENCE_CODES.has(itemCode) ? itemByCode.get(itemCode) : undefined
    if (!item || typeof words !== 'number' || !Number.isInteger(words)
      || words < 0 || words > sentenceMaxWords(item))
      return bad('문장 채점 형식 오류')
    sentences.push({ itemCode, words })
  }

  try {
    await saveScores(id, marks, sentences)
  } catch (e) {
    console.error('[admin/scores] 저장 실패', e)
    return jsonError('채점 저장에 실패했습니다.', 502)
  }
  return NextResponse.json({ ok: true })
}
