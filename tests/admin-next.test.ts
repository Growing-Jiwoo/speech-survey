import { describe, it, expect } from 'vitest'
import { safeNext } from '@/lib/admin-next'

// 로그인 만료 뒤 원래 보던 결과지로 돌아오게 한다(2026-10-08) — 단 열린 리다이렉트가 되면 안 된다.
describe('safeNext', () => {
  it('관리자 경로는 그대로(쿼리 포함)', () => {
    expect(safeNext('/admin/abc-123')).toBe('/admin/abc-123')
    expect(safeNext('/admin?status=submitted&q=%EA%B9%80')).toBe('/admin?status=submitted&q=%EA%B9%80')
    expect(safeNext('/admin/codes')).toBe('/admin/codes')
    expect(safeNext('/admin')).toBe('/admin')
  })
  it('없거나 관리자 밖이면 목록으로', () => {
    for (const v of [null, '', '/', '/survey', 'https://evil.com/admin', 'admin', '/administrator', '/adminx'])
      expect(safeNext(v)).toBe('/admin')
  })
  it('[보안] 이중 슬래시·역슬래시·로그인 자신은 막는다', () => {
    for (const v of ['//evil.com', '/admin//evil.com', '/admin/\\evil.com', '/admin/login', '/admin/login?next=/admin'])
      expect(safeNext(v)).toBe('/admin')
  })
})
