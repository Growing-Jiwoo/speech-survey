// POST /api/sessions — 검사 세션 생성(학급 코드 + 아동 정보) + 세션 스코프 토큰 발급.
// 학급 정보(학교·학년·반·담임·연락처)는 클라이언트가 보낸 값을 받지 않는다 —
// 코드를 다시 조회해 서버가 복사한다(스펙 2026-08-13). 이후 녹음 업로드·제출은 토큰 동봉 필수.
import { NextResponse } from 'next/server'
import { createSession, findClassCode } from '@/lib/db'
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
    const classCode = await findClassCode(d.code)
    if (!classCode) return jsonError('코드를 확인해 주세요.', 404)
    const sessionId = await createSession({
      classCode, childNo: d.childNo,
      birthYmd: d.birthYmd, gender: d.gender, childName: d.name,
    })
    const sessionToken = await createSessionToken(sessionId, env('SESSION_SECRET'))
    // grade는 어떤 검사지(양식)로 진행할지 정한다 — 코드가 정한 값을 서버가 내려준다.
    return NextResponse.json({ sessionId, sessionToken, grade: classCode.grade })
  } catch (e) {
    console.error('[sessions] createSession 실패', e)
    return jsonError('문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
