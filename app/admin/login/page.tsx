// app/admin/login/page.tsx — 관리자 로그인. 성공 시 HttpOnly 쿠키가 심어지고 /admin으로 이동한다.
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Blip } from '@/components/Blip'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { postJson } from '@/lib/http'

export default function AdminLogin() {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function login() {
    setErr(''); setBusy(true)
    const r = await postJson('/api/admin/login', { password: pw }, '로그인 실패')
    setBusy(false)
    if (r.ok) { router.push('/admin'); return }
    setErr(r.error)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      {/* form + submit: Enter 제출과 비밀번호 관리자 연동(autocomplete)을 위해 필요 */}
      <form className="card p-6" onSubmit={e => { e.preventDefault(); if (!busy) void login() }}>
        <div className="flex items-center gap-2">
          <Blip variant="logo" className="h-8 w-8" />
          <span className="text-sm font-bold text-ink-soft">읽기 검사 · 관리자</span>
        </div>
        <input type="password" name="password" autoComplete="current-password" aria-label="관리자 비밀번호"
          value={pw} onChange={e => setPw(e.target.value)} placeholder="비밀번호" disabled={busy}
          className="mt-5 h-[50px] w-full rounded-xl border-[1.5px] border-line bg-well px-4 text-base outline-none transition focus:border-blue focus:bg-white focus:ring-[3.5px] focus:ring-blue/15 disabled:opacity-50" />
        {err && <p role="alert" className="mt-2 text-sm text-rec-deep">{err}</p>}
        <button type="submit" disabled={busy} className="cta mt-4">로그인</button>
      </form>
      <LoadingOverlay show={busy} />
    </main>
  )
}
