// POST /api/apply — 공개 신청 접수.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ insertApplication: vi.fn() }))
vi.mock('@/lib/mail', () => ({
  sendMail: vi.fn(), applyNoticeMail: vi.fn(() => ({ to: '', subject: 's', html: 'h' })),
}))
vi.mock('@/lib/class-code', () => ({ generateClassCode: vi.fn(() => 'ABCDEF') }))
// after()는 요청 스코프 밖(테스트)에서 부르면 던진다 — 미뤄 둔 일을 모아 두고 테스트가 직접 돌린다.
const deferred = vi.hoisted(() => [] as (() => unknown)[])
vi.mock('next/server', async orig => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => unknown) => { deferred.push(fn) },
}))
const flushAfter = async () => { for (const fn of deferred.splice(0)) await fn() }

import { POST } from '@/app/api/apply/route'
import { insertApplication } from '@/lib/db'
import { sendMail } from '@/lib/mail'
import { generateClassCode } from '@/lib/class-code'

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
  deferred.length = 0
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
    await flushAfter()
    expect(sendMail).not.toHaveBeenCalled()
  })
  it('duplicate면 새 코드로 재시도한다 — 매 시도 새 코드를 뽑아 쓴다', async () => {
    // generateClassCode를 고정값으로만 목하면 "재시도마다 같은 코드를 5번 넣고 502내는" 버그도
    // 이 테스트를 통과시킨다 — 호출마다 다른 값을 주고, insertApplication에 실제로 넘어간
    // code 인자가 서로 다른지까지 확인해야 재시도 루프의 핵심(매번 새 코드)을 검증한 것이다.
    vi.mocked(generateClassCode).mockReturnValueOnce('ABCDEF').mockReturnValueOnce('GHJKMN')
    vi.mocked(insertApplication)
      .mockResolvedValueOnce('duplicate')
      .mockResolvedValueOnce({ id: 'cc-1', code: 'GHJKMN', status: 'pending' } as never)
    expect((await post(BODY)).status).toBe(201)
    expect(generateClassCode).toHaveBeenCalledTimes(2)
    expect(insertApplication).toHaveBeenCalledTimes(2)
    const codes = vi.mocked(insertApplication).mock.calls.map(c => c[0].code)
    expect(codes[0]).not.toBe(codes[1])
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
    // 두 문자열을 블랙리스트하는 대신 고정 문구와 정확히 같은지 확인한다 —
    // 원본 에러의 어떤 조각도 새지 않아야 한다는 것을 한 번에 못박는다.
    expect(json.error).toBe('접수에 실패했습니다. 다시 시도해 주세요.')
  })
  it('재시도 상한(5회) 소진 시 502', async () => {
    vi.mocked(insertApplication).mockResolvedValue('duplicate')
    const res = await post(BODY)
    expect(res.status).toBe(502)
    expect(insertApplication).toHaveBeenCalledTimes(5)
  })
})

describe('관리자 알림 합치기 — 신청 폭주가 메일 발송기가 되는 것을 막는다', () => {
  // lastNotifiedAt은 route.ts 모듈 스코프 싱글턴이라 이 파일의 다른 테스트가 이미 보냈을 수 있다.
  // 그래서 테스트마다 시계를 **이전에 돈 어떤 테스트보다도 하루 뒤**에 앉힌다(nextDay).
  // 종전처럼 「지금 + 24시간」「지금 + 48시간」을 고정으로 주면 선언 순서대로 돈다는 가정이라,
  // 순서를 섞으면(--sequence.shuffle) +48시간이 먼저 보내고 +24시간 테스트가 「창 안」으로 읽혀
  // 한 통도 안 나갔다. 실행 순서대로 늘어나는 시계는 어떤 순서로 돌아도 앞 흔적과 겹치지 않는다.
  let clock = Date.now()
  const nextDay = () => (clock += 24 * 3600_000)
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('연달아 두 번 신청해도 메일은 한 번만 보낸다', async () => {
    vi.setSystemTime(nextDay())
    await post(BODY)
    await post(BODY)
    await flushAfter()
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  it('합치기 창(10분)이 지나면 다시 보낸다', async () => {
    const base = nextDay()
    vi.setSystemTime(base)
    await post(BODY)
    vi.setSystemTime(base + 11 * 60_000)
    await post(BODY)
    await flushAfter()
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it('[REGRESSION] 응답은 알림 발송을 기다리지 않는다 — 메일은 응답 뒤(after)에 나간다', async () => {
    // 메일 서버가 멈춰도 교사는 접수 완료를 본다. 종전에는 발송을 await해서, 느린 발송이
    // 이미 접수된 신청을 시간 초과 "실패"로 보이게 했고 다시 누르면 같은 학급이 두 번 접수됐다.
    vi.setSystemTime(nextDay())
    vi.mocked(sendMail).mockReturnValue(new Promise(() => {}))
    expect((await post(BODY)).status).toBe(201)
    expect(sendMail).not.toHaveBeenCalled()
    expect(deferred).toHaveLength(1)
    void deferred[0]()
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@t.kr' }))
  })
})
