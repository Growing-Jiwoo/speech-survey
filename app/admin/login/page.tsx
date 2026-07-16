'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'

export default function AdminLogin() {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function login() {
    setErr(''); setBusy(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      if (res.ok) { router.push('/admin'); return }
      const json = await res.json().catch(() => ({}))
      setErr(json.error ?? '로그인 실패')
    } catch {
      setErr('연결에 문제가 생겼어요. 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <div className="card p-6">
        <div className="flex items-center gap-2">
          <Blip variant="logo" className="h-8 w-8" />
          <span className="text-sm font-bold text-ink-soft">읽기 검사 · 관리자</span>
        </div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !busy && login()} placeholder="비밀번호" disabled={busy}
          className="mt-5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15 disabled:opacity-50" />
        {err && <p role="alert" className="mt-2 text-sm text-rec-deep">{err}</p>}
        <button onClick={login} disabled={busy} className="cta mt-4">로그인</button>
      </div>
      <LoadingOverlay show={busy} />
    </main>
  )
}
