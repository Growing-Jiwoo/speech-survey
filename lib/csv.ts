type Cell = string | number | boolean | null | undefined

function escape(c: Cell): string {
  if (c === null || c === undefined) return ''
  const s = String(c)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildCsv(header: string[], rows: Cell[][]): string {
  const lines = [header, ...rows].map(r => r.map(escape).join(','))
  return '﻿' + lines.join('\r\n')
}
