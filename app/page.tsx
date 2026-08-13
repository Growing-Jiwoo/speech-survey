// app/page.tsx — 검사 시작 화면. 학급 코드 + 아동 정보만 입력한다(사용자 확정 2026-08-13).
// 학급 정보(학교·학년·반·담임·연락처)는 관리자가 /admin/codes에서 코드 발급 시 입력했다.
// [확인] → 코드 조회(verify-code) → 학급 정보 확인 모달 → [맞아요] → 세션 생성 → /survey.
// 학급 코드는 세션 생성 성공 직후 별도 키에 저장돼, 같은 학급의 다음 아동은 코드가 채워진
// 채로 시작한다(아동 정보는 절대 남기지 않는다 — lib/survey-state.ts 참고).
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { Select } from '@/components/Select'
import { CONSENT_NOTICE, GUARDIAN_CONSENT_LABEL } from '@/lib/consent'
import { gradeClassLabel, pad2 } from '@/lib/format'
import { postJson } from '@/lib/http'
import { clearState, loadClassCode, loadState, newState, saveClassCode, saveState } from '@/lib/survey-state'
import { validBirthYmd, validChildNo, validClassCode, validGender, validName } from '@/lib/validate'

const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15'
const labelCls = 'mt-4 block text-[13px] font-bold text-ink-soft'

const NOW_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => NOW_YEAR - 5 - i) // 초등 연령대 여유 범위
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

type FieldKey = 'code' | 'childNo' | 'name' | 'gender' | 'birth'
type FieldErrors = Partial<Record<FieldKey, string>>

/** 화면상 필드 순서 — 검증 실패 시 이 순서의 첫 에러 필드로 포커스를 옮긴다. */
const FIELD_ORDER: FieldKey[] = ['code', 'childNo', 'name', 'gender', 'birth']

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

/** verify-code 응답 — 확인 모달에 그대로 보여주는 학급 정보 */
interface ClassInfo {
  schoolName: string; grade: number; classNo: number
  teacherName: string; teacherPhone: string | null; teacherEmail: string | null
  alreadyTested: 'submitted' | 'inProgress' | null
}

