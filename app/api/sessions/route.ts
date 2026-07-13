import { NextResponse } from 'next/server'
import { createSession, listQuestions } from '@/lib/db'
import { validAge, validName } from '@/lib/validate'

export async function POST(req: Request) {
  const { name, age } = await req.json().catch(() => ({}))
  const cleanName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
  const ageNum = typeof age === 'number' || typeof age === 'string' ? Number(age) : NaN
  if (!validName(cleanName))
    return NextResponse.json({ error: '이름은 한글이나 영어로만 쓸 수 있어요.' }, { status: 400 })
  if (!validAge(ageNum))
    return NextResponse.json({ error: '나이는 숫자로만 쓸 수 있어요.' }, { status: 400 })
  const [sessionId, questions] = await Promise.all([createSession(cleanName, ageNum), listQuestions()])
  return NextResponse.json({ sessionId, questions })
}
