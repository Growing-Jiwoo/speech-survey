import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadRecording } from '@/lib/upload'
import type { Recording } from '@/hooks/useRecorder'

// 클라이언트 업로드 공통 경로(정상 업로드·재시도 배너가 함께 사용). Node 22의 네이티브
// fetch/FormData/Blob으로 jsdom 없이 검증한다.

const rec: Recording = {
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
  durationSec: 1.2345,
  mime: 'audio/webm',
  peak: 0.42,
}
const params = { sessionId: 'sid-1', sessionToken: 'tok', itemCode: 'rw01', attemptNo: 2, rec }

const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset() })
afterEach(() => { vi.unstubAllGlobals() })

describe('uploadRecording (클라이언트)', () => {
  it('성공 응답이면 true', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    expect(await uploadRecording(params)).toBe(true)
  })

  it('서버 오류(5xx)면 false — 예외를 던지지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 502 }))
    expect(await uploadRecording(params)).toBe(false)
  })

  it('네트워크 단절(fetch reject)이면 false', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await uploadRecording(params)).toBe(false)
  })

  it('FormData 필드 조립: durationSec은 소수 2자리, attemptNo는 문자열, 파일명은 audio', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    await uploadRecording(params)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/recordings')
    const fd = init.body as FormData
    expect(fd.get('sessionId')).toBe('sid-1')
    expect(fd.get('sessionToken')).toBe('tok')
    expect(fd.get('itemCode')).toBe('rw01')
    expect(fd.get('attemptNo')).toBe('2')
    expect(fd.get('durationSec')).toBe('1.23')
    expect((fd.get('audio') as File).name).toBe('audio')
  })
})
