// GET /api/results/[token] — 교사 결과 페이지 데이터. 인증은 **학급 스코프 토큰**(경로에 실림).
// 토큰은 권한만 담으므로 매 요청 DB를 읽는다 — 같은 링크를 새로고침하면 채점 진행이 보인다.
// 만료·변조·형식 오류를 구분하지 않고 401 하나로 뭉뚱그린다 — verifyResultsToken·verify-code와
// 같은 방침(사유를 나눠 보여주면 그 자체가 정보다).
// 응답에 생년월일·연락처·스토리지 경로를 싣지 않는다 — 교사가 볼 것은 이름·번호·점수·판정·상태다
// (사용자 확정 2026-09-22 — 임상 규칙 아님, 개발 판단).
import { NextResponse } from 'next/server'
import { verifyResultsToken } from '@/lib/auth'
import { classResults, findClassCodeById, listRoster } from '@/lib/db'
import { env } from '@/lib/env'
import { formForGrade } from '@/lib/forms'
import { buildChildren } from '@/lib/results'
import { jsonError } from '@/lib/request'
import { PROVISIONAL_CRITERIA, scoringFor } from '@/lib/scoring'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않습니다.', 401)
  try {
    const [row, roster, rows] = await Promise.all([
      findClassCodeById(classCodeId), listRoster(classCodeId), classResults(classCodeId),
    ])
    if (!row) return jsonError('학급을 찾을 수 없습니다.', 404)
    const form = formForGrade(row.grade)
    // 아동 실명·점수·판정이 담긴 응답이다 — 중간 캐시·뒤로가기 복원에 남기지 않는다
    // (PDF 라우트와 같은 방침). 새로고침이 곧 최신 상태여야 한다는 이 라우트의 약속도 이것이 지킨다.
    return NextResponse.json({
      cls: { schoolName: row.school_name, grade: row.grade, classNo: row.class_no, teacherName: row.teacher_name },
      provisional: PROVISIONAL_CRITERIA,
      taskMax: scoringFor(form).taskMax,
      children: buildChildren(
        roster.map(r => ({ child_no: r.child_no, child_name: r.child_name, gender: r.gender })),
        rows,
      ),
    }, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    console.error('[results/:token] 조회 실패', e)
    return jsonError('결과를 불러오지 못했습니다.', 500)
  }
}
