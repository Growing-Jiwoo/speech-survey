// app/page.tsx — 검사 시작 화면. 학급 코드로 명단을 불러 검사할 아동을 고른다(사용자 확정 2026-08-18).
// 학급 정보(학교·학년·반·담임·연락처)는 관리자가 /admin/codes에서 발급할 때, 또는 교사가
// /apply에서 신청할 때 이미 입력했다 — 시작 화면은 코드로 조회해 보여줄 뿐이다.
//
// [확인](코드만) → verify-code(childNo 없이) → 명단이 있으면 **명단 모드**(드롭다운),
// 비어 있으면 **직접 입력 모드**(옛 폼 그대로) → 확인 모달 → [맞아요] → 세션 생성 → /survey.
// 명단 모드는 검사자가 아동마다 5칸을 타이핑하던 것을 선택 1번으로 줄인다. 목적은 편의가
// 아니라 **오타 차단**이다 — 이름 한 글자가 곧 임상 기록이 되므로(그래서 관리자 신원 수정
// 기능까지 필요했다), 이름·성별·생년월일은 클라이언트가 보내지 않고 서버가 명단에서
// 복사한다(app/api/sessions/route.ts의 fromRoster 분기).
// 직접 입력 모드는 없앨 수 없다 — 전학생·늦은 동의서처럼 명단에 없는 아동이 있고, 관리자가
// 직접 발급한 코드에는 명단 자체가 없다. 그 경로는 이 변경 전과 동작이 같다.
//
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

/** 진행 단계. 'code'는 코드 한 칸만 보이는 첫 화면이고, 코드를 조회한 결과가
 *  'roster'(명단 드롭다운)와 'direct'(옛 입력 폼) 중 하나를 정한다. */
type Step = 'code' | 'roster' | 'direct'

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

/** verify-code 응답의 학급 부분 — 확인 모달에 그대로 보여준다. */
interface ClassInfo {
  schoolName: string; grade: number; classNo: number
  teacherName: string; teacherPhone: string | null; teacherEmail: string | null
}

/** verify-code 응답의 명단 1줄(childNo 없이 부를 때만 온다). */
interface RosterChild {
  childNo: number; name: string; gender: '남' | '여'; birthYmd: string
  tested: 'submitted' | 'inProgress' | null
}

/** 확인 모달이 보여줄 내용. 두 모드가 신원을 얻는 경로는 다르지만(명단 복사 / 직접 입력)
 *  모달은 한 갈래로 둔다 — 중복 검사 경고를 두 벌 쓰지 않기 위해서다. */
interface Confirmed {
  cls: ClassInfo
  childNo: number
  name: string
  /** 성별·생년월일 한 줄. 명단 모드에서만 채운다 — 직접 입력은 검사자가 방금 그 칸에
   *  타이핑한 값이라 모달에서 되풀이할 것이 없다(직접 입력 모달은 변경 전과 같다). */
  identity: string | null
  tested: 'submitted' | 'inProgress' | null
}

