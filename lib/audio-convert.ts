import { spawn } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import type { AzureContentType } from './azure-stt'

export interface Conversion { args: string[]; contentType: AzureContentType; ext: string }

export function pickConversion(mime: string): Conversion {
  if (mime.startsWith('audio/webm') || mime.startsWith('audio/ogg'))
    return { args: ['-c:a', 'copy', '-f', 'ogg'], contentType: 'audio/ogg; codecs=opus', ext: 'webm' }
  if (mime.startsWith('audio/mp4') || mime.startsWith('audio/aac') || mime.startsWith('audio/m4a'))
    return { args: ['-ac', '1', '-ar', '16000', '-f', 'wav'], contentType: 'audio/wav', ext: 'mp4' }
  return { args: ['-ac', '1', '-ar', '16000', '-f', 'wav'], contentType: 'audio/wav', ext: 'bin' }
}

/** 입력 버퍼를 Azure가 받는 포맷으로 변환. stdin→stdout 파이프, 파일 미사용. */
export async function toAzureFormat(input: Buffer, mime: string): Promise<{ data: Buffer; contentType: AzureContentType }> {
  const conv = pickConversion(mime)
  const bin = ffmpegPath as unknown as string
  if (!bin) throw new Error('ffmpeg-static 바이너리를 찾을 수 없습니다')
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...conv.args, 'pipe:1'])
    const out: Buffer[] = []; const err: Buffer[] = []
    p.stdout.on('data', d => out.push(d))
    p.stderr.on('data', d => err.push(d))
    p.on('error', reject)
    p.on('close', code => code === 0
      ? resolve({ data: Buffer.concat(out), contentType: conv.contentType })
      : reject(new Error(`ffmpeg 실패(${code}): ${Buffer.concat(err).toString().slice(0, 300)}`)))
    p.stdin.on('error', () => {}) // EPIPE 무시(ffmpeg 조기 종료 시)
    p.stdin.end(input)
  })
}
