// scripts/vendor-fonts.mjs — 웹폰트를 저장소에 내려받아 빌드의 외부 의존을 없앤다.
//
// 왜: next/font/google은 **빌드할 때마다** 구글에서 폰트를 받는다. 그 요청이 한 번만
// 실패해도 배포가 통째로 죽는다(실제로 Vercel에서 발생 —
// "Can't resolve '@vercel/turbopack-next/internal/font/google/font'").
// 폰트를 저장소에 넣으면 빌드가 네트워크를 전혀 타지 않는다.
//
// 무엇을 뺐나: 구글은 Noto Sans KR을 유니코드 구간별로 쪼개 주는데(브라우저가 실제로
// 쓰는 청크만 받도록), 그중 **한자(CJK) 전용 청크는 내려받지 않는다.** 이 앱은 한자를
// 렌더할 경로가 없다 — 아동/담임 이름은 `lib/schema.ts`의 NAME_RE가 한글·라틴만 허용하고,
// 학교명·검사 낱말·UI 문구가 전부 한글이다. 이 한 가지로 10.1MB → 5.9MB가 된다.
// (한글과 한자가 섞인 청크는 한글이 들어 있으므로 남긴다.)
//
// 실행: node scripts/vendor-fonts.mjs
// 결과: public/fonts/**.woff2 와 app/fonts.css 를 덮어쓴다.
//
// 폰트를 바꾸거나 웨이트를 조정하려면 아래 FAMILIES만 고치고 다시 실행하면 된다.
// 파일명에 구글 버전(v39 등)이 들어가므로, 재실행으로 파일이 바뀌면 이름도 바뀌어
// 캐시가 자연히 갈린다.
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

// woff2를 받으려면 최신 브라우저 UA가 필요하다 — 구형 UA로 요청하면 ttf를 준다.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** app/layout.tsx·globals.css가 기대하는 CSS 변수와 짝을 이룬다. */
const FAMILIES = [
  { name: 'Noto Sans KR', slug: 'noto-sans-kr', weights: [400, 500, 700] },
  { name: 'Lexend', slug: 'lexend', weights: [400, 500, 600] },
]

const ROOT = path.join(import.meta.dirname, '..')
const OUT_DIR = path.join(ROOT, 'public', 'fonts')
const CSS_PATH = path.join(ROOT, 'app', 'fonts.css')

/** 'U+ac00-d7a3, U+f900' → [[0xac00,0xd7a3],[0xf900,0xf900]] */
function parseRanges(spec) {
  return spec.split(',').map(p => {
    const [a, b] = p.trim().replace(/^U\+/i, '').split('-')
    return [parseInt(a, 16), parseInt(b, 16 ) || parseInt(a, 16)]
  })
}

const HANGUL = [[0xAC00, 0xD7A3], [0x1100, 0x11FF], [0x3130, 0x318F], [0xA960, 0xA97F], [0xD7B0, 0xD7FF]]
const CJK = [[0x4E00, 0x9FFF], [0x3400, 0x4DBF], [0xF900, 0xFAFF], [0x20000, 0x2FA1F]]
const overlaps = (rs, tgt) => rs.some(([a, b]) => tgt.some(([c, d]) => !(b < c || a > d)))

/** 한자 전용 청크인가 — 한글이 하나도 없고 한자만 있으면 건너뛴다. */
const isCjkOnly = rs => overlaps(rs, CJK) && !overlaps(rs, HANGUL)

async function fetchCss(family, weights) {
  const q = `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights.join(';')}&display=swap`
  const res = await fetch(`https://fonts.googleapis.com/css2?${q}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`구글 폰트 CSS 요청 실패 (${family}): ${res.status}`)
  return res.text()
}

/** CSS의 @font-face 블록을 {weight, url, range}로 뜯는다. */
function parseFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
    weight: body.match(/font-weight:\s*(\d+)/)[1],
    url: body.match(/url\((https:\/\/[^)]+\.woff2)\)/)[1],
    range: body.match(/unicode-range:\s*([^;]+);/)[1].trim(),
  }))
}

/** 구글 URL에서 버전(v39)을 뽑아 파일명에 넣는다 — 재벤더링 시 캐시가 갈리도록. */
const versionOf = url => url.match(/\/s\/[^/]+\/(v\d+)\//)?.[1] ?? 'v0'

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true })
  const blocks = []
  let kept = 0, skipped = 0, bytes = 0

  for (const { name, slug, weights } of FAMILIES) {
    const faces = parseFaces(await fetchCss(name, weights)).filter(f => {
      if (isCjkOnly(parseRanges(f.range))) { skipped++; return false }
      return true
    })
    await mkdir(path.join(OUT_DIR, slug), { recursive: true })

    // 같은 웨이트 안에서 순번을 매겨 파일명을 안정적으로 만든다.
    const seq = {}
    const downloads = faces.map(async f => {
      const n = (seq[f.weight] = (seq[f.weight] ?? -1) + 1)
      const file = `${f.weight}-${versionOf(f.url)}-${n}.woff2`
      const res = await fetch(f.url, { headers: { 'User-Agent': UA } })
      if (!res.ok) throw new Error(`폰트 다운로드 실패: ${f.url} (${res.status})`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(path.join(OUT_DIR, slug, file), buf)
      return { ...f, file, size: buf.length }
    })

    for (const f of await Promise.all(downloads)) {
      kept++; bytes += f.size
      blocks.push(`@font-face {
  font-family: '${name}';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url('/fonts/${slug}/${f.file}') format('woff2');
  unicode-range: ${f.range};
}`)
    }
    console.log(`  ${name}: ${Object.values(seq).reduce((a, b) => a + b + 1, 0)}개`)
  }

  await writeFile(CSS_PATH, `/* app/fonts.css — 자동 생성물. 직접 고치지 말 것.
 * scripts/vendor-fonts.mjs가 만든다(폰트·웨이트를 바꾸려면 그 파일의 FAMILIES를 고치고 재실행).
 *
 * 빌드가 구글에서 폰트를 받지 않도록 저장소에 넣은 것이다 — next/font/google은 빌드마다
 * 네트워크를 타서 한 번의 실패로 배포가 죽는다. 한자 전용 청크는 제외했다(이 앱은 한자를
 * 렌더하지 않는다 — 근거는 스크립트 주석 참고).
 */
${blocks.join('\n')}
`)

  console.log(`\n받은 파일 ${kept}개 · ${(bytes / 1048576).toFixed(2)} MB`)
  console.log(`건너뛴 한자 전용 청크 ${skipped}개`)
  console.log(`→ public/fonts/**, app/fonts.css`)
}

main().catch(e => { console.error(e); process.exit(1) })
