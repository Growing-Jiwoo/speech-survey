import { describe, it, expect } from 'vitest'
import { contactLabel, fmtDuration, gradeClassLabel, pad2, sheetDateLabel } from '@/lib/format'

describe('fmtDuration — 초 → m:ss (미상은 —)', () => {
  it('정상 값', () => {
    expect(fmtDuration(0)).toBe('0:00')
    expect(fmtDuration(5)).toBe('0:05')
    expect(fmtDuration(65)).toBe('1:05')
    expect(fmtDuration(599.9)).toBe('9:59') // 내림 — 반올림으로 초가 60이 되지 않게
  })
  it('null·NaN·음수·Infinity는 — (길이 미상 표기)', () => {
    expect(fmtDuration(null)).toBe('—')
    expect(fmtDuration(undefined)).toBe('—')
    expect(fmtDuration(Number.NaN)).toBe('—')
    expect(fmtDuration(-1)).toBe('—')
    expect(fmtDuration(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('pad2', () => {
  it('두 자리 0 패딩', () => {
    expect(pad2(3)).toBe('03')
    expect(pad2(12)).toBe('12')
  })
})

describe('gradeClassLabel (학년·반 표기)', () => {
  it('일반 학급은 "학년-반"', () => {
    expect(gradeClassLabel(1, 3)).toBe('1-3')
    expect(gradeClassLabel(6, 12)).toBe('6-12')
  })
  it('반 0은 단일학급(반 없음)을 뜻한다', () => {
    expect(gradeClassLabel(1, 0)).toBe('1학년 단일학급')
  })
})

describe('contactLabel (담임 연락처 표기)', () => {
  it('전화·이메일이 모두 있으면 함께 보여준다', () => {
    expect(contactLabel('010-1234-5678', 'a@b.com')).toBe('010-1234-5678 · a@b.com')
  })
  it('하나만 있으면 그것만 보여준다', () => {
    expect(contactLabel('010-1234-5678', null)).toBe('010-1234-5678')
    expect(contactLabel(null, 'a@b.com')).toBe('a@b.com')
  })
  it('분리 도입 전 수집분은 legacy 값으로 폴백한다', () => {
    expect(contactLabel(null, null, '010-0000-0000')).toBe('010-0000-0000')
  })
  it('아무것도 없으면 안내 문구', () => {
    expect(contactLabel(null, null)).toBe('연락처 없음')
    expect(contactLabel('', '', '')).toBe('연락처 없음')
  })
})

describe('sheetDateLabel (검사일 표기)', () => {
  it('서버 타임존과 무관하게 KST 기준 날짜를 낸다', () => {
    // 08:00 KST 검사 = 전날 23:00 UTC. 타임존을 고정하지 않으면 UTC 서버에서 하루 전으로 찍힌다.
    expect(sheetDateLabel('2026-08-06T23:00:00.000Z')).toBe('2026. 8. 7.')
    // KST 자정 직전
    expect(sheetDateLabel('2026-08-07T14:59:00.000Z')).toBe('2026. 8. 7.')
    // KST 자정 직후 → 다음 날
    expect(sheetDateLabel('2026-08-07T15:00:00.000Z')).toBe('2026. 8. 8.')
  })
})
