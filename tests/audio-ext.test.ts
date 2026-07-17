import { describe, it, expect } from 'vitest'
import { audioExt } from '@/lib/audio-ext'
import { safeContentType } from '@/lib/audio-validate'

describe('audioExt — 저장 확장자는 컨테이너와 일치해야 한다', () => {
  it('webm(코덱 파라미터 포함) → webm', () => {
    expect(audioExt('audio/webm')).toBe('webm')
    expect(audioExt('audio/webm;codecs=opus')).toBe('webm')
  })
  it('[REGRESSION] ogg → ogg (과거 webm으로 저장되던 불일치 수정)', () => {
    expect(audioExt('audio/ogg')).toBe('ogg')
  })
  it('mp4 계열 → mp4', () => {
    expect(audioExt('audio/mp4')).toBe('mp4')
    expect(audioExt('audio/aac')).toBe('mp4')
    expect(audioExt('audio/m4a')).toBe('mp4')
  })
  it('미지 MIME은 bin 폴백 (방어적 — 정상 경로에서는 도달 불가)', () => {
    expect(audioExt('application/octet-stream')).toBe('bin')
  })
  it('업로드 경로 불변식: safeContentType 결과는 항상 bin이 아닌 확장자를 얻는다', () => {
    for (const sniffed of ['webm', 'ogg', 'mp4'] as const)
      expect(audioExt(safeContentType(sniffed))).not.toBe('bin')
  })
})
