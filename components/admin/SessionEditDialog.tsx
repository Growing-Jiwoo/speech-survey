// components/admin/SessionEditDialog.tsx — 아동 식별값(번호·이름·성별·생년월일) 수정 모달.
//
// 검사자가 아동 번호를 잘못 입력한 세션을 바로잡기 위한 것이다. 오타는 검사가 끝난 뒤
// 관리자가 발견하므로, 여기가 유일한 교정 지점이다 — 없으면 삭제 후 재검사밖에 없고
// 그건 아이를 다시 부른다는 뜻이다.
//
// **학년·학급은 일부러 없다.** 학년이 바뀌면 저장된 점수가 다른 양식의 문항을 가리키게 된다.
// 학급 코드를 통째로 잘못 골랐다면 아이가 다른 검사지로 검사받은 것이라 기록이 무효이며,
// 수정이 아니라 삭제 후 재검사가 맞다 — 모달이 학년을 보여주지 않는 것이 그 사실을 드러낸다.
// 근거: lib/schema.ts의 sessionEditSchema 주석(사용자 확정 2026-08-15).
'use client'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Select } from '@/components/Select'
import { pad2 } from '@/lib/format'
import { requestJson } from '@/lib/http'
import { validBirthYmd, validChildNo, validGender, validName } from '@/lib/validate'
import type { SessionRow } from '@/lib/db'

const inputCls = 'mt-1.5 h-[46px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-[15px] outline-none transition focus:border-blue focus:bg-white'
const labelCls = 'mt-3 block text-[13px] font-bold text-ink-soft'

const NOW_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => NOW_YEAR - 5 - i)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/** 저장된 birth_ymd(YYMMDD)를 연·월·일로 되돌린다. 세기는 초등 연령대라 2000년대로 본다
 *  — 시작 화면의 연도 선택지(NOW_YEAR-5 ~ -16)와 같은 범위를 가정한다. */
function splitYmd(ymd: string): { y: string; m: string; d: string } {
  if (!/^\d{6}$/.test(ymd)) return { y: '', m: '', d: '' }
  return { y: String(2000 + Number(ymd.slice(0, 2))), m: String(Number(ymd.slice(2, 4))), d: String(Number(ymd.slice(4, 6))) }
}

