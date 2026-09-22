import { describe, it, expect } from 'vitest'
import { createToken, verifyToken, sha256Hex, createSessionToken, verifySessionToken,
  createResultsToken, verifyResultsToken, RESULTS_TTL_MS } from '@/lib/auth'

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
  it('비숫자 exp는 안전하게 실패 (NaN은 만료검사를 지나가도 서명에서 걸린다 — 동작 고정)', async () => {
    const t = await createToken(SECRET, 60_000)
    const [, jti] = t.split('.')
    expect(await verifyToken(`abc.${jti}.${t.split('.')[2]}`, SECRET)).toBe(false)
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

describe('학급 스코프 토큰(결과지 링크)', () => {
  const CID = '755316e7-fe7c-43f9-a5c5-5c2d39da59d7'
  it('발급한 토큰은 검증 통과하고 classCodeId를 돌려준다', async () => {
    const t = await createResultsToken(CID, SECRET)
    expect(await verifyResultsToken(t, SECRET)).toBe(CID)
  })
  it('기본 만료는 14일이다 — 채점 대기 기간을 감안한 값(사용자 확정 2026-09-22)', () => {
    expect(RESULTS_TTL_MS).toBe(14 * 24 * 3600_000)
  })
  it('만료된 토큰은 null', async () => {
    const t = await createResultsToken(CID, SECRET, -1)
    expect(await verifyResultsToken(t, SECRET)).toBeNull()
  })
  it('다른 시크릿이면 null', async () => {
    const t = await createResultsToken(CID, SECRET)
    expect(await verifyResultsToken(t, 'other')).toBeNull()
  })
  it('[REGRESSION] 주체(classCodeId)를 바꾸면 서명이 어긋나 null — 토큰 하나로 다른 학급을 열 수 없다', async () => {
    const t = await createResultsToken(CID, SECRET)
    const [, exp, sig] = t.split('.')
    expect(await verifyResultsToken(`99999999-9999-4999-8999-999999999999.${exp}.${sig}`, SECRET)).toBeNull()
  })
  it('만료(exp) 필드를 늘려도 null', async () => {
    const t = await createResultsToken(CID, SECRET, 60_000)
    const [cid, , sig] = t.split('.')
    expect(await verifyResultsToken(`${cid}.9999999999999.${sig}`, SECRET)).toBeNull()
  })
  it('형식이 아니면 null — 빈 문자열·점 개수 불일치·비UUID 주체', async () => {
    expect(await verifyResultsToken('', SECRET)).toBeNull()
    expect(await verifyResultsToken('a.b', SECRET)).toBeNull()
    expect(await verifyResultsToken('not-a-uuid.123.abc', SECRET)).toBeNull()
  })
})
