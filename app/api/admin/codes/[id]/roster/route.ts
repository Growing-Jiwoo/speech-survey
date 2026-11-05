// GET   /api/admin/codes/[id]/roster — 학급 명단 조회(뺀 아이 포함, `removed`). 인증은 proxy.
// PATCH /api/admin/codes/[id]/roster — 명단 빼기·되살리기 `{ childNo, removed }`(migration 009).
//
// ⚠️ PII: 응답에 **아동 실명·성별·생년월일**이 실린다. 이 라우트가 존재하는 이유는 둘이다 — 관리자가 승인 전에
// "이 신청이 실제 학급 명단인가"를 눈으로 판단해야 하고, 승인 뒤에는 전학 간 아이를 명단에서 빼야 한다(사용자 확정
// 2026-11-05 — 담당자 회신 아님. 담임도 결과지 화면에서 뺄 수 있다: app/api/results/[token]/roster).
// 그래서 목록(`GET /api/admin/codes`)은 실명을 절대 싣지 않고 `roster_count`만 센다:
// 관리자 화면을 열기만 해도 모든 학급의 아동 실명이 흘러나오면 안 되고, 실명은 관리자가
// 그 학급을 열겠다고 명시적으로 누른 순간에만 오간다.
import { NextResponse } from 'next/server'
import { listRosterAll, setRosterRemoved } from '@/lib/db'
import { UUID_RE, jsonError } from '@/lib/request'
import { rosterRemovedSchema } from '@/lib/schema'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('코드 정보가 올바르지 않아요.', 400)
  try {
    return NextResponse.json({ roster: await listRosterAll(id) })
  } catch (e) {
    console.error('[admin/codes/:id/roster] 명단 조회 실패', e)
    return jsonError('명단을 불러오지 못했어요.', 502)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('코드 정보가 올바르지 않아요.', 400)
  const parsed = rosterRemovedSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return jsonError('입력값을 다시 확인해 주세요.', 400)
  try {
    const r = await setRosterRemoved(id, parsed.data.childNo, parsed.data.removed)
    if (r === 'missing') return jsonError('명단에 없는 번호예요.', 404)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/codes/:id/roster] 명단 변경 실패', e)
    return jsonError('바꾸지 못했어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
