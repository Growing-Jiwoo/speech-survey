// scripts/local-stack/gen-env.mjs — 로컬 스택 전용 env 파일을 만든다(이미 있으면 lib.sh가 부르지 않는다).
// 모든 값은 이 Mac에서만 쓰는 시험값이다. 운영 .env.local은 읽지 않는다.
//
//  - SESSION_SECRET: 무작위 32바이트(hex)
//  - ADMIN_PASSWORD_HASH: 앱과 같은 라이브러리(@node-rs/argon2 hash — scripts/hash-password.ts와 같은 PHC 포맷)로
//    로컬 관리자 비밀번호를 해시한다. 비밀번호는 **PC마다 무작위**로 만든다(저장소가 공개라 고정값을 적지 않는다 —
//    루트 README 「비밀번호 값을 코드·문서에 적지 말 것」). `LOCAL_ADMIN_PASSWORD`를 주면 그 값을 쓴다(운영 비밀번호를 넣지 말 것).
//    평문은 이 env 파일(권한 600, git 무시)에만 남기고 터미널에 한 번 보인다 — 다시 볼 때는 show-password.sh.
//    이 파일은 셸이 source하므로(Next의 dotenv가 아니라) $를 이스케이프하지 않고
//    작은따옴표로 감싼다.
//  - LOCAL_JWT_SECRET + SUPABASE_SERVICE_ROLE_KEY: PostgREST가 검증하는 HS256 JWT(role=service_role).
import { randomBytes, createHmac } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { hash } from '@node-rs/argon2'

const LOCAL_ADMIN_PASSWORD = process.env.LOCAL_ADMIN_PASSWORD || randomBytes(9).toString('base64url')

const out = process.argv[2]
if (!out) { console.error('사용법: node gen-env.mjs <출력 경로>'); process.exit(1) }

const b64url = (b) => Buffer.from(b).toString('base64url')
function signJwt(payload, secret) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

const jwtSecret = randomBytes(32).toString('hex')
const iat = Math.floor(Date.now() / 1000)
const exp = iat + 10 * 365 * 24 * 3600
const serviceKey = signJwt({ iss: 'local-stack', role: 'service_role', iat, exp }, jwtSecret)
const anonKey = signJwt({ iss: 'local-stack', role: 'anon', iat, exp }, jwtSecret)
const adminHash = await hash(LOCAL_ADMIN_PASSWORD)

const q = (v) => `'${String(v).replaceAll("'", "'\\''")}'`
const lines = [
  '# 로컬 스택 전용 env — gen-env.mjs가 만들었다. 운영 값을 넣지 말 것(.env.local과 무관).',
  '# 셸이 source한다(set -a). 값은 작은따옴표 — $를 이스케이프하지 않는다.',
  '# 로컬 관리자 비밀번호는 아래 LOCAL_ADMIN_PASSWORD(이 PC 전용 시험값 — show-password.sh로 본다)',
  `LOCAL_ADMIN_PASSWORD=${q(LOCAL_ADMIN_PASSWORD)}`,
  '',
  '# ── 스택 내부 ──',
  `LOCAL_JWT_SECRET=${q(jwtSecret)}`,
  `LOCAL_ANON_KEY=${q(anonKey)}`,
  `LOCAL_STACK_GATEWAY_URL=${q('http://127.0.0.1:54320')}`,
  '',
  '# ── 앱이 읽는 값(lib/env.ts·process.env.*) — 전부 명시한다. 빈 값도 명시해 두면 Next가 다른 .env 파일 값으로 채우지 않는다 ──',
  `SUPABASE_URL=${q('http://127.0.0.1:54320')}`,
  `SUPABASE_SERVICE_ROLE_KEY=${q(serviceKey)}`,
  `ADMIN_PASSWORD_HASH=${q(adminHash)}`,
  `SESSION_SECRET=${q(randomBytes(32).toString('hex'))}`,
  `RESEND_API_KEY=${q('re_local_stack_fake_key')}`,
  `MAIL_FROM=${q('읽기검사(로컬) <noreply@local.test>')}`,
  "MAIL_TO_OVERRIDE=''        # 비움 — 운영과 같은 수신자 결정을 본다. 메일은 fetch-guard가 가짜 Resend로 돌린다",
  "MAIL_REPLY_TO=''",
  `APP_URL=${q('http://localhost:3100')}`,
  `ADMIN_NOTIFY_EMAIL=${q('admin@local.test')}`,
  "FORMS_KEY=''               # 비움 = 가짜 문항",
  '',
]
writeFileSync(out, lines.join('\n'), { mode: 0o600 })
console.log(`[local-stack] ${out} 생성`)
console.log(`[local-stack] 로컬 관리자 비밀번호: ${LOCAL_ADMIN_PASSWORD}  (이 PC 전용 · 다시 보기: scripts/local-stack/show-password.sh)`)
