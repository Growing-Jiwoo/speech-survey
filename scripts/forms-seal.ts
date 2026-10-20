// scripts/forms-seal.ts — 실제 검사 문항 평문(private/forms.json, 커밋 안 함) ↔ 암호문(lib/forms/sealed.ts, 커밋함).
//
//   npm run forms:seal     private/forms.json → lib/forms/sealed.ts   (문항을 고친 뒤)
//   npm run forms:unseal   lib/forms/sealed.ts → private/forms.json   (고치기 전에 — 새로 받은 PC에서도)
//
// 키는 환경 변수 FORMS_KEY, 없으면 .env.local에서 읽는다. 평문 형식과 검증은 lib/forms/index.ts `RealContent`.
// 암호화할 때마다 iv가 새로 나와 문항이 같아도 sealed.ts가 바뀐다 — 문항을 고치지 않았으면 다시 돌리지 말 것.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { seal, unseal } from '../lib/forms/seal'
import { SEALED } from '../lib/forms/sealed'

if (!process.env.FORMS_KEY && existsSync('.env.local')) process.loadEnvFile('.env.local')
const key = process.env.FORMS_KEY
if (!key) { console.error('[forms] FORMS_KEY가 없다 — .env.local에 넣을 것(README 「셋업」)'); process.exit(1) }

const PLAIN = 'private/forms.json'
const OUT = 'lib/forms/sealed.ts'

if (process.argv[2] === 'seal') {
  const plain = readFileSync(PLAIN, 'utf8')
  JSON.parse(plain)   // 깨진 JSON을 암호화해 두면 배포에서야 드러난다
  writeFileSync(OUT, [
    '// lib/forms/sealed.ts — 실제 검사 문항의 암호문. **직접 고치지 말 것** — `npm run forms:seal`이 만든다(scripts/forms-seal.ts).',
    '// 평문은 저장소에 없다(private/forms.json, 커밋 안 함). 키는 FORMS_KEY(Vercel 환경 변수 · .env.local) — lib/forms/seal.ts.',
    `export const SEALED = '${seal(plain, key)}'`,
    '',
  ].join('\n'))
  console.log(`[forms] ${PLAIN} → ${OUT}`)
} else if (process.argv[2] === 'unseal') {
  mkdirSync('private', { recursive: true })
  writeFileSync(PLAIN, unseal(SEALED, key))
  console.log(`[forms] ${OUT} → ${PLAIN}`)
} else {
  console.error('[forms] seal 또는 unseal'); process.exit(1)
}
