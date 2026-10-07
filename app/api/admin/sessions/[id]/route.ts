// /api/admin/sessions/[id] — 관리자 결과지 조회(GET)·세션 영구 삭제(DELETE). 인증은 proxy가 담당.
import { NextResponse } from 'next/server'
import { deleteSession, sessionDetail, signedAudioUrl, signedScanUrl, updateSessionIdentity } from '@/lib/db'
import { formForGrade } from '@/lib/forms'
import { sessionEditSchema } from '@/lib/schema'
import { UUID_RE, jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

const badId = () => jsonError('잘못된 세션 id입니다.', 400)

/** 관리자 결과지 데이터. 녹음은 서명 URL을 미리 만들어 내려준다(service role 키는 클라이언트에 노출 금지).
 *  쓰기 기록지 스캔본도 같다(올라온 경우만 — 서명 URL 1시간, 결과지를 다시 열면 새로 받는다).
 *  응답에는 스토리지 내부 경로(audio_path·스캔본 path)를 담지 않는다.
 *  검사지(`form`)도 여기서 싣는다 — 화면이 lib/forms를 import하면 문항이 공개 JS 청크에 실린다. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return badId()
  try {
    const { session, recordings, writing, marks, sentences, times, scan } = await sessionDetail(id)
    // 삭제된 세션과 장애를 같은 500으로 뭉뚱그리면 운영자가 "재시도"와 "장애 대응"을 구분할 수 없다
    // (sheet.pdf 라우트와 같은 판정 — 그쪽 가드는 sessionDetail이 throw해서 도달하지 못했다).
    if (!session) return jsonError('세션을 찾을 수 없습니다.', 404)
    // 녹음 하나의 서명이 실패해도 결과지 전체를 500으로 막지 않는다 — 그 녹음만 url 없이 내린다(화면이 「불러오지
    // 못했어요」). 막으면 파일 하나가 없는 검사는 결과지가 안 열리고 [검사 기록 삭제]에도 닿을 수 없었다(2026-10-08 야간 점검).
    const withUrls = await Promise.all(recordings.map(async r => ({
      item_code: r.item_code,
      attempt_no: r.attempt_no,
      url: await signedAudioUrl(r.audio_path).catch((e: unknown) => {
        console.error('[admin/sessions/:id] 녹음 서명 실패', r.item_code, r.attempt_no, e)
        return null
      }),
      duration_sec: r.duration_sec,
    })))
    // 서명이 실패해도 결과지 전체를 막지 않는다 — url 없이 내리고, **파일이 없는 것**(행만 남음 — 정리가 중간에
    // 끊긴 경우)인지 **일시 오류**인지를 `missing`으로 가른다. 없으면 화면이 연결 해제를 권하고(막으면 해제 버튼에
    // 다시 닿을 수 없다), 일시 오류면 다시 열어 보라고만 한다 — 해제는 스캔본과 쓰기 채점을 지우는 동작이다.
    const scanView = scan ? await signedScanUrl(scan.path).then(
      url => ({ url, missing: false, uploadedAt: scan.uploaded_at }),
      (e: unknown) => {
        console.error('[admin/sessions/:id] 스캔본 서명 실패', e)
        return { url: null, missing: /not.?found/i.test(e instanceof Error ? e.message : String(e)), uploadedAt: scan.uploaded_at }
      },
    ) : null
    return NextResponse.json({
      session, recordings: withUrls, writing, marks, sentences, times, scan: scanView, form: formForGrade(session.grade),
    })
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

/** 세션 영구 삭제(PII 파기): 스토리지 녹음·스캔본 → 세션 행(FK CASCADE로 녹음 메타·낱말쓰기·스캔본 행 정리). */
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
