import { NextResponse } from 'next/server'
import { ADMIN_COOKIE } from '@/lib/auth'

/** 관리자 로그아웃: 쿠키 즉시 만료. 공용 PC에서 자리를 떠날 때 세션을 끊는 용도.
 *  (HMAC 토큰은 서버측 저장소가 없어 쿠키 제거가 곧 로그아웃 — 전체 무효화는 SESSION_SECRET 회전) */
export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