export function SessionEditDialog({ open, session, onClose, onSaved }: {
  open: boolean
  session: SessionRow
  onClose: () => void
  /** 저장 성공 — 호출부가 캐시를 무효화한다 */
  onSaved: () => void
}) {
  const init = splitYmd(session.birth_ymd)
  const [childNo, setChildNo] = useState(String(session.child_no))
  const [name, setName] = useState(session.child_name)
  const [gender, setGender] = useState(session.gender)
  const [year, setYear] = useState(init.y)
  const [month, setMonth] = useState(init.m)
  const [day, setDay] = useState(init.d)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const daysInMonth = year && month ? new Date(Number(year), Number(month), 0).getDate() : 31
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const childNoNum = Number(childNo)
  const cleanName = name.trim().replace(/\s+/g, ' ')
  const birthYmd = year && month && day
    ? `${String(year).slice(2)}${pad2(Number(month))}${pad2(Number(day))}` : ''

  // 무엇이 바뀌는지 눈으로 대조하게 한다 — 번호는 한 글자 차이로 다른 아이의 기록이 된다.
  const changes = [
    ['번호', String(session.child_no), childNo],
    ['이름', session.child_name, cleanName],
    ['성별', session.gender, gender],
    ['생년월일', session.birth_ymd, birthYmd],
  ].filter(([, before, after]) => before !== after)

  async function save() {
    if (!validChildNo(childNoNum)) { setErr('아동 번호(1~99)를 입력해 주세요.'); return }
    if (!validName(cleanName)) { setErr('이름은 한글이나 영어로만 쓸 수 있어요.'); return }
    if (!validGender(gender)) { setErr('성별을 선택해 주세요.'); return }
    if (!validBirthYmd(birthYmd)) { setErr('생년월일을 선택해 주세요.'); return }

    setErr(''); setBusy(true)
    const r = await requestJson(`/api/admin/sessions/${session.id}`, {
      method: 'PATCH',
      body: { childNo: childNoNum, name: cleanName, gender, birthYmd },
    }, '수정에 실패했어요. 다시 시도해 주세요.')
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    onSaved()
  }

  return (
    <ConfirmDialog open={open} busy={busy} error={err}
      title="아동 정보 수정"
      confirmLabel={busy ? '수정 중…' : '수정하기'}
      onConfirm={() => void save()} onClose={onClose}>
      <div className="mt-3 text-left">
        <div className="flex gap-2.5">
          <div className="flex-1">
            <label className={labelCls} htmlFor="se-no">아동 번호</label>
            <input id="se-no" value={childNo} maxLength={2} inputMode="numeric"
              onChange={e => setChildNo(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </div>
          <div className="flex-[2]">
            <label className={labelCls} htmlFor="se-name">이름</label>
            <input id="se-name" value={name} maxLength={30}
              onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
        </div>

        <span className={labelCls} id="se-gender-label">성별</span>
        <div className="mt-1.5 flex gap-2.5" role="group" aria-labelledby="se-gender-label">
          {(['남', '여'] as const).map(g => (
            <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g}
              className={`h-[46px] flex-1 rounded-xl border-[1.5px] text-[15px] font-bold transition ${
                gender === g ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-soft'}`}>
              {g}
            </button>
          ))}
        </div>

        <span className={labelCls}>생년월일</span>
        <div className="mt-1.5 flex gap-2" role="group" aria-label="생년월일">
          <Select ariaLabel="출생 연도" placeholder="연도" className="flex-[1.3]" size="sm"
            value={year} onChange={v => { setYear(v); setDay('') }}
            options={YEARS.map(y => ({ value: String(y), label: `${y}년` }))} />
          <Select ariaLabel="출생 월" placeholder="월" className="flex-1" size="sm"
            value={month} onChange={v => { setMonth(v); setDay('') }}
            options={MONTHS.map(m => ({ value: String(m), label: `${m}월` }))} />
          <Select ariaLabel="출생 일" placeholder="일" className="flex-1" size="sm" disabled={!year || !month}
            value={day} onChange={setDay}
            options={DAYS.map(d => ({ value: String(d), label: `${d}일` }))} />
        </div>

        {/* 검사가 아직 끝나지 않았으면, 그 기기 화면은 옛 이름을 계속 보여준다 —
            진행 상태(localStorage)의 사본까지는 관리자 수정이 닿지 않는다. 기록은 정상이다. */}
        {!session.submitted_at && (
          <p className="mt-3 rounded-lg bg-amber/10 px-3 py-2 text-[12.5px] leading-relaxed text-ink-soft">
            이 검사는 아직 <b>진행 중</b>이에요. 검사 중인 기기 화면의 이름은 그 검사가 끝날 때까지
            예전 이름으로 보입니다(기록은 바뀐 값으로 남아요).
          </p>
        )}

        <div className="mt-4 rounded-xl border border-line bg-well px-3.5 py-2.5">
          {changes.length === 0 ? (
            <p className="text-[12.5px] text-ink-mute">바뀐 값이 없어요.</p>
          ) : (
            <dl className="flex flex-col gap-1">
              {changes.map(([label, before, after]) => (
                <div key={label} className="flex gap-2 text-[13px]">
                  <dt className="w-16 flex-none font-bold text-ink-mute">{label}</dt>
                  <dd className="min-w-0 text-ink-soft">
                    {before || '—'} <span className="text-ink-mute">→</span>{' '}
                    <b className="text-blue">{after || '—'}</b>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </ConfirmDialog>
  )
}
