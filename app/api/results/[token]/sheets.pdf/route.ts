// GET /api/results/[token]/sheets.pdf?ids=a,b,c — 교사용 병합 결과지.
// 세션마다 관리자와 **같은** `stampSheet`를 돌려 한 문서에 이어 붙인다(pdf-lib copyPages).
//   ids 없음 → 채점 완료 세션 전부, 아이당 최신 1장, 번호순 (25명 반 = 한 파일)
//   ids 있음 → 그 세션들만(옛 차수도 가능). **전부 이 토큰의 학급 소속인지 검증** — 아니면 403.
// 채점 완료(lib/results의 scored)가 아닌 세션은 400 — 빈 결과지가 교사에게 나가면 오해한다.
import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { verifyResultsToken } from '@/lib/auth'
import { classResults, findClassCodeById, type ClassResultsRow } from '@/lib/db'
import { env } from '@/lib/env'
import { kstDateKey } from '@/lib/adminStats'
import { stampSheet } from '@/lib/pdf/stamp-sheet'
import { buildChildren, latestSession, scoreInputFor, sheetsFileName } from '@/lib/results'
import { jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'
// 프로덕션은 Vercel **무료(Hobby) 플랜**이다 — 함수 제한시간 기본 10초. maxDuration 상한이 플랜마다
// 달라 이 값에 기대지 않는다: 아래에서 stampSheet를 **병렬**로 돌려 작업 자체를 짧게 만든다.
// (stampSheet는 매 호출 원본 PDF·폰트를 읽고 임베드해 100~300ms — 순서대로 25장이면 10초에 빠듯하다.)
export const maxDuration = 60

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않습니다.', 401)
  try {
    const [row, rows] = await Promise.all([findClassCodeById(classCodeId), classResults(classCodeId)])
    if (!row) return jsonError('학급을 찾을 수 없습니다.', 404)

    // 상태·차수는 lib/results가 정한다 — 화면과 같은 판정이어야 화면에서 잠긴 것이 여기서 열리지 않는다.
    const children = buildChildren([], rows)
    const byId = new Map(rows.map(r => [r.id, r]))
    const meta = new Map<string, { childNo: number; name: string; attemptNo: number; attemptCount: number; startedDate: string; status: string }>()
    for (const c of children) for (const s of c.sessions)
      meta.set(s.id, { childNo: c.childNo, name: c.name, attemptNo: s.attemptNo, attemptCount: c.sessions.length,
        startedDate: kstDateKey(new Date(s.startedAt)), status: s.status })

    const idsParam = new URL(req.url).searchParams.get('ids')
    const all = !idsParam
    let picked: ClassResultsRow[]
    if (all) {
      picked = children.map(latestSession).filter(s => s?.status === 'scored').map(s => byId.get(s!.id)!)
    } else {
      const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean)
      // 학급 소속 검증 — 이 토큰이 여는 학급의 세션이 아니면 하나라도 거부한다.
      if (ids.some(id => !byId.has(id))) return jsonError('이 학급의 검사가 아닙니다.', 403)
      if (ids.some(id => meta.get(id)!.status !== 'scored')) return jsonError('채점이 끝나지 않은 검사가 있습니다.', 400)
      picked = ids.map(id => byId.get(id)!)
    }
    if (picked.length === 0) return jsonError('내려받을 수 있는 결과지가 없습니다. 채점이 끝나면 다시 시도해 주세요.', 400)

    // 스탬핑은 **병렬**(I/O 바운드 — 원본 PDF·폰트 읽기), 병합만 순서대로(페이지 순서 = 번호순 보장).
    const stamped = await Promise.all(picked.map(r => {
      const { form, input } = scoreInputFor(r)
      return stampSheet({
        form, ...input,
        // 관리자 PDF와 **같은 문서**여야 한다 — 생년월일·체크리스트도 그대로 찍는다.
        session: { school_name: row.school_name, grade: r.grade, class_no: row.class_no, child_name: r.child_name,
          birth_ymd: r.birth_ymd, started_at: r.started_at, checklist: r.checklist },
      })
    }))
    const merged = await PDFDocument.create()
    for (const bytes of stamped) {
      const one = await PDFDocument.load(bytes)
      for (const p of await merged.copyPages(one, one.getPageIndices())) merged.addPage(p)
    }
    const out = await merged.save()

    const name = sheetsFileName({
      grade: row.grade, classNo: row.class_no, date: kstDateKey(new Date()), all,
      picked: picked.map(r => meta.get(r.id)!),
    })
    return new NextResponse(out as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="sheets.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[results/:token/sheets.pdf] 생성 실패', e)
    return jsonError('결과지를 만들지 못했습니다.', 500)
  }
}
