// GET /api/results/[token] — 교사 결과 페이지 데이터. 인증은 **학급 스코프 토큰**(경로에 실림).
// 토큰은 권한만 담으므로 매 요청 DB를 읽는다 — 같은 링크를 새로고침하면 채점 진행이 보인다.
// 만료·변조·형식 오류를 구분하지 않고 401 하나로 뭉뚱그린다 — verifyResultsToken·verify-code와
// 같은 방침(사유를 나눠 보여주면 그 자체가 정보다).
// 응답에 생년월일·연락처·스토리지 경로를 싣지 않는다 — 교사가 볼 것은 이름·번호·점수·판정·상태다
// (사용자 확정 2026-09-22 — 임상 규칙 아님, 개발 판단). 스캔본도 그림·경로는 싣지 않고 상태만 싣는다.
// `sheetTag`는 쓰기 기록지 QR의 반 표시다 — 올린 스캔본이 이 반 것인지 화면이 가린다(lib/writing-sheet).
// 결과는 **학기별로** 싣는다(`terms` — 검사가 있는 학기와 지금 학기, 최근 학기 먼저). 학급 코드는 만료가 없어 같은 반이 1학기
// 코드로 2학기에도 검사하므로, 재검사 차수·대표 검사·요약이 학기를 넘지 않게 학기마다 따로 묶는다(lib/results termGroups —
// 사용자 확정 2026-11-05, 담당자 회신 아님). 화면이 학기를 고른다(한 반이라 한 번에 다 실어도 작다).
// 명단에서 뺀 아이(`removed`)는 학기와 무관하게 한 번만 싣는다 — 어느 학기의 `children`에도 들지 않는다.
import { NextResponse } from 'next/server'
import { verifyResultsToken } from '@/lib/auth'
import { classResults, findClassCodeById, listRosterAll } from '@/lib/db'
import { env } from '@/lib/env'
import { formFor, formOfSession } from '@/lib/forms'
import { parseTermKey, semesterOf, termLabel } from '@/lib/format'
import { buildChildren, splitRemoved, termGroups, type ResultsTerm } from '@/lib/results'
import { classSheetTag } from '@/lib/writing-sheet'
import { jsonError } from '@/lib/request'
import { criteriaProvisional, scoringFor } from '@/lib/scoring'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않아요.', 401)
  try {
    const [row, rosterAll, allRows, sheetTag] = await Promise.all([
      findClassCodeById(classCodeId), listRosterAll(classCodeId), classResults(classCodeId), classSheetTag(classCodeId),
    ])
    if (!row) return jsonError('학급 정보가 없어요.', 404)
    // 만점은 학년이 같으면 학기가 달라도 같다(낱말 해독 14 · 쓰기 10) — 지금 학기 양식에서 읽는다.
    const form = formFor(row.grade, semesterOf(new Date().toISOString()))
    // 명단에서 뺀 아이는 **어느 학기의 표에도** 들지 않고 「명단에서 뺀 학생」으로 한 번만 싣는다(lib/results splitRemoved —
    // 검사 수는 모든 학기 합). 뺀 번호의 검사를 먼저 걸러 내고 학기로 묶어, 뺀 아이 검사만 있던 학기가 빈 칸으로 생기지 않게 한다.
    // 생년월일은 싣지 않는다.
    const { removed, removedNos } = splitRemoved(
      rosterAll.map(r => ({ child_no: r.child_no, child_name: r.child_name, gender: r.gender, removed: r.removed })), allRows)
    const roster = rosterAll.filter(r => !r.removed)
      .map(r => ({ child_no: r.child_no, child_name: r.child_name, gender: r.gender }))
    const rows = allRows.filter(r => !removedNos.has(r.child_no))
    const terms: ResultsTerm[] = termGroups(rows).map(g => ({
      key: g.key, label: termLabel(g.key), current: g.current,
      // 임시 기준 표시: 그 학기에 검사가 있으면 그 검사들의 양식으로(양식은 세션마다 정해진다 — 하나라도 임시면 표시),
      // 없으면(검사 전인 지금 학기) 그 학기에 시작할 양식으로.
      provisional: g.rows.length > 0
        ? g.rows.some(r => criteriaProvisional(formOfSession(r), r.grade))
        : criteriaProvisional(formFor(row.grade, parseTermKey(g.key)!.semester), row.grade),
      children: buildChildren(roster, g.rows),
    }))
    // 아동 실명·점수·판정이 담긴 응답이다 — 중간 캐시·뒤로가기 복원에 남기지 않는다
    // (PDF 라우트와 같은 방침). 새로고침이 곧 최신 상태여야 한다는 이 라우트의 약속도 이것이 지킨다.
    return NextResponse.json({
      cls: { schoolName: row.school_name, grade: row.grade, classNo: row.class_no, teacherName: row.teacher_name },
      taskMax: scoringFor(form).taskMax,
      terms,
      removed,
      sheetTag,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    console.error('[results/:token] 조회 실패', e)
    return jsonError('결과를 불러오지 못했어요.', 500)
  }
}
