// /api/admin/sessions/[id] — 관리자 결과지 조회(GET)·세션 영구 삭제(DELETE). 인증은 middleware가 담당.
import { NextResponse } from 'next/server'
import { deleteSession, sessionDetail, signedAudioUrl, updateSessionIdentity } from '@/lib/db'
import { sessionEditSchema } from '@/lib/schema'
import { UUID_RE, jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

const badId = () => jsonError('잘못된 세션 id입니다.', 400)

/** 관리자 결과지 데이터. 녹음은 서명 URL을 미리 만들어 내려준다(service role 키는 클라이언트에 노출 금지).
 *  응답에는 스토리지 내부 경로(audio_path)를 담지 않는다. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badId()
  try {
    const { session, recordings, writing, marks, sentences } = await sessionDetail(id)
    // 삭제된 세션과 장애를 같은 500으로 뭉뚱그리면 운영자가 "재시도"와 "장애 대응"을 구분할 수 없다
    // (sheet.pdf 라우트와 같은 판정 — 그쪽 가드는 sessionDetail이 throw해서 도달하지 못했다).
    if (!session) return jsonError('세션을 찾을 수 없습니다.', 404)
    const withUrls = await Promise.all(recordings.map(async r => ({
      item_code: r.item_code,
      attempt_no: r.attempt_no,
      url: await signedAudioUrl(r.audio_path),
      duration_sec: r.duration_sec,
    })))
    return NextResponse.json({ session, recordings: withUrls, writing, marks, sentences })
  } catch (e) {
    console.error('[admin/sessions/:id] 조회 실패', e)
    return jsonError('결과지를 불러오지 못했습니다.', 500)
  }
}

/** 아동 식별값 수정(번호·이름·성별·생년월일). 검사자가 잘못 입력한 세션을 바로잡는다.
 *
 *  받는 필드는 `sessionEditSchema`가 정한 4개뿐이다 — 바디에 `grade`나 학급 정보가 실려
 *  와도 zod가 걷어낸다. 학년이 바뀌면 저장된 점수가 다른 양식의 문항을 가리키게 되므로,
 *  이 화이트리스트가 곧 임상 기록의 안전장치다(스키마 주석 참고). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badId()
  let body: unknown
  try { body = await req.json() } catch { return jsonError('요청 형식이 올바르지 않습니다.', 400) }
  const parsed = sessionEditSchema.safeParse(body)
  if (!parsed.success) return jsonError('입력값을 확인해 주세요.', 400)
  try {
    const session = await updateSessionIdentity(id, parsed.data)
    // 삭제된 세션과 장애를 같은 500으로 뭉뚱그리지 않는다(GET과 같은 판정).
    if (!session) return jsonError('세션을 찾을 수 없습니다.', 404)
    // 임상 기록의 식별값이 바뀐 사건이라 최소 기록을 남긴다. 관리자 계정이 단일
    // 비밀번호라 행위자는 특정할 수 없다 — "무엇이 언제"까지만이다.
    console.info(`[admin/sessions/:id] 아동 정보 수정 id=${id} → ${parsed.data.childNo}번`)
    return NextResponse.json({ session })
  } catch (e) {
    console.error('[admin/sessions/:id] 수정 실패', e)
    return jsonError('수정에 실패했습니다.', 500)
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
