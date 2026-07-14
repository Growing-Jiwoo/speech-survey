/** 실제 Azure 키로 1초 사인파 wav를 변환해 연결 확인. 실행: npm run smoke:azure */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import ffmpegPath from 'ffmpeg-static'
import { transcribeShortAudio } from '../lib/azure-stt'

execSync(`${ffmpegPath} -y -f lavfi -i sine=frequency=440:duration=1 -ac 1 -ar 16000 /tmp/smoke.wav`, { stdio: 'ignore' })
try {
  const text = await transcribeShortAudio(readFileSync('/tmp/smoke.wav'), 'audio/wav')
  console.log(`Azure 연결 OK (사인파라 인식 텍스트는 빈 값이 정상): "${text}"`)
} catch (e) {
  console.error('Azure 연결 실패:', (e as Error).message)
  process.exit(1)
}
