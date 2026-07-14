import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  exportRows: vi.fn().mockResolvedValue([{
    id: 'sess-1', school_region: '서울특별시교육청', school_id: 'B1', school_name: '서울신구초등학교',
    birth_ymd: '190101', grade: 1, class_no: 3, gender: '남', child_name: '김도연',
    teacher_name: '박선생', teacher_contact: '010-1234-5678',
    checklist: ['speech'], started_at: '2026-07-14T01:00:00Z', submitted_at: '2026-07-14T01:30:00Z',
    recordings: [
      { item_code: 'rw01', attempt_no: 1, audio_path: 'sess-1/rw01_1.webm', duration_sec: 3.2 },
      { item_code: 'rw01', attempt_no: 2, audio_path: 'sess-1/rw01_2.webm', duration_sec: 2.8 },
    ],
    writing_answers: [{ item_code: 'ww01', can_write: true }],
  }]),
}))

import { GET } from '@/app/api/admin/export/route'

describe('GET /api/admin/export', () => {
  it('세션당 29행 + 헤더, 새 참여자 필드 포함', async () => {
    const res = await GET()
    const csv = await res.text()
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(1 + 29)
    expect(lines[0]).toContain('학교')
    expect(lines[0]).toContain('생년월일')
    const rw01 = lines.find(l => l.includes('rw01') || (l.includes(',1,') && l.includes('어디')))!
    expect(rw01).toContain('녹음완료')
    expect(rw01).toContain('sess-1/rw01_2.webm')
    expect(lines.some(l => l.includes('우비') && l.includes('예'))).toBe(true)
    expect(lines.some(l => l.includes('미녹음'))).toBe(true)
    expect(lines.some(l => l.includes('말 (조음/유창성)'))).toBe(true)
  })
})
