// lib/audio-ext.ts — 저장 파일 확장자 결정 (구 lib/audio-convert.ts의 pickConversion 대체)
export function audioExt(mime: string): string {
  if (mime.startsWith('audio/webm') || mime.startsWith('audio/ogg')) return 'webm'
  if (mime.startsWith('audio/mp4') || mime.startsWith('audio/aac') || mime.startsWith('audio/m4a')) return 'mp4'
  return 'bin'
}
