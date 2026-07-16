// app/page.tsx — 검사 시작(아동 정보 입력) 화면. 주로 교사/검사자가 입력한다.
// 제출 시 서버 검증(lib/schema)과 같은 규칙으로 클라이언트에서 선검증하고,
// 세션 생성 성공 시 진행 상태를 localStorage에 만들어 /survey로 이동한다.
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { Select } from '@/components/Select'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { SchoolPicker, type SelectedSchool } from '@/components/SchoolPicker'
import { pad2 } from '@/lib/format'
import { postJson } from '@/lib/http'
import { clearState, loadState, newState, saveState } from '@/lib/survey-state'
import { validBirthYmd, validClassNo, validContact, validGender, validName } from '@/lib/validate'

const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

const NOW_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => NOW_YEAR - 5 - i) // 초등 연령대 여유 범위
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

type FieldKey = 'school' | 'birth' | 'classNo' | 'gender' | 'name' | 'teacher' | 'contact'
type FieldErrors = Partial<Record<FieldKey, string>>

/** 화면상 필드 순서 — 검증 실패 시 이 순서의 첫 에러 필드로 포커스를 옮긴다. */
const FIELD_ORDER: FieldKey[] = ['school', 'birth', 'classNo', 'gender', 'name', 'teacher', 'contact']

