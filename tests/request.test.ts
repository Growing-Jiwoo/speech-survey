import { describe, it, expect } from 'vitest'
import { UUID_RE, clientIp, jsonError } from '@/lib/request'

const req = (headers: Record<string, string>) => new Request('http://x/api', { headers })

describe('clientIp — 위조 불가능한 헤더 우선 규칙 (PR #16의 단일 소스)', () => {
  it('x-real-ip가 있으면 최우선 (플랫폼 주입, 클라이언트 위조 불가)', () => {
    expect(clientIp(req({ 'x-real-ip': '1.2.3.4', 'x-forwarded-for': '9.9.9.9' }))).toBe('1.2.3.4')
  })
  it('x-forwarded-for는 마지막 홉만 신뢰 (첫 IP는 클라이언트가 위조 가능)', () => {
    expect(clientIp(req({ 'x-forwarded-for': 'spoofed, 5.6.7.8' }))).toBe('5.6.7.8')
  })
  it('헤더가 없으면 local (로컬 개발)', () => {
    expect(clientIp(req({}))).toBe('local')
  })
  it('공백·빈 항목은 걸러낸다', () => {
    expect(clientIp(req({ 'x-forwarded-for': ' 1.1.1.1 , , 2.2.2.2 ' }))).toBe('2.2.2.2')
  })
})

describe('UUID_RE', () => {
  it('표준 UUID 허용(대소문자 무관)', () => {
    expect(UUID_RE.test('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(UUID_RE.test('AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE')).toBe(true)
  })
  it('경로 조작·임의 문자열 거부', () => {
    expect(UUID_RE.test('../etc/passwd')).toBe(false)
    expect(UUID_RE.test('11111111-1111-4111-8111-11111111111')).toBe(false) // 한 자리 부족
    expect(UUID_RE.test('')).toBe(false)
  })
})

describe('jsonError', () => {
  it('{ error } 본문과 상태코드를 담은 응답', async () => {
    const res = jsonError('안내 문구', 404)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: '안내 문구' })
  })
})
