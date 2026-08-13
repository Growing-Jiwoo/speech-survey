// /api/admin/codes/[id] — 학급 코드 삭제. 세션이 참조 중이면 거부(FK restrict가 최종 방어).
import { NextResponse } from 'next/server'
import { deleteClassCode } from '@/lib/db'
import { UUID_RE, jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

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
