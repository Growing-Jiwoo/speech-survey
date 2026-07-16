// lib/audio-ext.ts — 저장 파일 확장자 결정.
// 실제 재생은 업로드 시 저장되는 Content-Type(lib/audio-validate.safeContentType)을 따르므로
// 확장자는 스토리지 경로 표기용이다 — 그래도 컨테이너와 일치시켜 다운로드/디버깅 혼란을 막는다.
export function audioExt(mime: string): string {
  if (mime.startsWith('audio/webm')) return 'webm'
  if (mime.startsWith('audio/ogg')) return 'ogg'
  if (mime.startsWith('audio/mp4') || mime.startsWith('audio/aac') || mime.startsWith('audio/m4a')) return 'mp4'
  return 'bin' // 방어적 폴백 — 현 호출 경로(safeContentType 결과만 입력)에서는 도달하지 않는다
}
