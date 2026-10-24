// GET /api/admin/codes/[id]/sheets.pdf — 관리자 학급별 결과보고서 받기(담당자 요청 2026-10-24 「관리자도 학교, 학급별로 전체
// 기록지 다운」). 교사 결과지의 [전체 PDF 다운로드]와 **같은 파일**이다. 아이당 받을 수 있는 최신 1장, 번호순
// (lib/pdf/class-sheets). 파일 이름만 앞에 학교 이름이 붙는다(여러 학교의 「1-2_결과지_전체」가 한 폴더에 섞이지 않게).
// 인증은 proxy가 담당. 서버는 학교 전체를 한 파일로 묶지 않는다(응답 상한 — class-sheets 주석). 화면의 「학교 전체」는 반마다
// 이 주소를 불러 브라우저에서 이어 붙인다(lib/download fetchMergedPdf).
import { classSheetsResponse } from '@/lib/pdf/class-sheets'
import { UUID_RE, jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'
// 교사 결과지 병합과 같은 값·같은 이유(app/api/results/[token]/sheets.pdf). 이 값에 기대지 않는다.
export const maxDuration = 60

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return jsonError('코드 정보가 올바르지 않아요.', 400)
  return classSheetsResponse(id, null, 'admin/codes/:id/sheets.pdf', { schoolInName: true })
}
