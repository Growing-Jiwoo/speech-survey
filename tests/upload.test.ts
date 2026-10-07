import { describe, it, expect } from 'vitest'
import { classifyUpload } from '@/lib/upload'

// 녹음 업로드 실패를 「다시 보내면 될 수도 있는 것」과 「다시 보내도 같은 것」으로 가른다 —
// 4xx에 재시도 버튼을 보이면 선생님이 끝없이 누른다(2026-10-01).
describe('classifyUpload', () => {
  it('2xx는 성공', () => {
    expect(classifyUpload(200)).toEqual({ ok: true, status: 200, retry: false, fatal: null })
  })
  it('연결 실패(0)·429·5xx만 재시도', () => {
    for (const s of [0, 429, 500, 502, 503]) expect(classifyUpload(s).retry).toBe(true)
    for (const s of [400, 401, 403, 404, 409, 413]) expect(classifyUpload(s).retry).toBe(false)
  })
  it('401은 세션 만료, 409는 이미 제출 — 이 검사를 더 진행할 수 없다', () => {
    expect(classifyUpload(401).fatal).toBe('expired')
    expect(classifyUpload(409).fatal).toBe('submitted')
    expect(classifyUpload(400).fatal).toBeNull()
  })
})
