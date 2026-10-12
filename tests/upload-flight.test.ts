import { describe, it, expect, vi } from 'vitest'
import {
  beginUpload, clearFailedUpload, endUpload, failedUploads, isUploading, setFailedUpload, subscribeUploads, uploadsInFlight,
} from '@/lib/upload-flight'

// 모듈 범위 상태라 테스트마다 다른 세션 id를 쓴다.
describe('올리는 중인 녹음 — 검사·검토 화면이 함께 본다 (2026-10-07)', () => {
  it('시작·끝을 세션·페이지·시도 단위로 센다', () => {
    beginUpload('s1', 'p_rs01', 1)
    beginUpload('s1', 'p_rs01', 2)      // 1회차가 느린 사이 다시 녹음
    beginUpload('s1', 'p_rs02', 1)
    expect(uploadsInFlight('s1')).toBe(3)
    expect(isUploading('s1', 'p_rs01', 2)).toBe(true)
    endUpload('s1', 'p_rs01', 1)
    expect(isUploading('s1', 'p_rs01', 1)).toBe(false)
    expect(isUploading('s1', 'p_rs01', 2)).toBe(true)
    expect(uploadsInFlight('s1')).toBe(2)
  })

  it('다른 세션(다른 탭의 다른 아이)은 세지 않는다 — 앞부분이 같은 id도', () => {
    beginUpload('s2', 'p_rs01', 1)
    beginUpload('s22', 'p_rs01', 1)
    expect(uploadsInFlight('s2')).toBe(1)
  })

  it('[REGRESSION] 시작·끝마다 알린다 — 검토 화면이 그때 저장 상태를 다시 읽고 제출 잠금을 푼다', () => {
    const fn = vi.fn()
    const off = subscribeUploads(fn)
    beginUpload('s3', 'p_rw_meaning', 1)
    expect(fn).toHaveBeenCalledTimes(1)
    endUpload('s3', 'p_rw_meaning', 1)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(uploadsInFlight('s3')).toBe(0)
    off()
    beginUpload('s3', 'p_rw_meaning', 2)
    expect(fn).toHaveBeenCalledTimes(2)   // 해지한 뒤에는 부르지 않는다
  })

  it('이미 끝난 시도를 다시 끝내도 알리지 않는다', () => {
    const fn = vi.fn()
    const off = subscribeUploads(fn)
    endUpload('s4', 'p_rs01', 1)
    expect(fn).not.toHaveBeenCalled()
    off()
  })

  it('알림을 받다가 스스로 해지해도 다른 구독자는 마저 받는다', () => {
    const second = vi.fn()
    const off1: () => void = subscribeUploads(() => off1())
    const off2 = subscribeUploads(second)
    beginUpload('s5', 'p_rs01', 1)
    expect(second).toHaveBeenCalledTimes(1)
    off2()
  })
})

describe('다시 보낼 녹음 — 화면을 옮겨도 남는다 (2026-10-12)', () => {
  const rec = { blob: new Blob(['a']), durationSec: 1, mime: 'audio/webm', peak: 0.5 }
  it('[REGRESSION] 세션·페이지마다 녹음과 시도 번호를 들고 있고, 지우면 사라진다', () => {
    setFailedUpload('f1', 'p_rw_meaning', { rec, attemptNo: 2 })
    expect(failedUploads('f1').p_rw_meaning.attemptNo).toBe(2)
    expect(failedUploads('f2')).toEqual({})
    clearFailedUpload('f1', 'p_rw_meaning')
    expect(failedUploads('f1')).toEqual({})
  })
  it('바뀌지 않으면 같은 객체를 돌려준다 — 화면이 바깥 저장소로 읽는다(useSyncExternalStore)', () => {
    setFailedUpload('f3', 'p_rs01', { rec, attemptNo: 1 })
    expect(failedUploads('f3')).toBe(failedUploads('f3'))
    expect(failedUploads('none')).toBe(failedUploads('none2'))
  })
  it('넣고 지울 때 알린다 — 없는 것을 지우면 알리지 않는다', () => {
    const fn = vi.fn()
    const off = subscribeUploads(fn)
    setFailedUpload('f4', 'p_rs01', { rec, attemptNo: 1 })
    clearFailedUpload('f4', 'p_rs01')
    clearFailedUpload('f4', 'p_rs01')
    expect(fn).toHaveBeenCalledTimes(2)
    off()
  })
})