function focusFirstError(errors: FieldErrors) {
  const key = FIELD_ORDER.find(k => errors[k])
  if (!key) return
  const root = document.querySelector<HTMLElement>(`[data-field="${key}"]`)
  const target = root?.matches('input,button') ? root : root?.querySelector<HTMLElement>('input,button')
  ;(target ?? root)?.focus()
  root?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null
  return <p id={id} role="alert" className="mt-1.5 text-[13px] text-rec-deep">{msg}</p>
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
  // 이 기기에 남아 있는 미제출 세션 — 실수로 뒤로가기/탭 닫기를 한 경우 이어서 할 수 있게 안내
  const [resumable, setResumable] = useState(false)

  useEffect(() => {
    // localStorage는 서버 프리렌더에 없으므로 마운트 후 확인(하이드레이션 불일치 방지).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResumable(loadState() !== null)
  }, [])

  // 선택한 연·월에 맞는 일수 (윤년 반영)
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  async function begin() {
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const cleanTeacher = teacherName.trim().replace(/\s+/g, ' ')
    const cleanContact = contact.trim()
    // 생년월일은 서버 스키마(birthYmdSchema)와 같은 YYMMDD 6자리로 조립한다
    const birthYmd = year && month && day ? `${String(year).slice(2)}${pad2(Number(month))}${pad2(Number(day))}` : ''

    const next: FieldErrors = {}
    if (!school) next.school = '학교를 선택해 주세요.'
    if (!validBirthYmd(birthYmd)) next.birth = '생년월일을 선택해 주세요.'
    if (!validClassNo(Number(classNo))) next.classNo = '반은 1~99 사이 숫자로 입력해 주세요.'
    if (!validGender(gender)) next.gender = '성별을 선택해 주세요.'
    if (!validName(cleanName)) next.name = '이름은 한글이나 영어로만 쓸 수 있어요.'
    if (!validName(cleanTeacher)) next.teacher = '담임교사명은 한글이나 영어로만 쓸 수 있어요.'
    if (!validContact(cleanContact)) next.contact = '연락처는 전화번호 또는 이메일 형식으로 입력해 주세요.'
    setErrors(next)
    if (Object.keys(next).length > 0) { focusFirstError(next); return }

    setFormErr(''); setBusy(true)
    const r = await postJson<{ sessionId: string; sessionToken: string }>('/api/sessions', {
      region: school!.region, schoolId: school!.schoolId, schoolName: school!.schoolName,
      birthYmd, grade: Number(grade), classNo: Number(classNo), gender,
      name: cleanName, teacherName: cleanTeacher, teacherContact: cleanContact,
    })
    setBusy(false)
    if (!r.ok) { setFormErr(r.error); return }
    clearState() // 공용 기기에 남아 있을 이전 검사 흔적 제거(세션별 키 누적 방지)
    saveState(newState(r.data.sessionId, r.data.sessionToken))
    router.push('/survey')
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

      {resumable && (
        <div className="card mt-6 flex w-full items-center justify-between gap-3 border-blue/40 bg-blue/5 p-4">
          <p className="text-sm font-bold text-ink-soft">이 기기에 진행 중인 검사가 있어요.</p>
          <div className="flex flex-none gap-2">
            <button type="button" onClick={() => router.push('/survey')}
              className="rounded-lg bg-blue px-3 py-2 text-xs font-bold text-white">
              이어서 하기
            </button>
            <button type="button" onClick={() => { clearState(); setResumable(false) }}
              className="rounded-lg border-[1.5px] border-line bg-white px-3 py-2 text-xs font-bold text-ink-soft">
              새로 시작
            </button>
          </div>
        </div>
      )}

      {/* 자동완성은 의도적으로 끈다(autoComplete="off") — 교사 개인 기기에서 본인 정보가
          아동 정보 칸에 제안되는 것을 막는다. */}
      <form className="card mt-8 w-full p-5" autoComplete="off"
        onSubmit={e => { e.preventDefault(); if (!busy && filled) void begin() }}>
        <label className="text-[13px] font-bold text-ink-soft">학교명</label>
        <div data-field="school">
          <SchoolPicker value={school} onSelect={setSchool} />
        </div>
        <FieldError id="err-school" msg={errors.school} />

        <span className={labelCls}>생년월일</span>
        <div className="mt-1.5 flex gap-2" data-field="birth" role="group" aria-label="생년월일"
          aria-describedby={errors.birth ? 'err-birth' : undefined}>
          <Select ariaLabel="출생 연도" placeholder="연도" className="flex-[1.3]"
            value={year} onChange={v => { setYear(v); setDay('') }}
            options={YEARS.map(y => ({ value: String(y), label: `${y}년` }))} />
          <Select ariaLabel="출생 월" placeholder="월" className="flex-1"
            value={month} onChange={v => { setMonth(v); setDay('') }}
            options={MONTHS.map(m => ({ value: String(m), label: `${m}월` }))} />
          <Select ariaLabel="출생 일" placeholder="일" className="flex-1" disabled={!year || !month}
            value={day} onChange={setDay}
            options={DAYS.map(d => ({ value: String(d), label: `${d}일` }))} />
        </div>
        <FieldError id="err-birth" msg={errors.birth} />

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="grade">학년</label>
            <div className="mt-1.5">
              <Select id="grade" ariaLabel="학년" placeholder="학년" value={grade} onChange={setGrade}
                options={[1, 2, 3, 4, 5, 6].map(g => ({ value: String(g), label: `${g}학년` }))} />
            </div>
          </div>
          <div className="flex-1">
            <label className={labelCls} htmlFor="classNo">반</label>
            <input id="classNo" data-field="classNo" name="classNo" value={classNo} inputMode="numeric" maxLength={2}
              aria-describedby={errors.classNo ? 'err-classNo' : undefined} aria-invalid={!!errors.classNo}
              onChange={e => setClassNo(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </div>
        </div>
        <FieldError id="err-classNo" msg={errors.classNo} />

        <span className={labelCls} id="gender-label">성별</span>
        <div className="mt-1.5 flex gap-2.5" data-field="gender" role="group" aria-labelledby="gender-label"
          aria-describedby={errors.gender ? 'err-gender' : undefined}>
          {(['남', '여'] as const).map(g => (
            <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g}
              className={`h-[50px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
                gender === g ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
              {g}
            </button>
          ))}
        </div>
        <FieldError id="err-gender" msg={errors.gender} />

        <label className={labelCls} htmlFor="name">이름</label>
        <input id="name" data-field="name" name="name" value={name} maxLength={30}
          aria-describedby={errors.name ? 'err-name' : undefined} aria-invalid={!!errors.name}
          onChange={e => setName(e.target.value)} className={inputCls} />
        <FieldError id="err-name" msg={errors.name} />

        <label className={labelCls} htmlFor="teacher">담임교사명</label>
        <input id="teacher" data-field="teacher" name="teacher" value={teacherName} maxLength={30}
          aria-describedby={errors.teacher ? 'err-teacher' : undefined} aria-invalid={!!errors.teacher}
          onChange={e => setTeacherName(e.target.value)} className={inputCls} />
        <FieldError id="err-teacher" msg={errors.teacher} />

        <label className={labelCls} htmlFor="contact">담임 연락처</label>
        <input id="contact" data-field="contact" name="contact" value={contact} maxLength={60} placeholder="전화번호 또는 이메일"
          aria-describedby={errors.contact ? 'err-contact' : undefined} aria-invalid={!!errors.contact}
          onChange={e => setContact(e.target.value)} className={inputCls} />
        <FieldError id="err-contact" msg={errors.contact} />

        {formErr && <p role="alert" className="mt-3 text-sm text-rec-deep">{formErr}</p>}
        <button type="submit" disabled={busy || !filled} className="cta mt-5">시작하기</button>
      </form>
      <p className="mt-auto pt-6 text-center text-[11px] text-ink-mute">녹음된 목소리는 검사 확인 용도로만 사용돼요.</p>
      <LoadingOverlay show={busy} />
    </main>
  )
}
