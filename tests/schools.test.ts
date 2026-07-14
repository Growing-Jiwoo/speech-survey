import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { REGIONS } from '@/lib/schools'

describe('REGIONS', () => {
  it('17개 교육청, slug·이름 중복 없음', () => {
    expect(REGIONS).toHaveLength(17)
    expect(new Set(REGIONS.map(r => r.slug)).size).toBe(17)
    expect(new Set(REGIONS.map(r => r.name)).size).toBe(17)
  })
  it('slug는 URL-safe 소문자', () => {
    REGIONS.forEach(r => expect(r.slug).toMatch(/^[a-z]+$/))
  })
})

describe('생성된 학교 데이터 (public/schools)', () => {
  it('index.json: 지역 17개 + count > 0', () => {
    expect(existsSync('public/schools/index.json')).toBe(true)
    const index = JSON.parse(readFileSync('public/schools/index.json', 'utf8'))
    expect(index).toHaveLength(17)
    for (const r of index) {
      expect(r).toMatchObject({ slug: expect.any(String), name: expect.any(String), short: expect.any(String), count: expect.any(Number) })
      expect(r.count).toBeGreaterThan(0)
    }
  })
  it('지역 파일: {id, name, addr} 형태, 이름순 정렬', () => {
    const seoul = JSON.parse(readFileSync('public/schools/seoul.json', 'utf8'))
    expect(seoul.length).toBeGreaterThan(500)
    expect(seoul[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), addr: expect.any(String) })
    const names = seoul.map((s: { name: string }) => s.name)
    expect([...names].sort((a, b) => a.localeCompare(b, 'ko'))).toEqual(names)
  })
})
