// GET /api/admin/export.xlsx — 관리자 [전체 데이터 받기]. 제출된 검사 전부를 엑셀 파일 하나로 내려준다
// (담당자 요청 2026-11-05 「전체데이터 파일을 엑셀파일로」, 담을 것은 담당자 확정 2026-11-06 — lib/excel-export 머리 주석).
// 인증은 proxy가 담당한다(/api/admin 전체). 아이당 학기마다 마지막 검사 한 줄, 양식마다 한 시트, 아동 코드만(이름 없음).
import { NextResponse } from 'next/server'
import { exportSessions } from '@/lib/db'
import { buildExportSheets, exportFileName } from '@/lib/excel-export'
import { writeXlsx } from '@/lib/xlsx-write'
import { kstDateKey } from '@/lib/adminStats'
import { jsonError } from '@/lib/request'

export const dynamic = 'force-dynamic'
// 수천 건이면 페이지를 여러 번 넘긴다 — 결과지 병합 라우트와 같은 값. 이 값에 기대지 않는다(보통 몇 초).
export const maxDuration = 60

export async function GET() {
  try {
    const sheets = buildExportSheets(await exportSessions())
    if (sheets.length === 0) return jsonError('내려받을 검사가 없어요. 제출된 검사가 생기면 다시 시도해 주세요.', 400)
    const bytes = writeXlsx(sheets)
    const name = exportFileName(kstDateKey(new Date()))
    return new NextResponse(bytes as BodyInit, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // 한글 파일명은 RFC 5987로 넘긴다(결과보고서 PDF 라우트와 같다)
        'content-disposition': `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // 아동 검사 기록 — 중간 캐시에 남기지 않는다(proxy도 /api/admin 전체에 붙이지만 PDF 라우트처럼 라우트도 직접 붙인다)
        'cache-control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[admin/export.xlsx] 생성 실패', e)
    return jsonError('엑셀 파일을 만들지 못했어요.', 500)
  }
}
