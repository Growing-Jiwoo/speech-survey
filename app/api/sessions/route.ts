// POST /api/sessions — 검사 세션 생성(아동 정보 저장) + 세션 스코프 토큰 발급.
// 이후 녹음 업로드·제출은 이 토큰을 동봉해야 한다(임의 세션 쓰기 차단).
import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { createSessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { clientIp, createRateLimiter, jsonError, PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS } from '@/lib/request'
import { sessionCreateSchema } from '@/lib/schema'

export const runtime = 'nodejs'

// 정책값(숫자)은 verify-code 라우트와 공유하지만(lib/request.ts 참고), 버킷은 이 라우트 전용으로 독립이다.
const rateLimited = createRateLimiter(PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS)

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
      childName: d.name, teacherName: d.teacherName,
      teacherPhone: d.teacherPhone || null, teacherEmail: d.teacherEmail || null,
      examinerType: d.examinerType,
    })
    const sessionToken = await createSessionToken(sessionId, env('SESSION_SECRET'))
    return NextResponse.json({ sessionId, sessionToken })
  } catch (e) {
    console.error('[sessions] createSession 실패', e)
    return jsonError('문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
