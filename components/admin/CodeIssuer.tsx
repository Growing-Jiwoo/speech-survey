// components/admin/CodeIssuer.tsx — 학급 코드 발급 + 발급 목록.
// 코드 1개 = 학급 1개(학교·학년·반·담임·연락처). 검사 현장은 이 코드만 입력한다(스펙 2026-08-13).
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SchoolPicker, type SelectedSchool } from '@/components/SchoolPicker'
import { PendingApplications } from '@/components/admin/PendingApplications'
import { Select } from '@/components/Select'
import { CLASS_OPTIONS, gradeClassLabel } from '@/lib/format'
import { postJson, requestJson } from '@/lib/http'
import { validEmail, validName, validPhone } from '@/lib/validate'
import { adminKeys, useClassCodesQuery, type ClassCodeItem } from '@/hooks/useAdminQueries'

const inputCls = 'mt-1.5 h-[46px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-[15px] outline-none transition focus:border-blue focus:bg-white'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

export function CodeIssuer() {
  const queryClient = useQueryClient()
  const { data: codes, isLoading, isError, refetch } = useClassCodesQuery()

  const [school, setSchool] = useState<SelectedSchool | null>(null)
  const [grade, setGrade] = useState('1')
  const [classNo, setClassNo] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // 발급 직후 1건만 붙잡아 둔다 — 교사에게 그 자리에서 불러 줘야 하는데, 아래 목록에서
  // 방금 만든 코드를 눈으로 찾게 하면 다른 학급 코드를 잘못 읽어 줄 수 있다.
  const [issued, setIssued] = useState<ClassCodeItem | null>(null)
  const [copied, setCopied] = useState(false)
  const [toDelete, setToDelete] = useState<ClassCodeItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [delErr, setDelErr] = useState('')

  // 대기(pending)와 발급(active)은 다른 섹션이 맡는다 — 아래 표는 active만 그린다.
  const active = (codes ?? []).filter(c => c.status === 'active')

  const cleanTeacher = teacherName.trim().replace(/\s+/g, ' ')
  const cleanPhone = phone.trim()
  const cleanEmail = email.trim()

  async function issue() {
    // 서버 스키마(classCodeCreateSchema)와 같은 규칙으로 선검증한다.
    if (!school) { setErr('학교를 선택해 주세요.'); return }
    if (classNo === '') { setErr('반을 선택해 주세요.'); return }
    if (!validName(cleanTeacher)) { setErr('담임교사명은 한글이나 영어로만 쓸 수 있어요.'); return }
    if (!cleanPhone && !cleanEmail) { setErr('전화번호나 이메일 중 하나는 입력해 주세요.'); return }
    if (cleanPhone && !validPhone(cleanPhone)) { setErr('전화번호 형식으로 입력해 주세요. (예: 01012345678)'); return }
    if (cleanEmail && !validEmail(cleanEmail)) { setErr('이메일 형식으로 입력해 주세요.'); return }

    setErr(''); setBusy(true)
    const r = await postJson<{ code: Omit<ClassCodeItem, 'session_count' | 'roster_count'> }>('/api/admin/codes', {
      region: school.region, schoolId: school.schoolId, schoolName: school.schoolName,
      grade: Number(grade), classNo: Number(classNo),
      teacherName: cleanTeacher, teacherPhone: cleanPhone, teacherEmail: cleanEmail,
    }, '코드 발급에 실패했어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    setIssued({ ...r.data.code, session_count: 0, roster_count: 0 })
    setCopied(false)
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }

  async function remove() {
    if (!toDelete) return
    setDeleting(true); setDelErr('')
    const r = await requestJson(`/api/admin/codes/${toDelete.id}`, { method: 'DELETE' },
      '삭제에 실패했어요. 다시 시도해 주세요.')
    setDeleting(false)
    if (!r.ok) { setDelErr(r.error); return }
    if (issued?.id === toDelete.id) setIssued(null)
    setToDelete(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-[15px] font-bold">학급 코드 발급</p>
          <p className="text-[12px] text-ink-mute">코드 하나가 학급 하나예요 · 검사 현장은 이 코드만 입력합니다</p>
        </div>
        <Link href="/admin"
          className="ml-auto rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
          ← 세션 목록
        </Link>
      </div>

      {/* 발급 폼 */}
      <div className="border-b border-line p-5">
        <label className="text-[13px] font-bold text-ink-soft">학교명</label>
        <SchoolPicker value={school} onSelect={setSchool} />
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-grade">학년</label>
            <div className="mt-1.5">
              <Select id="cc-grade" ariaLabel="학년" placeholder="학년" value={grade} onChange={setGrade}
                options={[1, 2, 3, 4, 5, 6].map(g => ({ value: String(g), label: `${g}학년` }))} />
            </div>
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-class">반</label>
            <div className="mt-1.5">
              <Select id="cc-class" ariaLabel="반" placeholder="반 선택" value={classNo}
                onChange={setClassNo} options={CLASS_OPTIONS} />
            </div>
          </div>
        </div>
        <label className={labelCls} htmlFor="cc-teacher">담임교사명</label>
        <input id="cc-teacher" value={teacherName} maxLength={30}
          onChange={e => setTeacherName(e.target.value)} className={inputCls} />
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-phone">담임 전화번호</label>
            <input id="cc-phone" value={phone} maxLength={60} inputMode="tel" placeholder="01012345678"
              onChange={e => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-email">담임 이메일</label>
            <input id="cc-email" value={email} maxLength={60} inputMode="email" placeholder="teacher@school.kr"
              onChange={e => setEmail(e.target.value)} className={inputCls} />
          </div>
        </div>
        <p className="mt-1.5 text-[12px] text-ink-mute">전화번호와 이메일 중 하나만 입력해도 괜찮아요. 하이픈(-)은 저장할 때 자동으로 빠져요.</p>
        {err && <p role="alert" className="mt-3 text-sm text-rec-deep">{err}</p>}
        <button type="button" onClick={() => void issue()} disabled={busy}
          className="mt-4 rounded-lg bg-blue px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-40">
          {busy ? '발급 중…' : '코드 발급'}
        </button>

        {issued && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-blue/40 bg-blue/5 px-4 py-3">
            <div>
              <p className="text-[12px] font-bold text-ink-mute">
                {issued.school_name} {gradeClassLabel(issued.grade, issued.class_no)} · 담임 {issued.teacher_name}
              </p>
              <p className="font-read text-[28px] font-bold tracking-[0.25em] text-blue">{issued.code}</p>
            </div>
            <button type="button"
              onClick={() => { void navigator.clipboard.writeText(issued.code).then(() => setCopied(true)) }}
              className="ml-auto rounded-lg border-[1.5px] border-line bg-white px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
              {copied ? '복사됨!' : '코드 복사'}
            </button>
          </div>
        )}
      </div>

      {/* 신청 대기(pending) — 대기 건이 없으면 스스로 아무것도 그리지 않는다 */}
      <PendingApplications items={(codes ?? []).filter(c => c.status === 'pending')}
        onDelete={c => { setDelErr(''); setToDelete(c) }} />

      {/* 발급된 코드(active) */}
      {isLoading ? (
        <p className="p-8 text-center text-sm text-ink-mute">불러오는 중…</p>
      ) : isError ? (
        <div className="flex flex-col items-start gap-3 p-8">
          <p className="text-sm text-ink-soft">목록을 불러오지 못했어요.</p>
          <button type="button" onClick={() => void refetch()}
            className="rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
            다시 시도
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-mute">
                {['코드', '학교', '학년/반', '담임', '연락처', '발급일', '세션', ''].map(h => (
                  <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map(c => (
                <tr key={c.id} className="border-t border-line/60">
                  <td className="font-read whitespace-nowrap px-4 py-2.5 font-bold tracking-widest text-blue">{c.code}</td>
                  <td className="whitespace-nowrap px-4">{c.school_name}</td>
                  <td className="whitespace-nowrap px-4">{gradeClassLabel(c.grade, c.class_no)}</td>
                  <td className="whitespace-nowrap px-4">{c.teacher_name}</td>
                  <td className="whitespace-nowrap px-4 text-ink-soft">
                    {[c.teacher_phone, c.teacher_email].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 text-ink-soft">
                    {new Date(c.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="whitespace-nowrap px-4 tabular-nums">{c.session_count}</td>
                  <td className="whitespace-nowrap px-4 text-right">
                    {/* 세션이 있는 코드는 지울 수 없다(FK restrict) — 버튼 자체를 내지 않는다.
                        대기(pending) 건의 삭제(반려)는 위 섹션이 맡으므로 여기에는 오지 않는다 */}
                    {c.session_count === 0 && (
                      <button type="button" onClick={() => { setDelErr(''); setToDelete(c) }}
                        className="rounded-lg border-[1.5px] border-rec/40 bg-rec/5 px-2.5 py-1 text-xs font-bold text-rec-deep transition hover:border-rec">
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {active.length === 0 && (
            <p className="p-8 text-center text-sm text-ink-mute">아직 발급한 코드가 없습니다.</p>
          )}
        </div>
      )}

      <ConfirmDialog open={toDelete !== null} busy={deleting} error={delErr} danger
        title="이 코드를 삭제할까요?"
        confirmLabel={deleting ? '삭제 중…' : '삭제'}
        onConfirm={remove} onClose={() => setToDelete(null)}>
        <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
          <b>{toDelete?.code}</b> ({toDelete?.school_name} {toDelete && gradeClassLabel(toDelete.grade, toDelete.class_no)})
          코드를 삭제하면 이 코드로는 더 이상 검사를 시작할 수 없습니다.
          {/* pending 삭제 = 신청 반려. cascade로 명단(아동 실명·생년월일)까지 함께 지워지므로 반드시 알린다 */}
          {toDelete?.status === 'pending' && (
            <> 신청한 <b>학생 명단 {toDelete.roster_count}명</b>도 함께 삭제되며, 되돌릴 수 없습니다.</>
          )}
        </p>
      </ConfirmDialog>
    </div>
  )
}
