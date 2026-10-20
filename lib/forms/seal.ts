// lib/forms/seal.ts — 실제 검사 문항의 암호화·복호화(AES-256-GCM). **서버 전용**(node:crypto).
//
// 왜: 저장소가 공개라 문항을 평문으로 커밋하면 누구나 검사지를 미리 볼 수 있다(선별검사의 타당도가 무너진다).
// 그래서 실제 문항은 암호문(`sealed.ts`)으로만 커밋하고, 키(`FORMS_KEY`, 32바이트 16진수)는 Vercel 환경 변수와
// 개발자 `.env.local`에만 둔다(사용자 확정 2026-10-20 — 저장소를 포트폴리오로 공개해 두려고). 키가 없으면 같은 모양의
// 가짜 문항(g*.ts)으로 돈다 — lib/forms/index.ts. GCM이라 암호문이 한 글자라도 바뀌거나 키가 틀리면 복호화가 실패한다.
//
// 암호문 형식: `v1.<iv>.<tag>.<본문>` (각각 base64). 만들기는 `npm run forms:seal`(scripts/forms-seal.ts).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const keyOf = (hex: string): Buffer => {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('FORMS_KEY는 64자리 16진수(32바이트)여야 한다')
  return Buffer.from(hex, 'hex')
}

export function seal(plain: string, keyHex: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyOf(keyHex), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), body.toString('base64')].join('.')
}

export function unseal(sealed: string, keyHex: string): string {
  const [v, iv, tag, body] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('문항 암호문 형식이 아니다')
  const d = createDecipheriv('aes-256-gcm', keyOf(keyHex), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8')
}
