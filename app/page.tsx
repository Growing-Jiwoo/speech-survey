'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StartPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function begin() {
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, age: Number(age) }),
      })
      const json = await res.json()
      if (!res.ok) { setErr(json.error ?? '오류가 났어요'); return }
      sessionStorage.setItem('survey', JSON.stringify({ sessionId: json.sessionId, questions: json.questions, name }))
      router.push('/survey')
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      <div className="text-6xl">🐰🎤</div>
      <h1 className="text-3xl">말하기 놀이 설문</h1>
      <p className="text-center text-ink/70">화면에 나오는 영어 문장을<br />또박또박 읽어 보아요!</p>
      <div className="flex w-full flex-col gap-3 rounded-3xl bg-white p-6 shadow-lg shadow-peach/40">
        <label className="text-sm">이름</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="이름을 적어 주세요"
          className="rounded-2xl border-2 border-peach bg-cream px-4 py-3 text-lg outline-none focus:border-peach-deep" />
        <label className="text-sm">나이</label>
        <input value={age} onChange={e => setAge(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="나이 (숫자)"
          className="rounded-2xl border-2 border-peach bg-cream px-4 py-3 text-lg outline-none focus:border-peach-deep" />
        {err && <p className="text-sm text-berry">{err}</p>}
        <button onClick={begin} disabled={busy || !name.trim() || !age}
          className="mt-2 rounded-full bg-peach-deep px-6 py-4 text-xl text-white shadow-md transition active:scale-95 disabled:opacity-40">
          {busy ? '준비 중…' : '시작하기 🚀'}
        </button>
      </div>
    </main>
  )
}
