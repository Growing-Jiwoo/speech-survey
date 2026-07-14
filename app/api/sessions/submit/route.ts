import { NextResponse } from 'next/server'
import { submitSession, type WritingAnswer } from '@/lib/db'
import { AREA_CODES, WRITING_ITEMS } from '@/lib/items'

const WRITING_CODES = new Set(WRITING_ITEMS.map(i => i.code))
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  if (typeof b.sessionId !== 'string' || !b.sessionId) return bad('세션 정보가 없습니다.')
  if (typeof b.writing !== 'object' || b.writing === null || Array.isArray(b.writing))
    return bad('낱말쓰기 답 형식 오류')
  const writing: WritingAnswer[] = []
  for (const [itemCode, canWrite] of Object.entries(b.writing)) {
    if (!WRITING_CODES.has(itemCode) || typeof canWrite !== 'boolean')
      return bad('낱말쓰기 답 형식 오류')
    writing.push({ itemCode, canWrite })
  }
  if (!Array.isArray(b.checklist) || b.checklist.some((c: unknown) => typeof c !== 'string' || !AREA_CODES.includes(c)))
    return bad('체크리스트 형식 오류')
  const checklist = [...new Set(b.checklist as string[])]
  await submitSession(b.sessionId, writing, checklist)
  return NextResponse.json({ ok: true })
}
