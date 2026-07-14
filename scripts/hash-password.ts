import { hash } from '@node-rs/argon2'
const pw = process.argv[2]
if (!pw) { console.error('사용법: npm run hash-password -- <비밀번호>'); process.exit(1) }
console.log(await hash(pw)) // $argon2id$v=19$... 를 ADMIN_PASSWORD_HASH에 저장
