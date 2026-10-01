import { describe, it, expect } from 'vitest'
import { approvalNoticeText, birthLabel, contactLabel, fmtDuration, gradeClassLabel, pad2, reportDateLabel, semesterOf, sheetDateLabel } from '@/lib/format'
import { APPLY_CHECKS, RETENTION_LABEL, SURVEY_NOTICE } from '@/lib/consent'

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

describe('reportDateLabel / birthLabel / semesterOf — 결과보고서 표기', () => {
  it('검사일은 KST 기준, 월·일 두 자리 (담당자 양식 2026-09-28)', () => {
    expect(reportDateLabel('2026-09-19T01:00:00.000Z')).toBe('2026. 09. 19.')
    // KST 자정 직전·직후 — UTC로 자르면 하루가 밀린다
    expect(reportDateLabel('2026-08-07T14:59:00.000Z')).toBe('2026. 08. 07.')
    expect(reportDateLabel('2026-08-07T15:00:00.000Z')).toBe('2026. 08. 08.')
  })
  it('생년월일 YYMMDD → 2019. 03. 15. (세기는 20으로 고정)', () => {
    expect(birthLabel('190315')).toBe('2019. 03. 15.')
    expect(birthLabel('2019-03-15')).toBe('2019-03-15')   // 저장형이 아니면 손대지 않는다
  })
  // 사용자 확정(2026-09-28) — 담당자 회신 아님. 학기별 양식이 생기면 이 규칙은 없어져야 한다.
  it('학기: 3~8월 → 1학기, 9~2월 → 2학기 (KST)', () => {
    expect(semesterOf('2026-03-02T01:00:00.000Z')).toBe(1)
    expect(semesterOf('2026-08-31T01:00:00.000Z')).toBe(1)
    expect(semesterOf('2026-09-01T01:00:00.000Z')).toBe(2)
    expect(semesterOf('2027-02-27T01:00:00.000Z')).toBe(2)
    expect(semesterOf('2026-08-31T15:00:00.000Z')).toBe(2)   // KST 9월 1일 00:00
  })
})

describe('approvalNoticeText', () => {
  const V = { teacherName: '김선생', schoolName: '서울가곡초등학교', grade: 1, classNo: 3,
    code: 'SGT2E4', surveyUrl: 'https://x.kr' }

  it('교사·학교·학급·코드·검사 주소와 시작 안내를 모두 담는다', () => {
    const t = approvalNoticeText(V)
    expect(t).toContain('김선생 선생님')
    expect(t).toContain('서울가곡초등학교 1-3')
    expect(t).toContain('학급 코드: SGT2E4')
    expect(t).toContain('검사 주소: https://x.kr')
    expect(t).toMatch(/학급 코드를 입력/)
  })

  it('[REGRESSION] 코드를 보관하라고 말한다 — 재발급 경로가 없어 잃으면 담당자 문의뿐이다', () => {
    expect(approvalNoticeText(V)).toContain('보관')
  })

  it('평문이다 — HTML 태그가 섞이지 않는다(카톡·문자에 그대로 붙인다)', () => {
    expect(approvalNoticeText(V)).not.toMatch(/[<>]/)
  })
})

// 승인 메일에서 뺀 검사 안내는 **신청 화면에 있어야 한다** — 두 곳 다 없으면 교사는 소요
// 시간도 준비물도 모른 채 검사를 시작한다. 상수를 lib으로 옮긴 이유가 이 핀이다.
describe('신청 화면 안내·동의 문구(lib/consent)', () => {
  it('[REGRESSION] 검사 안내가 소요 시간·준비물·녹음 취급·중단 가능을 말한다', () => {
    const all = SURVEY_NOTICE.join(' ')
    expect(all).toContain('약 5분')
    expect(all).toContain('헤드셋 마이크')
    expect(all).toContain('녹음')
    expect(all).toContain('멈출 수 있습니다')
    // 담당자 확정(2026-09-21) — 읽기 자체가 어려운 학생의 경로까지 안내에 넣기로 했다.
    expect(all).toContain('모르겠어요')
  })

  it('[REGRESSION] 동의 3개 중 하나는 법정대리인 동의 조건이다', () => {
    expect(APPLY_CHECKS).toHaveLength(3)
    // 문구는 「보호자 서면 동의」→「법정대리인의 동의」로 바뀌었다(담당자 확정 2026-09-21).
    // 수단(서면·전자)은 학교가 정하므로 못 박지 않고, **법정대리인 동의**라는 요건만 핀한다.
    expect(APPLY_CHECKS.some(c => c.label.includes('법정대리인의 동의'))).toBe(true)
  })

  it('[REGRESSION] 개인정보 동의는 주체를 밝힌다 — 「선생님의」가 없으면 학생 명단 동의로 읽힌다', () => {
    expect(APPLY_CHECKS[0].label).toContain('선생님의')
  })

  it('[REGRESSION] 보관 기간은 고지 문구와 같은 상수를 쓴다', () => {
    expect(APPLY_CHECKS[0].note).toContain(RETENTION_LABEL)
  })

  it('체크 2번은 화면의 검사 안내를 가리킨다 — 안내를 지우면 가짜 동의가 된다', () => {
    expect(APPLY_CHECKS[1].label).toContain('위 검사 안내')
    expect(SURVEY_NOTICE.length).toBeGreaterThan(0)
  })
})
