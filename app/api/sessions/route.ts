// POST /api/sessions — 검사 세션 생성(학급 코드 + 아동 정보) + 세션 스코프 토큰 발급.
// 학급 정보(학교·학년·반·담임·연락처)는 클라이언트가 보낸 값을 받지 않는다 —
// 코드를 다시 조회해 서버가 복사한다(스펙 2026-08-13). 이후 녹음 업로드·제출은 토큰 동봉 필수.
//
// 두 가지 아동 식별 모드가 있다(Task 13, 2026-08-18):
// - 직접 입력(`d`에 name/gender/birthYmd) — 검사자가 화면에서 입력한 값을 그대로 쓴다.
//   신원은 여전히 클라이언트가 보낸 그대로다 — 「명단에 없는 학생」 폴백 경로라 없앨 수 없고,
//   여기서는 변조를 막지 않는다.
// - 명단 모드(`fromRoster:true`) — 신청 때 등록한 명단에서 번호로 찾아 서버가 이름·성별·
//   생년월일을 복사한다. 클라이언트는 번호만 보낸다. **이 모드가 막는 것은 전사(transcription)
//   오류(오타)뿐이다** — 명단에 있는 아동을 고른다는 전제에서 이름을 잘못 옮겨 적는 실수를
//   구조적으로 없앤다는 뜻이지, 신원 위조 자체를 막는 보안 장치가 아니다(위조하려는 클라이언트는
//   그냥 fromRoster를 빼고 직접 입력 경로로 보내면 그만이다 — 서버 복사 보장은 클라이언트가
//   이 모드를 선택했을 때만 성립하는 opt-in 보장이다).
import { NextResponse } from 'next/server'
import { createSession, findClassCode, listRoster } from '@/lib/db'
import { createSessionToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { clientIp, createRateLimiter, jsonError, PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS } from '@/lib/request'
import { sessionCreateSchema } from '@/lib/schema'

export const runtime = 'nodejs'

// verify-code보다 빡빡한 상한 — 방어 대상이 스팸 세션 행 생성이라서다. 두 라우트가 왜
// 다른 상한을 쓰는지는 lib/request.ts의 VERIFY_CODE_RATE_LIMIT 주석 참고.
const rateLimited = createRateLimiter(PUBLIC_RATE_LIMIT, PUBLIC_RATE_WINDOW_MS)

export async function POST(req: Request) {
  if (rateLimited(clientIp(req)))
    return jsonError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429)

  const body = await req.json().catch(() => null)
  const parsed = sessionCreateSchema.safeParse(body)
  if (!parsed.success)
    return jsonError('입력값을 다시 확인해 주세요.', 400)

  const d = parsed.data
  try {
    const classCode = await findClassCode(d.code)
    // pending도 미존재와 같은 404 — verify-code(Task 12)와 같은 이유: 승인 전 코드가
    // 실재한다는 사실을 노출하지 않기 위해서다. 이 검사가 없으면 verify-code가 막은
    // pending 코드로도 세션 생성(직접 입력이든 명단이든)이 그대로 통과해 버린다.
    if (!classCode || classCode.status !== 'active') return jsonError('코드를 확인해 주세요.', 404)

    let sessionId: string
    if ('fromRoster' in d) {
      const roster = await listRoster(classCode.id)
      const child = roster.find(r => r.child_no === d.childNo)
      if (!child) return jsonError('명단에서 학생을 찾을 수 없어요. 직접 입력으로 진행해 주세요.', 400)
      sessionId = await createSession({
        classCode, childNo: child.child_no,
        birthYmd: child.birth_ymd, gender: child.gender, childName: child.child_name,
      })
    } else {
      sessionId = await createSession({
        classCode, childNo: d.childNo,
        birthYmd: d.birthYmd, gender: d.gender, childName: d.name,
      })
    }
    const sessionToken = await createSessionToken(sessionId, env('SESSION_SECRET'))
    // grade는 어떤 검사지(양식)로 진행할지 정한다 — 코드가 정한 값을 서버가 내려준다.
    return NextResponse.json({ sessionId, sessionToken, grade: classCode.grade })
  } catch (e) {
    // 이 try 블록은 코드 조회(findClassCode)와 세션 생성(createSession) 둘 다 감싼다 —
    // 라벨을 하나로 좁히면 장애 시 원인을 오인한다(예: DB 연결 장애를 "세션 생성 실패"로 오독).
    console.error('[sessions] 코드 조회 또는 세션 생성 실패', e)
    return jsonError('문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 502)
  }
}
