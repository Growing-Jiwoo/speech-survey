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
 *
 * iOS는 종전 안내(주소창 「가가」 → 웹 사이트 설정 → 마이크, 새로고침)가 iPadOS 26 Safari와 맞지 않았다 — 주소창 메뉴에 마이크
 * 항목이 없고, [취소]를 두 번 누르면 **그 탭에서는** 새로고침해도, 설정 앱에서 「허용」으로 바꿔도 다시 묻지 않고 바로 거부했다.
 * 새 탭에서 열면 다시 묻는다(아이패드 시뮬레이터, 2026-10-21 점검). 진행 상태는 이 기기에 남아 새 탭에서 이어 할 수 있다
 * (먼저 열린 탭은 useOtherTabGuard가 막는다). 설정 앱 경로는 iOS 18부터 「앱」 아래로 옮겨져 버전을 타지 않게 적는다.
 *
 * 안드로이드는 창이 **두 번** 뜬다 — 사이트 권한(「사이트에 있는 동안 허용」)과 Chrome 앱 자체의 마이크 권한(「앱 사용 중에만
 * 허용」). 사이트만 허용된 상태면 위쪽에 작은 [계속] 안내가 뜨는데 10초쯤 지나면 저절로 사라지며 거부로 끝났다. 주소창 왼쪽
 * 아이콘(자물쇠는 Chrome 117부터 다른 모양) → 권한에서 마이크를 켜면 새로고침 없이 다음 누름부터 된다(Android 16 · Chrome 133
 * 에뮬레이터, 2026-10-21 점검 — 버튼 이름은 한국어 화면에서 확인).
 */
export function micPermissionHint(ua: string, touchPoints = 0): string {
  switch (detectPlatform(ua, touchPoints)) {
    case 'ios':
      return '아이폰·아이패드: 버튼을 다시 누른 뒤 마이크 창에서 [허용]을 눌러 주세요. 창이 뜨지 않으면 이 탭을 닫고 새 탭에 주소를 다시 입력해 주세요. 하던 검사는 이어서 할 수 있어요. 그래도 안 되면 설정 앱에서 Safari → 마이크를 "허용"으로 바꿔 주세요.'
    case 'android':
      return '안드로이드: 버튼을 다시 누른 뒤 뜨는 창마다 [사이트에 있는 동안 허용]·[앱 사용 중에만 허용]을 눌러 주세요. 화면 위쪽에 [계속]이 뜨면 먼저 눌러 주세요. 창이 뜨지 않으면 주소창 왼쪽 아이콘 → 권한에서 마이크를 켜 주세요.'
    default:
      return '브라우저 주소창의 사이트 설정에서 마이크를 "허용"으로 바꾼 뒤 다시 시도해 주세요.'
  }
}

/** 지금 이 기기의 안내(브라우저 전용) — 화면 코드가 navigator를 직접 읽지 않게 한 곳에 둔다 */
export function micPermissionHintHere(): string {
  return typeof navigator === 'undefined' ? micPermissionHint('') : micPermissionHint(navigator.userAgent, navigator.maxTouchPoints)
}
