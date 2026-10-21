// hooks/useOtherTabGuard.ts — 같은 컴퓨터의 다른 탭이 **다른 아이**의 검사를 시작했는지, **같은 아이**의 검사를 열었는지 본다.
// 진행 상태는 localStorage에 「마지막 세션」 하나로 이어진다(lib/survey-state LAST_KEY). 탭 두 개로 두 아이를
// 진행하면 검토 화면은 마지막에 저장된 아이를 읽어, 선생님이 A를 검토한다고 믿고 B(미완료)를 제출할 수 있다.
// storage 이벤트는 **다른 탭의 변경에만** 오므로, 내 세션이 아닌 id로 바뀌면 이 탭을 막는다(사용자 확정 2026-10-01).
//
// 같은 아이를 두 탭에서 열어도 막는다(2026-10-12 점검). 두 탭이 각자 시도 번호를 매겨 같은 페이지 녹음이 서로를 덮었고,
// 한 탭이 제출한 뒤 다른 탭에서 녹음하면 제출된 아이의 이름·토큰이 이 컴퓨터에 다시 저장돼 시작 화면이 이어하기를 권했다.
// 새로 연 탭이 이기고(다른 아이 규칙과 같다) 먼저 열려 있던 탭을 막는다. 탭 사이 알림은 BroadcastChannel이다 — 같은 탭의
// 검사 ↔ 검토 화면 이동은 막지 않도록 탭마다 id를 붙인다(같은 탭 안의 다른 채널 객체에도 메시지가 가기 때문).
'use client'
import { useEffect, useState } from 'react'
import { LAST_KEY } from '@/lib/survey-state'

/** 이 탭(문서)의 id — 화면을 옮겨도(같은 탭) 같고, 다른 탭과는 다르다 */
const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random())
const CHANNEL = 'kodys-survey-tabs'

export type OtherTab = false | 'otherChild' | 'sameChild'

export function useOtherTabGuard(sessionId: string | undefined): OtherTab {
  const [blocked, setBlocked] = useState<OtherTab>(false)
  useEffect(() => {
    if (!sessionId) return
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_KEY && e.newValue && e.newValue !== sessionId) setBlocked('otherChild')
    }
    window.addEventListener('storage', onStorage)
    let ch: BroadcastChannel | null = null
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(CHANNEL)
      ch.onmessage = (e: MessageEvent<{ type?: string; sessionId?: string; tab?: string }>) => {
        if (e.data?.type === 'open' && e.data.sessionId === sessionId && e.data.tab !== TAB_ID) setBlocked('sameChild')
      }
      ch.postMessage({ type: 'open', sessionId, tab: TAB_ID })
    }
    return () => { window.removeEventListener('storage', onStorage); ch?.close() }
  }, [sessionId])
  return blocked
}

/** 막힌 탭에 덮는 안내 — 두 화면(검사·검토)이 같은 말을 한다. */
export function OtherTabNotice({ kind = 'otherChild' }: { kind?: Exclude<OtherTab, false> }) {
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="other-tab-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/60 p-6">
      <div className="card max-w-sm p-6 text-center">
        <p id="other-tab-title" className="text-lg font-bold">
          {kind === 'sameChild' ? '이 학생의 검사를 다른 탭에서 열었어요' : '다른 탭에서 다른 학생의 검사가 시작됐어요'}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {kind === 'sameChild'
            ? <>한 학생의 검사는 한 탭에서만 할 수 있어요. <b className="text-ink">이 탭은 닫고</b>, 새로 연 탭에서 이어 주세요.</>
            // 「컴퓨터」가 아니라 「기기」 — 태블릿으로도 검사한다(사용자 확정 2026-10-21)
            : <>한 기기에서는 한 번에 한 학생만 검사할 수 있어요. <b className="text-ink">이 탭은 닫고</b>, 새로 시작한 탭에서
              이어 주세요. 이 탭의 학생을 다시 검사하려면 그 검사가 끝난 뒤 시작 화면에서 다시 골라 주세요.</>}
          {/* 녹음 중에 막혔다면 그 시도는 저장되지 않았다(useRecorder — 화면을 떠난 녹음은 버린다) */}
          <span className="mt-2 block text-[12.5px] text-ink-mute">녹음 중이었다면 그 녹음은 저장되지 않았어요.</span>
        </p>
      </div>
    </div>
  )
}
