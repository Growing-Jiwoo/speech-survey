// scripts/copy-pdfjs-wasm.mjs — pdf.js의 이미지 해독기(wasm)를 public/pdfjs-wasm/으로 복사한다(dev·build 첫 단계).
//
// 왜: pdf.js 6은 흑백(1비트) 스캔 PDF의 CCITT G4·JBIG2 압축과 JPEG 2000을 wasm 해독기로만 푼다. 해독기 주소(`wasmUrl`)를
// 주지 않으면 그림을 경고만 남기고 빼고 그려 **모든 쪽이 흰 종이 → 「빈 쪽이에요」**가 되고, 흑백 스캔본은 한 장도 올릴 수
// 없었다(2026-10-08 야간 점검에서 재현 — 학교 복합기의 흔한 기본값이 흑백이다). lib/scan-pages.ts가 `/pdfjs-wasm/`을 넘긴다.
// 커밋하지 않고 매번 node_modules에서 복사한다 — 해독기는 설치된 pdfjs-dist의 작업자와 판이 맞아야 하므로, pdfjs를 올리면
// 저절로 따라오게 한다(public/pdfjs-wasm/은 .gitignore).
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'node_modules', 'pdfjs-dist', 'wasm')
const DEST = join(process.cwd(), 'public', 'pdfjs-wasm')
// 해독기와 wasm을 못 쓰는 브라우저용 대체 JS, 그리고 라이선스 고지(JBIG2·OpenJPEG·QCMS — 배포물에 함께 둔다).
// quickjs-eval은 PDF 안의 스크립트 실행용이라 쓰지 않는다.
const KEEP = /^(jbig2|openjpeg|qcms).*\.(wasm|js)$|^LICENSE_/

if (!existsSync(SRC)) {
  console.error(`[copy-pdfjs-wasm] ${SRC} 없음 — npm ci를 먼저 실행하세요`)
  process.exit(1)
}
mkdirSync(DEST, { recursive: true })
const files = readdirSync(SRC).filter(f => KEEP.test(f))
for (const f of files) copyFileSync(join(SRC, f), join(DEST, f))
console.log(`[copy-pdfjs-wasm] ${files.length}개 → public/pdfjs-wasm/`)
