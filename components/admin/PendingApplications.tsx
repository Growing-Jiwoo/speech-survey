// components/admin/PendingApplications.tsx — 교사 신청(pending) 검토·승인 섹션.
// 발급 목록(active)보다 **위**에 둔다 — 관리자가 이 화면에 오는 이유는 대개 대기 건 처리다.
'use client'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { approvalNoticeText, gradeClassLabel } from '@/lib/format'
import { postJson } from '@/lib/http'
import { adminKeys, useRosterQuery, type ClassCodeItem } from '@/hooks/useAdminQueries'

const btnCls = 'rounded-lg border-[1.5px] border-line bg-white px-2.5 py-1 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-40'

/** 승인 결과 — 행이 active 목록으로 옮겨가 사라진 뒤에도 관리자가 결과와 복사 버튼을 볼 수
 *  있어야 하므로 이 섹션이 붙잡아 둔다(발급 폼의 `issued` 패널과 같은 이유). */
interface Approved {
  code: string; teacherName: string; schoolName: string
  /** 검사 주소 — 라우트가 실제로 쓴 origin(APP_URL 우선)을 그대로 받는다.
   *  `window.location.origin`으로 다시 만들면 서버의 fallback만 흉내내 메일과 갈릴 수 있다. */
  surveyUrl: string
  already: boolean; mailed: boolean
}

