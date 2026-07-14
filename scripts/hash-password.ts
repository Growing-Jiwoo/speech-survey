import { hash } from '@node-rs/argon2'
const pw = process.argv[2]
if (!pw) { console.error('사용법: npm run hash-password -- <비밀번호>'); process.exit(1) }

const h = await hash(pw) // $argon2id$v=19$... (PHC 포맷, $는 필드 구분자)

// Next.js는 .env* 파일에서 $VAR 형태를 다른 변수 참조로 해석해 확장을 시도한다.
// 그대로 넣으면 $argon2id, $v 등을 존재하지 않는 변수로 오인해 값이 사라지고
// 해시가 깨진다(참고: https://nextjs.org/docs/pages/guides/environment-variables#variable-load-order — 리터럴 $는 \$로 이스케이프).
// Vercel 대시보드 등 셸/dotenv 파싱을 거치지 않는 곳에는 원본 해시를 그대로 붙여넣어야 한다.
console.log('# 원본 해시 — Vercel 등 대시보드에 직접 붙여넣을 때 사용(이스케이프 금지):')
console.log(h)
console.log('')
console.log('# .env.local(로컬)용 — Next.js의 $ 변수 확장을 막기 위해 이스케이프됨:')
console.log(`ADMIN_PASSWORD_HASH=${h.replaceAll('$', '\\$')}`)
