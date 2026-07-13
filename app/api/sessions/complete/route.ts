import { NextResponse } from 'next/server'
import { completeSession } from '@/lib/db'

export async function POST(req: Request) {
  const { sessionId } = await req.json().catch(() => ({}))
  if (!sessionId) return NextResponse.json({ error: 'sessionId 필요' }, { status: 400 })
  await completeSession(sessionId)
  return NextResponse.json({ ok: true })
}
