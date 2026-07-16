// components/survey/RetryBanner.tsx — 업로드 실패 녹음 재시도 배너.
// 실패한 녹음은 문항을 이동해도 사라지지 않고 여기 남아 다시 저장할 수 있다.
'use client'
import { useState } from 'react'
import { itemByCode } from '@/lib/items'
import { Spinner } from '@/components/Spinner'

export function RetryBanner({ codes, onRetry }: {
  /** 저장 실패 상태인 문항 코드 목록 */
  codes: string[]
  /** 재시도 실행(성공 여부와 무관하게 resolve — 성공 시 부모가 codes에서 제거) */
  onRetry: (code: string) => Promise<void>
}) {
  // 재시도 진행 중인 코드 — 버튼 연타로 같은 attemptNo가 중복 업로드되는 것을 막는다
  const [retrying, setRetrying] = useState<Set<string>>(new Set())

  if (codes.length === 0) return null

  async function retry(code: string) {
    if (retrying.has(code)) return
    setRetrying(prev => new Set(prev).add(code))
    try { await onRetry(code) }
    finally {
      setRetrying(prev => { const next = new Set(prev); next.delete(code); return next })
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-[14px] border border-rec/30 bg-rec/5 p-3">
      {codes.map(code => {
        const busy = retrying.has(code)
        return (
          <div key={code} className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-soft">
              <b className="text-rec-deep">{itemByCode.get(code)?.orderNo}번</b> 문항 저장에 실패했어요
            </p>
            <button onClick={() => retry(code)} disabled={busy}
              className="flex flex-none items-center gap-1.5 rounded-lg bg-rec-deep px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
              {busy && <Spinner className="h-3 w-3" />}
              {busy ? '저장 중…' : '다시 저장'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
