import { NextResponse } from 'next/server'
import { submitSession, type WritingAnswer } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { AREA_CODES, WRITING_ITEMS } from '@/lib/items'

export const runtime = 'nodejs'

const WRITING_CODES = new Set(WRITING_ITEMS.map(i => i.code))
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  if (typeof b.sessionId !== 'string' || !b.sessionId) return bad('세션 정보가 없습니다.')
  if (typeof b.writing !== 'object' || b.writing === null || Array.isArray(b.writing))
    return bad('낱말쓰기 답 형식 오류')
  const writing: WritingAnswer[] = []
  for (const [itemCode, canWrite] of Object.entries(b.writing)) {
    if (!WRITING_CODES.has(itemCode) || typeof canWrite !== 'boolean') return bad('낱말쓰기 답 형식 오류')
    writing.push({ itemCode, canWrite })
  }
  if (!Array.isArray(b.checklist) || b.checklist.some((c: unknown) => typeof c !== 'string' || !AREA_CODES.includes(c)))
    return bad('체크리스트 형식 오류')
  const checklist = [...new Set(b.checklist as string[])]

  const invalidToken = () => NextResponse.json({ error: '유효하지 않은 세션입니다.' }, { status: 401 })
  if (typeof b.sessionToken !== 'string') return invalidToken()
  if (!(await verifySessionToken(b.sessionId, b.sessionToken, env('SESSION_SECRET'))))
    return invalidToken()

  try {
    const affected = await submitSession(b.sessionId, writing, checklist)
    if (affected === 0)
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 })
  } catch (e) {
    console.error('[submit] 제출 실패', e)
    return NextResponse.json({ error: '제출에 실패했습니다.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
