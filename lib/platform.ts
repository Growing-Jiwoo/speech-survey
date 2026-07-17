// lib/platform.ts — User-Agent 기반 플랫폼 판별과 안내 문구(순수 함수, node 테스트 가능).
export type Platform = 'ios' | 'android' | 'other'

/** UA 문자열에서 대략적인 플랫폼을 판별한다(마이크 권한 안내 분기용 — 정밀 판별 목적 아님). */
export function detectPlatform(ua: string): Platform {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // iPadOS 13+ Safari는 데스크톱 UA로 위장하므로 Macintosh + 터치를 iOS로 본다.
  if (/macintosh/i.test(ua) && /mobile|touch/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

/**
 * 마이크 권한이 거부됐을 때 해제 방법 안내 — 플랫폼마다 절차가 달라 분기한다.
 * (현장 교사가 헤매지 않도록 구체 경로를 준다.)
 */
export function micPermissionHint(ua: string): string {
  switch (detectPlatform(ua)) {
    case 'ios':
      return '아이폰·아이패드: 설정 앱 → Safari → 카메라·마이크를 "허용"으로 바꾼 뒤 이 페이지를 새로고침해 주세요.'
    case 'android':
      return '안드로이드 크롬: 주소창 왼쪽의 자물쇠(또는 ⓘ) → 권한 → 마이크를 "허용"으로 바꿔 주세요.'
    default:
      return '브라우저 주소창의 사이트 설정에서 마이크를 "허용"으로 바꾼 뒤 다시 시도해 주세요.'
  }
}
