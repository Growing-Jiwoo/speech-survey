import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { createSessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { sessionCreateSchema } from '@/lib/schema'

export const runtime = 'nodejs'

const RATE_LIMIT = 20 // IP당 시간창 내 허용 세션 생성 수
const RATE_WINDOW_MS = 10 * 60_000
// best-effort 인메모리 카운터. 서버리스 환경에서는 인스턴스별로 독립되어 완벽한 전역 방어는 아니며,
// 스팸성 세션 생성을 완화하는 목적(마찰 추가)이다.
const hits = new Map<string, number[]>()

/** x-forwarded-for의 첫 IP(가장 왼쪽 = 실제 클라이언트, 프록시가 덧붙인 뒤쪽 제외). login 라우트와 동일 규칙. */
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
}

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 })

  const body = await req.json().catch(() => null)
  const parsed = sessionCreateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: '입력값을 다시 확인해 주세요.' }, { status: 400 })

  const d = parsed.data
  try {
    const sessionId = await createSession({
      schoolRegion: d.region, schoolId: d.schoolId, schoolName: d.schoolName,
      birthYmd: d.birthYmd, grade: d.grade, classNo: d.classNo, gender: d.gender,
      childName: d.name, teacherName: d.teacherName, teacherContact: d.teacherContact,
    })
    const sessionToken = await createSessionToken(sessionId, env('SESSION_SECRET'))
    return NextResponse.json({ sessionId, sessionToken })
  } catch (e) {
    console.error('[sessions] createSession 실패', e)
    return NextResponse.json({ error: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 })
  }
}
