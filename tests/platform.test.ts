import { describe, it, expect } from 'vitest'
import { detectPlatform, micPermissionHint } from '@/lib/platform'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Mobile Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1'

describe('detectPlatform', () => {
  it('iPhone → ios', () => expect(detectPlatform(IPHONE)).toBe('ios'))
  it('데스크톱 UA로 위장한 iPadOS(터치) → ios', () => expect(detectPlatform(IPADOS)).toBe('ios'))
  it('Android → android', () => expect(detectPlatform(ANDROID)).toBe('android'))
  it('데스크톱 Safari → other', () => expect(detectPlatform(DESKTOP)).toBe('other'))
})

describe('micPermissionHint — 플랫폼별 해제 절차 안내', () => {
  it('iOS는 설정 앱 경로를 안내', () => expect(micPermissionHint(IPHONE)).toContain('설정 앱'))
  it('Android는 주소창 자물쇠 경로를 안내', () => expect(micPermissionHint(ANDROID)).toContain('자물쇠'))
  it('그 외는 일반 안내', () => expect(micPermissionHint(DESKTOP)).toContain('사이트 설정'))
})
