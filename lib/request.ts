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
