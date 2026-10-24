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

/** 교사 신청(/apply)이 받는 학년 — 1·2학년만. 담당자 확정(2026-10-22, 회신은 사용자 전달 「신청은 1~2학년만 열어놓도록
 *  하면 된다네」): 3~6학년 검사지는 곧 따로 준다. 그 전에는 3~6학년이 1학년 검사지·임시 기준으로 검사되고 결과보고서에는
 *  임시 표시가 없다(README 「결과보고서 PDF」). 화면 선택지와 서버 검증(`applySchema`)이 이 배열 하나를 쓴다.
 *  관리자 직접 발급(CodeIssuer·classCodeCreateSchema)은 1~6학년 그대로다 — 담당자가 직접 정하는 경로다.
 *  3~6학년 검사지가 오면 그 양식을 넣은 뒤 여기에 학년을 더한다. */
export const APPLY_GRADES: readonly number[] = [1, 2]
export const APPLY_GRADE_OPTIONS = APPLY_GRADES.map(g => ({ value: String(g), label: `${g}학년` }))

/** 학년·반 표기. 반 0은 "단일학급(반 없음)" — 학년당 한 학급인 학교를 위해 010에서 허용했다. */
export function gradeClassLabel(grade: number, classNo: number): string {
  return classNo === 0 ? `${grade}학년 단일학급` : `${grade}-${classNo}`
}

/** 안내 문장 속 학급 — 「예시초 1-2 학급」. 단일학급은 표기가 이미 「학급」으로 끝나 「2학년 단일학급 학급」으로 겹치지 않게
 *  붙이지 않는다(2026-10-22 출시 전 점검). 승인 안내(메일·평문)·결과지 링크 메일의 첫 문장이 쓴다 */
