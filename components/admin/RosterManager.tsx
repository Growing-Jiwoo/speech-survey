// components/admin/RosterManager.tsx — 발급된 학급의 명단 펼침: 번호·이름·성별 + [빼기]/[되살리기](migration 009).
// 전학 간 아이를 명단에서 빼고 검사 기록은 남기는 것은 담당자 확정(2026-11-06, 답장에 대한 회신 원문 「오케이 고마워!!」)이고, 담임도
// 교사 결과지에서 같은 일을 한다(components/results/ResultsView). 빼도 검사 기록은 남는다 — 관리자 목록·결과지에 그대로 있다.
// ⚠️ 아동 실명 — 관리자가 [명단 보기]를 누른 학급만 받는다(useRosterQuery, 로그아웃 시 캐시와 함께 지워진다).
'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { requestJson } from '@/lib/http'
import { adminKeys, useRosterQuery } from '@/hooks/useAdminQueries'

const HIT = "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']"

export function RosterManager({ codeId }: { codeId: string }) {
  const queryClient = useQueryClient()
  const roster = useRosterQuery(codeId)
  const [busyNo, setBusyNo] = useState<number | null>(null)
  const [err, setErr] = useState('')

  async function toggle(childNo: number, name: string, removed: boolean) {
    // 빼기만 한 번 묻는다 — 되살리기는 되돌리는 동작이라 묻지 않는다
    if (removed && !window.confirm(`${childNo}번 ${name} 학생을 명단에서 뺄까요?\n검사 기록은 그대로 남아요.`)) return
    setBusyNo(childNo); setErr('')
    const r = await requestJson(`/api/admin/codes/${codeId}/roster`, { method: 'PATCH', body: { childNo, removed } })
    setBusyNo(null)
    if (!r.ok) { setErr(r.error); return }
    await queryClient.invalidateQueries({ queryKey: adminKeys.roster(codeId) })
  }

  if (roster.isLoading) return <p className="text-[13px] text-ink-mute">명단 불러오는 중…</p>
  if (roster.isError) return <p className="text-[13px] text-rec-deep">명단을 불러오지 못했어요.</p>
  const rows = roster.data ?? []
  const out = rows.filter(r => r.removed).length
  return (
    <div>
      <p className="mb-2 text-[12px] text-ink-mute">
        명단 {rows.length - out}명{out > 0 && ` · 뺀 학생 ${out}명`} — 전학 간 학생은 [빼기]를 눌러요. 검사 기록은 그대로 남아요.
      </p>
      {err && <p role="alert" className="mb-2 text-[13px] text-rec-deep">{err}</p>}
      <table className="text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-ink-mute">
            {['번호', '이름', '성별', ''].map(h => <th key={h} scope="col" className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.child_no} className={`border-t border-line/50 ${r.removed ? 'text-ink-mute' : ''}`}>
              <td className="px-2 py-1 tabular-nums">{r.child_no}</td>
              <td className="px-2 py-1 font-medium">
                {r.child_name}
                {r.removed && <span className="ml-1.5 rounded bg-well px-1.5 py-0.5 text-[11px] font-bold">뺀 학생</span>}
              </td>
              <td className="px-2 py-1">{r.gender}</td>
              <td className="px-2 py-1">
                <button type="button" disabled={busyNo !== null} onClick={() => void toggle(r.child_no, r.child_name, !r.removed)}
                  className={`rounded-lg border-[1.5px] border-line bg-white px-2.5 py-0.5 text-xs font-bold text-ink-soft transition hover:border-blue disabled:opacity-40 ${HIT}`}>
                  {busyNo === r.child_no ? '바꾸는 중…' : r.removed ? '되살리기' : '빼기'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
