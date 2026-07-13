'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { validAge, validName } from '@/lib/validate'

export default function StartPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function begin() {
    const cleanName = name.trim().replace(/\s+/g, ' ')
    const ageNum = Number(age)
    if (!validName(cleanName)) { setErr('이름은 한글이나 영어로만 쓸 수 있어요.'); return }
    if (!validAge(ageNum)) { setErr('나이는 숫자로만 쓸 수 있어요.'); return }
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, age: ageNum }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? '문제가 생겼어요. 다시 시도해 주세요.'); return }
      sessionStorage.setItem('survey', JSON.stringify({ sessionId: json.sessionId, questions: json.questions, name: cleanName }))
      router.push('/survey')
    } finally { setBusy(false) }
  }

  const inputCls = 'mt-1.5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center p-6 pt-10">
      <div className="flex items-center gap-2">
        <Blip variant="logo" className="h-8 w-8" />
        <span className="text-sm font-bold text-ink-soft">말하기 설문</span>
      </div>
      <h1 className="mt-14 text-2xl font-bold">안녕하세요!</h1>
      <p className="mt-3 text-center text-sm leading-relaxed text-ink-soft">
        화면에 나오는 영어 문장을<br />소리 내어 읽는 설문이에요.
      </p>
      <div className="card mt-8 w-full p-5">
        <label className="text-[13px] font-bold text-ink-soft" htmlFor="name">이름</label>
        <input id="name" value={name} maxLength={30} onChange={e => setName(e.target.value)}
          className={inputCls} />
        <label className="mt-4 block text-[13px] font-bold text-ink-soft" htmlFor="age">나이</label>
        <input id="age" value={age} inputMode="numeric" maxLength={3}
          onChange={e => setAge(e.target.value.replace(/\D/g, ''))} className={inputCls} />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">이름은 한글·영어만, 나이는 숫자만 쓸 수 있어요.</p>
        {err && <p role="alert" className="mt-2 text-sm text-rec-deep">{err}</p>}
        <button onClick={begin} disabled={busy || !name.trim() || !age} className="cta mt-4">
          {busy ? '준비 중…' : '시작하기'}
        </button>
      </div>
      <p className="mt-auto pt-6 text-center text-[11px] text-ink-mute">녹음된 목소리는 설문 확인 용도로만 사용돼요.</p>
    </main>
  )
}
