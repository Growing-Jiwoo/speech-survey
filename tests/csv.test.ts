import { describe, it, expect } from 'vitest'
import { buildCsv } from '@/lib/csv'

describe('buildCsv', () => {
  it('BOM으로 시작하고 헤더+행을 CRLF로 연결', () => {
    const out = buildCsv(['a', 'b'], [['1', '2'], ['3', '4']])
    expect(out.startsWith('﻿')).toBe(true)
    expect(out).toBe('﻿a,b\r\n1,2\r\n3,4')
  })
  it('쉼표·따옴표·개행 이스케이프', () => {
    const out = buildCsv(['x'], [['hi, "kid"\nline']])
    expect(out).toBe('﻿x\r\n"hi, ""kid""\nline"')
  })
  it('null/undefined는 빈 칸', () => {
    expect(buildCsv(['x', 'y'], [[null, undefined]])).toBe('﻿x,y\r\n,')
  })
})
