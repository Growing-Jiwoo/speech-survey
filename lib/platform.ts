// lib/platform.ts — User-Agent 기반 플랫폼 판별과 안내 문구(순수 함수, node 테스트 가능).
export type Platform = 'ios' | 'android' | 'other'

/**
 * UA 문자열과 터치 지점 수(`navigator.maxTouchPoints`)로 대략적인 플랫폼을 판별한다(마이크 권한 안내 분기용 — 정밀 판별 목적 아님).
 * iPadOS 13+ Safari는 맥과 **똑같은** UA(「Mobile」도 없다)를 보내고, 큰 화면의 안드로이드 태블릿 크롬도 기본이 데스크톱 UA라
 * UA만으로는 가릴 수 없다 — 맥·리눅스 UA인데 터치가 되면 태블릿으로 본다. 종전에는 UA만 봐서 아이패드가 `other`로 떨어져
 * 아이패드 설정 경로 대신 일반 안내가 나왔다(2026-10-21 태블릿 점검).
 */
export function detectPlatform(ua: string, touchPoints = 0): Platform {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/macintosh/i.test(ua) && (touchPoints > 1 || /mobile/i.test(ua))) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/linux/i.test(ua) && !/cros/i.test(ua) && touchPoints > 1) return 'android'
  return 'other'
}

/**
 * 마이크 권한이 거부됐을 때 해제 방법 안내 — 플랫폼마다 절차가 달라 분기한다.
 * (현장 교사가 헤매지 않도록 구체 경로를 준다.)
 */
export function micPermissionHint(ua: string, touchPoints = 0): string {
  switch (detectPlatform(ua, touchPoints)) {
    case 'ios':
      return '아이폰·아이패드: Safari 주소창의 「가가」(aA) 버튼 → 웹 사이트 설정 → 마이크를 "허용"으로 바꾼 뒤 이 페이지를 새로고침해 주세요. 메뉴가 없으면 설정 앱 → Safari → 마이크에서 바꿀 수 있어요.'
    case 'android':
      return '안드로이드 크롬: 주소창 왼쪽의 자물쇠(또는 ⓘ) → 권한 → 마이크를 "허용"으로 바꿔 주세요.'
    default:
      return '브라우저 주소창의 사이트 설정에서 마이크를 "허용"으로 바꾼 뒤 다시 시도해 주세요.'
  }
}

/** 지금 이 기기의 안내(브라우저 전용) — 화면 코드가 navigator를 직접 읽지 않게 한 곳에 둔다 */
export function micPermissionHintHere(): string {
  return typeof navigator === 'undefined' ? micPermissionHint('') : micPermissionHint(navigator.userAgent, navigator.maxTouchPoints)
}
