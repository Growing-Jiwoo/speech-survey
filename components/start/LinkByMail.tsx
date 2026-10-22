// components/start/LinkByMail.tsx — 시작 화면의 [결과지 받기]·[쓰기 스캔본 올리기]. 등록된 담임 메일로 학급 결과 화면 링크를
// 보낼 뿐 이 화면에서는 아무것도 열리지 않는다 — 아이 앞 공용 기기라 그래야 한다(결과지 사용자 확정 2026-09-22, 스캔본은
// 담당자 확정 2026-10-22 — 사용자의 「이메일에 링크를 첨부하는 방식으로 할게」에 담당자 「알겠어!!」, 회신은 사용자 전달:
// 코드만으로 올리게 하면 아이 앞 기기에서 아동 기록에 그림을 올릴 수 있다).
// 이메일은 입력·수정할 수 없다 — 요청자가 주소를 정하면 코드가 곧 열쇠다. 쿨다운은 종류마다 코드당 60초(서버가 센다).
// 학급이 바뀌면 상태가 남지 않게 호출부가 `key`에 학급 코드를 준다 — 「d***@exa***.com 로 보냈어요」는 그 학급 것이다.
'use client'
import { useEffect, useState } from 'react'
import { NETWORK_ERR_MSG } from '@/lib/http'

export function LinkByMail({ code, purpose, label }: {
  code: string
  purpose: 'results' | 'scan'
  /** 버튼 글자 — 메일·승인 안내가 이 이름으로 가리킨다(「[결과지 받기]를 다시 눌러 주세요」) */
  label: string
}) {
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // 남은 쿨다운(초). 서버가 429로 준 값 또는 성공 뒤 60에서 시작해 1초씩 준다.
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function request() {
    setBusy(true); setErr('')
    try {
      // postJson(requestJson)은 실패 바디를 버리는데 429의 retryAfterSec가 필요해 여기서만 fetch를 직접 쓴다.
      const res = await fetch('/api/results/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, purpose }),
      })
      const j = await res.json().catch(() => ({})) as
        { sent?: boolean; maskedEmail?: string; scoredCount?: number; error?: string; retryAfterSec?: number }
      if (res.status === 429 && typeof j.retryAfterSec === 'number') {
        // 다른 기기에서 방금 요청했거나 연타 — 에러가 아니라 안내다.
        setMsg('방금 링크를 보냈어요. 메일함을 확인해 주세요.')
        setCooldown(j.retryAfterSec)
      } else if (!res.ok) {
        setErr(j.error ?? '문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
      } else {
        setMsg(`${j.maskedEmail} 로 ${purpose === 'scan' ? '스캔본 올리기' : '결과지'} 링크를 보냈어요. 메일함을 확인해 주세요.`
          + (purpose === 'results' && j.scoredCount === 0 ? ' 아직 채점된 학생이 없어요. 채점이 끝나면 링크에서 새로고침해 주세요.' : ''))
        setCooldown(60)
      }
    } catch {
      setErr(NETWORK_ERR_MSG)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => void request()} disabled={busy || cooldown > 0}
        // 꺼진 버튼은 60%로 — .btn-outline:disabled(40%)가 Tailwind 레이어 밖이라 `!` 없이는 이기지 못한다(카운트다운 글자가 흐려졌다)
        className="btn-outline mt-3 h-[44px] w-full text-[14px] disabled:opacity-60!">
        {busy ? '보내는 중…' : cooldown > 0 ? `보냈어요 · ${cooldown}초 후 다시` : label}
      </button>
      {/* 발송 결과 한 줄 — 성공·429는 안내 톤(polite), 그 외 실패만 경고 색 */}
      {err
        ? <p role="alert" className="mt-2 text-[12.5px] leading-relaxed text-rec-deep">{err}</p>
        : msg && <p aria-live="polite" className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{msg}</p>}
    </>
  )
}
