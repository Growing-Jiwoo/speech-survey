// POST /api/results/[token]/roster — 교사 결과지에서 명단 빼기·되살리기. 인증은 학급 스코프 토큰(담임 메일 링크).
// 전학 간 아이를 명단에서 빼고 검사 기록은 남기는 것은 담당자 확정(2026-11-06, 답장에 대한 회신 원문 「오케이 고마워!!」)이고,
// 담임·관리자 **둘 다** 할 수 있게 한 것은 사용자가 정했다(관리자만이면 담임이 매번 연락해야 하고, 담임만이면 담임이
// 자리에 없을 때 대신할 사람이 없다). 시작 화면에는 두지 않는다 — 학급 코드만 알면 아이도 들어오는 공용 기기다.
// 검사 기록(sessions)은 건드리지 않는다 — 세션은 명단이 아니라 학급 코드에 붙어 있다(lib/db setRosterRemoved).
import { NextResponse } from 'next/server'
import { verifyResultsToken } from '@/lib/auth'
import { setRosterRemoved } from '@/lib/db'
import { env } from '@/lib/env'
import { createRateLimiter, jsonError } from '@/lib/request'
import { rosterRemovedSchema } from '@/lib/schema'

export const dynamic = 'force-dynamic'

/** 학급(토큰)당 — 한 반을 몇 번 오가도 넉넉하다. IP가 아닌 이유는 스캔본 올리기 라우트와 같다(학교 건물은 IP 하나). */
const rateLimited = createRateLimiter(200, 60 * 60 * 1000)

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않아요.', 401)
  if (rateLimited(classCodeId)) return jsonError('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429)
  const parsed = rosterRemovedSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('입력값을 다시 확인해 주세요.', 400)
  try {
    const r = await setRosterRemoved(classCodeId, parsed.data.childNo, parsed.data.removed)
    if (r === 'missing') return jsonError('명단에 없는 번호예요.', 404)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[results/:token/roster] 명단 변경 실패', e)
    return jsonError('바꾸지 못했어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
