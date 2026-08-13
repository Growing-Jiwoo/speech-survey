// lib/request.ts — API 라우트 공용 요청 헬퍼(서버 전용).
// 보안 규칙(IP 판별)과 검증 상수의 단일 소스 — 라우트별 복사본이 서로 어긋나는 드리프트를 막는다.
import { NextResponse } from 'next/server'

/**
 * 레이트리밋·브루트포스 키용 클라이언트 IP.
 * 플랫폼(Vercel)이 주입하는 x-real-ip 우선(클라이언트 위조 불가).
 * 없으면 x-forwarded-for의 마지막(가장 신뢰 가능한) 홉. 둘 다 없으면 'local'.
 * ※ x-forwarded-for 첫 IP는 클라이언트가 위조 가능하므로 키로 쓰지 않는다. (PR #16 참고)
 * ※ Vercel 외 인프라로 이전하면 x-real-ip도 위조 가능해지므로 프록시 설정을 재검토할 것.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const hops = req.headers.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean)
  return hops?.[hops.length - 1] ?? 'local'
}

/** 세션 id 등 UUID 경로/필드의 형식 선검증용(DB 오류 경로 진입 전에 400으로 차단). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `{ error }` JSON 에러 응답 축약. 메시지는 내부 정보 없는 사용자용 문구만 담을 것. */
export const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status })

/** best-effort 인메모리 IP 레이트리미터. 서버리스에서는 인스턴스별 독립이라 완벽한
 *  전역 방어는 아니며, 스팸성 요청에 마찰을 주는 목적이다. sweepEvery번째 요청마다
 *  만료 키를 걷어내 장수 인스턴스의 메모리 단조 증가를 막는다. */
export function createRateLimiter(limit: number, windowMs: number, sweepEvery = 100) {
  const hits = new Map<string, number[]>()
  let counter = 0
  return function rateLimited(ip: string): boolean {
    const now = Date.now()
    if (++counter % sweepEvery === 0) {
      for (const [key, times] of hits) {
        const alive = times.filter(t => now - t < windowMs)
        if (alive.length === 0) hits.delete(key)
        else hits.set(key, alive)
      }
    }
    const recent = (hits.get(ip) ?? []).filter(t => now - t < windowMs)
    recent.push(now)
    hits.set(ip, recent)
    return recent.length > limit
  }
}
