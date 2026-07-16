import { describe, it, expect } from 'vitest'
import { createToken, verifyToken, sha256Hex, createSessionToken, verifySessionToken } from '@/lib/auth'

const SECRET = 'test-secret'

describe('auth token', () => {
  it('발급한 토큰은 검증 통과', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t, SECRET)).toBe(true)
  })
  it('만료된 토큰은 실패', async () => {
    const t = await createToken(SECRET, -1)
    expect(await verifyToken(t, SECRET)).toBe(false)
  })
  it('변조된 토큰은 실패', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t + 'x', SECRET)).toBe(false)
    expect(await verifyToken('9999999999999.' + t.split('.')[1], SECRET)).toBe(false)
  })
  it('다른 시크릿이면 실패', async () => {
    const t = await createToken(SECRET, 60_000)
    expect(await verifyToken(t, 'other')).toBe(false)
  })
  it('sha256Hex는 알려진 값과 일치', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('세션 스코프 토큰', () => {
  const SID = '11111111-1111-4111-8111-111111111111'
  it('정상 검증 통과', async () => {
    const t = await createSessionToken(SID, SECRET)
    expect(await verifySessionToken(SID, t, SECRET)).toBe(true)
  })
  it('다른 sessionId면 실패', async () => {
    const t = await createSessionToken(SID, SECRET)
    expect(await verifySessionToken('22222222-2222-4222-8222-222222222222', t, SECRET)).toBe(false)
  })
  it('위조 서명·빈 토큰 실패', async () => {
    expect(await verifySessionToken(SID, `${SID}.deadbeef`, SECRET)).toBe(false)
    expect(await verifySessionToken(SID, '', SECRET)).toBe(false)
  })
  it('다른 시크릿이면 실패', async () => {
    const t = await createSessionToken(SID, SECRET)
    expect(await verifySessionToken(SID, t, 'other')).toBe(false)
  })
  it('만료된 세션 토큰은 실패', async () => {
    const t = await createSessionToken(SID, SECRET, -1)
    expect(await verifySessionToken(SID, t, SECRET)).toBe(false)
  })
  it('만료(exp) 필드 변조 시 실패', async () => {
    const t = await createSessionToken(SID, SECRET, 60_000)
    const sig = t.slice(t.indexOf('.') + 1)
    expect(await verifySessionToken(SID, `9999999999999.${sig}`, SECRET)).toBe(false)
  })
})

describe('관리자 토큰 jti', () => {
  it('매 발급마다 토큰이 달라 유일', async () => {
    expect(await createToken(SECRET, 60_000)).not.toBe(await createToken(SECRET, 60_000))
  })
})
