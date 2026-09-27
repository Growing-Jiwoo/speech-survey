// POST /api/sessions/form — 진행 중인 세션의 검사지(문항·제한 시간)를 내려준다.
//
// 문항을 클라이언트 번들에 넣지 않으려고 둔 라우트다. `/_next/static`의 JS 청크는 인증 없이
// 누구나 받을 수 있어서, 화면 코드가 lib/forms를 import하면 검사지 문항 전체가 공개 파일이 된다.
// 이 라우트를 거치면 문항은 **유효한 세션 토큰을 가진 검사 화면**에만 간다(README 참고).
//
// 토큰을 URL에 싣지 않으려고 GET이 아니라 POST다 — 쿼리 문자열은 접근 로그·브라우저 기록에 남는다.
import { NextResponse } from 'next/server'
import { sessionState } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { formForGrade } from '@/lib/forms'
import { jsonError } from '@/lib/request'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}))
  const invalidToken = () => jsonError('유효하지 않은 세션입니다.', 401)
  if (typeof b.sessionId !== 'string' || !b.sessionId || typeof b.sessionToken !== 'string') return invalidToken()
  if (!(await verifySessionToken(b.sessionId, b.sessionToken, env('SESSION_SECRET'))))
    return invalidToken()

  try {
    const s = await sessionState(b.sessionId)
    if (s.state === 'missing') return jsonError('세션을 찾을 수 없습니다.', 404)
    // 제출된 검사는 다시 진행할 수 없으니(제출·업로드가 모두 409) 문항을 줄 이유도 없다.
    if (s.state === 'submitted') return jsonError('이미 제출된 검사입니다.', 409)
    // 학년은 클라이언트가 아니라 세션 행이 정한다 — 제출 라우트와 같은 규칙.
    return NextResponse.json({ form: formForGrade(s.grade) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[sessions/form] 세션 조회 실패', e)
    return jsonError('검사 문항을 불러오지 못했습니다.', 502)
  }
}
