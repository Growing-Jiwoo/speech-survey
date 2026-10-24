// GET /api/results/[token]/sheets.pdf?ids=a,b,c — 교사용 병합 결과보고서. 학급은 토큰이 정하고 병합 규칙(ids 없음 = 아이당
// 받을 수 있는 최신 1장 · ids 있음 = 그 검사들만, 이 학급 소속 검증 · 번호순)은 관리자 학급별 받기와 같은 함수가 갖는다
// (lib/pdf/class-sheets). 같은 학급을 어디서 받든 같은 파일이어야 한다.
import { verifyResultsToken } from '@/lib/auth'
import { env } from '@/lib/env'
import { classSheetsResponse } from '@/lib/pdf/class-sheets'
import { jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'
// 프로덕션은 Vercel **무료(Hobby) 플랜**이다 — 함수 제한시간 기본 10초. maxDuration 상한이 플랜마다
// 달라 이 값에 기대지 않는다. 실측(2026-10-08, 로컬): 30장 약 1.4초 · 60장 약 2.6초.
export const maxDuration = 60

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const classCodeId = await verifyResultsToken(token, env('SESSION_SECRET'))
  if (!classCodeId) return jsonError('링크가 만료됐거나 올바르지 않아요.', 401)
  // `ids`를 여러 번 실어 보내도 하나로 합친다 — get()만 쓰면 첫 값만 받아 **나머지 아이가 조용히
  // 빠진다**(전수 점검 2026-09-22). 값이 아예 없는 것과 빈 값은 다르게 본다: `?ids=`는 「아무도
  // 고르지 않음」이지 「전체」가 아니다 — 같게 보면 선택 0명인 요청이 반 전체를 내려받는다.
  const sp = new URL(req.url).searchParams
  return classSheetsResponse(classCodeId, sp.has('ids') ? sp.getAll('ids').join(',') : null, 'results/:token/sheets.pdf')
}
