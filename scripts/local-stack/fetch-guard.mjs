// scripts/local-stack/fetch-guard.mjs — 로컬 스택으로 띄운 앱 프로세스에 NODE_OPTIONS=--import로 먼저 실린다.
//
//  1) lib/mail.ts는 https://api.resend.com/emails를 코드에 박아 두었다(설정으로 못 바꾼다). 그 요청만 로컬 게이트웨이의
//     가짜 Resend(/resend/emails)로 돌린다 — 앱 코드는 고치지 않는다.
//  2) 그 밖에 localhost가 아닌 곳으로 가는 fetch·http(s).request는 **전부 막는다**(예외를 던진다). 운영 Supabase 주소가
//     어디서 새어 들어오더라도 요청이 나가지 않는다.
// Next는 자기 fetch 패치를 이 함수 위에 씌우므로(앱 라우터) 앱의 모든 서버 fetch가 여기를 지난다.
import http from 'node:http'
import https from 'node:https'

const GATEWAY = process.env.LOCAL_STACK_GATEWAY_URL
if (!GATEWAY) throw new Error('[local-stack fetch-guard] LOCAL_STACK_GATEWAY_URL이 없다')

const LOCAL = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0'])
const block = (where) => {
  const msg = `[local-stack fetch-guard] 외부 요청 차단: ${where}`
  console.error(msg)
  return new Error(msg)
}

const origFetch = globalThis.fetch
globalThis.fetch = async function guardedFetch(input, init) {
  const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
  let u
  try { u = new URL(raw) } catch { return origFetch(input, init) }
  if (u.protocol === 'data:' || u.protocol === 'blob:') return origFetch(input, init)
  if (u.hostname === 'api.resend.com') {
    const target = `${GATEWAY}/resend${u.pathname.replace(/^\/+/, '/')}${u.search}`
    console.log(`[local-stack fetch-guard] Resend → ${target}`)
    return origFetch(input instanceof Request ? new Request(target, input) : target, init)
  }
  if (!LOCAL.has(u.hostname)) throw block(u.origin)
  return origFetch(input, init)
}

function hostOf(args) {
  const a = args[0]
  if (typeof a === 'string' || a instanceof URL) { try { return new URL(String(a)).hostname } catch { return '?' } }
  if (a && typeof a === 'object') return a.hostname ?? (a.host ? String(a.host).replace(/:\d+$/, '') : 'localhost')
  return 'localhost'
}
for (const mod of [http, https]) {
  for (const fn of ['request', 'get']) {
    const orig = mod[fn]
    mod[fn] = function guarded(...args) {
      const h = hostOf(args)
      if (!LOCAL.has(h)) throw block(`${mod === https ? 'https' : 'http'}://${h}`)
      return orig.apply(this, args)
    }
  }
}

if (!process.env.__LOCAL_STACK_GUARD_ANNOUNCED) {
  process.env.__LOCAL_STACK_GUARD_ANNOUNCED = '1'
  console.log(`[local-stack fetch-guard] 활성(pid ${process.pid}) — localhost 밖 요청 차단, Resend → ${GATEWAY}/resend`)
}
