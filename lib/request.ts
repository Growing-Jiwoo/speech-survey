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

/** `POST /api/sessions`(세션 생성) 전용 레이트리밋 정책값.
 *  방어 대상은 **스팸 세션 행 생성**이라 아래 검증 상한보다 훨씬 빡빡하게 잡는다.
 *  (사용자 확정 2026-08-13 — 임상 규칙 아님, 개발 판단) */
export const PUBLIC_RATE_LIMIT = 20 // IP당 시간창 내 허용 요청 수
export const PUBLIC_RATE_WINDOW_MS = 10 * 60_000

/** `POST /api/sessions/verify-code`(코드 확인) 전용 레이트리밋 상한 —
 *  `PUBLIC_RATE_LIMIT`과 값을 **일부러 분리**한다. 두 라우트는 위협 모델이 다르다:
 *  - verify-code의 방어 대상은 코드 열거인데, 코드 공간이 31^6 ≈ 8.8억이라 분당 수백 건으로도
 *    사실상 뚫리지 않는다 — 여기서 레이트리밋은 마찰일 뿐, 진짜 방어는 코드 공간 크기다.
 *  - 반면 clientIp는 학교 건물 전체가 NAT로 IP 하나를 공유하고, 확인 모달에서 [아니에요]를
 *    누르거나 코드를 잘못 입력해 재시도할 때마다 이 상한을 추가로 소비한다. 게다가 여러 PC로
 *    동시에 검사를 진행하는 것이 이 검사 흐름의 전제(학급 코드 스펙, docs/superpowers/specs/
 *    2026-08-13-admin-only-scoring-and-class-codes-design.md)라, 낮은 상한은 실제 검사를
 *    막는 장애가 된다. 학교 한 건물에서 여러 PC가 하루 종일 검사해도 넉넉하도록 크게 잡는다.
 *  나중에 "일관성" 명목으로 두 상한을 다시 합치지 말 것 — 위 이유로 의도된 차이다.
 *  (사용자 확정 2026-08-13 — 임상 규칙 아님, 개발 판단) */
export const VERIFY_CODE_RATE_LIMIT = 300 // IP당 시간창 내 허용 요청 수
export const VERIFY_CODE_RATE_WINDOW_MS = 10 * 60_000

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
