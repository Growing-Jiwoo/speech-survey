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

/** 로그인이 끝났을 때 — 로그인 뒤 이 화면으로 돌아온다(새 탭에서 열어 쓰던 발급 폼을 잃지 않게) */
const LOGIN_HREF = '/admin/login?next=%2Fadmin%2Fcodes'

export function CodeIssuer() {
  const queryClient = useQueryClient()
  const { data: codes, isLoading, isError, isFetching, error, refetch } = useClassCodesQuery()
  // 다시 받기가 실패해도 받아 둔 목록은 내리지 않는다(/admin 목록과 같은 규칙) — 전에는 한 번 실패하면 발급 목록 표가 통째로
  // 사라졌다. 대신 위에 띠로 알리고, 낡은 목록으로는 승인·삭제를 못 하게 잠근다(그사이 다른 탭이 승인·삭제했을 수 있다).
  // 401이면 다시 로그인 안내를 띄운다 — 전에는 「목록을 불러오지 못했어요」[다시 시도]뿐이었다(2026-10-12 점검).
  const expired = isError && /\(401\)/.test((error as Error | null)?.message ?? '')
  const stale = isError

  const [school, setSchool] = useState<SelectedSchool | null>(null)
  // 학년은 빈칸에서 시작한다 — 「1학년」이 미리 골라져 있으면 2학년 학급을 발급하며 지나쳐도 그대로 나가고,
  // 그 학급의 검사는 1학년 검사지로 진행된다(신청 화면 /apply와 같은 이유, 2026-10-12 점검).
  const [grade, setGrade] = useState('')
  const [classNo, setClassNo] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  /** 같은 학급의 코드가 이미 있다고 한 번 알린 학급(학교·학년·반) — 한 번 더 누르면 그대로 발급한다 */
  const [dupAck, setDupAck] = useState('')
  const [busy, setBusy] = useState(false)
  // 발급 직후 1건만 붙잡아 둔다 — 교사에게 그 자리에서 불러 줘야 하는데, 아래 목록에서
  // 방금 만든 코드를 눈으로 찾게 하면 다른 학급 코드를 잘못 읽어 줄 수 있다.
  const [issued, setIssued] = useState<ClassCodeItem | null>(null)
  const [copied, setCopied] = useState(false)
  const [toDelete, setToDelete] = useState<ClassCodeItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [delErr, setDelErr] = useState('')
  // 담임 이메일 인라인 수정 — 결과지 링크가 이 주소로만 가므로 오타를 고칠 길이 있어야 한다.
  // 오류 복구 경로라 "관리자 개입 없음" 원칙의 예외(스펙 2026-09-22 §이메일 안전망).
  const [editId, setEditId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [editErr, setEditErr] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  async function saveEmail(c: ClassCodeItem) {
    const v = editEmail.trim()
    if (!validEmail(v)) { setEditErr('이메일 형식을 확인해 주세요.'); return }
    setEditBusy(true); setEditErr('')
    const r = await requestJson<{ code: ClassCodeItem }>(`/api/admin/codes/${c.id}`,
      { method: 'PATCH', body: { teacherEmail: v } }, '수정하지 못했어요. 다시 시도해 주세요.')
    setEditBusy(false)
    if (!r.ok) { setEditErr(r.error); return }
    setEditId(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }

  // 대기(pending)와 발급(active)은 다른 섹션이 맡는다 — 아래 표는 active만 그린다.
  const active = (codes ?? []).filter(c => c.status === 'active')

  const cleanTeacher = teacherName.trim().replace(/\s+/g, ' ')
  const cleanPhone = phone.trim()
  const cleanEmail = email.trim()

  // 칸을 고치면 오류 문구를 지운다 — 「학교를 선택해 주세요」가 학교를 고른 뒤에도 [코드 발급]을 다시 누를
  // 때까지 남아 있었다(2026-10-08 야간 점검). 중복 학급 경고도 학급을 바꾸면 더는 맞지 않으므로 함께 지운다.
  const edit = <T,>(set: (v: T) => void) => (v: T) => { set(v); setErr('') }
  /** 학교·학년·반 — 학급이 바뀌면 「그래도 발급」 확인도 거둔다. 남겨 두면 3반 경고를 본 뒤 4반으로 갔다가 3반으로
   *  돌아왔을 때 경고 없이 바로 발급됐다(2026-10-12 점검). */
  const editClass = <T,>(set: (v: T) => void) => (v: T) => { edit(set)(v); setDupAck('') }

  async function issue() {
    // 서버 스키마(classCodeCreateSchema)와 같은 규칙으로 선검증한다.
    if (!school) { setErr('학교를 선택해 주세요.'); return }
    if (grade === '') { setErr('학년을 선택해 주세요.'); return }
    if (classNo === '') { setErr('반을 선택해 주세요.'); return }
    // 비어 있으면 「입력해 주세요」 — 형식 문구(「한글이나 영어로만」)는 쓴 것이 틀렸을 때만(2026-10-12 점검)
    if (cleanTeacher === '') { setErr('담임교사명을 입력해 주세요.'); return }
    if (!validName(cleanTeacher)) { setErr('담임교사명은 한글이나 영어로만 쓸 수 있어요.'); return }
    // 이메일 필수(사용자 확정 2026-09-22, 담당자 회신 아님) — 결과지 링크가 이 주소로만 간다.
    if (!cleanEmail) { setErr('담임 이메일을 입력해 주세요. 결과지 링크를 이 주소로 보내요.'); return }
    if (cleanPhone && !validPhone(cleanPhone)) { setErr('전화번호 형식으로 입력해 주세요. (예: 01012345678)'); return }
    if (!validEmail(cleanEmail)) { setErr('이메일 형식으로 입력해 주세요.'); return }

    // 같은 학급(학교·학년·반)에 코드가 이미 있으면 한 번 알린다 — 발급 직후 [코드 발급]을 한 번 더 누르거나 이미 신청된 반을
    // 직접 발급하면 한 반의 결과지·스캔본 올리기(반 표시가 코드마다 다르다)가 둘로 쪼개졌다(2026-10-08 야간 점검).
    // 막지는 않는다 — 담임이 바뀌어 새로 받는 경우도 있다.
    const classKey = `${school.schoolId}:${grade}:${classNo}`
    const dup = (codes ?? []).find(c => c.school_id === school.schoolId && c.grade === Number(grade) && c.class_no === Number(classNo))
    if (dup && dupAck !== classKey) {
      setDupAck(classKey)
      setErr(`이 학급의 코드가 이미 있어요(${dup.code}${dup.status === 'pending' ? ' · 신청 대기' : ''}, 담임 ${dup.teacher_name}). `
        + '같은 반에 코드가 둘이면 결과지가 나뉘어요. 그래도 새로 발급하려면 [코드 발급]을 한 번 더 누르세요.')
      return
    }

    setErr(''); setBusy(true)
    const r = await postJson<{ code: Omit<ClassCodeItem, 'session_count' | 'roster_count'> }>('/api/admin/codes', {
      region: school.region, schoolId: school.schoolId, schoolName: school.schoolName,
      grade: Number(grade), classNo: Number(classNo),
      teacherName: cleanTeacher, teacherPhone: cleanPhone, teacherEmail: cleanEmail,
    }, '코드를 발급하지 못했어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    setIssued({ ...r.data.code, session_count: 0, roster_count: 0 })
    setCopied(false)
    setDupAck('')
    setClassNo('')   // 같은 반을 실수로 한 번 더 발급하지 않게 — 다음 반은 학교·학년을 그대로 두고 반만 고르면 된다
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }

  async function remove() {
    if (!toDelete) return
    setDeleting(true); setDelErr('')
    const r = await requestJson(`/api/admin/codes/${toDelete.id}`, { method: 'DELETE' },
      '삭제하지 못했어요. 다시 시도해 주세요.')
    setDeleting(false)
    if (!r.ok) { setDelErr(r.error); return }
    if (issued?.id === toDelete.id) setIssued(null)
    // 삭제된 행을 캐시에서 먼저 빼서 화면에서 즉시 사라지게 한다 — invalidate만 걸면 재조회가
    // 돌아올 때까지 지운 행이 남아 있어 "안 지워졌나" 싶고, 그 사이 [삭제]를 다시 누를 수도
    // 있었다(사용자 보고 2026-08-19). 낙관적 업데이트가 아니라 **성공 응답 뒤** 반영이므로
    // 롤백이 필요 없다. 뒤이은 invalidate가 세션 수 같은 나머지 값을 서버 기준으로 맞춘다.
    const deletedId = toDelete.id
    queryClient.setQueryData<ClassCodeItem[]>(adminKeys.codes, prev =>
      prev?.filter(c => c.id !== deletedId))
    setToDelete(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.codes })
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_20px_44px_-28px_rgba(14,21,38,.35)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <div>
          <p className="text-[15px] font-bold">학급 코드 발급</p>
          <p className="text-[12px] text-ink-mute">코드 하나가 학급 하나예요 · 검사 현장에서는 이 코드만 입력해요</p>
        </div>
        <Link href="/admin"
          className="ml-auto rounded-lg border-[1.5px] border-line bg-well px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:border-blue">
          ← 검사 목록
        </Link>
      </div>
      {isError && (
        <p role="alert" className="border-b border-amber/40 bg-amber/10 px-5 py-2 text-[13px] text-amber">
          {expired ? <>로그인이 끝났어요(8시간).{' '}
              <a href={LOGIN_HREF} target="_blank" rel="noopener" className="font-bold underline">다시 로그인</a>하면 목록이 갱신돼요.</>
            : <>{codes ? '목록을 다시 받지 못했어요. 연결을 확인해 주세요. 아래는 마지막으로 받은 목록이에요.' : '목록을 불러오지 못했어요.'}{' '}
                <button type="button" onClick={() => void refetch()} disabled={isFetching} className="font-bold underline disabled:opacity-50">
                  {isFetching ? '다시 받는 중…' : '다시 시도'}
                </button></>}
          {codes && <> 목록을 다시 받을 때까지 승인·삭제는 잠가 둬요.</>}
        </p>
      )}

      {/* 발급 폼 — 표가 넓어 화면 폭을 넓혔지만 입력 칸은 읽기 좋은 폭에 둔다 */}
      <div className="border-b border-line p-5"><div className="max-w-3xl">
        <label className="text-[13px] font-bold text-ink-soft">학교명</label>
        <SchoolPicker value={school} onSelect={editClass(setSchool)} />
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-grade">학년</label>
            <div className="mt-1.5">
              <Select id="cc-grade" ariaLabel="학년" placeholder="학년 선택" value={grade} onChange={editClass(setGrade)}
                options={[1, 2, 3, 4, 5, 6].map(g => ({ value: String(g), label: `${g}학년` }))} />
            </div>
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-class">반</label>
            <div className="mt-1.5">
              <Select id="cc-class" ariaLabel="반" placeholder="반 선택" value={classNo}
                onChange={editClass(setClassNo)} options={CLASS_OPTIONS} />
            </div>
          </div>
        </div>
        <label className={labelCls} htmlFor="cc-teacher">담임교사명</label>
        <input id="cc-teacher" value={teacherName} maxLength={30}
          onChange={e => edit(setTeacherName)(e.target.value)} className={inputCls} />
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-phone">담임 전화번호 (선택)</label>
            <input id="cc-phone" value={phone} maxLength={60} inputMode="tel" placeholder="01012345678"
              onChange={e => edit(setPhone)(e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="cc-email">담임 이메일</label>
            <input id="cc-email" value={email} maxLength={60} inputMode="email" placeholder="name@example.com"
              onChange={e => edit(setEmail)(e.target.value)} className={inputCls} />
          </div>
        </div>
        {/* 이메일 필수 안내(사용자 확정 2026-09-22, 담당자 회신 아님) — 결과지 링크가 teacher_email로만 간다. */}
        <p className="mt-1.5 text-[12px] text-ink-mute">담임 이메일은 결과지 링크를 받을 주소라 필수예요. 전화번호는 몰라도 괜찮아요. 하이픈(-)은 저장할 때 자동으로 빠져요.</p>
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
      </div></div>

      {/* 신청 대기(pending) — 대기 건이 없으면 스스로 아무것도 그리지 않는다. 목록이 낡았으면 승인·삭제를 잠근다(위 stale) */}
      <PendingApplications items={(codes ?? []).filter(c => c.status === 'pending')} all={codes ?? []} locked={stale}
        onDelete={c => { setDelErr(''); setToDelete(c) }} />

      {/* 발급된 코드(active) — 받아 둔 목록이 있으면 다시 받기가 실패해도 그대로 보인다(위 띠가 알린다) */}
      {isLoading ? (
        <p className="p-8 text-center text-sm text-ink-mute">불러오는 중…</p>
      ) : codes ? (
        // 1024~1920 모든 폭에서 가로 스크롤 없이 연락처·발급일·검사 수·[삭제]가 보이게 — 화면 폭을 넓히고(app/admin/codes)
        // 학교·연락처 칸은 줄을 바꾼다(전화와 이메일을 두 줄로, 긴 이메일은 칸 안에서 접는다). 전에는 「전화 · 이메일」이 한 줄로
        // 잘리지 않아 발급일부터 [삭제]까지 표 맨 아래 가로 스크롤 뒤에 있었다(2026-10-12 점검).
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-mute">
                {['코드', '학교', '학년/반', '담임', '연락처', '발급일', '검사 수', ''].map(h => (
                  <th key={h} scope="col" className="whitespace-nowrap px-3 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map(c => (
                <tr key={c.id} className="border-t border-line/60">
                  <td className="font-read whitespace-nowrap px-3 py-2.5 font-bold tracking-widest text-blue">{c.code}</td>
                  <td className="max-w-[11rem] break-keep px-3">{c.school_name}</td>
                  <td className="whitespace-nowrap px-3">{gradeClassLabel(c.grade, c.class_no)}</td>
                  <td className="whitespace-nowrap px-3">{c.teacher_name}</td>
                  <td className="px-3 py-2 text-ink-soft">
                    {editId === c.id ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <input value={editEmail} onChange={e => setEditEmail(e.target.value)} inputMode="email"
                          aria-label="담임 이메일" aria-invalid={!!editErr}
                          className="h-8 w-56 rounded-lg border-[1.5px] border-line bg-white px-2 text-[13px] outline-none focus:border-blue" />
                        <button type="button" onClick={() => void saveEmail(c)} disabled={editBusy}
                          className="rounded-lg bg-blue px-2.5 py-1 text-xs font-bold text-white disabled:opacity-40">
                          {editBusy ? '저장 중…' : '저장'}
                        </button>
                        <button type="button" onClick={() => setEditId(null)} disabled={editBusy}
                          className="rounded-lg border-[1.5px] border-line bg-well px-2.5 py-1 text-xs font-bold text-ink-soft">
                          취소
                        </button>
                        {editErr && <span role="alert" className="text-xs text-rec-deep">{editErr}</span>}
                      </span>
                    ) : (
                      // 전화와 이메일을 두 줄로 — 한 줄로 이으면 칸이 넓어져 표가 화면을 넘었다. 긴 이메일은 칸 안에서 접는다.
                      <span className="flex max-w-[17rem] flex-col gap-0.5">
                        {c.teacher_phone && <span className="whitespace-nowrap tabular-nums">{c.teacher_phone}</span>}
                        <span className="flex items-baseline gap-2">
                          {c.teacher_email ? <span className="min-w-0 break-all">{c.teacher_email}</span>
                            : !c.teacher_phone && <span>—</span>}
                          {/* 이메일 없는 옛 코드(필수화 전 발급)도 여기서 채운다 — 채우기 전엔 그 학급이 결과지를 받을 수 없다 */}
                          <button type="button" onClick={() => { setEditId(c.id); setEditEmail(c.teacher_email ?? ''); setEditErr('') }}
                            // 누르는 범위만 넓힌다(-m/p — 자리는 그대로). 글자만 눌려 21×16px였다(2026-10-21 태블릿 점검)
                            className="-mx-1.5 -my-2 flex-none whitespace-nowrap px-1.5 py-2 text-[11.5px] font-bold text-blue underline underline-offset-2">
                            {c.teacher_email ? '수정' : '이메일 등록'}
                          </button>
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 text-ink-soft">
                    {new Date(c.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="whitespace-nowrap px-3 tabular-nums">{c.session_count}</td>
                  <td className="whitespace-nowrap px-3 text-right">
                    {/* 세션이 있는 코드는 지울 수 없다(FK restrict) — 버튼 자체를 내지 않는다.
                        대기(pending) 건의 삭제(반려)는 위 섹션이 맡으므로 여기에는 오지 않는다. 목록이 낡았으면 잠근다(위 stale) */}
                    {c.session_count === 0 && (
                      <button type="button" onClick={() => { setDelErr(''); setToDelete(c) }} disabled={stale}
                        className="rounded-lg border-[1.5px] border-rec/40 bg-rec/5 px-2.5 py-1 text-xs font-bold text-rec-deep transition hover:border-rec disabled:opacity-40">
                        삭제
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {active.length === 0 && (
            <p className="p-8 text-center text-sm text-ink-mute">아직 발급한 코드가 없어요.</p>
          )}
        </div>
      ) : null}

      {/* pending 삭제 = 신청 반려 — 승인 전이라 「이 코드로는 더 이상 검사를 시작할 수 없습니다」는 맞지 않는 말이었고,
          반려 메일이 없다는 것을 창이 말하지 않았다(2026-10-08 야간 점검, 사용자 확정 같은 날). 버튼 이름 「삭제」는
          관리자 설명서(「반려하는 방법은 삭제뿐」)와 맞추려고 그대로 둔다. */}
      <ConfirmDialog open={toDelete !== null} busy={deleting} error={delErr} danger
        title={toDelete?.status === 'pending' ? '이 신청을 삭제할까요?' : '이 코드를 삭제할까요?'}
        confirmLabel={deleting ? '삭제 중…' : '삭제'}
        onConfirm={remove} onClose={() => setToDelete(null)}>
        {toDelete?.status === 'pending' ? (
          <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
            {toDelete.school_name} {gradeClassLabel(toDelete.grade, toDelete.class_no)} <b>{toDelete.teacher_name}</b> 선생님의
            신청과 <b>학생 명단 {toDelete.roster_count}명</b>이 지워지고 되돌릴 수 없어요.
            {/* cascade로 명단(아동 실명·생년월일)까지 함께 지워지므로 반드시 알린다 */}
            <br /><b className="text-rec-deep">선생님께는 메일이 가지 않아요</b>. 반려 사실은 따로 알려 주세요
            {toDelete.teacher_email ? <>({toDelete.teacher_email})</> : null}.
          </p>
        ) : (
          <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
            <b>{toDelete?.code}</b> ({toDelete?.school_name} {toDelete && gradeClassLabel(toDelete.grade, toDelete.class_no)})
            코드를 삭제하면 이 코드로는 더 이상 검사를 시작할 수 없어요.
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}
