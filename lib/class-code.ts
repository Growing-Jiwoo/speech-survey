// lib/class-code.ts — 학급 코드 생성(서버 전용 — node:crypto).
// 형식(알파벳·길이)의 단일 소스는 lib/schema.ts — 발급과 입력 검증이 어긋나지 않게 한다.
import { randomInt } from 'node:crypto'
import { CODE_ALPHABET, CODE_LEN } from './schema'

export function generateClassCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}
