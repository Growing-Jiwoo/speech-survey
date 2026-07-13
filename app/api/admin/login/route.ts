import { NextResponse } from 'next/server'
import { createToken, sha256Hex, ADMIN_COOKIE } from '@/lib/auth'
import { env } from '@/lib/env'

const fails = new Map<string, { count: number; until: number }>()

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local'
  const f = fails.get(ip)
  if (f && f.count >= 5 && Date.now() < f.until)
    return NextResponse.json({ error: '시도가 너무 많습니다. 10분 후 다시 시도하세요.' }, { status: 429 })

  const { password } = await req.json().catch(() => ({}))
  if (!password || (await sha256Hex(password)) !== env('ADMIN_PASSWORD_HASH')) {
    const cur = fails.get(ip) ?? { count: 0, until: 0 }
    fails.set(ip, { count: cur.count + 1, until: Date.now() + 10 * 60_000 })
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 })
  }
  fails.delete(ip)
  const token = await createToken(env('SESSION_SECRET'))
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600 })
  return res
}
