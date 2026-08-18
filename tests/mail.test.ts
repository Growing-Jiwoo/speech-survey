// 메일 발송 — Resend HTTP API를 fetch로 부르므로 fetch를 스텁해 경계에서 검증한다.
// 특히 MAIL_TO_OVERRIDE는 "실수로 진짜 교사에게 나가는 것"을 막는 안전장치라 회귀 핀을 둔다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { approvedMail, applyNoticeMail, escapeHtml, sendMail } from '@/lib/mail'
import { approvalNoticeText } from '@/lib/format'

const okResponse = (id = 'msg_1') =>
  new Response(JSON.stringify({ id }), { status: 200, headers: { 'Content-Type': 'application/json' } })

const bodyOf = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_test_key')
  vi.stubEnv('MAIL_FROM', 'onboarding@resend.dev')
  vi.stubEnv('MAIL_TO_OVERRIDE', '')
  fetchMock = vi.fn().mockResolvedValue(okResponse())
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const mail = { to: 'teacher@school.kr', subject: '제목', html: '<p>본문</p>' }

describe('sendMail', () => {
  it('Resend에 인증 헤더와 함께 POST한다', async () => {
    const r = await sendMail(mail)
    expect(r).toEqual({ ok: true, id: 'msg_1' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key')
    expect(bodyOf(fetchMock)).toMatchObject({ from: 'onboarding@resend.dev', to: ['teacher@school.kr'] })
  })

  it('실패해도 던지지 않고 결과형으로 돌려준다 — 메일 실패가 신청·승인을 막으면 안 된다', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: '한도 초과' }), { status: 429 }))
    await expect(sendMail(mail)).resolves.toEqual({ ok: false, error: '한도 초과' })
  })

  it('네트워크가 끊겨도 결과형으로 돌려준다', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    await expect(sendMail(mail)).resolves.toEqual({ ok: false, error: 'network down' })
  })

  it('응답에 id가 없으면 실패로 본다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const r = await sendMail(mail)
    expect(r.ok).toBe(false)
  })
})

describe('MAIL_TO_OVERRIDE — 실수 발송 방지', () => {
  it('[REGRESSION] 설정되면 수신자를 그 주소로 강제한다', async () => {
    vi.stubEnv('MAIL_TO_OVERRIDE', 'dev@me.test')
    await sendMail(mail)
    expect(bodyOf(fetchMock).to).toEqual(['dev@me.test'])
  })

  it('원래 수신자를 본문에 적어 수신자 결정 로직을 눈으로 확인할 수 있게 한다', async () => {
    vi.stubEnv('MAIL_TO_OVERRIDE', 'dev@me.test')
    await sendMail(mail)
    const sent = bodyOf(fetchMock)
    expect(sent.html).toContain('teacher@school.kr')
    expect(sent.subject).toBe('[테스트] 제목')
  })

  it('비어 있으면 실제 수신자로 나간다 — 도메인 인증 후 이 줄만 비우면 된다', async () => {
    vi.stubEnv('MAIL_TO_OVERRIDE', '   ')
    await sendMail(mail)
    expect(bodyOf(fetchMock).to).toEqual(['teacher@school.kr'])
  })
})

describe('문구', () => {
  it('승인 메일에 학급 코드가 제목과 본문 모두에 들어간다', () => {
    const m = approvedMail({ teacherName: '김담임', schoolName: '예시초', code: 'K7M2P9', surveyUrl: 'https://x.test' })
    expect(m.subject).toContain('K7M2P9')
    expect(m.html).toContain('K7M2P9')
  })

  it('신청 알림에 학급과 등록 인원이 들어간다', () => {
    const m = applyNoticeMail({ schoolName: '예시초', grade: 1, classNo: 2,
      teacherName: '김담임', childCount: 12, adminUrl: 'https://x.test/admin/codes' })
    expect(m.html).toContain('12명')
    expect(m.subject).toContain('예시초')
  })

  it('[REGRESSION] 학교명·교사명은 이스케이프한다 — 그대로 본문에 들어가는 값이다', () => {
    const m = approvedMail({ teacherName: '<script>x</script>', schoolName: '예시초', code: 'ABC123', surveyUrl: 'https://x.test' })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })

  it('escapeHtml은 따옴표까지 처리한다', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  })

  it('[REGRESSION] adminUrl에 큰따옴표가 있어도 href 속성을 벗어나지 못한다 — ' +
    '요청 Host 헤더에서 만든 URL이라 신뢰할 수 없다', () => {
    const m = applyNoticeMail({
      schoolName: '예시초', grade: 1, classNo: 2, teacherName: '김담임', childCount: 1,
      adminUrl: 'https://evil.test/"><script>x</script>',
    })
    expect(m.html).not.toContain('"><script>')
    expect(m.html).toContain('href="https://evil.test/&quot;&gt;&lt;script&gt;x&lt;/script&gt;"')
  })

  it('[REGRESSION] surveyUrl도 같은 이유로 이스케이프한다 — 교사에게 나가는 메일이다', () => {
    const m = approvedMail({
      teacherName: '김담임', schoolName: '예시초', code: 'ABC123',
      surveyUrl: 'https://evil.test/"><script>x</script>',
    })
    expect(m.html).not.toContain('"><script>')
  })
})

// 승인 안내는 메일(HTML)과 관리자 복사용 평문 두 갈래로 나간다. **문장**은 담당자 확정본이 오면
// 통째로 바뀔 예정이라 핀하지 않고(그 시점에 거짓 실패만 낸다), 어느 쪽에서든 빠지면 교사가
// 검사를 시작할 수 없는 **필수 정보의 존재**만 고정한다.
describe('승인 안내 두 채널(approvedMail ↔ approvalNoticeText)', () => {
  it('두 채널이 같은 정보를 담는다 — 교사명·학교·코드·검사 주소', () => {
    const v = { teacherName: '김담임', schoolName: '예시초', code: 'K7M2P9', surveyUrl: 'https://x.test' }
    const html = approvedMail(v).html
    const text = approvalNoticeText(v)
    for (const s of [v.teacherName, v.schoolName, v.code, v.surveyUrl]) {
      expect(html).toContain(s)
      expect(text).toContain(s)
    }
  })
})
