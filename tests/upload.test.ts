import { describe, it, expect, vi } from 'vitest'
import { classifyUpload, uploadRecording, UPLOAD_TIMEOUT_MS } from '@/lib/upload'

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
  it('[REGRESSION] 404(관리자가 세션을 지움)도 더 진행할 수 없다 — 「다시 녹음」을 끝없이 권하지 않게 (2026-10-08)', () => {
    expect(classifyUpload(404)).toEqual({ ok: false, status: 404, retry: false, fatal: 'expired' })
  })
})

describe('uploadRecording — 멈춘 연결', () => {
  it('[REGRESSION] 응답이 오지 않으면 시간 제한으로 끊고 재시도로 분류한다 (2026-10-08)', async () => {
    const seen: (AbortSignal | undefined)[] = []
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined)
      return Promise.reject(new DOMException('The operation timed out.', 'TimeoutError'))
    }))
    const rec = { blob: new Blob(['x']), durationSec: 1, mime: 'audio/webm', peak: 0.5 }
    const r = await uploadRecording({ sessionId: 's', sessionToken: 't', itemCode: 'p_rs01', attemptNo: 1, rec })
    expect(seen[0]).toBeInstanceOf(AbortSignal)
    expect(r).toEqual({ ok: false, status: 0, retry: true, fatal: null })
    vi.unstubAllGlobals()
  })
  it('시간 제한은 1분 — 5MB 이하 녹음은 보통 수 초 안에 끝난다', () => {
    expect(UPLOAD_TIMEOUT_MS).toBe(60_000)
  })
})
