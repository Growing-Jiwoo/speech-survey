// components/admin/sheet/PageAudio.tsx — 결과지 각 과제에 붙는 페이지 녹음 재생기.
// 채점 대상(낱말 행·문장)과 같은 자리에 두어, 듣고 바로 O/X·어절 수를 찍을 수 있게 한다.
// 시도(재녹음)가 여러 개면 전환 칩을 낸다. 인쇄물에서는 통째로 숨긴다.
//
// 길이는 여기서 찍지 않고 AudioPlayer에 넘긴다 — 예전에는 이 줄에 `0:02`를, 플레이어가
// 다시 `0:00/0:02`를 찍어 같은 숫자가 두 번 나왔다. 제한 시간 초과만 별도 배지로 알린다.
'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Badge } from '@/components/Badge'
import type { DetailRecording } from '@/hooks/useAdminQueries'

// wavesurfer.js(수십 KB)는 재생기가 실제로 필요할 때만 청크를 받도록 지연 로드.
const AudioPlayer = dynamic(() => import('@/components/AudioPlayer').then(m => m.AudioPlayer), {
  ssr: false,
  loading: () => <div className="h-10 w-full max-w-[420px] animate-pulse rounded-lg bg-well" />,
})

export type Attempt = Pick<DetailRecording, 'attempt_no' | 'url' | 'duration_sec'>

export function PageAudio({ label, attempts, limitSec, onAudioError }: {
  /** 무엇의 녹음인지 (예: '의미 낱말'). 문장처럼 바로 옆에 문항이 적혀 있으면 생략한다 */
  label?: string
  attempts: Attempt[]
  /** 검사지 제한 시간(초). 이 값을 넘는 녹음은 초과분이 채점 대상이 아님을 알린다 */
  limitSec: number
  onAudioError: () => void
}) {
  // 기본 재생은 **마지막 차수**(사용자 확정 2026-09-22 — 담당자 회신이 아니라 표시 기본값이다).
  // 일시정지가 녹음 중에도 눌리게 된 뒤(PR #68) 잘린 1차가 흔해졌다 — 1차를 기본으로 두면 채점자가
  // 칩을 안 누른 채 잘린 소리로 채점한다. "아직 고르지 않음"을 null로 두어 attempts가 나중에 늘어도
  // 최신을 가리키게 한다. 채점자가 고른 뒤에는 그 선택을 유지한다.
  const [idx, setIdx] = useState<number | null>(null)

  if (attempts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 print:hidden">
        {label && <span className="text-[14px] font-bold text-ink">{label}</span>}
        <Badge tone="rec">미녹음</Badge>
      </div>
    )
  }

  const curIdx = idx === null ? attempts.length - 1 : Math.min(idx, attempts.length - 1)
  const cur = attempts[curIdx]
  // 여유 시간(GRACE_SEC)까지는 정상 — 채점 기준(limitSec) 초과만 알린다.
  const over = cur.duration_sec != null && cur.duration_sec > limitSec

  return (
    <div className="flex flex-wrap items-center gap-2.5 print:hidden">
      {label && <span className="text-[14px] font-bold text-ink">{label}</span>}
      {/* 재녹음이 있을 때만 나온다. '#1'은 무슨 번호인지 안 읽혀서 '1차'로 쓴다. */}
      {attempts.length > 1 && (
        <div className="flex items-center gap-1">
          <span className="mr-0.5 text-[12px] text-ink-mute">재녹음</span>
          {attempts.map((a, i) => (
            <button key={a.attempt_no} type="button" aria-pressed={i === curIdx}
              aria-label={`${label ?? '녹음'} ${a.attempt_no}번째 시도`}
              onClick={() => setIdx(i)}
              className={`h-8 rounded-md border px-2.5 text-[12.5px] font-bold transition ${
                i === curIdx ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-mute'}`}>
              {a.attempt_no}차
            </button>
          ))}
        </div>
      )}
      <AudioPlayer src={cur.url} durationSec={cur.duration_sec} onError={onAudioError} />
      {over && <Badge tone="amber" size="sm">{limitSec}초 초과</Badge>}
    </div>
  )
}
