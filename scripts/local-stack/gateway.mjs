// scripts/local-stack/gateway.mjs — 앱이 SUPABASE_URL로 부르는 자리를 대신하는 로컬 게이트웨이(의존성 없음, node:http).
//
//   /rest/v1/*            → PostgREST(127.0.0.1:PGRST_PORT)로 그대로 넘긴다(supabase-js 헤더 포함, JWT 검증은 PostgREST가)
//   /storage/v1/object/*  → 이 폴더의 .data/storage 아래 파일로 흉내 낸 Storage. 앱이 쓰는 것만(lib/db.ts):
//                           upload(POST/PUT, 원시 본문) · list(POST object/list) · remove(DELETE, {prefixes}) ·
//                           createSignedUrl(POST object/sign) · 서명 URL 받기(GET object/sign?token=…)
//   /resend/emails        → 가짜 Resend. 본문을 .data/mails.json에 쌓고 {id}만 돌려준다 — 아무것도 보내지 않는다.
//                           앱의 https://api.resend.com 요청은 fetch-guard.mjs가 여기로 돌린다.
//   /__local/health · /__local/mails  → 점검용
//
// 운영 Supabase Storage와 다른 점: 멀티파트 업로드·이미지 변환·버전 없음(앱이 쓰지 않음). 오류 모양은 Storage API와 같게
// {statusCode, error, message}로 낸다 — 앱의 /exist|duplicate/ 검사(lib/db uploadScanObject)가 그대로 맞는다.
import http from 'node:http'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.GATEWAY_PORT ?? 54320)
const PGRST = `http://127.0.0.1:${process.env.PGRST_PORT ?? 54321}`
const DATA = process.env.LOCAL_STACK_DATA ?? path.join(path.dirname(new URL(import.meta.url).pathname), '.data')
const STORAGE_DIR = path.join(DATA, 'storage')
const META_DIR = path.join(DATA, 'storage-meta')
const MAILS = path.join(DATA, 'mails.json')
const SECRET = process.env.LOCAL_JWT_SECRET
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SECRET || !SERVICE_KEY) { console.error('LOCAL_JWT_SECRET·SUPABASE_SERVICE_ROLE_KEY가 없다(.env.local-stack)'); process.exit(1) }

fs.mkdirSync(STORAGE_DIR, { recursive: true })
fs.mkdirSync(META_DIR, { recursive: true })

// ── 공통 ──
function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': buf.length, ...headers })
  res.end(buf)
}
const storageError = (res, status, error, message) => send(res, status, { statusCode: String(status), error, message })
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
const json = (buf) => { try { return JSON.parse(buf.toString('utf8') || '{}') } catch { return null } }

/** HS256 JWT 검증 — service_role이어야 Storage를 쓸 수 있다(운영 Storage도 비공개 버킷은 service key가 필요). */
function roleOf(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  if (!m) return null
  const [h, p, s] = m[1].split('.')
  if (!h || !p || !s) return null
  const want = createHmac('sha256', SECRET).update(`${h}.${p}`).digest()
  const got = Buffer.from(s, 'base64url')
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  try {
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    if (claims.exp && claims.exp * 1000 < Date.now()) return null
    return claims.role ?? null
  } catch { return null }
}

/** 버킷 안의 경로를 안전하게 — 빈 조각·`..`·절대경로를 막는다. */
function safeKey(raw) {
  const decoded = decodeURIComponent(raw)
  const parts = decoded.split('/').filter(Boolean)
  if (parts.length === 0 || parts.some(p => p === '.' || p === '..' || p.includes('\0'))) return null
  return parts.join('/')
}
const fileOf = (bucket, key) => path.join(STORAGE_DIR, bucket, key)
const metaOf = (bucket, key) => path.join(META_DIR, bucket, `${key}.json`)

