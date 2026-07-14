import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashPassword } from '@/lib/password'

vi.mock('@/lib/db', () => ({
  isLoginLocked: vi.fn().mockResolvedValue(false),
  recordLoginFailure: vi.fn().mockResolvedValue(undefined),
  clearLoginFailures: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/env', () => ({ env: (k: string) => k === 'ADMIN_PASSWORD_HASH' ? HASH : 'secret' }))

import { POST } from '@/app/api/admin/login/route'
import * as db from '@/lib/db'

const PW = 'correct-horse'
let HASH = ''

function makeReq(password: unknown, ip = '1.2.3.4', extraHeaders: Record<string, string> = {}) {
  return new Request('http://x/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip, ...extraHeaders },
    body: JSON.stringify({ password }),
  })
}

beforeEach(() => {
  HASH = hashPassword(PW)
  vi.clearAllMocks()
  vi.mocked(db.isLoginLocked).mockResolvedValue(false)
})

describe('POST /api/admin/login', () => {
  it('올바른 비번 → 200 + 쿠키 + 실패기록 초기화', async () => {
    const res = await POST(makeReq(PW))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('admin_token=')
    expect(db.clearLoginFailures).toHaveBeenCalledWith('1.2.3.4')
    expect(db.recordLoginFailure).not.toHaveBeenCalled()
  })
  it('틀린 비번 → 401 + 실패 기록', async () => {
    const res = await POST(makeReq('wrong'))
    expect(res.status).toBe(401)
    expect(db.recordLoginFailure).toHaveBeenCalledWith('1.2.3.4', expect.any(Number))
  })
  it('빈 비번 → 401 + 실패 기록', async () => {
    expect((await POST(makeReq('', '9.9.9.9'))).status).toBe(401)
    expect(db.recordLoginFailure).toHaveBeenCalledWith('9.9.9.9', expect.any(Number))
  })
  it('잠금 상태면 429 (비번 대조 전 차단)', async () => {
    vi.mocked(db.isLoginLocked).mockResolvedValue(true)
    const res = await POST(makeReq(PW))
    expect(res.status).toBe(429)
    expect(db.clearLoginFailures).not.toHaveBeenCalled()
  })
  it('x-forwarded-for 마지막 IP 사용 (클라이언트가 조작 가능한 앞쪽 항목은 무시)', async () => {
    await POST(makeReq('wrong', '5.5.5.5, 10.0.0.1, 10.0.0.2'))
    expect(db.recordLoginFailure).toHaveBeenCalledWith('10.0.0.2', expect.any(Number))
  })
  it('x-real-ip 헤더가 있으면 우선 사용', async () => {
    await POST(makeReq('wrong', '1.2.3.4', { 'x-real-ip': '9.8.7.6' }))
    expect(db.recordLoginFailure).toHaveBeenCalledWith('9.8.7.6', expect.any(Number))
  })
})
