import { describe, it, expect } from 'vitest'
import { isAllowedAudioMime, sniffAudio, safeContentType } from '@/lib/audio-validate'

const bytes = (...b: number[]) => new Uint8Array(b)

describe('isAllowedAudioMime', () => {
  it('허용 MIME', () => {
    for (const m of ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/m4a'])
      expect(isAllowedAudioMime(m)).toBe(true)
  })
  it('코덱 파라미터 허용', () => expect(isAllowedAudioMime('audio/webm;codecs=opus')).toBe(true))
  it('비허용 거부', () => {
    expect(isAllowedAudioMime('text/html')).toBe(false)
    expect(isAllowedAudioMime('application/octet-stream')).toBe(false)
    expect(isAllowedAudioMime('')).toBe(false)
  })
})

describe('sniffAudio', () => {
  it('WebM/Matroska 0x1A45DFA3', () => expect(sniffAudio(bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4))).toBe('webm'))
  it("OGG 'OggS'", () => expect(sniffAudio(bytes(0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0))).toBe('ogg'))
  it("MP4 'ftyp' @offset4", () => expect(sniffAudio(bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70))).toBe('mp4'))
  it('오디오 아님 → null', () => {
    expect(sniffAudio(bytes(0x3c, 0x68, 0x74, 0x6d, 0x6c))).toBeNull() // "<html"
    expect(sniffAudio(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull()       // "%PDF"
    expect(sniffAudio(bytes(1, 2))).toBeNull()                          // 너무 짧음
  })
})

describe('safeContentType', () => {
  it('컨테이너→고정 MIME', () => {
    expect(safeContentType('webm')).toBe('audio/webm')
    expect(safeContentType('ogg')).toBe('audio/ogg')
    expect(safeContentType('mp4')).toBe('audio/mp4')
  })
})
