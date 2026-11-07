import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  exportSessions: vi.fn().mockResolvedValue([]),
}))

import { GET } from '@/app/api/admin/export.xlsx/route'
import * as db from '@/lib/db'
import { readXlsx } from '@/lib/xlsx'
import type { ExportSessionRow } from '@/lib/excel-export'

// 인증은 proxy가 맡는다(tests/proxy.test.ts) — 여기서는 라우트의 응답 모양만 본다.

const ROW: ExportSessionRow = {
  id: 's1', class_code_id: 'C1', apply_seq: 17, child_no: 3, gender: '여', grade: 1, form_id: 'KODYS-G1-S2', checklist: [],
  started_at: '2026-10-05T01:00:00.000Z', submitted_at: '2026-10-05T01:20:00.000Z',
  recordings: [], reading_marks: [], sentence_scores: [], sentence_times: [], writing_answers: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.exportSessions).mockResolvedValue([])
})

describe('GET /api/admin/export.xlsx', () => {
  it('엑셀 파일로 내려준다 — 형식·한글 파일명(RFC 5987)·캐시 금지', async () => {
    vi.mocked(db.exportSessions).mockResolvedValueOnce([ROW])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(res.headers.get('content-disposition')).toMatch(/filename\*=UTF-8''.+\.xlsx/)
    expect(decodeURIComponent(res.headers.get('content-disposition')!.split("''")[1])).toMatch(/^읽기검사_전체데이터_\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const rows = await readXlsx(await res.arrayBuffer())
    expect(rows[0][0]).toBe('아동 코드')
    expect(rows[1][0]).toBe('017-03')
  })

  it('제출된 검사가 없으면 400 + 안내 문구(빈 파일을 내려주지 않는다)', async () => {
    const res = await GET()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/검사가 없어요/)
  })

  it('DB 오류면 500 + 일반화된 문구(내부 원문 노출 안 함)', async () => {
    vi.mocked(db.exportSessions).mockRejectedValueOnce(new Error('relation "sessions" does not exist'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(500)
    expect((await res.json()).error).not.toMatch(/relation/)
  })
})
