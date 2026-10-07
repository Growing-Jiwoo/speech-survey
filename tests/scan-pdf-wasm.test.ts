import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { PDF_WASM_URL } from '@/lib/scan-pages'

// 흑백(1비트) 스캔 PDF는 CCITT G4·JBIG2로 압축된다 — pdf.js 6은 이것을 wasm 해독기로만 푼다(2026-10-08 야간 점검에서 재현:
// 해독기 주소 없이 열면 모든 쪽이 흰 종이 → 「빈 쪽」 → 흑백 스캔본을 한 장도 올릴 수 없었다).
// 이 테스트는 pdfjs-dist를 올릴 때 해독기 구조가 바뀌어 같은 일이 조용히 다시 생기는 것을 잡는다.
const ROOT = join(process.cwd(), 'node_modules', 'pdfjs-dist')
const pdf = () => new Uint8Array(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'ccitt-g4.pdf')))

async function decodeFirstImage(wasmUrl?: string): Promise<{ width: number; height: number } | null> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const log = console.log; console.log = () => {}          // pdf.js 경고(해독 실패)를 테스트 출력에서 숨긴다
  try {
    const doc = await pdfjs.getDocument({ data: pdf(), ...(wasmUrl ? { wasmUrl } : {}) }).promise
    const page = await doc.getPage(1)
    const ops = await page.getOperatorList()
    const id = ops.argsArray[ops.fnArray.indexOf(pdfjs.OPS.paintImageXObject)]?.[0] as string | undefined
    await new Promise(r => setTimeout(r, 200))
    const img = id ? (page.objs.get(id) as { width: number; height: number } | null) : null
    await doc.loadingTask.destroy()
    return img ? { width: img.width, height: img.height } : null
  } finally { console.log = log }
}

describe('흑백 스캔 PDF(CCITT G4) 해독', () => {
  // 순서가 중요하다 — 한 번 불러온 해독기는 같은 프로세스에 남아, 뒤에서 주소 없이 열어도 풀린다
  it('해독기 주소가 없으면 그림이 빠진다(이 테스트가 지키는 이유)', async () => {
    expect(await decodeFirstImage()).toBeNull()
  })
  it('[REGRESSION] 해독기 주소를 주면 그림이 풀린다 — 앱은 PDF_WASM_URL을 넘긴다', async () => {
    expect(await decodeFirstImage(join(ROOT, 'wasm') + '/')).toEqual({ width: 400, height: 300 })
  })
  it('앱이 넘기는 주소와 복사 스크립트의 대상이 같다', () => {
    expect(PDF_WASM_URL).toBe('/pdfjs-wasm/')
    execFileSync(process.execPath, ['scripts/copy-pdfjs-wasm.mjs'], { stdio: 'ignore' })
    const copied = readdirSync(join(process.cwd(), 'public', 'pdfjs-wasm'))
    for (const f of ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm', 'LICENSE_JBIG2']) expect(copied).toContain(f)
  })
})
