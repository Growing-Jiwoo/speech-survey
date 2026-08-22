// POST /api/admin/codes/[id]/approve — 신청 승인 + 교사에게 코드 안내 메일. 인증은 middleware.
//
// 멱등: 이미 active면(already:true) 메일을 다시 시도하지 않는다. `already:true`는 "행이
// active"라는 사실만 보장하고 "메일이 나갔다"는 사실은 보장하지 않는다(관리자 발급 코드는
// 애초에 active로 태어나고, 메일 발송 실패 후 재시도해도 이후 매번 already:true다) — 그래서
// 이 값으로 "메일을 보냈는가"를 되짚어 판단하지 않는다. 대신 `mailed`를 이 호출이 실제로
// 보냈는지로 정직하게 채우고, already:true에는 재발송을 시도하지 않는다: 재발송은 무료
// 한도(Resend)를 다시 태우고 이미 코드를 받은 교사에게 같은 메일을 또 보낼 수 있어 득보다
// 실이 크다. 대신 화면의 [안내 문구 복사] 버튼이 "메일이 안 갔을 수 있다"는 두 경로(관리자
// 코드·메일 실패 후 재시도) 모두의 예비 경로다 — mail_sent_at 컬럼을 두지 않고 이 버튼으로
// 해결하는 쪽을 택했다(DB 마이그레이션 없이 항상 쓸 수 있는 수동 경로가 더 단순하다).
//
// 메일 실패에도 승인은 유지한다(status 갱신을 롤백하지 않는다) — 응답에는 항상 `code`와
// `surveyUrl`을 실어 관리자가 [안내 문구 복사]로 직접 전달할 수 있게 한다(이 응답의 청자는
// 인증된 관리자이지, /api/apply가 코드를 감추는 낯선 신청자가 아니다).
//
// `surveyUrl`을 내려주는 이유: 화면이 `window.location.origin`으로 같은 값을 만들면 그건 서버의
// **fallback**을 흉내낸 것이지 서버가 실제로 쓴 값(APP_URL 우선)이 아니다. 프리뷰·대체 호스트
// 배포에서 둘이 갈라지면 **메일이 실패했을 때** 교사가 받는 주소만 틀리게 되는데, 그건 그 학급이
// 검사를 시작할 수 없다는 뜻이다. 그래서 origin의 단일 소스를 이 응답으로 못박는다.
import { NextResponse } from 'next/server'
import { approveClassCode } from '@/lib/db'
import { approvedMail, sendMail } from '@/lib/mail'
import { jsonError, UUID_RE } from '@/lib/request'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 코드 id입니다.', 400)

  try {
    const result = await approveClassCode(id)
    if (!result) return jsonError('존재하지 않는 코드입니다.', 404)
    const { row, already } = result

    // 메일을 보내지 않는 경로(already·이메일 없음)에서도 응답에 실어야 하므로 밖에서 정한다.
    const origin = process.env.APP_URL?.trim() || new URL(req.url).origin

    let mailed = false
    if (!already && row.teacher_email) {
      const mail = approvedMail({
        teacherName: row.teacher_name, schoolName: row.school_name,
        grade: row.grade, classNo: row.class_no,
        code: row.code, surveyUrl: origin,
      })
      const sent = await sendMail({ ...mail, to: row.teacher_email })
      if (sent.ok) mailed = true
      else console.error('[admin/codes/:id/approve] 승인 메일 발송 실패', sent.error)
    }

    return NextResponse.json({ ok: true, already, mailed, code: row.code, surveyUrl: origin })
  } catch (e) {
    console.error('[admin/codes/:id/approve] 승인 실패', e)
    return jsonError('승인 처리에 실패했습니다.', 502)
  }
}
