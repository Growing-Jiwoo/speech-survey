// scripts/check-client-bundle.ts — 검사지 문항이 공개 JS 청크에 실렸는지 빌드 직후 검사한다.
//
// 왜: `.next/static`은 인증 없이 누구나 받을 수 있는 파일이다. 화면(클라이언트 컴포넌트)이
// lib/forms를 값으로 import하는 순간 문항 전체가 거기 실린다. 문항은 세션 토큰을 확인한 서버만
// 내려준다(app/api/sessions/form, 관리자 상세 API) — 이 검사가 그 약속을 지킨다.
// import 하나로 조용히 되돌아가는 종류의 실수라 사람이 리뷰로 잡기 어렵다.
//
// 무엇을 찾나: 문장 읽기 문항(한 줄씩)과 **따옴표로 감싼** 무의미 낱말. 두 글자 의미 낱말
// ('바지' 등)은 UI 문구와 우연히 겹칠 수 있어 찾지 않는다 — 문항이 새면 문장과 무의미 낱말도
// 같은 배열에 붙어 함께 새므로 이것으로 충분하다. 번들러가 한글을 \uXXXX로 바꿔 쓸 수도 있어
// 두 표기를 다 본다.
//
// 실행: npm run build (next build 뒤에 자동으로 돈다). 단독 실행은 `npx tsx scripts/check-client-bundle.ts`.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { FORMS } from '../lib/forms'

const DIR = path.join(import.meta.dirname, '..', '.next', 'static')

const escapeU = (s: string) => [...s].map(c => (c.charCodeAt(0) > 0x7f
  ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}` : c)).join('')

const needles = FORMS.flatMap(f => [
  ...f.sentences.flatMap(s => s.split('\n')),
  ...[...f.readNonsense, ...(f.writing.kind === 'word' ? f.writing.nonsense : [])]
    .flatMap(w => [`"${w}"`, `'${w}'`]),
]).flatMap(n => [n, escapeU(n)])

async function* files(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* files(p)
    else if (/\.(js|json|html|txt)$/.test(e.name)) yield p
  }
}

let scanned = 0
const hits: string[] = []
for await (const p of files(DIR)) {
  scanned++
  const text = await readFile(p, 'utf8')
  const found = needles.find(n => text.includes(n))
  if (found) hits.push(`${path.relative(process.cwd(), p)}  ←  ${found}`)
}

if (scanned === 0) { console.error(`[check-client-bundle] ${DIR}에 파일이 없다 — next build를 먼저 돌릴 것`); process.exit(1) }
if (hits.length > 0) {
  console.error('[check-client-bundle] 검사지 문항이 공개 JS에 실렸다. 클라이언트 코드가 lib/forms(또는 그것을 값으로')
  console.error('import하는 lib/results 등)를 import하고 있는지 확인할 것 — 양식은 서버 응답으로 받아야 한다.')
  for (const h of hits) console.error(`  ${h}`)
  process.exit(1)
}
console.log(`[check-client-bundle] 공개 청크 ${scanned}개에 검사지 문항 없음`)
