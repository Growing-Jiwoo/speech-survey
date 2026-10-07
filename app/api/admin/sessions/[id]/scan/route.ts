// DELETE /api/admin/sessions/[id]/scan — 담당자의 「이 아이 기록지가 아니에요 — 연결 해제」.
// 스캔본(파일·행)과 **그 스캔본을 보고 넣은 쓰기 채점**을 함께 지워 「스캔 대기」로 되돌린다
// (lib/db unlinkWritingScan). 선생님이 결과지 화면에서 맞는 기록지를 다시 올리면 된다.
// 판독이 어려운 경우의 「다시 올려 달라」 요청은 앱에 두지 않는다 — 담당자가 담임에게 직접 연락한다
// (사용자 확정 2026-09-30: 선생님이 결과지 화면을 다시 열지 않으면 요청을 못 본다).
import { NextResponse } from 'next/server'
import { sessionState, unlinkWritingScan } from '@/lib/db'
import { formForGrade } from '@/lib/forms'
import { itemsFor } from '@/lib/items'
import { UUID_RE, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 세션 id예요.', 400)
  try {
    const s = await sessionState(id)
    if (s.state === 'missing') return jsonError('세션을 찾을 수 없어요.', 404)
    // 화면에서 표시한 검사의 쓰기는 검사 중 입력이 유일한 채점 경로다 — 여기서 지우면 되돌릴 길이 없다.
    if (s.writingMode !== 'scan') return jsonError('스캔본으로 채점하는 검사가 아니에요.', 409)
    const f = itemsFor(formForGrade(s.grade))
    await unlinkWritingScan(id, f.writingSection === 'word_writing' ? 'word' : 'sentence', f.writingItems.map(i => i.code))
    // 채점 근거가 사라지는 사건이라 최소 기록을 남긴다(아동 정보 수정·세션 삭제와 같은 방침).
    console.info(`[admin/sessions/:id/scan] 스캔본 연결 해제 id=${id}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/sessions/:id/scan] 연결 해제 실패', e)
    return jsonError('연결 해제에 실패했어요.', 500)
  }
}
