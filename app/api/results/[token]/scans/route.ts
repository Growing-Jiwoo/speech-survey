// POST /api/results/[token]/scans — 쓰기 기록지 스캔본 한 장(한 아이) 올리기. 인증은 경로의 학급 스코프 토큰.
// 화면(components/results/ScanUpload)이 PDF·사진을 쪽마다 JPEG로 바꿔 **한 장씩** 보낸다 — 한 요청이
// 서버리스 본문 상한(4.5MB)을 넘지 않게, 그리고 한 장이 실패해도 나머지는 올라가게.
//
// 올릴 수 있는 검사(사용자 확정 2026-09-30):
//   이 토큰의 학급 · 제출됨 · 쓰기 방식 scan · 담당자가 쓰기를 아직 하나도 넣지 않음 ·
//   그 아이의 **가장 최근에 제출된 검사**(2026-10-01 — 오래 열어 둔 탭이 새 기록지를 앞 차수에 붙이지 않게).
//   이미 올린 것은 담당자 채점 전까지 바꿀 수 있다(새 파일을 올린 뒤 옛 파일을 지운다). 채점이 시작된
//   뒤에 바꾸면 넣은 점수와 근거 그림이 어긋난다 — 잘못 붙었으면 담당자가 「연결 해제」한다.
// 응답에 스토리지 경로를 싣지 않는다(결과 목록 라우트와 같은 방침).
import { NextResponse } from 'next/server'
import { verifyResultsToken } from '@/lib/auth'
import {
  latestSubmittedSessionId, removeScanObjects, restoreWritingScan, scanUploadTarget, uploadScanObject, upsertWritingScan,
} from '@/lib/db'
import { env } from '@/lib/env'
import { formForGrade } from '@/lib/forms'
import { itemsFor } from '@/lib/items'
import { imageExt, sniffImage } from '@/lib/image-validate'
import { UUID_RE, createRateLimiter, jsonError } from '@/lib/request'

export const runtime = 'nodejs'
export const maxDuration = 60

/** 한 장 상한 — 화면이 JPEG로 줄여 보낸다(보통 1MB 안팎). 서버리스 본문 상한(4.5MB)보다 아래. */
const MAX_BYTES = 4 * 1024 * 1024
/** 학급(토큰)당 시간당 상한 — 한 반 40명을 몇 번 다시 올려도 넉넉하다. 유효한 링크 하나로 스토리지를
 *  채우는 것을 막는다. IP가 아닌 이유는 결과지 요청 라우트와 같다(학교 건물은 IP 하나). */
const rateLimited = createRateLimiter(300, 60 * 60 * 1000)

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않아요.', 401)
  if (rateLimited(classCodeId)) return jsonError('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429)

  const fd = await req.formData().catch(() => null)
  const file = fd?.get('file')
  const sessionId = String(fd?.get('sessionId') ?? '')
  if (!(file instanceof File) || !UUID_RE.test(sessionId)) return jsonError('빠진 항목이 있어요.', 400)
  if (file.size > MAX_BYTES) return jsonError('스캔본이 너무 커요.', 413)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffImage(bytes)
  if (!mime) return jsonError('이미지 파일만 올릴 수 있어요.', 400)

  try {
    const t = await scanUploadTarget(sessionId)
    // 다른 학급의 검사는 없는 검사와 같은 404 — 있다는 사실도 알려 주지 않는다.
    if (!t || t.class_code_id !== classCodeId) return jsonError('검사 기록이 없어요.', 404)
    if (!t.submitted_at) return jsonError('아직 제출되지 않은 검사예요.', 409)
    if (t.writing_mode !== 'scan') return jsonError('화면에서 쓰기를 표시한 검사예요.', 409)
    const writingCodes = new Set(itemsFor(formForGrade(t.grade)).writingItems.map(i => i.code))
    const scored = (x: { writing_answers: { item_code: string }[]; sentence_scores: { item_code: string }[] }) =>
      x.writing_answers.some(w => writingCodes.has(w.item_code)) || x.sentence_scores.some(s => writingCodes.has(s.item_code))
    if (scored(t)) return jsonError('담당자가 쓰기 채점을 시작해 바꿀 수 없어요.', 409)
    // 스캔본은 그 아이의 가장 최근 제출 검사에만 붙는다(화면의 짝짓기와 같은 규칙) — 다르면 화면이 옛 목록으로 짝지은 것이다
    if ((await latestSubmittedSessionId(t.class_code_id, t.child_no)) !== sessionId)
      return jsonError('이 학생은 더 최근에 제출한 검사가 있어요. 결과지를 새로고침한 뒤 다시 올려 주세요.', 409)

    // 올릴 때마다 새 경로 — 같은 경로에 덮어쓰면 업로드 도중 실패했을 때 옛 파일까지 잃는다. 무작위 꼬리를 붙인다 —
    // 「이미 있음」을 성공으로 보는 재시도(uploadScanObject)는 경로가 유일해야 안전하다(같은 ms의 두 요청).
    const path = `${sessionId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${imageExt(mime)}`
    await uploadScanObject(path, Buffer.from(bytes), mime)
    try {
      await upsertWritingScan({ sessionId, path, contentType: mime, bytes: bytes.length })
    } catch (e) {
      // 고아 파일 방지(녹음 업로드와 같은 보상 정리). 정리 실패는 로그만.
      await removeScanObjects([path]).catch(err => console.error('[results/scans] 보상 정리 실패', err))
      throw e
    }
    // 확인과 교체 사이에 담당자가 쓰기를 넣었으면 되돌린다 — 넣은 점수는 옛 그림(또는 그림 없음)을 보고 한 것이다.
    // 드문 경쟁이지만 그대로 두면 점수와 근거 그림이 어긋난 채 흔적 없이 남는다.
    const after = await scanUploadTarget(sessionId)
    if (after && scored(after)) {
      try {
        await restoreWritingScan(sessionId, t.scan)
      } catch (err) {
        // 되돌리지 못했다 — 행이 새 그림을 가리킨 채 남으므로 새 파일은 지우지 않는다. 점수와 그림이 어긋났을 수 있어
        // 찾을 수 있게 남긴다(담당자가 결과지에서 보고 「연결 해제」할 수 있다). 채점이 시작됐으니 다시 보내도 409다.
        console.error(`[results/scans] 되돌리기 실패 — 점수와 근거 그림이 어긋났을 수 있음 session=${sessionId}`, err)
        return jsonError('담당자가 쓰기 채점을 시작해 바꿀 수 없어요.', 409)
      }
      await removeScanObjects([path]).catch(err => console.error('[results/scans] 되돌린 스캔본 정리 실패', err))
      return jsonError('담당자가 쓰기 채점을 시작해 바꿀 수 없어요.', 409)
    }
    // 바꾼 경우 옛 파일 — 행은 이미 새 파일을 가리키므로 정리 실패는 로그만(검사를 지울 때 폴더째 지워진다).
    if (t.scan) await removeScanObjects([t.scan.path]).catch(err => console.error('[results/scans] 옛 스캔본 정리 실패', err))
    // 아동 기록에 그림이 붙은 사건이라 최소 기록을 남긴다(누가 올렸는지는 링크 소지자 — 특정 불가)
    console.info(`[results/scans] 스캔본 ${t.scan ? '교체' : '올림'} session=${sessionId}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[results/scans] 저장 실패', e)
    return jsonError('스캔본을 올리지 못했어요.', 502)
  }
}
