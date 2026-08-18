// lib/mail.ts — 메일 발송 단일 창구(서버 전용 — 클라이언트에서 import 금지).
// 발송은 Resend HTTP API에 POST 한 번이라 SDK를 넣지 않는다(의존성·번들 증가 없음).
//
// 이 앱이 보내는 메일은 두 종류뿐이다:
//  ① 새 신청 알림 → 관리자        ② 승인·학급 코드 안내 → 교사
// 문구는 templates 절에 모아 두고, 담당자 확정본이 오면 그 함수만 갈아 끼운다.
import { env } from './env'

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
// ⚠️ 담당자 확인 대기 — 확정 아님. 아래 문구는 개발용 초안이다(사용자 확정 2026-08-18).
// 해림(담당자)이 안내 문구 예시를 만들기로 했고, 연구윤리 검토본이 오면 다시 교체된다.
// 교체할 때 이 두 함수만 고치면 되고 발송 경로는 건드릴 필요가 없다.

const WRAP = (body: string) => `<div style="font:15px/1.7 -apple-system,'Apple SD Gothic Neo',sans-serif;
  color:#0E1526;max-width:560px">${body}
  <hr style="border:0;border-top:1px solid #E3E8F3;margin:24px 0 12px">
  <p style="font-size:12.5px;color:#6E7994;margin:0">읽기 선별검사</p></div>`

/** ① 새 신청이 들어왔을 때 관리자에게 */
export function applyNoticeMail(v: {
  schoolName: string; grade: number; classNo: number; teacherName: string; childCount: number; adminUrl: string
}): Mail {
  const where = `${v.schoolName} ${v.grade}학년 ${v.classNo === 0 ? '' : `${v.classNo}반 `}`
  return {
    to: '', // 호출부가 관리자 주소를 채운다
    subject: `[읽기검사] 새 신청 — ${v.schoolName} ${v.teacherName} 선생님`,
    html: WRAP(`
      <h2 style="font-size:18px;margin:0 0 14px">새 신청이 들어왔습니다</h2>
      <table style="font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 14px 4px 0;color:#6E7994">학급</td><td><b>${escapeHtml(where)}</b></td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#6E7994">담임</td><td>${escapeHtml(v.teacherName)} 선생님</td></tr>
        <tr><td style="padding:4px 14px 4px 0;color:#6E7994">등록 학생</td><td>${v.childCount}명</td></tr>
      </table>
      <p style="margin:18px 0 0"><a href="${v.adminUrl}"
        style="background:#2F6BFF;color:#fff;text-decoration:none;border-radius:9px;padding:11px 18px;
        display:inline-block;font-weight:700;font-size:14px">신청 확인하고 승인하기</a></p>
      <p style="font-size:13px;color:#6E7994;margin:14px 0 0">
        승인하면 선생님께 학급 코드가 자동으로 발송됩니다.</p>`),
  }
}

/** ② 승인 후 교사에게 — 학급 코드 전달 */
export function approvedMail(v: {
  teacherName: string; schoolName: string; code: string; surveyUrl: string
}): Mail {
  return {
    to: '', // 호출부가 교사 주소를 채운다
    subject: `[읽기검사] 신청이 승인되었습니다 — 학급 코드 ${v.code}`,
    html: WRAP(`
      <p style="margin:0 0 6px">${escapeHtml(v.teacherName)} 선생님, 안녕하세요.</p>
      <p style="margin:0 0 18px">${escapeHtml(v.schoolName)} 읽기 선별검사 신청이 <b>승인</b>되었습니다.</p>
      <div style="border:1.5px solid #2F6BFF;background:#EDF2FF;border-radius:12px;padding:16px 18px;margin:0 0 18px">
        <p style="margin:0 0 4px;font-size:12.5px;font-weight:700;color:#2F6BFF">학급 코드</p>
        <p style="margin:0;font-size:30px;font-weight:800;letter-spacing:.1em">${escapeHtml(v.code)}</p>
      </div>
      <p style="margin:0 0 6px">검사 주소: <a href="${v.surveyUrl}" style="color:#2F6BFF">${v.surveyUrl}</a></p>
      <p style="margin:0 0 18px;font-size:14px;color:#3A4256">
        시작 화면에서 이 코드를 입력하시면 등록하신 <b>학생 명단</b>이 나옵니다.
        검사할 학생을 고르고 정보를 확인한 뒤 시작해 주세요.</p>
      <p style="font-size:13px;color:#6E7994;margin:0">
        ※ 검사 전 보호자 서면 동의서를 회수해 주시고, 동의를 받은 학생만 검사해 주세요.</p>`),
  }
}
