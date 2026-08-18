// GET /api/admin/codes/[id]/roster — 신청 명단 조회(읽기 전용). 인증은 middleware.
//
// ⚠️ PII: 응답에 **아동 실명·성별·생년월일**이 실린다. 이 라우트가 존재하는 이유는 하나뿐이다 —
// 관리자가 승인 전에 "이 신청이 실제 학급 명단인가"를 눈으로 판단해야 하기 때문이다.
// 그래서 목록(`GET /api/admin/codes`)은 실명을 절대 싣지 않고 `roster_count`만 센다:
// 관리자 화면을 열기만 해도 모든 학급의 아동 실명이 흘러나오면 안 되고, 실명은 관리자가
// 그 학급을 열겠다고 명시적으로 누른 순간에만 오간다.
import { NextResponse } from 'next/server'
import { listRoster } from '@/lib/db'
import { UUID_RE, jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 코드 id입니다.', 400)
  try {
    return NextResponse.json({ roster: await listRoster(id) })
  } catch (e) {
    console.error('[admin/codes/:id/roster] 명단 조회 실패', e)
    return jsonError('명단을 불러오지 못했습니다.', 502)
  }
}
