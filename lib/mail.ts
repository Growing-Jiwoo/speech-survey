// lib/mail.ts — 메일 발송 단일 창구(서버 전용 — 클라이언트에서 import 금지).
// 발송은 Resend HTTP API에 POST 한 번이라 SDK를 넣지 않는다(의존성·번들 증가 없음).
//
// 이 앱이 보내는 메일은 두 종류뿐이다:
//  ① 새 신청 알림 → 관리자        ② 승인·학급 코드 안내 → 교사
// 문구는 templates 절에 모아 두고, 담당자 확정본이 오면 그 함수만 갈아 끼운다.
import { env } from './env'
import { gradeClassLabel } from './format'

const ENDPOINT = 'https://api.resend.com/emails'

export type MailResult = { ok: true; id: string } | { ok: false; error: string }

export interface Mail {
  to: string
  subject: string
  html: string
}

/**
 * 메일 한 통 발송. 던지지 않고 결과형으로 돌려준다(lib/http.ts와 같은 관례) —
 * 메일 실패로 신청·승인 자체가 실패하면 안 되므로, 호출부가 실패를 조용히 기록하고 넘어갈 수 있어야 한다.
 *
 * **MAIL_TO_OVERRIDE가 설정돼 있으면 수신자를 그 주소로 강제한다.**
 * 개발·스테이징에서 실수로 진짜 교사에게 메일이 나가는 것을 막는 안전장치이며,
 * 도메인 인증 전 Resend 샌드박스가 *가입 이메일로만* 발송을 허용하는 제약도 이걸로 넘긴다.
 * 원래 수신자를 본문 머리에 적어, 수신자 결정 로직까지 눈으로 검증할 수 있게 한다.
 */
export async function sendMail({ to, subject, html }: Mail): Promise<MailResult> {
  const override = process.env.MAIL_TO_OVERRIDE?.trim()
  if (override) {
    html = `<p style="background:#FCF4E4;border:1px solid #96660C33;border-radius:8px;padding:10px 12px;
      font:13px/1.6 sans-serif;color:#3A4256;margin:0 0 16px">
      테스트 발송 — 원래 수신자: <b>${escapeHtml(to)}</b></p>` + html
    to = override
    subject = `[테스트] ${subject}`
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env('MAIL_FROM'), to: [to], subject, html }),
    })
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
    if (!res.ok) return { ok: false, error: data.message ?? `발송 실패 (${res.status})` }
    if (!data.id) return { ok: false, error: '발송 응답에 id가 없습니다' }
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '발송 중 오류' }
  }
}

/** 메일 본문에 사용자 입력을 넣기 전 이스케이프 — 학교명·교사명이 그대로 들어간다. */
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// ── 문구 ───────────────────────────────────────────────────────────
// 사용자 확정 2026-08-22. 이전 판은 "개발용 초안"이었고 교사가 실제로 묻는 것(얼마나 걸리나 ·
// 무엇이 필요하나 · 코드를 잃으면)에 답하지 않았다.
//
// ⚠️ 여전히 연구윤리 검토본 대기 중이다 — 검토본이 오면 이 절만 교체하면 되고 발송 경로는
// 건드릴 필요가 없다.
//
// ⚠️ 승인 메일은 **코드 전달이 목적**이라 짧게 유지한다. 소요 시간·준비물·보호자 동의 조건을
// 담은 「검사 전에 확인해 주세요」 블록은 실제 발송본을 검수한 뒤 뺐다(사용자 확정 2026-08-22)
// — 그 내용은 신청 화면(`app/apply`의 `SURVEY_NOTICE`)에서 교사가 **이미 읽고 체크한 것**이라
// 중복이었다. 다시 넣자는 말이 나오면 각 문장의 근거는 그쪽 상수 주석에 있다.
// ⚠️ 승인 안내는 **3채널**이다 — 이 파일의 approvedMail(HTML), lib/format의 approvalNoticeText
// (관리자가 카톡·문자로 붙여넣는 평문), 그리고 관리자 화면의 [안내 문구 복사]. 한쪽만 고치면
// 채널에 따라 안내가 갈린다(tests/mail.test.ts가 필수 정보 존재를 대조한다).

const C = {
  ink: '#0E1526', soft: '#3A4256', mute: '#6E7994',
  line: '#E3E8F3', well: '#F7F9FE', blue: '#2F6BFF', blueWell: '#EDF2FF',
} as const

const FONT = `-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif`

/** 메일 골격 — 이름표(누가 보낸 메일인지)를 위에 두고 본문을 감싼다. 교사가 받은 편지함에서
 *  다시 찾을 물건이라 제목만으로 판별되지 않을 때 이 띠가 단서가 된다. */
const WRAP = (body: string) => `<div style="font:15px/1.7 ${FONT};color:${C.ink};max-width:560px">
  <p style="margin:0 0 20px;padding:0 0 14px;border-bottom:2px solid ${C.blue};
    font-size:13px;font-weight:800;letter-spacing:.02em;color:${C.blue}">읽기 선별검사</p>
  ${body}
  <hr style="border:0;border-top:1px solid ${C.line};margin:26px 0 12px">
  <p style="font-size:12px;color:${C.mute};margin:0;line-height:1.6">
    초등학교 읽기 선별검사 · 이 메일은 신청하신 주소로 발송됐습니다.</p></div>`

/** 소제목 — 메일에서는 h3보다 이 형태가 클라이언트별 여백 차이가 적다. */
const H = (text: string) => `<p style="margin:24px 0 8px;font-size:13px;font-weight:800;
  color:${C.soft};letter-spacing:.02em">${text}</p>`

const UL = (items: string[]) => `<ul style="margin:0;padding:0 0 0 18px;font-size:14px;
  color:${C.soft};line-height:1.75">${items.map(i => `<li style="margin:0 0 4px">${i}</li>`).join('')}</ul>`

