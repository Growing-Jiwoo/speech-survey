import { NextResponse } from 'next/server'
import { deleteSession, sessionDetail, signedAudioUrl } from '@/lib/db'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const badId = () => NextResponse.json({ error: '잘못된 세션 id입니다.' }, { status: 400 })

/** 관리자 결과지 데이터. 녹음은 서명 URL을 미리 만들어 내려준다(service role 키는 클라이언트에 노출 금지). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badId()
  try {
    const { session, recordings, writing } = await sessionDetail(id)
    const withUrls = await Promise.all(recordings.map(async r => ({
      item_code: r.item_code,
      attempt_no: r.attempt_no,
      url: await signedAudioUrl(r.audio_path),
      duration_sec: r.duration_sec,
    })))
    return NextResponse.json({ session, recordings: withUrls, writing })
  } catch (e) {
    console.error('[admin/sessions/:id] 조회 실패', e)
    return NextResponse.json({ error: '결과지를 불러오지 못했습니다.' }, { status: 500 })
  }
}

/** 세션 영구 삭제(PII 파기): 스토리지 녹음 → 세션 행(FK CASCADE로 녹음 메타·낱말쓰기 정리). 인증은 middleware가 담당. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badId()
  try {
    await deleteSession(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/sessions/:id] 삭제 실패', e)
    return NextResponse.json({ error: '세션 삭제에 실패했습니다.' }, { status: 500 })
  }
}
