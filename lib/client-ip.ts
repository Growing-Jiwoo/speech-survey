/** 신뢰 가능한 리버스 프록시(예: Vercel 엣지) *하나*만 앞단에 있다고 가정한다.
 *  클라이언트가 x-forwarded-for 앞쪽에 임의 IP를 얼마든지 덧붙일 수 있으므로 첫 값은 절대
 *  신뢰하지 않는다 — 프록시가 직접 덧붙인 마지막 값만 신뢰한다. x-real-ip는 프록시가 항상
 *  덮어쓴다(클라이언트가 보낸 값을 무시)는 전제하에 있으면 우선한다.
 *
 *  ⚠️ 이 함수로 얻은 IP를 신뢰하는 로그인 레이트리밋의 안전성은 위 전제에 전적으로 의존한다.
 *  배포 플랫폼이 x-real-ip/x-forwarded-for를 실제로 덮어쓰는지 실측으로 1회 확인할 것.
 *  앞단에 프록시가 하나 더(예: Cloudflare→Vercel) 붙으면 "마지막 = 신뢰 프록시" 가정이 깨지므로
 *  이 로직을 반드시 재검토해야 한다. */
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