/** ① 새 신청이 들어왔을 때 관리자에게 */
export function applyNoticeMail(v: {
  schoolName: string; grade: number; classNo: number; teacherName: string; childCount: number; adminUrl: string
}): Mail {
  const where = `${v.schoolName} ${gradeClassLabel(v.grade, v.classNo)}`
  return {
    to: '', // 호출부가 관리자 주소를 채운다
    subject: `[읽기 선별검사] 새 신청 — ${where} ${v.teacherName} 선생님 (${v.childCount}명)`,
    html: WRAP(`
      <h2 style="font-size:19px;margin:0 0 4px;font-weight:800">승인 대기 신청이 있습니다</h2>
      <p style="margin:0 0 18px;font-size:14px;color:${C.mute}">
        승인하면 선생님께 학급 코드가 자동으로 발송됩니다. 승인 전에는 코드가 전달되지 않습니다.</p>
      <table style="font-size:14px;border-collapse:collapse;background:${C.well};
        border:1px solid ${C.line};border-radius:10px;padding:4px">
        <tr><td style="padding:8px 16px 4px 14px;color:${C.mute};white-space:nowrap">학급</td>
            <td style="padding:8px 14px 4px 0"><b>${escapeHtml(where)}</b></td></tr>
        <tr><td style="padding:4px 16px 4px 14px;color:${C.mute};white-space:nowrap">담임</td>
            <td style="padding:4px 14px 4px 0">${escapeHtml(v.teacherName)} 선생님</td></tr>
        <tr><td style="padding:4px 16px 10px 14px;color:${C.mute};white-space:nowrap">등록 학생</td>
            <td style="padding:4px 14px 10px 0">${v.childCount}명</td></tr>
      </table>
      <p style="margin:20px 0 0"><a href="${escapeHtml(v.adminUrl)}"
        style="background:${C.blue};color:#fff;text-decoration:none;border-radius:9px;padding:12px 20px;
        display:inline-block;font-weight:700;font-size:14px">명단 확인하고 승인하기</a></p>
      <p style="font-size:13px;color:${C.mute};margin:14px 0 0">
        승인 화면에서 등록된 명단을 먼저 확인하실 수 있습니다.</p>`),
  }
}

/** ② 승인 후 교사에게 — 학급 코드 전달.
 *  교사가 **보관하는 유일한 물건**이므로 검사를 시작할 수 있는 정보가 다 있어야 한다.
 *  코드 재발급 경로가 없어(관리자에게 문의하는 수밖에) 보관을 명시적으로 부탁한다.
 *
 *  ⚠️ TODO(문의처 — 나중에 넣기로 함, 2026-08-22): 본문이 "담당자에게 문의하셔야 합니다"라고만
 *  말하고 **어디로 문의할지는 적혀 있지 않다.** 메일을 지운 교사가 갈 곳이 없다.
 *  운영 주체가 창구(메일 또는 전화)를 정하면 **세 곳을 함께** 채울 것 — 값이 갈리면
 *  채널마다 다른 곳으로 안내한다:
 *    1) 이 함수의 보관 안내 문단
 *    2) lib/format.ts의 approvalNoticeText(관리자가 카톡·문자로 붙이는 평문)
 *    3) docs/consent/guardian-consent-form.md의 `[담당자 소속·성명·연락처]`(보호자용) */
export function approvedMail(v: {
  teacherName: string; schoolName: string; grade: number; classNo: number
  code: string; surveyUrl: string
}): Mail {
  const where = `${v.schoolName} ${gradeClassLabel(v.grade, v.classNo)}`
  return {
    to: '', // 호출부가 교사 주소를 채운다
    subject: `[읽기 선별검사] ${where} 학급 코드 ${v.code}`,
    html: WRAP(`
      <p style="margin:0 0 6px">${escapeHtml(v.teacherName)} 선생님, 안녕하세요.</p>
      <p style="margin:0 0 20px">${escapeHtml(where)} 학급의 읽기 선별검사 신청을 확인했습니다.<br>
        아래 학급 코드로 검사를 시작하실 수 있어요.</p>

      <div style="border:1.5px solid ${C.blue};background:${C.blueWell};border-radius:12px;
        padding:16px 18px;margin:0 0 20px">
        <p style="margin:0 0 6px;font-size:12px;font-weight:800;color:${C.blue};letter-spacing:.04em">학급 코드</p>
        <p style="margin:0;font-size:32px;font-weight:800;letter-spacing:.1em"
          translate="no">${escapeHtml(v.code)}</p>
        <p style="margin:6px 0 0;font-size:12.5px;color:${C.soft}">${escapeHtml(where)}</p>
      </div>

      <p style="margin:0;font-size:14px;color:${C.mute}">검사 주소</p>
      <p style="margin:2px 0 0"><a href="${escapeHtml(v.surveyUrl)}"
        style="color:${C.blue};word-break:break-all">${escapeHtml(v.surveyUrl)}</a></p>

      ${H('시작하는 방법')}
      ${UL([
        '검사 주소로 들어가 학급 코드를 입력합니다.',
        '등록하신 학생 명단이 나옵니다. 검사할 학생을 고르세요.',
        '이름·생년월일을 확인하고 검사를 시작합니다.',
      ])}


      <p style="margin:24px 0 0;padding:12px 14px;background:${C.well};border:1px solid ${C.line};
        border-radius:10px;font-size:13px;color:${C.soft};line-height:1.7">
        <b>이 메일을 보관해 주세요.</b> 학급 코드는 이 메일로만 전달되고,<br>
        다시 받으려면 담당자에게 문의하셔야 합니다.</p>`),
  }
}
