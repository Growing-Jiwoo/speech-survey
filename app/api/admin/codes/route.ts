// /api/admin/codes — 학급 코드 발급(POST)·목록(GET). 인증은 middleware가 담당.
import { NextResponse } from 'next/server'
import { insertClassCode, listClassCodes } from '@/lib/db'
import { generateClassCode } from '@/lib/class-code'
import { classCodeCreateSchema } from '@/lib/schema'
import { jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

/** unique 충돌 재시도 상한 — 31^6 공간에서 연속 충돌은 사실상 장애라 그때는 502로 알린다. */
const MAX_RETRY = 5

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = classCodeCreateSchema.safeParse(body)
  if (!parsed.success) return jsonError('입력값을 다시 확인해 주세요.', 400)
  const d = parsed.data
  try {
    for (let i = 0; i < MAX_RETRY; i++) {
      const row = await insertClassCode({
        code: generateClassCode(),
        schoolRegion: d.region, schoolId: d.schoolId, schoolName: d.schoolName,
        grade: d.grade, classNo: d.classNo,
        teacherName: d.teacherName,
        teacherPhone: d.teacherPhone || null, teacherEmail: d.teacherEmail || null,
      })
      if (row !== 'duplicate') return NextResponse.json({ code: row })
    }
    console.error('[admin/codes] 코드 unique 충돌 재시도 상한 도달')
    return jsonError('코드 발급에 실패했습니다. 다시 시도해 주세요.', 502)
  } catch (e) {
    console.error('[admin/codes] 발급 실패', e)
    return jsonError('코드 발급에 실패했습니다.', 502)
  }
}

export async function GET() {
  try {
    const rows = await listClassCodes()
    return NextResponse.json({
      codes: rows.map(({ sessions, ...c }) => ({ ...c, session_count: sessions[0]?.count ?? 0 })),
    })
  } catch (e) {
    console.error('[admin/codes] 목록 조회 실패', e)
    return jsonError('목록을 불러오지 못했습니다.', 500)
  }
}
