'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { SchoolPicker, type SelectedSchool } from '@/components/SchoolPicker'
import { newState, saveState } from '@/lib/survey-state'
import { validBirthYmd, validClassNo, validContact, validGender, validName } from '@/lib/validate'

const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15'
const selectCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-3 text-base outline-none transition focus:border-blue'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

const pad = (n: number) => String(n).padStart(2, '0')
const NOW_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => NOW_YEAR - 5 - i) // 초등 연령대 여유 범위
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

type FieldErrors = Partial<Record<'school' | 'birth' | 'classNo' | 'gender' | 'name' | 'teacher' | 'contact', string>>

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p role="alert" className="mt-1.5 text-[13px] text-rec-deep">{msg}</p>
}

export default function StartPage() {
  const router = useRouter()
  const [school, setSchool] = useState<SelectedSchool | null>(null)
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [grade, setGrade] = useState('1')
  const [classNo, setClassNo] = useState('')
  const [gender, setGender] = useState<'남' | '여' | ''>('')
  const [name, setName] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [contact, setContact] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)

  // 선택한 연·월에 맞는 일수 (윤년 반영)
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  async function begin() {
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const cleanTeacher = teacherName.trim().replace(/\s+/g, ' ')
    const cleanContact = contact.trim()
    const birthYmd = year && month && day ? `${String(year).slice(2)}${pad(Number(month))}${pad(Number(day))}` : ''

    const next: FieldErrors = {}
    if (!school) next.school = '학교를 선택해 주세요.'
    if (!validBirthYmd(birthYmd)) next.birth = '생년월일을 선택해 주세요.'
    if (!validClassNo(Number(classNo))) next.classNo = '반은 1~99 사이 숫자로 입력해 주세요.'
    if (!validGender(gender)) next.gender = '성별을 선택해 주세요.'
    if (!validName(cleanName)) next.name = '이름은 한글이나 영어로만 쓸 수 있어요.'
    if (!validName(cleanTeacher)) next.teacher = '담임교사명은 한글이나 영어로만 쓸 수 있어요.'
    if (!validContact(cleanContact)) next.contact = '연락처는 전화번호 또는 이메일 형식으로 입력해 주세요.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setFormErr(''); setBusy(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region: school!.region, schoolId: school!.schoolId, schoolName: school!.schoolName,
          birthYmd, grade: Number(grade), classNo: Number(classNo), gender,
          name: cleanName, teacherName: cleanTeacher, teacherContact: cleanContact,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setFormErr(json.error ?? '문제가 생겼어요. 다시 시도해 주세요.'); return }
      saveState(newState(json.sessionId, cleanName))
      router.push('/survey')
    } catch {
      setFormErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  const filled = school && year && month && day && classNo && gender && name.trim() && teacherName.trim() && contact.trim()

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-10 text-2xl font-bold">안녕하세요!</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        검사를 시작하기 전에<br />아래 정보를 입력해 주세요.
      </p>
      <div className="card mt-8 w-full p-5">
        <label className="text-[13px] font-bold text-ink-soft">학교명</label>
        <SchoolPicker value={school} onSelect={setSchool} />
        <FieldError msg={errors.school} />

        <span className={labelCls}>생년월일</span>
        <div className="mt-1.5 flex gap-2">
          <select aria-label="출생 연도" value={year} onChange={e => { setYear(e.target.value); setDay('') }}
            className={`${selectCls} mt-0 flex-[1.3]`}>
            <option value="">연도</option>
            {YEARS.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select aria-label="출생 월" value={month} onChange={e => { setMonth(e.target.value); setDay('') }}
            className={`${selectCls} mt-0 flex-1`}>
            <option value="">월</option>
            {MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          <select aria-label="출생 일" value={day} onChange={e => setDay(e.target.value)} disabled={!year || !month}
            className={`${selectCls} mt-0 flex-1 disabled:opacity-50`}>
            <option value="">일</option>
            {DAYS.map(d => <option key={d} value={d}>{d}일</option>)}
          </select>
        </div>
        <FieldError msg={errors.birth} />

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="grade">학년</label>
            <select id="grade" value={grade} onChange={e => setGrade(e.target.value)} className={selectCls}>
              {[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g}>{g}학년</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="classNo">반</label>
            <input id="classNo" value={classNo} inputMode="numeric" maxLength={2}
              onChange={e => setClassNo(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </div>
        </div>
        <FieldError msg={errors.classNo} />

        <span className={labelCls}>성별</span>
        <div className="mt-1.5 flex gap-2.5">
          {(['남', '여'] as const).map(g => (
            <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g}
              className={`h-[50px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
                gender === g ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
              {g}
            </button>
          ))}
        </div>
        <FieldError msg={errors.gender} />

        <label className={labelCls} htmlFor="name">이름</label>
        <input id="name" value={name} maxLength={30} onChange={e => setName(e.target.value)} className={inputCls} />
        <FieldError msg={errors.name} />

        <label className={labelCls} htmlFor="teacher">담임교사명</label>
        <input id="teacher" value={teacherName} maxLength={30}
          onChange={e => setTeacherName(e.target.value)} className={inputCls} />
        <FieldError msg={errors.teacher} />

        <label className={labelCls} htmlFor="contact">담임 연락처</label>
        <input id="contact" value={contact} maxLength={60} placeholder="전화번호 또는 이메일"
          onChange={e => setContact(e.target.value)} className={inputCls} />
        <FieldError msg={errors.contact} />

        {formErr && <p role="alert" className="mt-3 text-sm text-rec-deep">{formErr}</p>}
        <button onClick={begin} disabled={busy || !filled} className="cta mt-5">
          {busy ? '준비 중…' : '시작하기'}
        </button>
      </div>
      <p className="mt-auto pt-6 text-center text-[11px] text-ink-mute">녹음된 목소리는 검사 확인 용도로만 사용돼요.</p>
    </main>
  )
}
