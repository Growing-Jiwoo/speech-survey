import { NextResponse } from 'next/server'
import { sessionDetail, signedAudioUrl } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** 관리자 결과지 데이터. 녹음은 서명 URL을 미리 만들어 내려준다(service role 키는 클라이언트에 노출 금지). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
