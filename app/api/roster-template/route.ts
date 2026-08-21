// GET /api/roster-template — 교사가 내려받는 빈 학급 명단 양식(CSV).
//
// 왜 라우트인가(정적 파일·data: URI가 아니라):
//  · 정적 파일로 두면 `lib/roster`의 머리글 상수를 고쳤을 때 양식만 옛 이름으로 남는다.
//    여기서 만들면 파서와 한 소스를 쓴다.
//  · `data:`/`blob:` URI는 CSP(`default-src 'self'`)에 걸릴 수 있다. 같은 출처 GET이
//    가장 안전하고, 파일명도 서버가 정한다.
//
// 인증을 걸지 않는다 — 신청 화면(`/apply`)이 공개이고, 이 응답에는 아동 정보가 한 글자도
// 없다(빈 양식이다). 오히려 교사가 양식을 못 받는 쪽이 실제 사고다.
import { rosterTemplateCsv } from '@/lib/roster'

// 내용이 배포마다 고정이라 캐시해도 된다 — 파서 상수가 바뀌면 새 배포가 새 응답을 준다.
export const dynamic = 'force-static'

/** 엑셀이 UTF-8 CSV를 열 때 BOM이 없으면 한글이 깨진다(윈도우 기본 인코딩으로 읽는다). */
const BOM = '﻿'

const FILENAME = '읽기검사-학급명단-양식.csv'

export function GET() {
  return new Response(BOM + rosterTemplateCsv(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      // 한글 파일명은 RFC 5987로 넘긴다 — filename*이 없으면 브라우저가 이름을 깨뜨린다
      // (검사지 PDF 라우트와 같은 방식).
      'content-disposition': `attachment; filename="roster-template.csv"; filename*=UTF-8''${encodeURIComponent(FILENAME)}`,
      'cache-control': 'public, max-age=3600',
    },
  })
}
