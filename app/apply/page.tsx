// app/apply/page.tsx — 교사 신청 화면(공개). 학급 정보 + 명단 + 동의 → POST /api/apply.
// 관리자 직접 발급(/admin/codes)과 달리 **이메일이 필수**다 — 접수는 pending 코드만 만들고,
// 승인 메일이 교사에게 코드가 닿는 유일한 경로다(스펙: 승인이 실제 관문이어야 한다).
'use client'
import { useState } from 'react'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { RosterEditor } from '@/components/apply/RosterEditor'
import { SchoolPicker, type SelectedSchool } from '@/components/SchoolPicker'
import { Select } from '@/components/Select'
import { CLASS_OPTIONS } from '@/lib/format'
import { postJson } from '@/lib/http'
import type { RosterChild } from '@/lib/roster'
import { validEmail, validName, validPhone } from '@/lib/validate'

const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-[15px] outline-none transition focus:border-blue focus:bg-white'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

/** ⚠️ 담당자 확인 대기 — 확정 아님. 아래 문구는 개발용 초안이다(사용자 확정 2026-08-18).
 *  담당자가 안내 문구 예시를 만들기로 했고, 연구윤리 검토본이 오면 다시 교체된다.
 *  교체할 때 이 상수만 고치면 되고 화면 구조는 건드릴 필요가 없다.
 *  ⚠️ 아동 개인정보·연구 활용 동의는 여기서 받을 수 없다 — 교사는 보호자의 대리인이
 *  아니다. 그것은 가정통신문(서면)의 몫이다(스펙 "동의" 절). */
const APPLY_CHECKS = [
  '개인정보(성명·연락처) 수집·이용에 동의합니다.',
  '검사 절차 안내를 확인했습니다.',
  '보호자 서면 동의를 받은 학생만 명단에 등록했습니다.',
] as const