export function PendingApplications({
  items, onDelete,
}: {
  items: ClassCodeItem[]
  /** 삭제(반려) 확인 모달은 발급 목록과 공유하므로 부모(CodeIssuer)가 소유한다 */
  onDelete: (c: ClassCodeItem) => void
}) {
  const queryClient = useQueryClient()
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [approved, setApproved] = useState<Approved | null>(null)
  const [copied, setCopied] = useState(false)
  const roster = useRosterQuery(openId)

  async function approve(c: ClassCodeItem) {
    setBusyId(c.id); setErr('')
    const r = await postJson<{ already: boolean; mailed: boolean; code: string; surveyUrl: string }>(
      `/api/admin/codes/${c.id}/approve`, undefined, '승인에 실패했어요. 다시 시도해 주세요.')
    setBusyId(null)
    if (!r.ok) { setErr(r.error); return }
    setApproved({
      code: r.data.code, teacherName: c.teacher_name, schoolName: c.school_name,
      surveyUrl: r.data.surveyUrl, already: r.data.already, mailed: r.data.mailed,
    })
    setCopied(false)
    setOpenId(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }

  function copyNotice(a: Approved) {
    const text = approvalNoticeText({
      teacherName: a.teacherName, schoolName: a.schoolName, code: a.code,
      surveyUrl: a.surveyUrl,   // 승인 응답이 준 값 — 메일에 찍힌 주소와 반드시 같아야 한다
    })
    void navigator.clipboard.writeText(text).then(() => setCopied(true))
  }

  // 대기 건도 없고 방금 승인한 결과도 없으면 섹션 자체를 내지 않는다(빈 제목만 남지 않게).
  if (items.length === 0 && !approved) return null

  return (
    <div className="border-b border-line bg-amber/5 p-5">
      {items.length > 0 && (
        <p className="text-[15px] font-bold">
          대기 중 <span className="text-amber">{items.length}건</span>
          <span className="ml-2 text-[12px] font-medium text-ink-mute">
            선생님이 직접 신청한 학급이에요 · 승인하면 코드가 메일로 발송됩니다
          </span>
        </p>
      )}

      {approved && (
        <ApprovedBanner a={approved} copied={copied} onCopy={() => copyNotice(approved)} />
      )}
      {err && <p role="alert" className="mt-3 text-sm text-rec-deep">{err}</p>}

      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map(c => (
          <li key={c.id} className="rounded-xl border-[1.5px] border-line bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {c.school_name} {gradeClassLabel(c.grade, c.class_no)} · 담임 {c.teacher_name}
                </p>
                <p className="text-[12px] text-ink-mute">
                  {c.roster_count}명 · 신청 {c.applied_at ? new Date(c.applied_at).toLocaleString('ko-KR') : '—'}
                  {c.teacher_email && ` · ${c.teacher_email}`}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {/* 승인 요청은 메일 발송까지 끝난 뒤에 응답하므로 1~2초 머문다. 그 사이 같은 행의
                    다른 버튼이 살아 있으면 승인 중인 학급을 삭제(반려)하거나 명단을 여닫을 수 있었다
                    — 행 전체를 잠근다(사용자 보고 2026-08-19). 승인 버튼 자체는 첫 줄의
                    setBusyId로 이미 즉시 잠긴다. */}
                <button type="button" className={btnCls} disabled={busyId === c.id}
                  aria-expanded={openId === c.id} aria-controls={`roster-${c.id}`}
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                  {openId === c.id ? '명단 닫기' : '명단 보기'}
                </button>
                <button type="button" disabled={busyId === c.id}
                  onClick={() => void approve(c)}
                  className="rounded-lg bg-blue px-3 py-1 text-xs font-bold text-white transition disabled:opacity-40">
                  {busyId === c.id ? '승인 중…' : '승인'}
                </button>
                <button type="button" disabled={busyId === c.id} onClick={() => onDelete(c)}
                  className="rounded-lg border-[1.5px] border-rec/40 bg-rec/5 px-2.5 py-1 text-xs font-bold text-rec-deep transition hover:border-rec disabled:opacity-40">
                  삭제
                </button>
              </div>
            </div>

            {/* ⚠️ 아동 실명·생년월일 — 기본은 접힘이고, 관리자가 승인 판단을 위해 직접 열 때만 표시한다 */}
            {openId === c.id && (
              <div id={`roster-${c.id}`} className="mt-3 border-t border-line/60 pt-3">
                {roster.isLoading ? (
                  <p className="text-[13px] text-ink-mute">명단 불러오는 중…</p>
                ) : roster.isError ? (
                  <p className="text-[13px] text-rec-deep">명단을 불러오지 못했어요.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-[11px] text-ink-mute">
                          {['번호', '이름', '성별', '생년월일'].map(h => (
                            <th key={h} scope="col" className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(roster.data ?? []).map(r => (
                          <tr key={r.child_no} className="border-t border-line/50">
                            <td className="px-2 py-1 tabular-nums text-ink-soft">{r.child_no}</td>
                            <td className="px-2 py-1 font-medium">{r.child_name}</td>
                            <td className="px-2 py-1 text-ink-soft">{r.gender}</td>
                            <td className="px-2 py-1 tabular-nums text-ink-soft">{r.birth_ymd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 승인 결과 안내. 문구는 `(already, mailed)` 조합이 그대로 결정한다:
 *  - (false, true)  정상 승인 — 메일이 나갔다
 *  - (false, false) 승인은 됐고 **메일 발송은 실패** — 복사 경로가 유일한 전달 수단
 *  - (true, false)  이미 승인된 학급 — 라우트는 **이전 호출에서 메일이 나갔는지 알 수 없다**
 *    (`mail_sent_at` 같은 기록을 두지 않았다). 그래서 "보냈다"도 "못 보냈다"도 주장하지 않고
 *    발송 여부 미상이라고만 말한다 — 관리자가 보냈다고 믿으면 교사는 코드를 못 받는다.
 *  - (true, true)   승인하지 않은 호출이 메일을 보낼 수는 없으므로 발생하지 않는다(분기하지 않음).
 * 메일이 확실히 나간 경우가 아니면 [안내 문구 복사]를 항상 내어 예비 경로를 남긴다.
 *
 * 승인 직후 목록이 갱신되면 방금 누른 [승인] 버튼이 딸려 사라져 포커스가 body로 떨어진다 —
 * 그래서 이 배너로 포커스를 옮긴다(`role="status"`는 화면을 보지 않는 사용자에게 읽어 주고,
 * 포커스 이동은 그 다음 Tab이 사라진 버튼 자리가 아니라 여기서 이어지게 한다).
 * 승인 1건마다 `a` 객체가 새로 만들어지므로 같은 학급을 다시 승인해도 다시 발화한다.
 */
function ApprovedBanner({ a, copied, onCopy }: { a: Approved; copied: boolean; onCopy: () => void }) {
  const sure = !a.already && a.mailed
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [a])
  return (
    <div ref={ref} role="status" tabIndex={-1}
      className={`mt-3 flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] px-4 py-3 outline-none ${
      sure ? 'border-blue/40 bg-blue/5' : 'border-amber/50 bg-amber/10'}`}>
      <div>
        <p className="text-sm font-bold">
          {sure ? '승인 완료 · 선생님께 코드 메일을 보냈어요'
            : a.already ? '이미 승인된 학급이에요 · 메일 발송 여부는 알 수 없어요'
              : '승인은 됐지만 메일 발송에 실패했어요'}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-mute">
          {a.schoolName} 담임 {a.teacherName} · 학급 코드{' '}
          <b className="font-read tracking-widest text-blue">{a.code}</b>
          {!sure && ' — 아래 버튼으로 안내 문구를 복사해 직접 전달해 주세요.'}
        </p>
      </div>
      {!sure && (
        <button type="button" onClick={onCopy}
          className="ml-auto rounded-lg bg-blue px-3 py-1.5 text-xs font-bold text-white transition">
          {copied ? '복사됨!' : '안내 문구 복사'}
        </button>
      )}
    </div>
  )
}
