import { NextResponse } from 'next/server'
import { listSessions } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** 관리자 목록 데이터 — 클라이언트(react-query)에서 캐싱해 재방문 시 재요청을 피한다. 인증은 middleware가 담당. */
export async function GET() {
  try {
    const sessions = await listSessions()
    return NextResponse.json({ sessions })
  } catch (e) {
    console.error('[admin/sessions] 목록 조회 실패', e)
    return NextResponse.json({ error: '목록을 불러오지 못했습니다.' }, { status: 500 })
  }
}
