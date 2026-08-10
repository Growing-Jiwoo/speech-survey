// components/admin/sheet/PageAudio.tsx — 결과지 각 섹션에 인라인으로 붙는 페이지 녹음.
// 채점 대상(낱말 격자·문장)과 같은 줄에 두어, 듣고 바로 O/X를 찍을 수 있게 한다.
// 시도(재녹음)가 여러 개면 전환 버튼을 낸다. 인쇄물에서는 통째로 숨긴다.
'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { fmtDuration } from '@/lib/format'
import { Badge } from '@/components/Badge'
import type { DetailRecording } from '@/hooks/useAdminQueries'

// wavesurfer.js(수십 KB)는 재생기가 실제로 필요할 때만 청크를 받도록 지연 로드.
const AudioPlayer = dynamic(() => import('@/components/AudioPlayer').then(m => m.AudioPlayer), {
  ssr: false,
  loading: () => <div className="h-8 w-full max-w-[240px] animate-pulse rounded-lg bg-well" />,
})

export type Attempt = Pick<DetailRecording, 'attempt_no' | 'url' | 'duration_sec'>

export function PageAudio({ label, attempts, limitSec, onAudioError }: {
  /** 무엇의 녹음인지 (예: '의미 낱말') */
  label: string
  attempts: Attempt[]
  /** 검사지 제한 시간(초). 이 값을 넘는 녹음은 초과분이 채점 대상이 아님을 알린다 */
  limitSec: number
  onAudioError: () => void
}) {
  const [idx, setIdx] = useState(0)

  if (attempts.length === 0) {
    return (
      <div className="flex items-center gap-2.5 print:hidden">
        <span className="text-[13px] font-bold text-ink-soft">{label}</span>
        <Badge tone="rec">미녹음</Badge>
      </div>
    )
  }

  const cur = attempts[Math.min(idx, attempts.length - 1)]
  // 여유 시간(GRACE_SEC)까지는 정상 — 채점 기준(limitSec) 초과만 알린다.
  const over = cur.duration_sec != null && cur.duration_sec > limitSec

  return (
    <div className="flex flex-wrap items-center gap-2.5 print:hidden">
      <span className="text-[13px] font-bold text-ink-soft">{label}</span>
      {attempts.length > 1 && (
        <div className="flex gap-1">
          {attempts.map((a, i) => (
            <button key={a.attempt_no} type="button" aria-pressed={i === idx}
              aria-label={`${label} ${a.attempt_no}번째 시도`}
              onClick={() => setIdx(i)}
              className={`h-8 rounded-md border px-2.5 text-[12.5px] font-bold transition ${
                i === idx ? 'border-blue bg-blue/10 text-blue' : 'border-line bg-well text-ink-mute'}`}>
              #{a.attempt_no}
            </button>
          ))}
        </div>
      )}
      <span className={`font-read text-[12.5px] tabular-nums ${over ? 'font-bold text-amber' : 'text-ink-soft'}`}
        title={over ? `채점 기준(${limitSec}초) 초과분 포함` : undefined}>
        {fmtDuration(cur.duration_sec)}{over && ' !'}
      </span>
      <AudioPlayer src={cur.url} onError={onAudioError} />
    </div>
  )
}