export function classPhrase(schoolName: string, grade: number, classNo: number): string {
  const where = `${schoolName} ${gradeClassLabel(grade, classNo)}`
  return classNo === 0 ? where : `${where} 학급`
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

/**
 * 검사 기록 삭제 확인 창의 회차 안내: 지우는 회차와 남는 회차. 재검사가 아니면 null이다.
 * 담당자가 「1·2회차를 지우면 3회차도 지워지나」를 물었다(2026-10-24). 창이 아이 이름만 말하고 「모두 영구 삭제」라고 해서
 * 그 아이의 기록 전부가 지워지는 것처럼 읽혔다.
 */
export function deleteRetestNote(retest: { nth: number; of: number } | null): { target: string; kept: string } | null {
  if (!retest) return null
  const kept = Array.from({ length: retest.of }, (_, i) => i + 1).filter(n => n !== retest.nth)
  return { target: `${retest.nth}/${retest.of}회차`, kept: `${kept.map(n => `${n}/${retest.of}`).join('·')}회차` }
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
 * 담당자 확정(2026-10-20) — 「1학기는 3~8월 2학기는 9~2월을 기준으로 세워도 될까?」에 「응응!」(처음은 사용자 확정
 * 2026-09-28). 두 곳이 쓴다: 새 세션의 양식 고르기(lib/db `createSession` → lib/forms `formFor`)와 결과보고서
 * 「학년 / 학기」 칸. 양식은 세션 행에 적히므로(migration 008) 이 경계를 바꿔도 이미 한 검사의 문항은 그대로다.
 */
export function semesterOf(iso: string): 1 | 2 {
  const month = kstYmd(iso)[1]
  return month >= 3 && month <= 8 ? 1 : 2
}

/**
 * 승인 안내의 「결과지 받는 방법」 — 3채널(approvedMail HTML · approvalNoticeText 평문 · 관리자
 * [안내 문구 복사])이 **이 배열 하나**를 쓴다. 한쪽에만 문구가 살아나면 채널에 따라 안내가 갈리므로
 * `tests/mail.test.ts`가 두 채널 모두 담는지 대조한다. 사용자 확정 2026-09-22.
 * 받는 주소는 「이 메일 주소」라고 부르지 않는다 — 평문은 카톡·문자로도 가서 가리킬 메일이 없다. 링크는 학급에
 * 등록된 담임 이메일(`class_codes.teacher_email`)로만 가므로 그것을 그대로 말한다(2026-10-12 점검).
 */
export const RESULTS_GUIDE_LINES = [
  '검사가 끝나고 채점이 완료되면, 검사 주소에서 학급 코드를 입력한 뒤 [결과지 받기]를 누르시기 바랍니다.',
  '결과지 링크는 담당자에게 등록된 선생님 이메일로 옵니다.',
] as const

/** 승인 안내의 「쓰기를 기록지로 하실 때」 제목 — 두 채널(메일·평문)이 같은 말을 쓴다 */
export const SCAN_GUIDE_TITLE = '쓰기를 기록지(스캔본)로 하실 때'

/**
 * 승인 안내의 쓰기 스캔본 진행 순서 — 메일(`approvedMail`)과 평문(`approvalNoticeText`)이 함께 쓰는 단일 소스.
 * 진행 순서 뒤에 **받아쓰기 문항**(`WritingNotice` — 승인한 날의 학기 양식, 기록지 칸 번호 순서)을 싣는다. 담당자 요청
 * (2026-10-20 「스캔본 업로드로 할 경우 문항을 미리 알고 계셔야 할 것 같음. 코드 전달 드릴 때 검사 문항을 알려 드리는 건 어떨지 —
 * 예: 쓰기 스캔본 업로드로 진행하실 경우 받아쓰기는 아래 문항으로 진행 부탁드립니다. 쓰기 기록지는 ~(안내)」) 그대로다.
 * 처음(2026-10-21 오전)에는 메일이 퍼질 것을 걱정해 문항을 빼고 순서만 넣었는데, 요청과 달라 같은 날 문항을 넣었다(사용자 지시).
 * 문항은 화면 코드에 두지 않는다 — 승인 라우트가 서버에서 양식(`lib/forms` `writingPrompts`)을 풀어 메일에 넣고, 같은 값을 응답으로
 * 내려 관리자 [안내 문구 복사]가 쓴다. 안내 문구 자체는 담당자에게 확인받지 않은 사용자 확정(2026-10-21)이고, 말투만
 * 「-다」체로 맞췄다(lib/mail.ts 「문구」 절 — 담당자 확정).
 * 「낱말」·「문장」은 학년이 아니라 **양식의 쓰기 과제**(`WritingNotice.kind`)로 고른다 — 2학년은 문장 쓰기지만, 3~6학년은 1학년
 * 양식(낱말 쓰기)으로 검사한다(lib/forms 폴백). 학년으로 고르던 때는 3학년 학급에 「불러 줄 문장」과 낱말 10개가 함께 실렸다.
 * 버튼 이름은 시작 화면 글자 그대로다 — 2026-10-22 시작 화면이 블록으로 바뀌며 [쓰기 기록지 인쇄]·[쓰기 스캔본 올리기]가 됐고
 * (담당자 요청), 스캔본은 [쓰기 스캔본 올리기]가 담임 메일로 보내는 링크에서 올린다(담당자 확정 같은 날 — 사용자의 「이메일에 링크를
 * 첨부하는 방식으로 할게」에 담당자 「알겠어!!」. 종전 「결과지 화면에서」).
 */
export function scanGuideLines(kind: WritingNotice['kind']): string[] {
  const what = kind === 'word' ? '낱말' : '문장'
  return [
    '검사 주소에서 학급 코드를 입력한 뒤 [쓰기 기록지 인쇄]로 학생별 기록지를 뽑아 주시기 바랍니다.',
    `검사의 쓰기 단계에서 「스캔본으로 올리기」를 고르면, 불러 줄 ${what}이 기록지 칸 번호와 함께 화면에 나옵니다. 화면을 보고 불러 주시기 바랍니다.`,
    '반 전체 검사가 끝나면 검사 주소에서 [쓰기 스캔본 올리기]를 누르고, 메일로 받은 링크에서 기록지를 스캔한 파일을 올려 주시기 바랍니다. 담당자가 스캔본을 보고 채점합니다.',
  ]
}

/** 승인 안내에 싣는 받아쓰기 문항 — 승인 라우트가 서버에서 만든다(위 주석). `kind`는 그 양식의 쓰기 과제(낱말 쓰기·문장 쓰기) */
export interface WritingNotice { semester: 1 | 2; kind: 'word' | 'sentence'; items: string[] }

/** 받아쓰기 문항 목록 앞의 한 줄 — 두 채널이 같은 말을 쓴다. 학기를 적는 이유: 문항은 학기마다 다르다(승인한 날의 학기 양식).
 *  조사는 받침에 맞춘다 — 「낱말로」·「문장으로」(「문장로」로 나가던 것, 2026-10-22 출시 전 점검) */
export function writingNoticeLead(w: Pick<WritingNotice, 'semester' | 'kind'>): string {
  return `받아쓰기는 아래 ${w.kind === 'word' ? '낱말로' : '문장으로'} 진행해 주시기 바랍니다(${w.semester}학기 검사지 · 기록지 칸 번호 순서).`
}

/**
 * 승인 안내 문구(평문) — 관리자가 [안내 문구 복사]로 교사에게 직접 전달하는 예비 경로.
 * 메일이 실패했거나 발송 여부를 알 수 없을 때(`already:true`) 교사가 코드를 받는 **유일한** 길이다.
 *
 * ⚠️ `lib/mail.ts`의 `approvedMail`과 **같은 내용을 유지할 것** — 교사가 메일로 받든 관리자가
 * 붙여넣어 전하든 같은 안내를 읽어야 한다. 한쪽 문구만 고치면 채널에 따라 안내가 갈린다.
 * (mail 쪽은 HTML, 이쪽은 카톡·문자에 그대로 붙일 평문이라 함수를 공유하지는 않는다.)
 *
 * 「쓰기를 기록지(스캔본)로 하실 때」는 두 채널이 `scanGuideLines`를 함께 쓴다(2026-10-21).
 * 소요 시간·준비물·보호자 동의 조건은 담지 않는다 — 메일 쪽에서 뺐으므로 여기서도 뺀다
 * (두 채널이 갈리면 안 된다). 그 내용은 신청 화면에서 교사가 이미 읽고 체크한 것이다.
 * 사용자 확정 2026-08-22. 연구윤리 검토본이 오면 mail.ts와 함께 교체.
 */
export function approvalNoticeText(v: {
  teacherName: string; schoolName: string; grade: number; classNo: number
  code: string; surveyUrl: string; writing: WritingNotice
}): string {
  return [
    `${v.teacherName} 선생님, 안녕하십니까.`,
    `${classPhrase(v.schoolName, v.grade, v.classNo)}의 읽기 선별검사 신청을 확인했습니다.`,
    '',
    `학급 코드: ${v.code}`,
    `검사 주소: ${v.surveyUrl}`,
    '',
    '검사 주소로 들어가 학급 코드를 입력하시면 등록하신 학생 명단이 나옵니다.',
    '검사할 학생을 고르고 이름·생년월일을 확인한 뒤 시작하시기 바랍니다.',
    '',
    SCAN_GUIDE_TITLE,
    ...scanGuideLines(v.writing.kind).map(l => `- ${l}`),
    '',
    writingNoticeLead(v.writing),
    ...v.writing.items.map((t, i) => `${i + 1}. ${t}`),
    '',
    '결과지 받는 방법',
    ...RESULTS_GUIDE_LINES.map(l => `- ${l}`),
    '',
    '학급 코드는 이 안내로만 전달되므로 보관해 주시기 바랍니다.',
  ].join('\n')
}