export default function ApplyPage() {
  const [school, setSchool] = useState<SelectedSchool | null>(null)
  const [grade, setGrade] = useState('1')
  const [classNo, setClassNo] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  // 명단 유효성은 RosterEditor가 전부 소유한다 — 확정 명단일 때만 배열이 온다.
  const [roster, setRoster] = useState<RosterChild[] | null>(null)
  const [checks, setChecks] = useState([false, false, false])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const cleanTeacher = teacherName.trim().replace(/\s+/g, ' ')
  const cleanPhone = phone.trim()
  const cleanEmail = email.trim()
  const allChecked = checks.every(Boolean)
  const filled = school !== null && classNo !== '' && cleanTeacher !== ''
    && cleanEmail !== '' && roster !== null && allChecked

  /** [신청하기] — 서버 스키마(applySchema)와 같은 규칙으로 선검증한 뒤 접수한다.
   *  성공 분기에서는 busy를 풀지 않는다(app/page.tsx의 begin()과 같은 이유) — 접수 완료
   *  화면으로 바뀌기 전에 버튼이 다시 살아나면 느린 기기에서 연타로 pending 코드가
   *  두 개 생기고, 관리자가 같은 학급을 두 번 승인하게 된다. */
  async function submit() {
    if (!school) { setErr('학교를 선택해 주세요.'); return }
    if (classNo === '') { setErr('반을 선택해 주세요.'); return }
    if (!validName(cleanTeacher)) { setErr('선생님 성함은 한글이나 영어로만 쓸 수 있어요.'); return }
    if (!validEmail(cleanEmail)) { setErr('승인 안내를 받을 이메일을 형식에 맞게 입력해 주세요.'); return }
    if (cleanPhone && !validPhone(cleanPhone)) { setErr('전화번호 형식으로 입력해 주세요. (예: 01012345678)'); return }
    if (!roster) { setErr('학급 명단을 확인해 주세요.'); return }
    if (!allChecked) { setErr('안내 및 동의 항목에 모두 체크해 주세요.'); return }

    setErr(''); setBusy(true)
    const r = await postJson('/api/apply', {
      region: school.region, schoolId: school.schoolId, schoolName: school.schoolName,
      grade: Number(grade), classNo: Number(classNo),
      teacherName: cleanTeacher, teacherPhone: cleanPhone, teacherEmail: cleanEmail,
      roster,
    }, '접수에 실패했어요. 다시 시도해 주세요.')
    if (!r.ok) { setBusy(false); setErr(r.error); return }
    setDone(true)
  }

  // 접수 완료 화면. **학급 코드를 보여주지 않는다** — 라우트가 코드를 응답에 넣지 않고,
  // 여기서 코드를 보여주면 승인이 관문 역할을 잃는다(app/api/apply/route.ts 첫 주석).
  if (done) return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6">
      <Blip variant="logo" className="h-14 w-14" />
      <h1 className="mt-6 text-xl font-bold">신청이 접수됐어요.</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        승인되면 이메일로 학급 코드를 보내드립니다.<br />
        <b className="text-ink">{cleanEmail}</b> 메일함을 확인해 주세요.
      </p>
      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-mute">
        승인까지 며칠 걸릴 수 있어요.<br />메일이 오지 않으면 스팸함도 확인해 주세요.
      </p>
    </main>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col p-6 pt-10">
      <div className="flex items-center gap-2 self-center">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-10 self-center text-2xl font-bold">검사 신청</h1>
      <p className="mt-3 self-center text-center text-sm leading-relaxed text-ink-soft">
        학급 정보와 명단을 남겨 주시면<br />확인 후 학급 코드를 메일로 보내드려요.
      </p>

      {/* 자동완성은 끈다 — app/page.tsx와 같은 이유(개인 기기에서 남의 칸에 제안되는 것 방지) */}
      <form className="mt-8 w-full" autoComplete="off"
        onSubmit={e => { e.preventDefault(); if (!busy) void submit() }}>
        <section className="card p-5">
          <h2 className="text-[15px] font-bold">학교와 선생님 정보</h2>
          <label className="mt-4 block text-[13px] font-bold text-ink-soft">학교명</label>
          <SchoolPicker value={school} onSelect={setSchool} />
          <div className="flex gap-2.5">
            <div className="flex-1">
              <label className={labelCls} htmlFor="ap-grade">학년</label>
              <div className="mt-1.5">
                <Select id="ap-grade" ariaLabel="학년" placeholder="학년" value={grade} onChange={setGrade}
                  options={[1, 2, 3, 4, 5, 6].map(g => ({ value: String(g), label: `${g}학년` }))} />
              </div>
            </div>
            <div className="flex-1">
              <label className={labelCls} htmlFor="ap-class">반</label>
              <div className="mt-1.5">
                <Select id="ap-class" ariaLabel="반" placeholder="반 선택" value={classNo}
                  onChange={setClassNo} options={CLASS_OPTIONS} />
              </div>
            </div>
          </div>
          <label className={labelCls} htmlFor="ap-teacher">선생님 성함</label>
          <input id="ap-teacher" value={teacherName} maxLength={30}
            onChange={e => setTeacherName(e.target.value)} className={inputCls} />
          <label className={labelCls} htmlFor="ap-email">승인 안내를 받을 이메일 (필수)</label>
          <input id="ap-email" value={email} maxLength={60} inputMode="email" placeholder="name@example.com"
            onChange={e => setEmail(e.target.value)} className={inputCls} />
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-mute">
            {/* "학교 메일"로 못 박지 않는다 — 개인 메일을 쓰는 교사도 있고, 승인 메일이 코드가
                닿는 유일한 경로라 받을 수 있는 주소가 맞다(사용자 확정 2026-08-21). */}
            학급 코드는 이 주소로만 보내드려요.<br />메일을 받을 수 있는 주소를 적어 주세요.
          </p>
          <label className={labelCls} htmlFor="ap-phone">연락처 (선택)</label>
          <input id="ap-phone" value={phone} maxLength={60} inputMode="tel" placeholder="01012345678"
            onChange={e => setPhone(e.target.value)} className={inputCls} />
        </section>

        <section className="card mt-4 p-5">
          <h2 className="text-[15px] font-bold">학급 명단</h2>
          <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-mute">
            번호·이름·성별·생년월일 네 칸만 씁니다. 그 밖의 정보는 저장하지 않아요.
          </p>
          <RosterEditor onChange={setRoster} />
        </section>

        <section className="card mt-4 p-5">
          <h2 className="text-[15px] font-bold">안내 및 동의</h2>
          <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[12.5px] text-ink-soft">
            {['신청', '담당자 승인', '학급 코드 메일', '검사 진행'].map((s, i) => (
              <li key={s}>{i > 0 && <span className="mr-2 text-ink-mute">→</span>}{s}</li>
            ))}
          </ol>
          <div className="mt-4 flex flex-col gap-2">
            {APPLY_CHECKS.map((text, i) => (
              <label key={text} className="flex cursor-pointer items-start gap-2.5 rounded-lg border-[1.5px] border-line bg-well px-3 py-2.5">
                <input type="checkbox" checked={checks[i]}
                  onChange={e => setChecks(c => c.map((v, j) => (j === i ? e.target.checked : v)))}
                  className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-blue)]" />
                <span className="text-[13px] font-bold leading-relaxed text-ink-soft">{text}</span>
              </label>
            ))}
          </div>
        </section>

        {err && <p role="alert" className="mt-3 text-sm text-rec-deep">{err}</p>}
        <button type="submit" disabled={busy || !filled} className="cta mt-5">신청하기</button>
        {!filled && (
          <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-mute">
            학급 정보·명단을 채우고 동의 항목에 모두 체크하면 신청할 수 있어요.
          </p>
        )}
      </form>
      <LoadingOverlay show={busy} />
    </main>
  )
}
