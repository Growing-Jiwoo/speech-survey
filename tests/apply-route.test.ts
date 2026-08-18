// POST /api/apply — 공개 신청 접수.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ insertApplication: vi.fn() }))
vi.mock('@/lib/mail', () => ({
  sendMail: vi.fn(), applyNoticeMail: vi.fn(() => ({ to: '', subject: 's', html: 'h' })),
}))
vi.mock('@/lib/class-code', () => ({ generateClassCode: vi.fn(() => 'ABCDEF') }))

import { POST } from '@/app/api/apply/route'
import { insertApplication } from '@/lib/db'
import { sendMail } from '@/lib/mail'

const BODY = {
  region: '서울특별시교육청', schoolId: 'S001', schoolName: '서울예시초',
  grade: 1, classNo: 2, teacherName: '김담임', teacherPhone: '', teacherEmail: 't@school.kr',
  roster: [{ childNo: 1, name: '김서아', gender: '여', birthYmd: '190304' }],
}
const post = (body: unknown, ip = '1.2.3.4') => POST(new Request('http://t/api/apply', {
  method: 'POST', body: JSON.stringify(body), headers: { 'x-real-ip': ip },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(insertApplication).mockResolvedValue({ id: 'cc-1', code: 'ABCDEF', status: 'pending' } as never)
  vi.mocked(sendMail).mockResolvedValue({ ok: true, id: 'm1' })
  vi.stubEnv('ADMIN_NOTIFY_EMAIL', 'admin@t.kr')
})

describe('POST /api/apply', () => {
  it('정상 신청은 201 — 응답에 코드를 넣지 않는다(승인 메일이 유일한 전달 경로)', async () => {
    const res = await post(BODY)
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(JSON.stringify(json)).not.toContain('ABCDEF')
  })
  it('스키마 위반은 전체 400 — 부분 저장 없음', async () => {
    const res = await post({ ...BODY, roster: [] })
    expect(res.status).toBe(400)
    expect(insertApplication).not.toHaveBeenCalled()
  })
  it('[REGRESSION] 관리자 알림 메일이 실패해도 신청은 성공한다', async () => {
    vi.mocked(sendMail).mockResolvedValue({ ok: false, error: 'down' })
    expect((await post(BODY)).status).toBe(201)
  })
  it('ADMIN_NOTIFY_EMAIL이 없으면 메일을 보내지 않는다', async () => {
    vi.stubEnv('ADMIN_NOTIFY_EMAIL', '')
    await post(BODY)
    expect(sendMail).not.toHaveBeenCalled()
  })
  it('duplicate면 새 코드로 재시도한다', async () => {
    vi.mocked(insertApplication)
      .mockResolvedValueOnce('duplicate')
      .mockResolvedValueOnce({ id: 'cc-1', code: 'GHJKMN', status: 'pending' } as never)
    expect((await post(BODY)).status).toBe(201)
    expect(insertApplication).toHaveBeenCalledTimes(2)
  })
  it('레이트리밋 초과는 429', async () => {
    for (let i = 0; i < 20; i++) await post(BODY, '9.9.9.9')
    expect((await post(BODY, '9.9.9.9')).status).toBe(429)
  })
  it('DB 오류(예: 롤백 실패로 코드가 실린 메시지)는 502 + 원본 오류 텍스트 비노출', async () => {
    vi.mocked(insertApplication).mockRejectedValue(
      new Error('insert failed (pending 코드 SECRET1 롤백 실패 — 수동 삭제 필요)'))
    const res = await post(BODY)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).not.toMatch(/SECRET1/)
    expect(json.error).not.toMatch(/롤백/)
  })
  it('재시도 상한(5회) 소진 시 502', async () => {
    vi.mocked(insertApplication).mockResolvedValue('duplicate')
    const res = await post(BODY)
    expect(res.status).toBe(502)
    expect(insertApplication).toHaveBeenCalledTimes(5)
  })
})