export default function StartPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('code')
  const [code, setCode] = useState('')
  // 코드 조회 결과 — 명단 모드 머리글과 확인 모달이 쓴다
  const [cls, setCls] = useState<ClassInfo | null>(null)
  const [roster, setRoster] = useState<RosterChild[]>([])
  const [pick, setPick] = useState('') // 드롭다운에서 고른 아동 번호(Select 계약이 문자열)
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
  // 값이 있으면 확인 모달이 열려 있다
  const [confirm, setConfirm] = useState<Confirmed | null>(null)
  // 세션 생성 실패 시 모달 안에 보여줄 오류 — 모달을 닫지 않고 재시도할 수 있게 한다
  const [confirmErr, setConfirmErr] = useState('')
  // 이 기기에 남아 있는 미제출 세션 — 누구의 검사인지(번호+이름) 함께 보여 이어하기를 돕는다.
  // 번호를 같이 밝히는 이유: 이 흐름은 아동을 코드+번호로 지목하므로 이름만으로는
  // 검사자가 "지금 부른 아이"와 같은 아이인지 대조할 근거가 한 칸 부족하다.
  const [resume, setResume] = useState<{ childName: string; childNo: number } | null>(null)

  useEffect(() => {
    // localStorage는 서버 프리렌더에 없으므로 마운트 후 확인(하이드레이션 불일치 방지).
    const s = loadState()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) setResume({ childName: s.childName, childNo: s.childNo })
    // 같은 학급을 연달아 검사할 때 코드 재입력을 던다 — 직전 검사가 성공한 코드만 남아 있다.
    // 단계는 'code'에 그대로 둔다 — [확인]을 다시 눌러 명단을 새로 받아야 방금 끝낸 아동의
    // 「검사함」 표시가 반영된다.
    const last = loadClassCode()
    if (last) setCode(last)
  }, [])

  // 단계가 바뀌면 방금 나타난 첫 칸으로 포커스를 옮긴다. 눌렀던 [확인]은 다음 단계에서
  // (보호자 동의 미체크 탓에) disabled로 다시 그려지므로 브라우저가 포커스를 body로 떨어뜨린다 —
  // 그러면 키보드·스크린리더 검사자는 문서 처음부터 Tab을 다시 밟아야 새 칸에 닿는다.
  useEffect(() => {
    if (step === 'code') return
    document.getElementById(step === 'roster' ? 'pick' : 'childNo')?.focus()
  }, [step])

  // 선택한 연·월에 맞는 일수 (윤년 반영)
  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const cleanCode = code.trim().toUpperCase()
  const cleanName = name.trim().replace(/\s+/g, ' ')
  const childNoNum = Number(childNo)
  const birthYmd = year && month && day
    ? `${String(year).slice(2)}${pad2(Number(month))}${pad2(Number(day))}` : ''

  /** 1단계 [확인] — 코드만 조회한다. 명단이 있으면 드롭다운으로, 비어 있으면(관리자 직접
   *  발급 코드) 옛 입력 폼으로 넘어간다. */
  async function lookupCode() {
    if (!validClassCode(cleanCode)) {
      setErrors({ code: '6자리 학급 코드를 입력해 주세요.' }); focusFirstError({ code: '!' }); return
    }
    setErrors({}); setFormErr(''); setBusy(true)
    const r = await postJson<ClassInfo & { roster: RosterChild[] }>('/api/sessions/verify-code',
      { code: cleanCode }, '코드 확인에 실패했어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) {
      // 미승인(pending) 코드도 미존재와 같은 404다 — 사유를 구분하지 않는 것이 서버 방침이다.
      if (r.status === 404) { setErrors({ code: '코드를 확인해 주세요.' }); focusFirstError({ code: '!' }) }
      else setFormErr(r.error)
      return
    }
    setCls(r.data)
    setRoster(r.data.roster)
    setStep(r.data.roster.length > 0 ? 'roster' : 'direct')
  }

  /** 명단 모드 [확인] — 서버를 다시 부르지 않는다. 코드 조회 때 받은 명단 행이 이름·성별·
   *  생년월일·검사 여부를 전부 담고 있고, 기록에 실릴 신원은 어차피 세션 생성 때 서버가
   *  명단에서 다시 복사한다(클라이언트 값은 번호뿐). */
  function openRosterConfirm() {
    const child = roster.find(r => r.childNo === Number(pick))
    if (!child || !cls) return
    setConfirmErr('')
    setConfirm({
      cls, childNo: child.childNo, name: child.name,
      identity: `${child.gender} · ${child.birthYmd}`, tested: child.tested,
    })
  }

  /** 직접 입력 모드 [확인] — 서버 스키마와 같은 규칙으로 선검증 후, 그 번호 하나의 검사
   *  이력(alreadyTested)까지 받아 확인 모달을 연다. */
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
    const r = await postJson<ClassInfo & { alreadyTested: Confirmed['tested'] }>(
      '/api/sessions/verify-code',
      { code: cleanCode, childNo: childNoNum }, '코드 확인에 실패했어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) {
      if (r.status === 404) { setErrors({ code: '코드를 확인해 주세요.' }); focusFirstError({ code: '!' }) }
      else setFormErr(r.error)
      return
    }
    setConfirmErr('')
    setConfirm({
      cls: r.data, childNo: childNoNum, name: cleanName,
      identity: null, tested: r.data.alreadyTested,
    })
  }

  /** 확인 모달 [맞아요] — 세션 생성. 성공했을 때만 코드를 기억한다(스펙 "연속 검사").
   *  명단 모드는 번호만 보내고 서버가 명단에서 이름·성별·생년월일을 복사한다 — 화면이 들고
   *  있는 값을 보내면 서버 복사라는 보장이 무의미해진다.
   *  성공 분기에서는 busy를 풀지 않는다 — router.push가 끝나기 전에 확인 버튼이 다시
   *  활성화되면 느린 기기에서 두 번 탭해 세션이 중복 생성될 수 있다(첫 세션이 고아로 남음).
   *  화면을 완전히 떠날 때까지 잠가 두고, 실패했을 때만 재시도할 수 있게 푼다. */
  async function begin(c: Confirmed) {
    setBusy(true)
    const r = await postJson<{ sessionId: string; sessionToken: string; grade: number }>('/api/sessions',
      step === 'roster'
        ? { fromRoster: true, code: cleanCode, childNo: c.childNo, guardianConsent: consent }
        : {
          code: cleanCode, childNo: c.childNo, name: c.name, gender, birthYmd,
          guardianConsent: consent, // 서버 스키마가 true 리터럴만 허용 — 미체크 요청은 400
        })
    if (!r.ok) { setBusy(false); setConfirmErr(r.error); return }
    saveClassCode(cleanCode)
    clearState() // 공용 기기에 남아 있을 이전 검사 흔적 제거(세션별 키 누적 방지)
    saveState(newState(r.data.sessionId, c.name, c.childNo, r.data.sessionToken, r.data.grade))
    router.push('/survey')
  }

  const filled = code.trim() && childNo !== '' && name.trim() && gender && year && month && day && consent
  const canSubmit = step === 'code' ? !!code.trim()
    : step === 'roster' ? !!(pick && consent)
      : !!filled

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">읽기 검사</span>
      </div>
      <h1 className="mt-10 text-2xl font-bold">안녕하세요!</h1>
      {/* aria-live — 단계 전환은 이 문구만이 말로 알려 준다(화면에서는 폼 모양이 바뀌어 보이지만
          스크린리더에는 아무 일도 일어나지 않은 것과 같다). */}
      <p aria-live="polite" className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        {step === 'code' ? <>선생님께 받은 학급 코드를<br />입력해 주세요.</>
          : step === 'roster' ? '검사할 학생을 골라 주세요.'
            : '아동 정보를 입력해 주세요.'}
      </p>

      {resume && (
        <div className="card mt-6 flex w-full flex-col gap-3 border-blue/40 bg-blue/5 p-4">
          <p className="text-sm font-bold text-ink-soft">
            {resume.childName
              ? <><b className="text-blue">{resume.childNo}번 {resume.childName}</b> 학생의 검사가 진행 중이에요.</>
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
        onSubmit={e => {
          e.preventDefault()
          if (busy || !canSubmit) return
          if (step === 'code') void lookupCode()
          else if (step === 'roster') openRosterConfirm()
          else void verify()
        }}>
        <div>
          <label className="text-[13px] font-bold text-ink-soft" htmlFor="code">학급 코드</label>
          {/* 코드는 6자리지만, classCodeSchema가 trim 전 20자까지 허용해 양끝 공백 붙여넣기를
              봐준다(사용자 확정 2026-08-13) — maxLength를 6으로 조이면 그 붙여넣기가 잘려 코드
              자체가 손상될 수 있어, 공백 여유를 둔 8로 맞춘다. */}
          <input id="code" data-field="code" name="code" value={code} maxLength={8}
            placeholder="ABC234" autoCapitalize="characters" spellCheck={false}
            aria-describedby={errors.code ? 'err-code' : undefined} aria-invalid={!!errors.code}
            onChange={e => {
              setCode(e.target.value.toUpperCase())
              // 코드를 고치면 화면에 걸린 명단은 다른 학급 것일 수 있으므로 첫 단계로 되돌린다.
              // 보호자 동의 체크까지 함께 푼다 — 체크는 "이 아동의 서면 동의서를 받았다"는
              // 뜻이라, 학급이 바뀔 수 있는 시점에 남겨 두면 다른 학급 아동에게 그대로 적용된다.
              // 직접 입력 모드는 되돌리지 않는다 — 그 폼의 [확인]이 코드를 다시 조회하므로
              // 위험이 없고, 코드 오타를 고치려다 입력하던 칸이 접히는 편이 더 나쁘다.
              if (step === 'roster') {
                setStep('code'); setCls(null); setRoster([]); setPick(''); setConsent(false)
              }
            }}
            className={`${inputCls} font-read mt-1.5 text-center text-xl tracking-[0.3em]`} />
          <FieldError id="err-code" msg={errors.code} />
        </div>

        {step === 'roster' && cls && (
          <>
            {/* 코드가 가리키는 학급을 밝혀 직접 입력 폼과 한눈에 구분되게 한다. 담임 이름·연락처는
                일부러 넣지 않는다 — 이 화면은 아동이 보고 있고, 학급 확인에는 학교·학년·반·인원이면
                충분하다(담임 정보는 시작 직전 확인 모달에서만 보여준다). */}
            <p className="mt-4 rounded-xl border border-mint/40 bg-mint/10 px-3.5 py-2.5 text-[13px] font-bold text-mint">
              {cls.schoolName} {gradeClassLabel(cls.grade, cls.classNo)} · 명단 {roster.length}명
            </p>
            <label className={labelCls} htmlFor="pick">검사할 학생</label>
            {/* 명단은 눌러야 펼쳐지는 드롭다운으로 둔다 — 교실 공용 기기 화면이라 목록을 펼쳐
                두면 지금 검사하지 않는 아이들의 이름까지 계속 노출된다.
                라벨에 생년월일은 넣지 않는다 — 선택 시점에 신원 대조에 가장 덜 필요한 칸이라
                확인 모달에서만 보여준다. */}
            <Select id="pick" ariaLabel="검사할 학생" placeholder="번호와 이름을 골라 주세요"
              className="mt-1.5" value={pick} onChange={setPick}
              options={roster.map(r => ({
                value: String(r.childNo),
                // 이미 검사한 아동도 그대로 고를 수 있다 — 재검사는 허용이고(스펙 "중복 검사
                // 경고"), 경고는 확인 모달이 낸다. 여기서 막으면 재검사 경로가 사라진다.
                label: `${r.childNo}번 ${r.name} (${r.gender})${r.tested ? ' · 검사함' : ''}`,
              }))} />
            <button type="button" onClick={() => setStep('direct')}
              className="mt-2.5 text-[13px] font-bold text-blue underline underline-offset-2">
              명단에 없는 학생이에요
            </button>
          </>
        )}

        {step === 'direct' && (
          <>
            <div className="flex gap-2.5">
              <div className="flex-1">
                <label className={labelCls} htmlFor="childNo">아동 번호</label>
                {/* placeholder를 두지 않는다(사용자 확정 2026-08-15). 학급 코드의 `ABC234`는 짐작할 수
                    없는 형식(6자리·대문자·혼동 문자 제외)을 가르치지만, 번호칸의 예시 숫자는 라벨과
                    숫자 키패드가 이미 말하는 것을 되풀이할 뿐이다. 두 자리 폭 칸 속 회색 숫자는
                    입력된 값으로 오독되기 쉽고, 이 칸이 임상 기록을 어느 아이에게 붙일지 정한다. */}
                <input id="childNo" data-field="childNo" name="childNo" value={childNo} maxLength={2}
                  inputMode="numeric"
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
            {/* 돌아가는 길. 위 폴백 링크는 드롭다운 바로 아래 있는 작은 글자라 터치 기기에서
                잘못 눌리는데, 되돌릴 길이 없으면 남은 방법이 새로고침뿐이고 그러면 입력한 코드도
                날아간다(코드는 세션 생성 성공 때만 기억된다). 「고르기」쪽이 정상 경로이므로
                되돌리기가 아니라 그 이름으로 적는다. */}
            {roster.length > 0 && (
              <button type="button" onClick={() => setStep('roster')}
                className="mt-4 text-[13px] font-bold text-blue underline underline-offset-2">
                명단에서 고르기
              </button>
            )}
          </>
        )}

        {/* 개인정보 수집·이용 고지 + 법정대리인 서면 동의 확인 체크 — 문구의 단일 소스는 lib/consent.ts.
            코드만 입력하는 첫 단계에서는 감춘다 — 아동 개인정보를 아직 하나도 다루지 않는 화면에
            동의 고지를 띄우면 무엇에 동의하는지가 흐려지고, 코드 오타로 못 넘어가는 사이에
            체크가 켜져 있게 된다. */}
        {step !== 'code' && (
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
        )}

        {formErr && <p role="alert" className="mt-3 text-sm text-rec-deep">{formErr}</p>}
        <button type="submit" disabled={busy || !canSubmit} className="cta mt-5">확인</button>
        {step !== 'code' && !consent && (
          <p className="mt-2 text-center text-[12px] text-ink-mute">보호자 동의 확인에 체크해야 시작할 수 있어요.</p>
        )}
      </form>
      <p className="mt-auto pt-6 text-center text-[12px] text-ink-mute">녹음된 목소리는 검사 확인 용도로만 사용돼요.</p>

      {/* 확인 모달 — 코드가 가리키는 학급과 아동이 맞는지 시작 전에 한 번 묻는다(스펙 "흐름" 3).
          이미 검사한 번호면 경고형으로 바뀐다 — 막지는 않는다(재검사 허용, 스펙 "중복 검사 경고").
          명단 모드와 직접 입력 모드가 이 모달을 공유하므로 중복 검사 경고 문구도 한 벌뿐이다. */}
      {confirm && (
        <ConfirmDialog open busy={busy} error={confirmErr}
          title={confirm.tested
            ? `${confirm.childNo}번은 이미 검사했어요`
            : '이 정보가 맞나요?'}
          confirmLabel={confirm.tested ? '네, 다시 검사할게요' : '맞아요, 시작하기'}
          cancelLabel="아니에요"
          onConfirm={() => void begin(confirm)} onClose={() => { setConfirm(null); setConfirmErr('') }}>
          <div className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
            <p className="font-bold text-ink">
              {confirm.cls.schoolName} {gradeClassLabel(confirm.cls.grade, confirm.cls.classNo)}
            </p>
            <p className="mt-0.5 text-[13px]">
              담임 {confirm.cls.teacherName}
              {(confirm.cls.teacherPhone || confirm.cls.teacherEmail) && (
                <> · {[confirm.cls.teacherPhone, confirm.cls.teacherEmail].filter(Boolean).join(' · ')}</>
              )}
            </p>
            <p className="mt-2.5">
              <b className="text-blue">{confirm.childNo}번 {confirm.name}</b> 학생의 검사를
              {confirm.tested ? ' 다시' : ''} 시작할까요?
            </p>
            {/* 명단에서 고른 경우에만 — 검사자가 타이핑하지 않은 값이므로 시작 전에 한 번은
                눈으로 대조할 기회를 준다(생년월일은 저장 형식 그대로 YYMMDD). */}
            {confirm.identity && (
              <p className="mt-1 text-[13px] tabular-nums text-ink-mute">{confirm.identity}</p>
            )}
            {confirm.tested === 'inProgress' && (
              <p className="mt-2 text-[12.5px] text-amber">
                이 번호로 진행 중인(제출 전) 검사가 있어요. 다른 기기에서 검사 중일 수 있어요.
              </p>
            )}
            {confirm.tested === 'submitted' && (
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
