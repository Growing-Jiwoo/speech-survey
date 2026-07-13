import { buildCsv } from '@/lib/csv'
import { exportRows } from '@/lib/db'

export const dynamic = 'force-dynamic'

const HEADER = ['이름', '나이', '세션시작', '문항번호', '난이도', '목표문장', '시도순번', 'STT텍스트', '재시도총횟수', '건너뜀', '발화길이초', '녹음경로']

export async function GET() {
  const responses = await exportRows()
  const cells = responses.flatMap((r: any) => {
    const base = [
      r.sessions.child_name, r.sessions.child_age, r.sessions.started_at,
      r.questions.order_no, r.questions.difficulty, r.questions.text,
    ]
    const skipFlag = r.status === 'skipped' ? 'Y' : 'N'
    const attempts = [...(r.attempts ?? [])].sort((a: any, b: any) => a.attempt_no - b.attempt_no)
    if (attempts.length === 0) {
      return [[...base, '', '', r.retry_count, skipFlag, '', '']]
    }
    return attempts.map((a: any) => [
      ...base, a.attempt_no, a.stt_text, r.retry_count, skipFlag, a.duration_sec, a.audio_path,
    ])
  })
  return new Response(buildCsv(HEADER, cells), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="survey-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
