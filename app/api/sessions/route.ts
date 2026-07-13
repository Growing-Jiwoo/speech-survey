import { NextResponse } from 'next/server'
import { createSession, listQuestions } from '@/lib/db'

export async function POST(req: Request) {
  const { name, age } = await req.json().catch(() => ({}))
  const ageNum = Number(age)
  if (!name?.trim() || !Number.isInteger(ageNum) || ageNum < 3 || ageNum > 19)
    return NextResponse.json({ error: '이름과 나이(3~19)를 확인해 주세요' }, { status: 400 })
  const [sessionId, questions] = await Promise.all([createSession(name.trim(), ageNum), listQuestions()])
  return NextResponse.json({ sessionId, questions })
}
