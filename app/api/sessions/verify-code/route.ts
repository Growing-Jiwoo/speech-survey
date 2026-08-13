// POST /api/sessions/verify-code — 학급 코드 조회(검사 시작 전 확인 모달 데이터).
// 공개 라우트 — 코드가 곧 접근 수단이므로 세션 생성과 같은 레이트리밋으로 코드 열거를 막는다.
// ⚠️ 검사한 번호 목록은 반환하지 않는다 — 시작 화면은 아동 앞의 PC이고 학급 안에서 번호는
// 사실상 이름이다. 물어본 그 번호의 상태(alreadyTested)만 답한다(스펙 "중복 검사 경고").
import { NextResponse } from 'next/server'
import { childTestState, findClassCode } from '@/lib/db'
import { verifyCodeSchema } from '@/lib/schema'
import { clientIp, createRateLimiter, jsonError } from '@/lib/request'

export const runtime = 'nodejs'

const rateLimited = createRateLimiter(20, 10 * 60_000)

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)
  const body = await req.json().catch(() => null)
  const parsed = verifyCodeSchema.safeParse(body)
  if (!parsed.success) return jsonError('코드를 확인해 주세요.', 400)
  try {
    const row = await findClassCode(parsed.data.code)
    if (!row) return jsonError('코드를 확인해 주세요.', 404)
    const alreadyTested = await childTestState(row.id, parsed.data.childNo)
    return NextResponse.json({
      schoolName: row.school_name, grade: row.grade, classNo: row.class_no,
      teacherName: row.teacher_name, teacherPhone: row.teacher_phone, teacherEmail: row.teacher_email,
      alreadyTested,
    })
  } catch (e) {
    console.error('[verify-code] 조회 실패', e)
    return jsonError('확인에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502)
  }
}
