import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hash } from '@node-rs/argon2'

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

function makeReq(password: unknown, headers: Record<string, string> = {}) {
  return new Request('http://x/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ password }),
  })
}

beforeEach(async () => {
  HASH = await hash(PW)                 // argon2id 인코딩 해시
  vi.clearAllMocks()
  vi.mocked(db.isLoginLocked).mockResolvedValue(false)
})

describe('POST /api/admin/login', () => {
  it('올바른 비번 → 200 + 쿠키 + 실패기록 초기화', async () => {
    const res = await POST(makeReq(PW, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('admin_token=')
    expect(db.clearLoginFailures).toHaveBeenCalledWith('1.2.3.4')
    expect(db.clearLoginFailures).toHaveBeenCalledWith('__global__')
    expect(db.recordLoginFailure).not.toHaveBeenCalled()
  })
  it('틀린 비번 → 401 + 실패 기록 (IP + 전역)', async () => {
    const res = await POST(makeReq('wrong', { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(401)
    expect(db.recordLoginFailure).toHaveBeenCalledWith('1.2.3.4', expect.any(Number))
    expect(db.recordLoginFailure).toHaveBeenCalledWith('__global__', expect.any(Number))
  })
  it('빈 비번 → 401 + 실패 기록', async () => {
    expect((await POST(makeReq('', { 'x-real-ip': '9.9.9.9' }))).status).toBe(401)
    expect(db.recordLoginFailure).toHaveBeenCalledWith('9.9.9.9', expect.any(Number))
  })
  it('IP 잠금 상태면 429 (비번 대조 전 차단)', async () => {
    vi.mocked(db.isLoginLocked).mockImplementation(async (key: string) => key === '1.2.3.4')
    const res = await POST(makeReq(PW, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(429)
    expect(db.clearLoginFailures).not.toHaveBeenCalled()
  })
  it('전역 스로틀 트리거 시 429 (IP는 잠기지 않았어도 차단)', async () => {
    vi.mocked(db.isLoginLocked).mockImplementation(async (key: string) => key === '__global__')
    const res = await POST(makeReq(PW, { 'x-real-ip': '1.2.3.4' }))
    expect(res.status).toBe(429)
    expect(db.clearLoginFailures).not.toHaveBeenCalled()
  })
  it('플랫폼 주입 x-real-ip 우선 사용', async () => {
    await POST(makeReq('wrong', { 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '5.5.5.5' }))
    expect(db.recordLoginFailure).toHaveBeenCalledWith('8.8.8.8', expect.any(Number))
  })
  it('x-real-ip 없으면 x-forwarded-for 마지막(신뢰) 홉', async () => {
    await POST(makeReq('wrong', { 'x-forwarded-for': '5.5.5.5, 10.0.0.1, 10.0.0.2' }))
    expect(db.recordLoginFailure).toHaveBeenCalledWith('10.0.0.2', expect.any(Number))
  })
  it('공격자가 x-forwarded-for 첫 홉을 위조해도 신뢰 위치(x-real-ip)가 같으면 동일 잠금 버킷으로 집계된다', async () => {
    // 첫 시도: 위조된 첫 홉 '1.1.1.1', 실제 신뢰 IP(x-real-ip)는 '9.9.9.9'
    await POST(makeReq('wrong', { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1' }))
    // 두 번째 시도: 다른 위조 첫 홉 '2.2.2.2', 동일한 실제 신뢰 IP
    await POST(makeReq('wrong', { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '2.2.2.2' }))
    expect(db.recordLoginFailure).toHaveBeenNthCalledWith(1, '9.9.9.9', expect.any(Number))
    expect(db.recordLoginFailure).toHaveBeenNthCalledWith(3, '9.9.9.9', expect.any(Number))
    // 스푸핑된 첫 홉 값이 잠금 키로 쓰인 적이 없어야 한다
    expect(db.recordLoginFailure).not.toHaveBeenCalledWith('1.1.1.1', expect.any(Number))
    expect(db.recordLoginFailure).not.toHaveBeenCalledWith('2.2.2.2', expect.any(Number))
  })
})
