// lib/audio-validate.ts — 업로드 오디오 MIME allowlist + 매직바이트 검증(저장형 XSS 차단).
const ALLOWED_MIME = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/m4a']

/** 클라이언트가 준 MIME 접두가 허용 오디오인지(;codecs=opus 등 파라미터는 무시). */
export function isAllowedAudioMime(mime: string): boolean {
  const base = mime.split(';')[0].trim().toLowerCase()
  return ALLOWED_MIME.includes(base)
}

export type SniffedAudio = 'webm' | 'mp4' | 'ogg'

/** 앞부분 바이트로 실제 컨테이너 판별. 미일치 시 null(오디오 아님 → 거부). */
export function sniffAudio(bytes: Uint8Array): SniffedAudio | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return 'webm' // EBML(Matroska/WebM)
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53)
    return 'ogg'  // 'OggS'
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70)
    return 'mp4'  // 'ftyp' at offset 4 (MP4/M4A)
  return null
}

/** 판별된 컨테이너에 대응하는 서버 고정 Content-Type(클라이언트 MIME 불신). */
export function safeContentType(sniffed: SniffedAudio): string {
  return sniffed === 'webm' ? 'audio/webm' : sniffed === 'ogg' ? 'audio/ogg' : 'audio/mp4'
}
