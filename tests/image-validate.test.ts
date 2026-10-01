import { describe, it, expect } from 'vitest'
import { imageExt, sniffImage } from '@/lib/image-validate'

describe('sniffImage — 스캔본 업로드의 매직바이트(클라이언트 MIME 불신)', () => {
  it('JPEG(FF D8 FF)', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe('image/jpeg')
  })
  it('PNG(89 50 4E 47 0D 0A 1A 0A)', () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png')
  })
  it('그 밖(PDF·HTML·빈 파일·잘린 머리)은 null — 이미지로 행세하는 파일이 관리자 화면에서 열리지 않게', () => {
    for (const b of [
      new TextEncoder().encode('%PDF-1.7'), new TextEncoder().encode('<svg onload=alert(1)>'),
      new Uint8Array([]), new Uint8Array([0xff, 0xd8]), new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    ]) expect(sniffImage(b)).toBeNull()
  })
  it('확장자는 판별 결과로 정한다', () => {
    expect(imageExt('image/jpeg')).toBe('jpg')
    expect(imageExt('image/png')).toBe('png')
  })
})