export default function StartPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [childNo, setChildNo] = useState('')
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'남' | '여' | ''>('')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  // 법정대리인 서면 동의를 확인했다는 검사자 체크(필수) — 체크 전에는 [확인] 비활성
  const [consent, setConsent] = useState(false)
  // 코드 조회 결과 — 값이 있으면 확인 모달이 열려 있다
  const [confirm, setConfirm] = useState<ClassInfo | null>(null)
  // 세션 생성 실패 시 모달 안에 보여줄 오류 — 모달을 닫지 않고 재시도할 수 있게 한다
  const [confirmErr, setConfirmErr] = useState('')
  // 이 기기에 남아 있는 미제출 세션 — 누구의 검사인지(childName) 함께 보여 이어하기를 돕는다
  const [resume, setResume] = useState<{ childName: string } | null>(null)

  useEffect(() => {
    // localStorage는 서버 프리렌더에 없으므로 마운트 후 확인(하이드레이션 불일치 방지).
    const s = loadState()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) setResume({ childName: s.childName })
    // 같은 학급을 연달아 검사할 때 코드 재입력을 던다 — 직전 검사가 성공한 코드만 남아 있다.
    const last = loadClassCode()
    if (last) setCode(last)
  }, [])

  // 선택한 연·월에 맞는 일수 (윤년 반영)
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const cleanCode = code.trim().toUpperCase()
  const cleanName = name.trim().replace(/\s+/g, ' ')
  const childNoNum = Number(childNo)
  const birthYmd = year && month && day
    ? `${String(year).slice(2)}${pad2(Number(month))}${pad2(Number(day))}` : ''

  /** [확인] — 서버 스키마와 같은 규칙으로 선검증 후 코드를 조회해 확인 모달을 연다. */
  async function verify() {
    const next: FieldErrors = {}
    if (!validClassCode(cleanCode)) next.code = '6자리 학급 코드를 입력해 주세요.'
    if (childNo === '' || !validChildNo(childNoNum)) next.childNo = '아동 번호(1~99)를 입력해 주세요.'
    if (!validName(cleanName)) next.name = '이름은 한글이나 영어로만 쓸 수 있어요.'
    if (!validGender(gender)) next.gender = '성별을 선택해 주세요.'
    if (!validBirthYmd(birthYmd)) next.birth = '생년월일을 선택해 주세요.'
    setErrors(next)
    if (Object.keys(next).length > 0) { focusFirstError(next); return }

    setFormErr(''); setBusy(true)
    const r = await postJson<ClassInfo>('/api/sessions/verify-code',
      { code: cleanCode, childNo: childNoNum }, '코드 확인에 실패했어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) {
      if (r.status === 404) { setErrors({ code: '코드를 확인해 주세요.' }); focusFirstError({ code: '!' }) }
      else setFormErr(r.error)
      return
    }
    setConfirmErr('')
    setConfirm(r.data)
  }

  /** 확인 모달 [맞아요] — 세션 생성. 성공했을 때만 코드를 기억한다(스펙 "연속 검사").
   *  성공 분기에서는 busy를 풀지 않는다 — router.push가 끝나기 전에 확인 버튼이 다시
   *  활성화되면 느린 기기에서 두 번 탭해 세션이 중복 생성될 수 있다(첫 세션이 고아로 남음).
   *  화면을 완전히 떠날 때까지 잠가 두고, 실패했을 때만 재시도할 수 있게 푼다. */
  async function begin() {
    setBusy(true)
    const r = await postJson<{ sessionId: string; sessionToken: string; grade: number }>('/api/sessions', {
      code: cleanCode, childNo: childNoNum, name: cleanName, gender, birthYmd,
      guardianConsent: consent, // 서버 스키마가 true 리터럴만 허용 — 미체크 요청은 400
    })
    if (!r.ok) { setBusy(false); setConfirmErr(r.error); return }
    saveClassCode(cleanCode)
    clearState() // 공용 기기에 남아 있을 이전 검사 흔적 제거(세션별 키 누적 방지)
    saveState(newState(r.data.sessionId, cleanName, r.data.sessionToken, r.data.grade))
    router.push('/survey')
  }

  const filled = code.trim() && childNo !== '' && name.trim() && gender && year && month && day && consent

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-10 text-2xl font-bold">안녕하세요!</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        선생님께 받은 학급 코드와<br />아동 정보를 입력해 주세요.
      </p>

      {resume && (
        <div className="card mt-6 flex w-full flex-col gap-3 border-blue/40 bg-blue/5 p-4">
          <p className="text-sm font-bold text-ink-soft">
            {resume.childName
              ? <><b className="text-blue">{resume.childName}</b> 학생의 검사가 진행 중이에요.</>
              : '이 기기에 진행 중인 검사가 있어요.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push('/survey')}
              className="flex-1 rounded-lg bg-blue py-2.5 text-sm font-bold text-white">
              이어서 하기
            </button>
            <button type="button" onClick={() => { clearState(); setResume(null) }}
              className="flex-1 rounded-lg border-[1.5px] border-line bg-white py-2.5 text-sm font-bold text-ink-soft">
              새로 시작
            </button>
          </div>
        </div>
      )}

      {/* 자동완성은 의도적으로 끈다(autoComplete="off") — 교사 개인 기기에서 본인 정보가
          아동 정보 칸에 제안되는 것을 막는다. */}
      <form className="card mt-8 w-full p-5" autoComplete="off"
        onSubmit={e => { e.preventDefault(); if (!busy && filled) void verify() }}>
        <div>
          <label className="text-[13px] font-bold text-ink-soft" htmlFor="code">학급 코드</label>
          {/* 코드는 6자리지만, classCodeSchema가 trim 전 20자까지 허용해 양끝 공백 붙여넣기를
              봐준다(사용자 확정 2026-08-13) — maxLength를 6으로 조이면 그 붙여넣기가 잘려 코드
              자체가 손상될 수 있어, 공백 여유를 둔 8로 맞춘다. */}
          <input id="code" data-field="code" name="code" value={code} maxLength={8}
            placeholder="ABC234" autoCapitalize="characters" spellCheck={false}
            aria-describedby={errors.code ? 'err-code' : undefined} aria-invalid={!!errors.code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            className={`${inputCls} font-read mt-1.5 text-center text-xl tracking-[0.3em]`} />
          <FieldError id="err-code" msg={errors.code} />
        </div>

        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="childNo">아동 번호</label>
            <input id="childNo" data-field="childNo" name="childNo" value={childNo} maxLength={2}
              inputMode="numeric" placeholder="3"
              aria-describedby={errors.childNo ? 'err-childNo' : undefined} aria-invalid={!!errors.childNo}
              onChange={e => setChildNo(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </div>
          <div className="flex-[2]">
            <label className={labelCls} htmlFor="name">이름</label>
            <input id="name" data-field="name" name="name" value={name} maxLength={30}
              aria-describedby={errors.name ? 'err-name' : undefined} aria-invalid={!!errors.name}
              onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
        </div>
        <FieldError id="err-childNo" msg={errors.childNo} />
        <FieldError id="err-name" msg={errors.name} />

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

        {/* 개인정보 수집·이용 고지 + 법정대리인 서면 동의 확인 체크 — 문구의 단일 소스는 lib/consent.ts. */}
        <div className="mt-6 rounded-xl border border-line bg-well p-4">
          <p className="text-[13px] font-bold text-ink-soft">개인정보 수집·이용 안내</p>
          <dl className="mt-2 flex flex-col gap-1.5">
            {CONSENT_NOTICE.map(row => (
              <div key={row.label} className="flex gap-2 text-xs leading-relaxed">
                <dt className="w-20 flex-none font-bold text-ink-mute">{row.label}</dt>
                <dd className="min-w-0 text-ink-soft">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-mute">
            만 14세 미만 아동의 개인정보이므로 법정대리인(보호자)의 동의가 필요합니다.
            학교에서 배부한 서면 동의서를 먼저 회수한 뒤 검사를 시작해 주세요.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border-[1.5px] border-line bg-white px-3 py-2.5">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 flex-none accent-[var(--color-blue)]" />
            <span className="text-xs font-bold leading-relaxed text-ink-soft">{GUARDIAN_CONSENT_LABEL}</span>
          </label>
        </div>

        {formErr && <p role="alert" className="mt-3 text-sm text-rec-deep">{formErr}</p>}
        <button type="submit" disabled={busy || !filled} className="cta mt-5">확인</button>
        {!consent && (
          <p className="mt-2 text-center text-[12px] text-ink-mute">보호자 동의 확인에 체크해야 시작할 수 있어요.</p>
        )}
      </form>
      <p className="mt-auto pt-6 text-center text-[12px] text-ink-mute">녹음된 목소리는 검사 확인 용도로만 사용돼요.</p>

      {/* 확인 모달 — 코드가 가리키는 학급과 아동이 맞는지 시작 전에 한 번 묻는다(스펙 "흐름" 3).
          이미 검사한 번호면 경고형으로 바뀐다 — 막지는 않는다(재검사 허용, 스펙 "중복 검사 경고"). */}
      {confirm && (
        <ConfirmDialog open busy={busy} error={confirmErr}
          title={confirm.alreadyTested
            ? `${childNoNum}번은 이미 검사했어요`
            : '이 정보가 맞나요?'}
          confirmLabel={confirm.alreadyTested ? '네, 다시 검사할게요' : '맞아요, 시작하기'}
          cancelLabel="아니에요"
          onConfirm={begin} onClose={() => { setConfirm(null); setConfirmErr('') }}>
          <div className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
            <p className="font-bold text-ink">
              {confirm.schoolName} {gradeClassLabel(confirm.grade, confirm.classNo)}
            </p>
            <p className="mt-0.5 text-[13px]">
              담임 {confirm.teacherName}
              {(confirm.teacherPhone || confirm.teacherEmail) && (
                <> · {[confirm.teacherPhone, confirm.teacherEmail].filter(Boolean).join(' · ')}</>
              )}
            </p>
            <p className="mt-2.5">
              <b className="text-blue">{childNoNum}번 {cleanName}</b> 학생의 검사를
              {confirm.alreadyTested ? ' 다시' : ''} 시작할까요?
            </p>
            {confirm.alreadyTested === 'inProgress' && (
              <p className="mt-2 text-[12.5px] text-amber">
                이 번호로 진행 중인(제출 전) 검사가 있어요. 다른 기기에서 검사 중일 수 있어요.
              </p>
            )}
            {confirm.alreadyTested === 'submitted' && (
              <p className="mt-2 text-[12.5px] text-amber">
                이 번호로 제출까지 끝난 검사가 있어요. 다시 검사하면 새 결과가 추가로 남아요.
              </p>
            )}
          </div>
        </ConfirmDialog>
      )}
      <LoadingOverlay show={busy && !confirm} />
    </main>
  )
}
