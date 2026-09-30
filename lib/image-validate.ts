// lib/image-validate.ts — 쓰기 기록지 스캔본 업로드의 매직바이트 검증(lib/audio-validate와 같은 방침).
// 클라이언트가 준 MIME은 믿지 않는다 — 앞부분 바이트로 실제 형식을 판별하고, 저장하는 Content-Type은
// 판별 결과로 서버가 정한다(다른 형식의 파일이 이미지로 행세해 관리자 화면에서 열리지 않게).

export type SniffedImage = 'image/jpeg' | 'image/png'

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 앞부분 바이트로 실제 형식 판별. JPEG·PNG가 아니면 null(거부). */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= PNG_SIG.length && PNG_SIG.every((b, i) => bytes[i] === b)) return 'image/png'
  return null
}

export const imageExt = (mime: SniffedImage) => (mime === 'image/png' ? 'png' : 'jpg')
