// POST /api/sessions — 검사 세션 생성(아동 정보 저장) + 세션 스코프 토큰 발급.
// 이후 녹음 업로드·제출은 이 토큰을 동봉해야 한다(임의 세션 쓰기 차단).
import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { createSessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { clientIp, jsonError } from '@/lib/request'
import { sessionCreateSchema } from '@/lib/schema'

export const runtime = 'nodejs'

const RATE_LIMIT = 20 // IP당 시간창 내 허용 세션 생성 수
const RATE_WINDOW_MS = 10 * 60_000
const SWEEP_EVERY = 100 // N번째 요청마다 전체 만료 키 청소(사라진 IP 엔트리의 무한 누적 방지)
// best-effort 인메모리 카운터. 서버리스 환경에서는 인스턴스별로 독립되어 완벽한 전역 방어는 아니며,
// 스팸성 세션 생성을 완화하는 목적(마찰 추가)이다.
const hits = new Map<string, number[]>()
let sweepCounter = 0

function rateLimited(ip: string): boolean {
  const now = Date.now()
  // 장수 인스턴스(로컬/컨테이너)에서 한 번 오고 사라진 IP의 엔트리가 영구 잔존해
  // 메모리가 단조 증가하는 것을 막는다 — 주기적으로 전체 맵에서 만료 키를 걷어낸다.
  if (++sweepCounter % SWEEP_EVERY === 0) {
    for (const [key, times] of hits) {
      const alive = times.filter(t => now - t < RATE_WINDOW_MS)
      if (alive.length === 0) hits.delete(key)
      else hits.set(key, alive)
    }
  }
  const recent = (hits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  return recent.length > RATE_LIMIT
}

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)

  const body = await req.json().catch(() => null)
  const parsed = sessionCreateSchema.safeParse(body)
  if (!parsed.success)
    return jsonError('입력값을 다시 확인해 주세요.', 400)

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
    return jsonError('문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
