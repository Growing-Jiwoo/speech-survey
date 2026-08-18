// POST /api/sessions/verify-code — 학급 코드 조회(검사 시작 전 확인 모달 데이터).
// 공개 라우트 — 코드가 곧 접근 수단이므로 코드 열거를 막기 위해 레이트리밋을 둔다.
// 단, sessions 라우트보다 훨씬 높은 전용 상한을 쓴다 — 학교 건물 전체가 IP 하나(NAT)를
// 공유하고, 확인 모달 재시도(오타·[아니에요])마다 이 상한을 소비하며, 여러 PC 동시 검사가
// 전제이기 때문이다. 이유 전문은 lib/request.ts의 VERIFY_CODE_RATE_LIMIT 주석 참고.
// ⚠️ pending 코드는 미존재 코드와 **완전히 같은** 404를 돌려준다 — "코드는 있는데 승인 전"이라고
// 구분하면 그 자체로 코드가 실재한다는 사실이 열거 공격에 샌다. PR A/B가 만든 승인 관문이
// 여기서 뚫리지 않게 하는 것이 이 검사의 존재 이유다.
// 옛 방침 "검사한 번호 목록은 반환하지 않는다"(시작 화면은 아동 앞의 PC이고 학급 안에서
// 번호는 사실상 이름이라는 근거)는 명단 드롭다운 도입으로 뒤집혔다 — childNo 없이 부르면
// 명단 전체(번호별 검사 상태 포함)를 돌려준다. 코드 소지가 이미 학급 접근을 의미하는 이상,
// 명단은 주면서 검사 여부만 감추는 것은 의미가 없다(근거는 lib/db.ts의 rosterWithTested
// docblock). childNo와 함께 부르는 옛 경로("명단에 없는 학생" 폴백)는 그대로 물어본 번호
// 하나의 상태(alreadyTested)만 답한다.
import { NextResponse } from 'next/server'
import { childTestState, findClassCode, rosterWithTested } from '@/lib/db'
import { verifyCodeSchema } from '@/lib/schema'
import { clientIp, createRateLimiter, jsonError, VERIFY_CODE_RATE_LIMIT, VERIFY_CODE_RATE_WINDOW_MS } from '@/lib/request'

export const runtime = 'nodejs'

const rateLimited = createRateLimiter(VERIFY_CODE_RATE_LIMIT, VERIFY_CODE_RATE_WINDOW_MS)

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)
  const body = await req.json().catch(() => null)
  const parsed = verifyCodeSchema.safeParse(body)
  if (!parsed.success) return jsonError('코드를 확인해 주세요.', 400)
  try {
    const row = await findClassCode(parsed.data.code)
    // pending도 "코드를 확인해 주세요." 404로 뭉뚱그린다 — 사유를 밝히면 미승인 코드가
    // 실재한다는 사실이 새어 나가 열거 공격에 쓰인다.
    if (!row || row.status !== 'active') return jsonError('코드를 확인해 주세요.', 404)
    const base = {
      schoolName: row.school_name, grade: row.grade, classNo: row.class_no,
      teacherName: row.teacher_name, teacherPhone: row.teacher_phone, teacherEmail: row.teacher_email,
    }
    if (parsed.data.childNo === undefined)
      return NextResponse.json({ ...base, roster: await rosterWithTested(row.id) })
    const alreadyTested = await childTestState(row.id, parsed.data.childNo)
    return NextResponse.json({ ...base, alreadyTested })
  } catch (e) {
    console.error('[verify-code] 조회 실패', e)
    return jsonError('확인에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502)
  }
}
