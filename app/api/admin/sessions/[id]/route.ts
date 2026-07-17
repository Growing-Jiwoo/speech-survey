// /api/admin/sessions/[id] — 관리자 결과지 조회(GET)·세션 영구 삭제(DELETE). 인증은 middleware가 담당.
import { NextResponse } from 'next/server'
import { deleteSession, sessionDetail, signedAudioUrl } from '@/lib/db'
import { UUID_RE, jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

const badId = () => jsonError('잘못된 세션 id입니다.', 400)

/** 관리자 결과지 데이터. 녹음은 서명 URL을 미리 만들어 내려준다(service role 키는 클라이언트에 노출 금지).
 *  응답에는 스토리지 내부 경로(audio_path)를 담지 않는다. */
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
    return jsonError('결과지를 불러오지 못했습니다.', 500)
  }
}

/** 세션 영구 삭제(PII 파기): 스토리지 녹음 → 세션 행(FK CASCADE로 녹음 메타·낱말쓰기 정리). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badId()
  try {
    await deleteSession(id)
    // PII 파기 추적용 최소 기록(무엇이/언제). 관리자 계정이 단일 비밀번호라 행위자 특정은 불가.
    console.info(`[admin/sessions/:id] 세션 삭제 완료 id=${id}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/sessions/:id] 삭제 실패', e)
    return jsonError('세션 삭제에 실패했습니다.', 500)
  }
}
