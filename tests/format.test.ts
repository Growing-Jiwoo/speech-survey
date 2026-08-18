import { describe, it, expect } from 'vitest'
import { approvalNoticeText, contactLabel, fmtDuration, gradeClassLabel, pad2, sheetDateLabel, gradeClassLines } from '@/lib/format'

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
  it('아무것도 없으면 안내 문구', () => {
    expect(contactLabel(null, null)).toBe('연락처 없음')
    expect(contactLabel('', '')).toBe('연락처 없음')
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

// 검사지의 「학년」 칸은 원래 학년만 적는 자리인데 이 앱은 반까지 함께 찍는다.
// 한 줄로 뭉치면 인쇄물만 보고는 무엇이 학년이고 무엇이 반인지 알 수 없다.
describe('gradeClassLines — 검사지 학년 칸(두 줄)', () => {
  it('학년을 온전히 적고 반을 괄호로 덧붙인다', () => {
    expect(gradeClassLines(1, 2)).toEqual(['1학년', '(2반)'])
    expect(gradeClassLines(6, 12)).toEqual(['6학년', '(12반)'])
  })
  it('반 0은 학년당 한 학급인 학교 — 번호 대신 단일학급으로 적는다', () => {
    expect(gradeClassLines(1, 0)).toEqual(['1학년', '(단일학급)'])
  })
  // 화면은 좁은 표 칸에 들어가야 해 한 줄 표기를 그대로 쓴다. 둘을 같은 함수로 합치면
  // 한쪽 요구가 다른 쪽을 망가뜨린다.
  it('화면용 한 줄 표기(gradeClassLabel)와 별개다', () => {
    expect(gradeClassLabel(1, 2)).toBe('1-2')
    expect(gradeClassLines(1, 2).join('')).not.toBe(gradeClassLabel(1, 2))
  })
})

describe('approvalNoticeText', () => {
  const V = { teacherName: '김선생', schoolName: '서울가곡초등학교', code: 'SGT2E4', surveyUrl: 'https://x.kr' }

  it('교사·학교·코드·검사 주소와 시작 안내를 모두 담는다', () => {
    const t = approvalNoticeText(V)
    expect(t).toContain('김선생 선생님')
    expect(t).toContain('서울가곡초등학교')
    expect(t).toContain('학급 코드: SGT2E4')
    expect(t).toContain('검사 주소: https://x.kr')
    expect(t).toMatch(/시작 화면에서 이 코드를 입력/)
  })

  it('평문이다 — HTML 태그가 섞이지 않는다(카톡·문자에 그대로 붙인다)', () => {
    expect(approvalNoticeText(V)).not.toMatch(/[<>]/)
  })
})
