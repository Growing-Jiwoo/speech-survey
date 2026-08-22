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
import { APPLY_CHECKS, SURVEY_NOTICE } from '@/lib/consent'
import { CLASS_OPTIONS } from '@/lib/format'
import { postJson } from '@/lib/http'
import type { RosterChild } from '@/lib/roster'
import { validEmail, validName, validPhone } from '@/lib/validate'

const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-[15px] outline-none transition focus:border-blue focus:bg-white'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

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
    if (!validEmail(cleanEmail)) { setErr('이메일 형식을 확인해 주세요. (예: name@example.com)'); return }
    if (cleanPhone && !validPhone(cleanPhone)) { setErr('전화번호 형식으로 입력해 주세요. (예: 01012345678)'); return }
    if (!roster) { setErr('학급 명단을 확인해 주세요.'); return }
    if (!allChecked) { setErr('검사 안내를 읽고 동의 항목 3개에 모두 체크해 주세요.'); return }

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
      {/* 종전은 「접수됐어요」(해요체)와 「보내드립니다」(합니다체)가 한 화면에 섞여 있었다. */}
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        담당자가 명단을 확인한 뒤 학급 코드를 보내드려요.<br />
        <b className="text-ink">{cleanEmail}</b> 메일함을 확인해 주세요.
      </p>
      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-mute">
        승인까지 며칠 걸릴 수 있어요.<br />
        메일이 오지 않으면 스팸함도 확인해 주세요.<br />
        학급 코드는 메일로만 전달되니 받으신 메일을 보관해 주세요.
      </p>
    </main>
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col p-6 pt-10">
      <div className="flex items-center gap-2 self-center">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-10 self-center text-2xl font-bold">읽기 선별검사 신청</h1>
      {/* 종전 리드는 "학급 정보와 명단을 남겨 주시면…"뿐이라 **무슨 검사인지 한 줄도 없었다.**
          이 화면에 처음 들어온 교사가 가장 먼저 알아야 하는 것을 먼저 말한다. */}
      <p className="mt-3 self-center text-center text-sm leading-relaxed text-ink-soft">
        아이가 낱말과 문장을 소리 내어 읽는 과정을 녹음해<br />
        읽기 발달을 조기에 확인하는 검사예요.
      </p>
      <p className="mt-2.5 self-center text-center text-[13px] leading-relaxed text-ink-mute">
        학급 명단을 남겨 주시면 담당자가 확인한 뒤<br />학급 코드를 메일로 보내드려요.
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
          {/* 라벨에서 (필수)를 뗀다 — 학교·학년·반·성함·이메일이 모두 필수인데 이 칸만
              (필수)가 붙어 나머지가 선택처럼 보였다. 선택인 것에만 (선택)을 붙인다. */}
          <label className={labelCls} htmlFor="ap-email">이메일</label>
          <input id="ap-email" value={email} maxLength={60} type="email" inputMode="email"
            spellCheck={false} placeholder="name@example.com"
            onChange={e => setEmail(e.target.value)} className={inputCls} />
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-mute">
            {/* 종전 둘째 줄("메일을 받을 수 있는 주소를 적어 주세요")은 동어반복이었다 —
                실질 정보는 "이 주소로만"과 "학교 메일이 아니어도 된다"다.
                "학교 메일"로 못 박지 않는 이유는 개인 메일을 쓰는 교사도 있고, 승인 메일이
                코드가 닿는 유일한 경로이기 때문이다(사용자 확정 2026-08-21). */}
            학급 코드는 <b className="text-ink-soft">이 주소로만</b> 보내드려요.<br />
            학교 메일이 아니어도 괜찮아요.
          </p>
          <label className={labelCls} htmlFor="ap-phone">연락처 (선택)</label>
          <input id="ap-phone" value={phone} maxLength={60} inputMode="tel" spellCheck={false}
            placeholder="01012345678"
            onChange={e => setPhone(e.target.value)} className={inputCls} />
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-mute">
            메일이 닿지 않을 때만 연락드려요.
          </p>
        </section>

        <section className="card mt-4 p-5">
          <h2 className="text-[15px] font-bold">학급 명단</h2>
          <p className="mt-1 mb-4 text-[12px] leading-relaxed text-ink-mute">
            {/* "그 밖의 정보는 저장하지 않아요"보다 구체적으로 — 명렬표를 올릴 때 교사가
                실제로 걱정하는 것은 주민등록번호다. 2중 차단이 실제 기능이므로 그것을 말한다
                (lib/roster: 머리글 이름과 값 모양 양쪽에서 걸러 낸다). */}
            번호·이름·성별·생년월일 <b className="text-ink-soft">네 칸만</b> 씁니다.
            주민등록번호가 들어 있으면 읽지 않고 버려요.
          </p>
          <RosterEditor onChange={setRoster} />
        </section>

        <section className="card mt-4 p-5">
          <h2 className="text-[15px] font-bold">검사 안내 및 동의</h2>
          <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-[12.5px] text-ink-soft">
            {['신청', '담당자 승인', '학급 코드 메일', '검사 진행'].map((s, i) => (
              <li key={s}>{i > 0 && <span className="mr-2 text-ink-mute">→</span>}{s}</li>
            ))}
          </ol>

          {/* 「위 검사 안내를 확인했습니다」 체크가 가리킬 실체 — 종전에는 확인할 안내가
              화면에 없는데 확인했다고 체크하게 만들었다(가짜 동의). */}
          <ul className="mt-4 flex flex-col gap-1.5 rounded-xl border-[1.5px] border-line bg-well px-4 py-3.5">
            {SURVEY_NOTICE.map(t => (
              <li key={t} className="flex gap-2 text-[13px] leading-relaxed text-ink-soft">
                <span aria-hidden="true" className="flex-none text-blue">·</span>{t}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col gap-2">
            {APPLY_CHECKS.map((c, i) => (
              <label key={c.label} className="flex cursor-pointer items-start gap-2.5 rounded-lg border-[1.5px] border-line bg-white px-3 py-2.5">
                <input type="checkbox" checked={checks[i]}
                  onChange={e => setChecks(cs => cs.map((v, j) => (j === i ? e.target.checked : v)))}
                  className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-blue)]" />
                <span>
                  <span className="block text-[13px] font-bold leading-relaxed text-ink-soft">{c.label}</span>
                  {c.note && <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-mute">{c.note}</span>}
                </span>
              </label>
            ))}
          </div>
        </section>

        {err && <p role="alert" className="mt-3 text-sm text-rec-deep">{err}</p>}
        <button type="submit" disabled={busy || !filled} className="cta mt-5">신청하기</button>
        {!filled && (
          <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-mute">
            학급 정보와 명단을 채우고 동의 항목 3개에 체크하면 신청할 수 있어요.
          </p>
        )}
      </form>
      <LoadingOverlay show={busy} />
    </main>
  )
}
