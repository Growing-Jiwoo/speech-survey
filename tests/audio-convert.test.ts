import { describe, it, expect } from 'vitest'
import { pickConversion } from '@/lib/audio-convert'

describe('pickConversion', () => {
  it('webm/ogg(opus)는 ogg 컨테이너 재포장(코덱 복사)', () => {
    expect(pickConversion('audio/webm;codecs=opus')).toEqual({ args: ['-c:a', 'copy', '-f', 'ogg'], contentType: 'audio/ogg; codecs=opus', ext: 'webm' })
    expect(pickConversion('audio/webm')).toEqual({ args: ['-c:a', 'copy', '-f', 'ogg'], contentType: 'audio/ogg; codecs=opus', ext: 'webm' })
  })
  it('mp4(aac)는 16kHz mono wav로 트랜스코딩', () => {
    expect(pickConversion('audio/mp4')).toEqual({ args: ['-ac', '1', '-ar', '16000', '-f', 'wav'], contentType: 'audio/wav', ext: 'mp4' })
  })
  it('알 수 없는 타입도 wav 폴백', () => {
    expect(pickConversion('application/octet-stream').contentType).toBe('audio/wav')
  })
})
