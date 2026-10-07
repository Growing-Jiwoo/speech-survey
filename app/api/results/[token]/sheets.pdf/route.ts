// GET /api/results/[token]/sheets.pdf?ids=a,b,c — 교사용 병합 결과보고서.
// 세션마다 관리자와 **같은** `renderReport`를 돌려 한 문서에 이어 붙인다(pdf-lib copyPages).
//   ids 없음 → 채점 완료 세션 전부, 아이당 최신 1장, 번호순 (25명 반 = 한 파일)
//   ids 있음 → 그 세션들만(옛 차수도 가능). **전부 이 토큰의 학급 소속인지 검증** — 아니면 403.
//   쪽 순서는 어느 쪽이든 번호순, 같은 아이는 차수순(ids를 보낸 순서가 아니다).
// 채점 완료(lib/results의 scored)가 아닌 세션은 400 — 빈 결과지가 교사에게 나가면 오해한다.
import { NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { verifyResultsToken } from '@/lib/auth'
import { classResults, findClassCodeById, type ClassResultsRow } from '@/lib/db'
import { env } from '@/lib/env'
import { kstDateKey } from '@/lib/adminStats'
import { renderReport } from '@/lib/pdf/report'
import { buildChildren, latestScored, scoreInputFor, sheetsFileName } from '@/lib/results'
import { jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'
// 프로덕션은 Vercel **무료(Hobby) 플랜**이다 — 함수 제한시간 기본 10초. maxDuration 상한이 플랜마다
// 달라 이 값에 기대지 않는다. 실측(2026-10-08, 로컬): 30장 약 1.4초 · 60장 약 2.6초.
export const maxDuration = 60

/** 한 번에 병합할 수 있는 결과지 장수 상한 — 학급 정원보다 넉넉하다. */
const MAX_SHEETS = 60

/** 동시에 만드는 결과지 수. renderReport는 CPU 일(폰트 임베드)이라 전부 한꺼번에 돌려도 빨라지지 않고
 *  메모리만 쌓인다 — 실측(2026-10-08) 60장 전부 병렬 2.6초·707MB, 4장씩 2.6초·259MB. */
const RENDER_CONCURRENCY = 4

/** 순서를 지키며 `limit`개씩만 동시에 돌린다 — 결과 배열은 입력 순서 그대로. */
async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(xs.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, async () => {
    while (next < xs.length) { const i = next++; out[i] = await fn(xs[i]) }
  }))
  return out
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않아요.', 401)
  try {
    const [row, rows] = await Promise.all([findClassCodeById(classCodeId), classResults(classCodeId)])
    if (!row) return jsonError('학급을 찾을 수 없어요.', 404)

    // 상태·차수는 lib/results가 정한다 — 화면과 같은 판정이어야 화면에서 잠긴 것이 여기서 열리지 않는다.
    const children = buildChildren([], rows)
    const byId = new Map(rows.map(r => [r.id, r]))
    const meta = new Map<string, { childNo: number; name: string; attemptNo: number; attemptCount: number; startedDate: string; status: string }>()
    for (const c of children) for (const s of c.sessions)
      meta.set(s.id, { childNo: c.childNo, name: c.name, attemptNo: s.attemptNo, attemptCount: c.sessions.length,
        startedDate: kstDateKey(new Date(s.startedAt)), status: s.status })

    // `ids`를 여러 번 실어 보내도 하나로 합친다 — get()만 쓰면 첫 값만 받아 **나머지 아이가 조용히
    // 빠진다**(전수 점검 2026-09-22). 값이 아예 없는 것과 빈 값은 다르게 본다: `?ids=`는 「아무도
    // 고르지 않음」이지 「전체」가 아니다 — 같게 보면 선택 0명인 요청이 반 전체를 내려받는다.
    const params = new URL(req.url).searchParams
    const idsParam = params.has('ids') ? params.getAll('ids').join(',') : null
    const all = idsParam === null
    let picked: ClassResultsRow[]
    if (all) {
      // 아이당 **받을 수 있는 것 중 최신** 한 장(lib/results의 latestScored 주석) — 최신 세션이
      // 중단된 재검사인 아이를 통째로 빼지 않는다.
      picked = children.map(latestScored).filter(s => s !== null).map(s => byId.get(s.id)!)
    } else {
      // 같은 id가 두 번 오면 한 장만 — 중복이면 같은 장이 두 번 붙고 파일명 「N명」도 틀린다
      const ids = [...new Set(idsParam.split(',').map(s => s.trim()).filter(Boolean))]
      // 학급 소속 검증 — 이 토큰이 여는 학급의 세션이 아니면 하나라도 거부한다.
      if (ids.some(id => !byId.has(id))) return jsonError('이 학급의 검사가 아니에요.', 403)
      if (ids.some(id => meta.get(id)!.status !== 'scored')) return jsonError('채점이 끝나지 않은 검사가 있어요.', 400)
      picked = ids.map(id => byId.get(id)!)
    }
    if (picked.length === 0)
      return jsonError(all
        ? '내려받을 수 있는 결과지가 없어요. 채점이 끝나면 다시 시도해 주세요.'
        : '선택한 검사가 없어요.', 400)
    // 한 학급이 이 수를 넘길 일은 없다(학급 정원). 상한이 없으면 유효 토큰 하나로 수백 장을
    // 요청해 함수 제한시간을 넘길 수 있다 — 장당 약 50ms라 190장쯤에서 10초에 닿는다.
    if (picked.length > MAX_SHEETS)
      return jsonError(`한 번에 ${MAX_SHEETS}장까지 받을 수 있어요. 나눠서 받아 주세요.`, 400)

    // 쪽 순서는 **번호순, 같은 아이는 차수순** — 화면 목록의 「Fail 먼저」(lib/results buildChildren)나
    // 선생님이 체크한 순서를 따르지 않는다. 종전에는 그 순서가 그대로 쪽 순서가 돼, 인쇄 묶음을 번호대로
    // 나눠 주려면 다시 추려야 했다.
    picked.sort((a, b) => a.child_no - b.child_no || a.started_at.localeCompare(b.started_at))
    const pages = await mapLimit(picked, RENDER_CONCURRENCY, r => {
      const { form, input } = scoreInputFor(r)
      return renderReport({
        form, ...input,
        // 관리자 PDF와 **같은 문서**여야 한다 — 성별·생년월일·체크리스트도 그대로 찍는다.
        session: { school_region: row.school_region, school_id: row.school_id, school_name: row.school_name,
          grade: r.grade, gender: r.gender, child_name: r.child_name,
          birth_ymd: r.birth_ymd, started_at: r.started_at, checklist: r.checklist },
      })
    })
    const merged = await PDFDocument.create()
    for (const bytes of pages) {
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
    return jsonError('결과보고서를 만들지 못했어요.', 500)
  }
}
