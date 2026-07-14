// scripts/build-schools.ts — 전국초등학교 원본 JSON을 지역별 경량 JSON으로 변환.
// 사용: npm run build:schools [-- <원본디렉터리>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { REGIONS } from '../lib/schools'

const SRC = process.argv[2] ?? '/Users/kimjiwoo/Desktop/전국초등학교_지역별'
const OUT = 'public/schools'

interface RawSchool {
  학교ID: string; 학교명: string; 학교급구분: string; 운영상태: string; 소재지지번주소: string
}

mkdirSync(OUT, { recursive: true })
const index: { slug: string; name: string; short: string; count: number }[] = []

for (const region of REGIONS) {
  const raw: RawSchool[] = JSON.parse(readFileSync(join(SRC, `${region.name}.json`), 'utf8'))
  const schools = raw
    .filter(s => s.운영상태 === '운영' && s.학교급구분 === '초등학교')
    .map(s => ({
      id: s.학교ID,
      name: s.학교명,
      addr: (s.소재지지번주소 ?? '').split(' ')[1] ?? '', // 시·군·구 (동명교 구분용)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  writeFileSync(join(OUT, `${region.slug}.json`), JSON.stringify(schools), 'utf8')
  index.push({ ...region, count: schools.length })
  console.log(`${region.short}: ${schools.length}개교`)
}

writeFileSync(join(OUT, 'index.json'), JSON.stringify(index), 'utf8')
console.log(`총 ${index.reduce((a, r) => a + r.count, 0)}개교 → ${OUT}/`)
