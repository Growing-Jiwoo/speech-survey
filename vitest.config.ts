import { defineConfig } from 'vitest/config'
import path from 'node:path'
export default defineConfig({
  // testTimeout 20초: QR 해독(scan-qr-decode)·결과보고서 PDF(report)·pdf.js(scan-pdf-wasm)는 한 건에 1~3.5초라
  // 기본 5초로는 병렬 실행·머신 부하에서 시간 초과로 거짓 실패했다(2026-10-08). 진짜 멈춤도 20초면 잡힌다.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 20_000 },
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
})
