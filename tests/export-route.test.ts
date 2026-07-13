import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  exportRows: vi.fn().mockResolvedValue([
    {
      status: 'completed', retry_count: 2,
      sessions: { child_name: '민준', child_age: 8, started_at: '2026-07-13T04:55:00Z' },
      questions: { order_no: 1, difficulty: 'easy', text: 'I like apples.' },
      attempts: [{
        attempt_no: 2, stt_text: 'i like apples', audio_path: 's1/1_2.webm',
        duration_sec: 3.2, created_at: '2026-07-13T05:00:00Z',
      }],
    },
    {
      status: 'skipped', retry_count: 0,
      sessions: { child_name: '민준', child_age: 8, started_at: '2026-07-13T04:55:00Z' },
      questions: { order_no: 2, difficulty: 'easy', text: 'I like bananas.' },
      attempts: [],
    },
  ]),
}))

import { GET } from '@/app/api/admin/export/route'

describe('GET /api/admin/export', () => {
  it('CSV 헤더·행·Content-Disposition', async () => {
    const res = await GET()
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    // Response.text() strips a leading BOM per the WHATWG fetch/encoding spec's
    // UTF-8 decode step, so BOM presence must be checked at the byte level.
    const buf = new Uint8Array(await res.arrayBuffer())
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf])
    const body = new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf.slice(3))
    const [header, row1, row2] = body.split('\r\n')
    expect(header).toBe('이름,나이,세션시작,문항번호,난이도,목표문장,시도순번,STT텍스트,재시도총횟수,건너뜀,발화길이초,녹음경로')
    expect(row1).toBe('민준,8,2026-07-13T04:55:00Z,1,easy,I like apples.,2,i like apples,2,N,3.2,s1/1_2.webm')
    expect(row2).toBe('민준,8,2026-07-13T04:55:00Z,2,easy,I like bananas.,,,0,Y,,')
  })
})
