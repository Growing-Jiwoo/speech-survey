// /api/admin/sessions/[id]/sheet.pdf — 공식 검사지 PDF 다운로드.
// 담당자 배포 원본 검사지에 채점 결과만 얹어 내려준다(생성은 lib/pdf/stamp-sheet).
// 파일명에 아동 이름이 들어가므로 middleware의 관리자 인증 뒤에서만 접근된다.
import { NextResponse } from 'next/server'
import { sessionDetail } from '@/lib/db'
import { formForGrade } from '@/lib/forms'
import { stampSheet } from '@/lib/pdf/stamp-sheet'
import { kstDateKey } from '@/lib/adminStats'
import { UUID_RE, jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('잘못된 세션 id입니다.', 400)
  try {
    const { session, writing, marks, sentences } = await sessionDetail(id)
    // 삭제된 세션과 장애를 같은 500으로 뭉뚱그리면 운영자가 "재시도"와 "장애 대응"을 구분할 수 없다.
    if (!session) return jsonError('세션을 찾을 수 없습니다.', 404)
    const bytes = await stampSheet({
      form: formForGrade(session.grade),
      session,
      marks: Object.fromEntries(marks.map(m => [m.item_code, m.correct])),
      sentences: Object.fromEntries(sentences.map(s => [s.item_code, s.words])),
      writing: Object.fromEntries(writing.map(w => [w.item_code, w.can_write])),
    })

    // 검사지에 찍히는 검사일과 같은 KST 기준 — UTC로 자르면 아침 검사가 하루 전으로 어긋난다.
    const date = kstDateKey(new Date(session.started_at))
    const name = `${session.child_name}_${date}.pdf`
    return new NextResponse(bytes as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        // 한글 파일명은 RFC 5987로 넘긴다. filename*이 없으면 브라우저가 이름을 깨뜨린다.
        'content-disposition': `attachment; filename="sheet_${date}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // 아동 개인정보가 담긴 문서 — 중간 캐시에 남기지 않는다.
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[admin/sessions/:id/sheet.pdf] 생성 실패', e)
    return jsonError('결과지를 만들지 못했습니다.', 500)
  }
}
