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

/** 결과지 머리글용 풀어 쓴 학급 표기 — `1학년 2반`, 단일학급은 `1학년 단일학급`.
 *  목록 표의 좁은 칸은 `gradeClassLabel`(`1-2`)을 그대로 쓴다. */
export function classLabel(grade: number, classNo: number): string {
  return classNo === 0 ? `${grade}학년 단일학급` : `${grade}학년 ${classNo}반`
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
 * 관리자 결과지 화면의 검사일 표기(KST 고정). 검사는 한국 학교에서 이뤄지는데 서버(Vercel)는 UTC라,
 * 타임존을 고정하지 않으면 아침 검사(08:00 KST = 전날 23:00 UTC)가 하루 전으로 찍힌다.
 * 결과보고서 PDF는 월·일을 두 자리로 적는 `reportDateLabel`을 쓴다(같은 KST 기준).
 */
export function sheetDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
}

/** KST 기준 [년, 월, 일]. 결과보고서의 검사일·학기 판정이 같은 시각 기준을 써야 한다. */
function kstYmd(iso: string): [number, number, number] {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso)).split('-').map(Number)
  return [p[0], p[1], p[2]]
}

/** 결과보고서 검사일 표기 `2026. 09. 19.` — 담당자 양식(2026-09-28)이 월·일을 두 자리로 적는다
 *  (`sheetDateLabel`의 `2026. 9. 19.`과 다르다). */
export function reportDateLabel(iso: string): string {
  const [y, m, d] = kstYmd(iso)
  return `${y}. ${pad2(m)}. ${pad2(d)}.`
}

/** DB 저장형 생년월일 `YYMMDD` → 결과보고서 표기 `2019. 03. 15.`.
 *  세기는 20으로 고정한다 — 초등학생의 생년은 2000년대뿐이다. */
export function birthLabel(yymmdd: string): string {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(yymmdd)
  if (!m) return yymmdd
  return `20${m[1]}. ${m[2]}. ${m[3]}.`
}

/**
 * 검사일의 학기. 3~8월 → 1학기, 9~2월 → 2학기.
 * 사용자 확정(2026-09-28) — 담당자 회신이 **아니다**. 결과보고서 머리글 「학년 / 학기」 칸을 채우기 위한
 * 개발 판단이며 세션에 학기 값이 따로 없다. 담당자가 「학기별로 문항·Pass/Fail 점수가 다르다」고
 * 했으므로(2026-09-28), 학기별 양식이 생기면 그 양식이 학기를 정하고 이 함수는 없어져야 한다.
 */
export function semesterOf(iso: string): 1 | 2 {
  const month = kstYmd(iso)[1]
  return month >= 3 && month <= 8 ? 1 : 2
}

/**
 * 승인 안내의 「결과지 받는 방법」 — 3채널(approvedMail HTML · approvalNoticeText 평문 · 관리자
 * [안내 문구 복사])이 **이 배열 하나**를 쓴다. 한쪽에만 문구가 살아나면 채널에 따라 안내가 갈리므로
 * `tests/mail.test.ts`가 두 채널 모두 담는지 대조한다. 사용자 확정 2026-09-22.
 */
export const RESULTS_GUIDE_LINES = [
  '검사가 끝나고 채점이 완료되면, 검사 주소에서 학급 코드를 입력한 뒤 [결과지 받기]를 누르세요.',
  '이 메일 주소로 결과지 링크가 옵니다.',
] as const

/**
 * 승인 안내 문구(평문) — 관리자가 [안내 문구 복사]로 교사에게 직접 전달하는 예비 경로.
 * 메일이 실패했거나 발송 여부를 알 수 없을 때(`already:true`) 교사가 코드를 받는 **유일한** 길이다.
 *
 * ⚠️ `lib/mail.ts`의 `approvedMail`과 **같은 내용을 유지할 것** — 교사가 메일로 받든 관리자가
 * 붙여넣어 전하든 같은 안내를 읽어야 한다. 한쪽 문구만 고치면 채널에 따라 안내가 갈린다.
 * (mail 쪽은 HTML, 이쪽은 카톡·문자에 그대로 붙일 평문이라 함수를 공유하지는 않는다.)
 *
 * 소요 시간·준비물·보호자 동의 조건은 담지 않는다 — 메일 쪽에서 뺐으므로 여기서도 뺀다
 * (두 채널이 갈리면 안 된다). 그 내용은 신청 화면에서 교사가 이미 읽고 체크한 것이다.
 * 사용자 확정 2026-08-22. 연구윤리 검토본이 오면 mail.ts와 함께 교체.
 */
export function approvalNoticeText(v: {
  teacherName: string; schoolName: string; grade: number; classNo: number
  code: string; surveyUrl: string
}): string {
  const where = `${v.schoolName} ${gradeClassLabel(v.grade, v.classNo)}`
  return [
    `${v.teacherName} 선생님, 안녕하세요.`,
    `${where} 학급의 읽기 선별검사 신청을 확인했습니다.`,
    '',
    `학급 코드: ${v.code}`,
    `검사 주소: ${v.surveyUrl}`,
    '',
    '검사 주소로 들어가 학급 코드를 입력하시면 등록하신 학생 명단이 나옵니다.',
    '검사할 학생을 고르고 이름·생년월일을 확인한 뒤 시작해 주세요.',
    '',
    '결과지 받는 방법',
    ...RESULTS_GUIDE_LINES.map(l => `- ${l}`),
    '',
    '학급 코드는 이 안내로만 전달되니 보관해 주세요.',
  ].join('\n')
}
