'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')

  async function login() {
    setErr('')
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    if (res.ok) router.push('/admin')
    else setErr((await res.json()).error ?? '로그인 실패')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-2xl">관리자 로그인</h1>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && login()} placeholder="비밀번호"
        className="rounded-2xl border-2 border-ink/20 px-4 py-3 outline-none focus:border-sky" />
      {err && <p className="text-sm text-berry">{err}</p>}
      <button onClick={login} className="rounded-full bg-ink px-6 py-3 text-white">로그인</button>
    </main>
  )
}
