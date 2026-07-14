import { buildCsv } from '@/lib/csv'
import { exportRows } from '@/lib/db'
import { ITEMS, KIND_LABEL, SECTION_LABEL, areaLabel } from '@/lib/items'

export const dynamic = 'force-dynamic'

const HEADER = ['지역', '학교', '학년', '반', '성별', '이름', '생년월일', '담임교사', '담임연락처',
  '시작시각', '제출시각', '문항번호', '섹션', '구분', '제시어', '응답', '시도수', '최종녹음경로', '최종길이초']

export async function GET() {
  const sessions = await exportRows()
  const cells = sessions.flatMap(s => {
    const base = [s.school_region, s.school_name, s.grade, s.class_no, s.gender, s.child_name,
      s.birth_ymd, s.teacher_name, s.teacher_contact, s.started_at, s.submitted_at ?? '']
    return ITEMS.map(item => {
      const row = [...base, item.orderNo, SECTION_LABEL[item.section],
        item.kind ? KIND_LABEL[item.kind] : '', item.text.replace(/\n/g, ' ')]
      if (item.maxSec > 0) {
        const recs = s.recordings.filter(r => r.item_code === item.code)
          .sort((a, b) => a.attempt_no - b.attempt_no)
        const last = recs[recs.length - 1]
        return [...row, recs.length > 0 ? '녹음완료' : '미녹음', recs.length,
          last?.audio_path ?? '', last?.duration_sec ?? '']
      }
      if (item.section === 'word_writing') {
        const ans = s.writing_answers.find(w => w.item_code === item.code)
        return [...row, ans === undefined ? '미선택' : ans.can_write ? '예' : '아니오', '', '', '']
      }
      return [...row, s.checklist.length > 0 ? s.checklist.map(areaLabel).join('; ') : '선택없음', '', '', '']
    })
  })
  return new Response(buildCsv(HEADER, cells), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kodys-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
