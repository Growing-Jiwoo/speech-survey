// lib/format.ts — 표시용 포맷 공용 헬퍼(순수 함수).
export const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * 초 → "m:ss". null·NaN·음수는 '—'(길이 미상)로 표기한다.
 * 오디오 플레이어의 시간 표시와 결과지의 녹음 길이 컬럼이 공유한다.
 */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
  return `${Math.floor(sec / 60)}:${pad2(Math.floor(sec % 60))}`
}

/** 반 선택지의 화면 상한. `classNoSchema`(lib/schema.ts)는 DB·검증용으로 0~99까지 넓게 열어
 *  두지만, 드롭다운은 실사용 범위에 맞춰 이만큼만 보여준다. */
export const MAX_CLASS_NO = 20

/** 반 드롭다운 선택지: 단일학급(반 없음) = 0, 그 외 1~MAX_CLASS_NO.
 *  관리자 발급 화면(CodeIssuer)과 교사 신청 화면(/apply)이 **같은 스키마**(classCodeFields)로
 *  들어가므로 선택지도 한 곳에서 나온다 — 한쪽만 늘리면 같은 학급을 한 화면에서는 만들 수
 *  있고 다른 화면에서는 못 만드는 일이 생긴다. */
export const CLASS_OPTIONS = [
  { value: '0', label: '단일학급 (반 없음)' },
  ...Array.from({ length: MAX_CLASS_NO }, (_, i) => ({ value: String(i + 1), label: `${i + 1}반` })),
]

/** 학년·반 표기. 반 0은 "단일학급(반 없음)" — 학년당 한 학급인 학교를 위해 010에서 허용했다. */
export function gradeClassLabel(grade: number, classNo: number): string {
  return classNo === 0 ? `${grade}학년 단일학급` : `${grade}-${classNo}`
}

/**
 * 검사지 PDF의 「학년」 칸 표기 — **두 줄**로 나눈다: `1학년` / `(2반)`.
 *
 * 화면용 `gradeClassLabel`과 일부러 다르다. 검사지의 「학년」 칸은 원래 학년만 적는 자리인데
 * 이 앱은 반까지 알고 있어 함께 찍는다. 한 줄에 `1-2`로 뭉치면 **무엇이 학년이고 무엇이
 * 반인지 인쇄물만 보고는 알 수 없다** — 임상 문서라 읽는 사람이 앱을 모른다.
 * 학년을 먼저 온전히 적고 반을 괄호로 덧붙이면 칸의 원래 의미(학년)가 유지된다
 * (사용자 확정 2026-08-15).
 *
 * 반이 0이면 학년당 한 학급인 학교다 — 반 번호가 없으므로 `(단일학급)`으로 적는다.
 */
export function gradeClassLines(grade: number, classNo: number): [string, string] {
  return [`${grade}학년`, classNo === 0 ? '(단일학급)' : `(${classNo}반)`]
}

/** 담임 연락처 표기. 전화·이메일 중 있는 값만 이어붙이고, 둘 다 없으면 안내 문구를 낸다. */
export function contactLabel(
  phone: string | null | undefined,
  email: string | null | undefined,
): string {
  const parts = [phone, email].filter((v): v is string => !!v)
  if (parts.length > 0) return parts.join(' · ')
  return '연락처 없음'
}

/**
 * 검사일 표기(KST 고정). 검사는 한국 학교에서 이뤄지는데 서버(Vercel)는 UTC라,
 * 타임존을 고정하지 않으면 아침 검사(08:00 KST = 전날 23:00 UTC)가 공식 결과지에
 * 하루 전으로 찍힌다. 화면은 브라우저 타임존이라 드러나지 않고 PDF에서만 어긋난다.
 */
export function sheetDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
}

/**
 * 승인 안내 문구(평문) — 관리자가 [안내 문구 복사]로 교사에게 직접 전달하는 예비 경로.
 * 메일이 실패했거나 발송 여부를 알 수 없을 때(`already:true`) 교사가 코드를 받는 **유일한** 길이다.
 *
 * ⚠️ `lib/mail.ts`의 `approvedMail`과 **같은 내용을 유지할 것** — 교사가 메일로 받든 관리자가
 * 붙여넣어 전하든 같은 안내를 읽어야 한다. 한쪽 문구만 고치면 채널에 따라 안내가 갈린다.
 * (mail 쪽은 HTML, 이쪽은 카톡·문자에 그대로 붙일 평문이라 함수를 공유하지는 않는다.)
 */
export function approvalNoticeText(v: {
  teacherName: string; schoolName: string; code: string; surveyUrl: string
}): string {
  return [
    `${v.teacherName} 선생님, 안녕하세요.`,
    `${v.schoolName} 읽기 선별검사 신청이 승인되었습니다.`,
    '',
    `학급 코드: ${v.code}`,
    `검사 주소: ${v.surveyUrl}`,
    '',
    '시작 화면에서 이 코드를 입력하시면 등록하신 학생 명단이 나옵니다.',
    '검사할 학생을 고르고 정보를 확인한 뒤 시작해 주세요.',
    '',
    '※ 검사 전 보호자 서면 동의서를 회수해 주시고, 동의를 받은 학생만 검사해 주세요.',
  ].join('\n')
}
