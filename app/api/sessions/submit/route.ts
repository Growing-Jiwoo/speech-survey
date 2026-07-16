// POST /api/sessions/submit — 최종 제출(낱말쓰기 답 + 체크리스트 저장, submitted_at 확정).
// 제출 이후에는 같은 세션의 재제출·녹음 업로드가 모두 거부된다(검사 증적 보호).
import { NextResponse } from 'next/server'
import { submitSession, type WritingAnswer } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { AREA_CODES, WRITING_ITEMS } from '@/lib/items'
import { jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const WRITING_CODES = new Set(WRITING_ITEMS.map(i => i.code))
const bad = (msg: string) => jsonError(msg, 400)

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

  const invalidToken = () => jsonError('유효하지 않은 세션입니다.', 401)
  if (typeof b.sessionToken !== 'string') return invalidToken()
  if (!(await verifySessionToken(b.sessionId, b.sessionToken, env('SESSION_SECRET'))))
    return invalidToken()

  try {
    const result = await submitSession(b.sessionId, writing, checklist)
    if (result === 'not_found')
      return jsonError('세션을 찾을 수 없습니다.', 404)
    if (result === 'already_submitted')
      return jsonError('이미 제출된 검사입니다.', 409)
  } catch (e) {
    console.error('[submit] 제출 실패', e)
    return jsonError('제출에 실패했습니다.', 502)
  }
  return NextResponse.json({ ok: true })
}
