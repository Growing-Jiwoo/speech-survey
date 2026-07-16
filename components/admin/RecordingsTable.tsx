// components/admin/RecordingsTable.tsx — 결과지의 녹음 문항 표.
// 문항당 모든 시도(재녹음 포함)를 순서대로 보여주고, 시도별 서명 URL 오디오를 재생한다.
'use client'
import dynamic from 'next/dynamic'
import { KIND_LABEL, RECORDING_ITEMS } from '@/lib/items'
import { fmtDuration } from '@/lib/format'
import { Badge } from '@/components/Badge'
import type { DetailRecording } from '@/hooks/useAdminQueries'

// wavesurfer.js(수십 KB)는 재생기가 실제로 필요할 때만 청크를 받도록 지연 로드.
const AudioPlayer = dynamic(() => import('@/components/AudioPlayer').then(m => m.AudioPlayer), {
  ssr: false,
  loading: () => <div className="h-8 w-full max-w-[280px] animate-pulse rounded-lg bg-well" />,
})

export type RecordingsByItem = Map<string, Pick<DetailRecording, 'attempt_no' | 'url' | 'duration_sec'>[]>

export function RecordingsTable({ byItem, onAudioError }: {
  /** item_code → 시도 목록(attempt_no 오름차순) */
  byItem: RecordingsByItem
  /** 서명 URL 만료 등 재생 실패 시 상위에서 데이터를 다시 받아오게 한다 */
  onAudioError: () => void
}) {
  return (
    // 좁은 화면(태블릿 세로)에서는 표를 가로 스크롤로 살린다 — 카드의 overflow-hidden에 눌리지 않도록.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs text-ink-mute">
            <th scope="col" className="w-11 px-5 py-3 font-medium">#</th>
            <th scope="col" className="w-24 px-3 font-medium">구분</th>
            <th scope="col" className="px-3 font-medium">제시어</th>
            <th scope="col" className="w-14 px-3 font-medium">시도</th>
            <th scope="col" className="w-20 px-3 font-medium">길이</th>
            <th scope="col" className="w-72 px-3 pr-5 font-medium">듣기</th>
          </tr>
        </thead>
        <tbody>
          {RECORDING_ITEMS.flatMap(item => {
            const label = item.section === 'word_reading'
              ? `낱말 (${KIND_LABEL[item.kind!]})` : '문장'
            const views = byItem.get(item.code) ?? []
            if (views.length === 0) return [(
              <tr key={item.code} className="border-t border-line/60 bg-rec/5">
                <td className="px-5 py-3 text-ink-mute">{item.orderNo}</td>
                <td className="px-3 text-xs text-ink-mute">{label}</td>
                <td className="px-3 font-read whitespace-pre-line break-keep">{item.text}</td>
                <td className="px-3">—</td>
                <td className="px-3 text-ink-mute">—</td>
                <td className="px-3 pr-5"><Badge tone="rec">미녹음</Badge></td>
              </tr>
            )]
            return views.map((v, i) => {
              const over = v.duration_sec != null && v.duration_sec > item.maxSec
              return (
                // 같은 문항의 2번째 시도부터는 번호·구분·제시어를 비워 시각적으로 묶는다
                <tr key={`${item.code}-${v.attempt_no}`} className={i === 0 ? 'border-t border-line/60' : ''}>
                  <td className="px-5 py-3 text-ink-mute">{i === 0 ? item.orderNo : ''}</td>
                  <td className="px-3 text-xs text-ink-mute">{i === 0 ? label : ''}</td>
                  <td className="px-3 font-read whitespace-pre-line break-keep">{i === 0 ? item.text : ''}</td>
                  <td className="px-3 text-ink-mute">{views.length > 1 ? `#${v.attempt_no}` : ''}</td>
                  <td className={`px-3 font-read text-[12px] tabular-nums ${over ? 'font-bold text-amber' : 'text-ink-soft'}`}
                    title={over ? `제한(${item.maxSec}초) 초과` : undefined}>
                    {fmtDuration(v.duration_sec)}{over && ' !'}
                  </td>
                  <td className="px-3 py-2 pr-5">
                    <AudioPlayer src={v.url} onError={onAudioError} />
                  </td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
    </div>
  )
}
