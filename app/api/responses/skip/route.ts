import { NextResponse } from 'next/server'
import { markSkipped } from '@/lib/db'

export async function POST(req: Request) {
  const { sessionId, questionId } = await req.json().catch(() => ({}))
  if (!sessionId || !questionId) return NextResponse.json({ error: 'sessionId, questionId 필요' }, { status: 400 })
  await markSkipped(sessionId, Number(questionId))
  return NextResponse.json({ ok: true })
}
