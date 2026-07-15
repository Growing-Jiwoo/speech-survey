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

/** 레이트리밋 키: 플랫폼(Vercel)이 주입하는 x-real-ip 우선(클라이언트 위조 불가).
 *  없으면 x-forwarded-for의 마지막(가장 신뢰 가능한) 홉. 둘 다 없으면 'local'.
 *  ※ x-forwarded-for 첫 IP는 클라이언트가 위조 가능하므로 키로 쓰지 않는다. (login 라우트와 동일 규칙) */
function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const hops = req.headers.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean)
  return hops?.[hops.length - 1] ?? 'local'
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
