// /api/admin/codes/[id] — 학급 코드 삭제(DELETE)·담임 이메일 수정(PATCH). 인증은 proxy가 담당.
import { NextResponse } from 'next/server'
import { deleteClassCode, updateClassCodeEmail } from '@/lib/db'
import { UUID_RE, jsonError } from '@/lib/request'
import { classCodeEmailSchema } from '@/lib/schema'

export const dynamic = 'force-dynamic'

/** 세션이 참조 중이면 거부(FK restrict가 최종 방어). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 코드 id입니다.', 400)
  try {
    const result = await deleteClassCode(id)
    if (result === 'in_use') return jsonError('이미 검사에 사용된 코드는 삭제할 수 없습니다.', 409)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/codes/:id] 삭제 실패', e)
    return jsonError('코드 삭제에 실패했습니다.', 500)
  }
}

/** 담임 이메일 수정 — 결과지 링크(`/api/results/request`)가 이 주소로만 가므로, 잘못 등록된
 *  주소를 바로잡는 유일한 경로다(사용자 확정 2026-09-22 — 담당자 회신 아님).
 *  `classCodeEmailSchema`가 이메일 한 필드만 받는다 — 학급 정보는 세션에 복사된 임상 기록과
 *  어긋나므로 여기서 바꿀 수 없다. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 코드 id입니다.', 400)
  let body: unknown
  try { body = await req.json() } catch { return jsonError('요청 형식이 올바르지 않습니다.', 400) }
  const parsed = classCodeEmailSchema.safeParse(body)
  if (!parsed.success) return jsonError('이메일 형식을 확인해 주세요.', 400)
  try {
    const code = await updateClassCodeEmail(id, parsed.data.teacherEmail)
    if (!code) return jsonError('존재하지 않는 코드입니다.', 404)
    console.info(`[admin/codes/:id] 담임 이메일 수정 id=${id}`)
    return NextResponse.json({ code })
  } catch (e) {
    console.error('[admin/codes/:id] 이메일 수정 실패', e)
    return jsonError('수정에 실패했습니다.', 500)
  }
}
