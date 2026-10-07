// hooks/useOtherTabGuard.ts — 같은 컴퓨터의 다른 탭이 **다른 아이**의 검사를 시작했는지 본다.
// 진행 상태는 localStorage에 「마지막 세션」 하나로 이어진다(lib/survey-state LAST_KEY). 탭 두 개로 두 아이를
// 진행하면 검토 화면은 마지막에 저장된 아이를 읽어, 선생님이 A를 검토한다고 믿고 B(미완료)를 제출할 수 있다.
// storage 이벤트는 **다른 탭의 변경에만** 오므로, 내 세션이 아닌 id로 바뀌면 이 탭을 막는다(사용자 확정 2026-10-01).
'use client'
import { useEffect, useState } from 'react'
import { LAST_KEY } from '@/lib/survey-state'

export function useOtherTabGuard(sessionId: string | undefined): boolean {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (!sessionId) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_KEY && e.newValue && e.newValue !== sessionId) setBlocked(true)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [sessionId])
  return blocked
}

/** 막힌 탭에 덮는 안내 — 두 화면(검사·검토)이 같은 말을 한다. */
export function OtherTabNotice() {
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="other-tab-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/60 p-6">
      <div className="card max-w-sm p-6 text-center">
        <p id="other-tab-title" className="text-lg font-bold">다른 탭에서 다른 학생의 검사가 시작됐어요</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          한 컴퓨터에서는 한 번에 한 학생만 검사할 수 있어요. <b className="text-ink">이 탭은 닫고</b>, 새로 시작한 탭에서
          이어 주세요. 이 탭의 학생을 다시 검사하려면 그 검사가 끝난 뒤 시작 화면에서 다시 골라 주세요.
        </p>
      </div>
    </div>
  )
}
