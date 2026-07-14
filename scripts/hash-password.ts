import { hashPassword } from '../lib/password'
const pw = process.argv[2]
if (!pw) { console.error('사용법: npm run hash-password -- <비밀번호>'); process.exit(1) }
console.log(hashPassword(pw))
