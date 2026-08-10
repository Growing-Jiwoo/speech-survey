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
  const [idx, setIdx] = useState(0)

  if (attempts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 print:hidden">
        {label && <span className="text-[13px] font-bold text-ink-soft">{label}</span>}
        <Badge tone="rec">미녹음</Badge>
      </div>
    )
  }

  const cur = attempts[Math.min(idx, attempts.length - 1)]
  // 여유 시간(GRACE_SEC)까지는 정상 — 채점 기준(limitSec) 초과만 알린다.
  const over = cur.duration_sec != null && cur.duration_sec > limitSec

  return (
    <div className="flex flex-wrap items-center gap-2.5 print:hidden">
      {label && <span className="text-[13px] font-bold text-ink-soft">{label}</span>}
      {attempts.length > 1 && (
        <div className="flex gap-1">
          {attempts.map((a, i) => (
            <button key={a.attempt_no} type="button" aria-pressed={i === idx}
              aria-label={`${label ?? '녹음'} ${a.attempt_no}번째 시도`}
              onClick={() => setIdx(i)}
              className={`h-8 rounded-md border px-2.5 text-[12.5px] font-bold transition ${
                i === idx ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-mute'}`}>
              #{a.attempt_no}
            </button>
          ))}
        </div>
      )}
      <AudioPlayer src={cur.url} durationSec={cur.duration_sec} onError={onAudioError} />
      {over && <Badge tone="amber" size="sm">{limitSec}초 초과</Badge>}
    </div>
  )
}
