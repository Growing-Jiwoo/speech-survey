// components/admin/sheet/ScanViewer.tsx — 쓰기 기록지 스캔본 보기(확대·축소·회전·새 창에서 보기).
// 스캔본 방식 검사에서 담당자가 이 그림을 보며 옆의 쓰기 칸을 채점한다(사용자 확정 2026-09-30).
// 거꾸로 스캔된 쪽·옆으로 누운 사진이 흔해 회전을 둔다. 돌려도 스크롤이 잘리지 않게, 감싸는 상자가
// **돌린 모양**의 가로세로를 차지한다(그림은 그 한가운데에서 돈다).
'use client'
import { useRef, useState } from 'react'

const ZOOMS = [50, 75, 100, 125, 150, 200, 300]
const DEFAULT_ZOOM = ZOOMS.indexOf(100)
/** 그림이 오기 전 자리 — A4 세로(기록지) */
const A4_RATIO = 210 / 297

/** 그림을 못 불러왔을 때 스스로 상세를 다시 받는 횟수 — 링크가 만료된 경우는 한 번이면 풀린다. 계속 실패하면
 *  (연결이 끊김) 되풀이하지 않고 안내만 남긴다 */
const MAX_AUTO_REFRESH = 2

export function ScanViewer({ url, alt, onExpired }: {
  url: string; alt: string
  /** 그림을 못 불러왔다 — 상위가 상세를 다시 받아 새 서명 URL을 준다(녹음 플레이어의 onError와 같은 복구) */
  onExpired?: () => void
}) {
  const [zi, setZi] = useState(DEFAULT_ZOOM)
  const [rot, setRot] = useState(0)
  const [ratio, setRatio] = useState(A4_RATIO)
  // 서명 URL은 1시간만 열린다 — 오래 열어 둔 결과지에서 그림이 깨지면 이유와 할 일을 보인다
  const [broken, setBroken] = useState(false)
  const refreshes = useRef(0)
  const quarter = rot % 180 !== 0
  const btn = 'h-8 min-w-8 rounded-lg border border-line bg-white px-2 text-[13px] font-bold text-ink-soft transition hover:border-blue disabled:opacity-40'
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-well">
      <div role="toolbar" aria-label="스캔본 보기" className="flex flex-wrap items-center gap-1.5 border-b border-line bg-white px-2.5 py-1.5">
        <button type="button" className={btn} aria-label="축소" disabled={zi === 0} onClick={() => setZi(i => i - 1)}>−</button>
        <span aria-live="polite" className="w-12 text-center text-[12.5px] font-bold tabular-nums text-ink-soft">{ZOOMS[zi]}%</span>
        <button type="button" className={btn} aria-label="확대" disabled={zi === ZOOMS.length - 1} onClick={() => setZi(i => i + 1)}>+</button>
        <button type="button" className={btn} onClick={() => setRot(r => (r + 90) % 360)}>↻ 회전</button>
        <a href={url} target="_blank" rel="noopener noreferrer" className={`${btn} ml-auto inline-flex items-center`}>새 창에서 보기</a>
      </div>
      {broken && (
        <p role="alert" className="border-b border-line bg-rec/5 px-3 py-2 text-[12.5px] text-rec-deep">
          스캔본을 불러오지 못했어요. 결과지를 새로 열어 주세요. 보기 링크는 1시간 동안만 열려요.
        </p>
      )}
      <div className="max-h-[78vh] overflow-auto p-3">
        <div className="relative mx-auto" style={{ width: `${ZOOMS[zi]}%`, aspectRatio: String(quarter ? 1 / ratio : ratio) }}>
          {/* 서명 URL(1시간)이라 next/image 최적화 대상이 아니다 — 원본 그대로 보여 준다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt}
            onError={() => { setBroken(true); if (refreshes.current < MAX_AUTO_REFRESH) { refreshes.current++; onExpired?.() } }}
            onLoad={e => { setBroken(false); const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight) }}
            className="absolute left-1/2 top-1/2 max-w-none bg-white shadow-sm"
            // 90°·270°면 그림의 세로가 상자의 가로가 된다 — 너비를 상자 너비 × (가로/세로)로 준다
            style={{ width: quarter ? `${ratio * 100}%` : '100%', transform: `translate(-50%, -50%) rotate(${rot}deg)` }} />
        </div>
      </div>
    </div>
  )
}
