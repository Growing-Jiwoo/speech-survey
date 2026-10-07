// lib/admin-next.ts — 관리자 로그인 뒤 돌아갈 경로(?next=) 검증. proxy가 로그인으로 보낼 때 원래 경로를 싣는다.

/** 로그인 뒤 갈 곳 — **같은 출처의 관리자 경로만** 허용한다(`//evil.com`·`/\\evil.com` 같은 열린 리다이렉트 차단).
 *  아니면 목록(/admin)으로 간다. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/admin') || next.startsWith('/admin/login')) return '/admin'
  if (/^\/admin[^/?#]/.test(next)) return '/admin'      // /adminX 같은 다른 경로
  if (/[\\]|\/\//.test(next)) return '/admin'          // 역슬래시·이중 슬래시
  return next
}
