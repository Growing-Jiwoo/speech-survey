/** 신뢰 가능한 리버스 프록시(예: Vercel 엣지) 하나만 앞단에 있다고 가정한다.
 *  클라이언트가 x-forwarded-for 앞쪽에 임의 IP를 얼마든지 덧붙일 수 있으므로 첫 값은 절대
 *  신뢰하지 않는다 — 프록시가 직접 덧붙인 마지막 값만 신뢰한다. x-real-ip는 프록시가 항상
 *  덮어쓰므로(클라이언트가 보낸 값을 무시) 있으면 그 값을 우선한다. */
export function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const ips = xff.split(',').map(s => s.trim()).filter(Boolean)
    if (ips.length) return ips[ips.length - 1]
  }
  return 'local'
}