/** storage.buckets 행을 PostgREST로 읽는다(001·006이 넣은 행 — 크기·형식 상한 포함). */
async function bucketRow(bucket) {
  const r = await fetch(`${PGRST}/buckets?id=eq.${encodeURIComponent(bucket)}&select=*`, {
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Accept-Profile': 'storage' },
  })
  if (!r.ok) throw new Error(`PostgREST buckets 조회 실패 ${r.status}: ${await r.text()}`)
  const rows = await r.json()
  return rows[0] ?? null
}

// ── 서명 URL 토큰: base64url(JSON{url,exp}).hmac ──
function signToken(url, expiresIn) {
  const payload = Buffer.from(JSON.stringify({ url, exp: Math.floor(Date.now() / 1000) + Number(expiresIn || 60) })).toString('base64url')
  return `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`
}
function checkToken(token, url) {
  const [payload, sig] = String(token ?? '').split('.')
  if (!payload || !sig) return 'InvalidJWT'
  const want = createHmac('sha256', SECRET).update(payload).digest('base64url')
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return 'InvalidSignature'
  const c = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (c.url !== url) return 'InvalidSignature'
  if (c.exp * 1000 < Date.now()) return 'ExpiredToken'
  return null
}

// ── Storage ──
async function handleStorage(req, res, rest, query) {
  // GET object/sign/<bucket>/<key>?token= — 브라우저가 <audio>·<img>·fetch로 연다(인증 헤더 없음)
  if (req.method === 'GET' && rest.startsWith('object/sign/')) {
    const [bucket, ...k] = rest.slice('object/sign/'.length).split('/')
    const key = safeKey(k.join('/'))
    if (!key) return storageError(res, 400, 'InvalidKey', 'Invalid key')
    const bad = checkToken(query.get('token'), `${bucket}/${key}`)
    if (bad) return storageError(res, 400, bad, '서명 URL이 올바르지 않거나 만료됐다')
    return serveFile(req, res, bucket, key)
  }
  if (req.method === 'OPTIONS') return send(res, 204, '', corsHeaders())

  if (roleOf(req) !== 'service_role') return storageError(res, 403, 'Unauthorized', 'service_role 키가 필요하다(로컬 Storage)')

  // POST object/list/<bucket> {prefix, limit, offset, sortBy, search}
  if (req.method === 'POST' && rest.startsWith('object/list/')) {
    const bucket = rest.slice('object/list/'.length)
    if (!(await bucketRow(bucket))) return storageError(res, 404, 'Bucket not found', 'Bucket not found')
    const body = json(await readBody(req)) ?? {}
    return send(res, 200, listObjects(bucket, body))
  }
  // POST object/sign/<bucket>/<key> {expiresIn}
  if (req.method === 'POST' && rest.startsWith('object/sign/')) {
    const [bucket, ...k] = rest.slice('object/sign/'.length).split('/')
    const key = safeKey(k.join('/'))
    if (!key) return storageError(res, 400, 'InvalidKey', 'Invalid key')
    const body = json(await readBody(req)) ?? {}
    if (!fs.existsSync(fileOf(bucket, key))) return storageError(res, 404, 'not_found', 'Object not found')
    return send(res, 200, { signedURL: `/object/sign/${bucket}/${key}?token=${signToken(`${bucket}/${key}`, body.expiresIn)}` })
  }
  // DELETE object/<bucket> {prefixes:[...]}
  if (req.method === 'DELETE' && rest.startsWith('object/') && !rest.slice(7).includes('/')) {
    const bucket = rest.slice(7)
    if (!(await bucketRow(bucket))) return storageError(res, 404, 'Bucket not found', 'Bucket not found')
    const body = json(await readBody(req)) ?? {}
    const removed = []
    for (const p of Array.isArray(body.prefixes) ? body.prefixes : []) {
      const key = safeKey(p)
      if (!key) continue
      const f = fileOf(bucket, key)
      if (fs.existsSync(f) && fs.statSync(f).isFile()) {
        const meta = readMeta(bucket, key)
        fs.rmSync(f)
        fs.rmSync(metaOf(bucket, key), { force: true })
        removed.push({ name: key, bucket_id: bucket, id: meta.id ?? null, metadata: meta.metadata ?? null })
        // 빈 폴더는 남기지 않는다 — Supabase Storage에는 「빈 폴더」가 없다(list 결과가 운영과 같게)
        for (let d = path.dirname(f); d !== path.join(STORAGE_DIR, bucket) && d.startsWith(STORAGE_DIR); d = path.dirname(d)) {
          try { fs.rmdirSync(d) } catch { break }
        }
      }
    }
    return send(res, 200, removed)
  }
  // POST/PUT object/<bucket>/<key> — 업로드(원시 본문). POST는 x-upsert, PUT은 덮어쓰기(update)
  if ((req.method === 'POST' || req.method === 'PUT') && rest.startsWith('object/')) {
    const [bucket, ...k] = rest.slice(7).split('/')
    const key = safeKey(k.join('/'))
    if (!key) return storageError(res, 400, 'InvalidKey', 'Invalid key')
    const row = await bucketRow(bucket)
    if (!row) return storageError(res, 404, 'Bucket not found', 'Bucket not found')
    const mime = String(req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim()
    if (mime.startsWith('multipart/')) return storageError(res, 501, 'NotImplemented', '로컬 Storage는 원시 본문 업로드만 흉내 낸다')
    const body = await readBody(req)
    if (row.file_size_limit && body.length > Number(row.file_size_limit))
      return storageError(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size')
    if (Array.isArray(row.allowed_mime_types) && row.allowed_mime_types.length && !row.allowed_mime_types.includes(mime))
      return storageError(res, 415, 'invalid_mime_type', `mime type ${mime} is not supported`)
    const f = fileOf(bucket, key)
    const exists = fs.existsSync(f)
    const upsert = req.method === 'PUT' || String(req.headers['x-upsert']) === 'true'
    if (exists && !upsert) return storageError(res, 409, 'Duplicate', 'The resource already exists')
    if (!exists && req.method === 'PUT') return storageError(res, 404, 'not_found', 'Object not found')
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    const now = new Date().toISOString()
    const prev = exists ? readMeta(bucket, key) : {}
    const meta = {
      id: prev.id ?? randomUUID(), created_at: prev.created_at ?? now, updated_at: now,
      metadata: { size: body.length, mimetype: mime, cacheControl: req.headers['cache-control'] ?? 'max-age=3600', lastModified: now },
    }
    fs.mkdirSync(path.dirname(metaOf(bucket, key)), { recursive: true })
    fs.writeFileSync(metaOf(bucket, key), JSON.stringify(meta))
    return send(res, 200, { Id: meta.id, Key: `${bucket}/${key}` })
  }
  // GET object/(authenticated/)<bucket>/<key> — 인증 다운로드(앱은 쓰지 않지만 확인용)
  if (req.method === 'GET' && rest.startsWith('object/')) {
    const [bucket, ...k] = rest.slice(7).replace(/^authenticated\//, '').split('/')
    const key = safeKey(k.join('/'))
    if (!key) return storageError(res, 400, 'InvalidKey', 'Invalid key')
    return serveFile(req, res, bucket, key)
  }
  return storageError(res, 404, 'NotImplemented', `로컬 Storage에 없는 경로: ${req.method} /storage/v1/${rest}`)
}

function readMeta(bucket, key) {
  try { return JSON.parse(fs.readFileSync(metaOf(bucket, key), 'utf8')) } catch { return {} }
}

function listObjects(bucket, { prefix = '', limit = 100, offset = 0, search = '', sortBy }) {
  const dirKey = String(prefix).split('/').filter(Boolean).join('/')
  if (dirKey && !safeKey(dirKey)) return []
  const dir = path.join(STORAGE_DIR, bucket, dirKey)
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  let items = entries
    .filter(e => !search || e.name.includes(search))
    .map(e => {
      if (e.isDirectory()) return { name: e.name, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null }
      const m = readMeta(bucket, dirKey ? `${dirKey}/${e.name}` : e.name)
      return { name: e.name, id: m.id ?? null, updated_at: m.updated_at ?? null, created_at: m.created_at ?? null, last_accessed_at: m.updated_at ?? null, metadata: m.metadata ?? null }
    })
  const col = sortBy?.column ?? 'name'
  const dirn = sortBy?.order === 'desc' ? -1 : 1
  items.sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * dirn)
  return items.slice(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 100))
}

const corsHeaders = () => ({
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'range, content-type',
  'access-control-expose-headers': 'content-length, content-range, accept-ranges',
})

function serveFile(req, res, bucket, key) {
  const f = fileOf(bucket, key)
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return storageError(res, 404, 'not_found', 'Object not found')
  const meta = readMeta(bucket, key)
  const size = fs.statSync(f).size
  const headers = { ...corsHeaders(), 'content-type': meta.metadata?.mimetype ?? 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'no-store' }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2])
    let end = range[1] && range[2] ? Number(range[2]) : size - 1
    start = Math.max(0, start); end = Math.min(size - 1, end)
    if (start > end) { res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` }); return res.end() }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
    return fs.createReadStream(f, { start, end }).pipe(res)
  }
  res.writeHead(200, { ...headers, 'content-length': size })
  fs.createReadStream(f).pipe(res)
}

// ── 가짜 Resend ──
async function handleResend(req, res, rest) {
  if (req.method !== 'POST' || rest !== 'emails') return send(res, 404, { name: 'not_found', message: `가짜 Resend에 없는 경로: ${rest}` })
  if (!/^Bearer .+/.test(req.headers.authorization ?? '')) return send(res, 401, { name: 'missing_api_key', message: 'Missing API key' })
  const body = json(await readBody(req))
  if (!body || !body.from || !body.to || !body.subject) return send(res, 422, { name: 'validation_error', message: 'from·to·subject가 필요하다' })
  const id = randomUUID()
  let mails = []
  try { mails = JSON.parse(fs.readFileSync(MAILS, 'utf8')) } catch { /* 처음 */ }
  mails.push({ id, received_at: new Date().toISOString(), body })
  fs.writeFileSync(MAILS, JSON.stringify(mails, null, 2))
  console.log(`[resend-fake] 기록 ${id} to=${JSON.stringify(body.to)} subject=${JSON.stringify(body.subject)}`)
  return send(res, 200, { id })
}

// ── PostgREST 프록시 ──
function proxyRest(req, res, rest, search) {
  const headers = { ...req.headers }
  delete headers.host
  delete headers.connection
  const up = http.request(`${PGRST}/${rest}${search}`, { method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers)
    r.pipe(res)
  })
  up.on('error', (e) => send(res, 502, { message: `PostgREST 연결 실패: ${e.message}` }))
  req.pipe(up)
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url ?? '/', 'http://local')
  const p = u.pathname
  try {
    if (p.startsWith('/rest/v1/')) return proxyRest(req, res, p.slice('/rest/v1/'.length), u.search)
    if (p === '/rest/v1') return proxyRest(req, res, '', u.search)
    if (p.startsWith('/storage/v1/')) return await handleStorage(req, res, p.slice('/storage/v1/'.length), u.searchParams)
    if (p.startsWith('/resend/')) return await handleResend(req, res, p.slice('/resend/'.length))
    if (p === '/__local/health') return send(res, 200, { ok: true })
    if (p === '/__local/mails') {
      let mails = []
      try { mails = JSON.parse(fs.readFileSync(MAILS, 'utf8')) } catch { /* 없음 */ }
      return send(res, 200, mails)
    }
    return send(res, 404, { message: `로컬 게이트웨이에 없는 경로: ${p}` })
  } catch (e) {
    console.error('[gateway] 오류', req.method, p, e)
    if (!res.headersSent) send(res, 500, { statusCode: '500', error: 'internal', message: String(e?.message ?? e) })
  }
})
server.listen(PORT, '127.0.0.1', () => console.log(`[gateway] http://127.0.0.1:${PORT} (PostgREST ${PGRST}, data ${DATA})`))
