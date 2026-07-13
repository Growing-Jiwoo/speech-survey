import { buildCsv } from '@/lib/csv'
import { exportRows } from '@/lib/db'

export const dynamic = 'force-dynamic'

const HEADER = ['이름', '나이', '세션시작', '문항번호', '난이도', '목표문장', '시도순번', 'STT텍스트', '재시도총횟수', '건너뜀', '발화길이초', '녹음경로']

export async function GET() {
  const rows = await exportRows()
  const cells = rows.map((r: any) => [
    r.responses.sessions.child_name, r.responses.sessions.child_age, r.responses.sessions.started_at,
    r.responses.questions.order_no, r.responses.questions.difficulty, r.responses.questions.text,
    r.attempt_no, r.stt_text, r.responses.retry_count,
    r.responses.status === 'skipped' ? 'Y' : 'N', r.duration_sec, r.audio_path,
  ])
  return new Response(buildCsv(HEADER, cells), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="survey-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
