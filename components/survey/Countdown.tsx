// components/survey/Countdown.tsx — "준비… 3·2·1·시작!" 시작 신호.
// 종이 검사에서 검사자가 "시작!"과 동시에 초시계를 누르는 동작을 그대로 옮긴 것.
// 버튼을 누르는 즉시 제한 시간이 흐르면 아동이 화면을 파악하는 몇 초가 그대로 점수 손실이 된다.
'use client'
import { useEffect, useRef, useState } from 'react'

export const COUNTDOWN_FROM = 3

export function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(COUNTDOWN_FROM)
  // 최신 콜백 유지(latest-ref) — onDone의 참조가 바뀌어도 진행 중인 1초 타이머가 리셋되지 않는다
  // (hooks/useRecorder.ts와 같은 패턴).
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })
  // 중복 호출 방지: 0에 도달하는 순간 정확히 한 번만 시작한다.
  const fired = useRef(false)

  useEffect(() => {
    if (n > 0) {
      const t = setTimeout(() => setN(v => v - 1), 1000)
      return () => clearTimeout(t)
    }
    if (!fired.current) { fired.current = true; onDoneRef.current() }
  }, [n])

  return (
    // RecordingItem.tsx와 같은 이유로 매초 바뀌는 숫자에는 aria-live를 붙이지 않는다(낭독 스팸 방지).
    // 화면판독기에는 "카운트다운 시작" 1회(polite)와, 녹음이 실제로 시작되는 "시작!" 1회(alert)만 들려준다.
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm font-bold text-ink-soft" aria-live="polite">
        {n > 0 ? '준비하세요' : null}
      </p>
      {/* 매초 key가 바뀌며 리마운트돼 확대 애니메이션이 다시 재생된다. (시각 전용, 낭독 안 됨) */}
      <p key={n} className="font-read text-[88px] font-bold leading-none text-blue motion-safe:animate-[ping_0.35s_ease-out_1] lg:text-[120px]">
        {n > 0 ? n : '시작!'}
      </p>
      {/* role="alert"는 등장하는 순간 자동으로 강하게(assertive) 낭독된다 — 녹음 시작 신호이므로 한 번만. */}
      {n <= 0 && <span role="alert" className="sr-only">시작!</span>}
    </div>
  )
}
