// POST /api/results/request — 교사 결과지 링크 요청(공개). 학급 코드만 받아 **등록된 담임 이메일로**
// 학급 스코프 토큰 링크를 보낸다. 이메일은 바디에서 받지 않는다 — 요청자가 주소를 정할 수 있으면
// 코드가 곧 결과지 열쇠가 된다(사용자 확정 2026-09-22).
//
// 이 버튼은 아이 앞 교실 PC의 시작 화면에 있다. 아이가 눌러도 담임 메일함에 링크가 갈 뿐이지만,
// 연타하면 메일함을 채울 수는 있다 → **코드당 60초 1회**. 키가 IP가 아닌 이유: 학교 건물은 IP
// 하나라 IP 제한은 정상 사용을 막고 연타는 못 막는다. 인메모리라 서버리스 인스턴스별(best-effort)
// — 기존 레이트리미터와 같은 한계를 받아들인다.
import { NextResponse } from 'next/server'
import { createResultsToken } from '@/lib/auth'
import { classResults, findClassCode } from '@/lib/db'
import { env } from '@/lib/env'
import { resultsLinkMail, sendMail } from '@/lib/mail'
import { buildChildren, maskEmail, summarize } from '@/lib/results'
import { clientIp, createRateLimiter, jsonError, VERIFY_CODE_RATE_LIMIT, VERIFY_CODE_RATE_WINDOW_MS } from '@/lib/request'
import { resultsRequestSchema } from '@/lib/schema'

export const runtime = 'nodejs'

// 코드 열거 방어 — verify-code와 같은 위협이라 같은 상한을 쓴다.
const ipLimited = createRateLimiter(VERIFY_CODE_RATE_LIMIT, VERIFY_CODE_RATE_WINDOW_MS)

/** 코드당 쿨다운(사용자 확정 2026-09-22: 1분 1회). 발송에 **성공한** 시각만 기록한다 —
 *  실패 뒤 곧바로 다시 누를 수 있어야 한다. */
const COOLDOWN_MS = 60_000
const lastSentAt = new Map<string, number>()

export async function POST(req: Request) {
  if (ipLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)
  const body = await req.json().catch(() => null)
  const parsed = resultsRequestSchema.safeParse(body)
  if (!parsed.success) return jsonError('코드를 확인해 주세요.', 400)
  const code = parsed.data.code

  const waited = Date.now() - (lastSentAt.get(code) ?? 0)
  if (waited < COOLDOWN_MS) {
    const retryAfterSec = Math.ceil((COOLDOWN_MS - waited) / 1000)
    return NextResponse.json(
      { error: '방금 링크를 보냈어요. 메일함을 확인해 주세요.', retryAfterSec },
      { status: 429, headers: { 'retry-after': String(retryAfterSec) } },
    )
  }

  try {
    const row = await findClassCode(code)
    // pending도 미존재와 같은 404 — 승인 여부가 새면 코드 열거에 쓰인다(verify-code 방침).
    if (!row || row.status !== 'active') return jsonError('코드를 확인해 주세요.', 404)
    // 발급 이메일 필수화(2026-09-22) 뒤로는 도달하지 않는 방어선. 안내 UI는 두지 않는다(사용자 확정).
    if (!row.teacher_email) return jsonError('이 학급은 이메일이 등록돼 있지 않습니다. 담당자에게 문의해 주세요.', 400)

    const [token, rows] = await Promise.all([
      createResultsToken(row.id, env('SESSION_SECRET')),
      classResults(row.id),
    ])
    // Host 헤더는 위조 가능 — APP_URL이 있으면 그것을 쓴다(apply·approve 라우트와 같은 규칙).
    const origin = process.env.APP_URL?.trim() || new URL(req.url).origin
    const m = resultsLinkMail({
      teacherName: row.teacher_name, schoolName: row.school_name, grade: row.grade, classNo: row.class_no,
      resultsUrl: `${origin}/results/${token}`,
    })
    const sent = await sendMail({ ...m, to: row.teacher_email })
    if (!sent.ok) {
      console.error('[results/request] 메일 발송 실패', sent.error)
      return jsonError('메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.', 502)
    }
    lastSentAt.set(code, Date.now())

    // 채점 완료 수 — 화면이 「아직 채점된 학생이 없어요」를 낼 근거. 명단은 여기서 필요 없다
    // (세션만으로 센다 — 미실시는 채점 수와 무관).
    const scoredCount = summarize(buildChildren([], rows)).scored
    return NextResponse.json({ sent: true, maskedEmail: maskEmail(row.teacher_email), scoredCount })
  } catch (e) {
    console.error('[results/request] 실패', e)
    return jsonError('문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
