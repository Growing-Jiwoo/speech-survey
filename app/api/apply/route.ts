// POST /api/apply — 교사 신청 접수(공개). pending 코드 + 명단을 만들고 관리자에게 알린다.
// 응답에 코드를 넣지 않는다 — 승인 메일이 유일한 전달 경로여야 승인이 실제 관문이 된다(스펙).
import { NextResponse } from 'next/server'
import { insertApplication } from '@/lib/db'
import { generateClassCode } from '@/lib/class-code'
import { applyNoticeMail, sendMail } from '@/lib/mail'
import { applySchema } from '@/lib/schema'
import { APPLY_RATE_LIMIT, APPLY_RATE_WINDOW_MS, clientIp, createRateLimiter, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const rateLimited = createRateLimiter(APPLY_RATE_LIMIT, APPLY_RATE_WINDOW_MS)
const MAX_RETRY = 5   // admin/codes와 같은 관례 — 31^6 공간에서 연속 충돌은 사실상 장애

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)

  const body = await req.json().catch(() => null)
  const parsed = applySchema.safeParse(body)
  if (!parsed.success) return jsonError('입력값을 다시 확인해 주세요.', 400)
  const d = parsed.data

  try {
    for (let i = 0; i < MAX_RETRY; i++) {
      const row = await insertApplication({
        code: generateClassCode(),
        schoolRegion: d.region, schoolId: d.schoolId, schoolName: d.schoolName,
        grade: d.grade, classNo: d.classNo,
        teacherName: d.teacherName,
        teacherPhone: d.teacherPhone || null, teacherEmail: d.teacherEmail,
      }, d.roster)
      if (row === 'duplicate') continue

      // 관리자 알림 — 실패해도 신청은 성공(관리자 화면의 대기 배지가 예비 채널)
      const adminTo = process.env.ADMIN_NOTIFY_EMAIL?.trim()
      if (adminTo) {
        const origin = new URL(req.url).origin
        const mail = applyNoticeMail({
          schoolName: d.schoolName, grade: d.grade, classNo: d.classNo,
          teacherName: d.teacherName, childCount: d.roster.length,
          adminUrl: `${origin}/admin/codes`,
        })
        const sent = await sendMail({ ...mail, to: adminTo })
        if (!sent.ok) console.error('[apply] 관리자 알림 메일 실패', sent.error)
      }
      return NextResponse.json({ ok: true }, { status: 201 })
    }
    console.error('[apply] 코드 unique 충돌 재시도 상한 도달')
    return jsonError('접수에 실패했습니다. 다시 시도해 주세요.', 502)
  } catch (e) {
    console.error('[apply] 접수 실패', e)
    return jsonError('접수에 실패했습니다. 다시 시도해 주세요.', 502)
  }
}
