import { describe, it, expect } from 'vitest'
import { detectPlatform, micPermissionHint } from '@/lib/platform'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1'
// 실제 iPadOS 17 Safari의 기본 UA — 맥과 같고 「Mobile」도 없다. 위 IPADOS처럼 Mobile이 붙은 UA만 시험해서 놓쳤다(2026-10-21 점검)
const IPAD_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
// 큰 화면 안드로이드 태블릿 크롬의 기본(데스크톱 사이트) UA
const ANDROID_TAB_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const CHROMEBOOK = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

describe('detectPlatform', () => {
  it('iPhone → ios', () => expect(detectPlatform(IPHONE)).toBe('ios'))
  it('데스크톱 UA로 위장한 iPadOS(터치) → ios', () => expect(detectPlatform(IPADOS)).toBe('ios'))
  it('Android → android', () => expect(detectPlatform(ANDROID)).toBe('android'))
  it('데스크톱 Safari → other', () => expect(detectPlatform(DESKTOP)).toBe('other'))
  it('iPadOS Safari 기본 UA + 터치 → ios', () => expect(detectPlatform(IPAD_SAFARI, 5)).toBe('ios'))
  it('같은 UA라도 터치가 없으면(맥) → other', () => expect(detectPlatform(IPAD_SAFARI, 0)).toBe('other'))
  it('데스크톱 UA의 안드로이드 태블릿 + 터치 → android', () => expect(detectPlatform(ANDROID_TAB_DESKTOP, 5)).toBe('android'))
  it('터치 크롬북은 안드로이드로 보지 않는다', () => expect(detectPlatform(CHROMEBOOK, 10)).toBe('other'))
})

describe('micPermissionHint — 플랫폼별 해제 절차 안내', () => {
  it('iOS는 설정 앱 경로를 안내', () => expect(micPermissionHint(IPHONE)).toContain('설정 앱'))
  it('Android는 주소창 아이콘 → 권한 경로를 안내', () => expect(micPermissionHint(ANDROID)).toContain('권한에서 마이크'))
  it('Android는 Chrome 앱 자체 권한 창도 안내', () => expect(micPermissionHint(ANDROID)).toContain('앱 사용 중에만 허용'))
  // 두 번 거부한 탭은 새로고침해도 다시 묻지 않는다 — 새 탭이 해법(iPadOS 26 Safari, 2026-10-21)
  it('아이패드(데스크톱 UA)도 iOS 안내 — 새 탭으로 다시 열기', () => expect(micPermissionHint(IPAD_SAFARI, 5)).toContain('새 탭'))
  it('그 외는 일반 안내', () => expect(micPermissionHint(DESKTOP)).toContain('사이트 설정'))
})
