// components/admin/BadgeLegend.tsx — 화면에 쓰인 배지가 무엇을 뜻하는지 적어 두는 범례.
//
// 관리자 화면의 배지 중 "채점 전"은 이름만으로 알 수 없다 — 아직 채점하지 않았다는 뜻이지
// 0점이 아니다. 오독하면 치르지도 않은 과제에서 낙제한 아동으로 읽히므로 **이 한 줄은 상시** 보인다.
// 나머지 설명은 접어 둔다(사용자 확정 2026-10-27, A안) — 배지마다 말풍선(Tip)이 같은 문장을 보여 주고, 범례는
// 목록 맨 아래라 행이 많으면 어차피 끝까지 내려가야 보였다. 펼친 범례는 처음 쓰는 사람이 한 번에 훑어보는 용도다.
//
// 한 줄로 이어 붙이지 않는다 — 배지와 설명이 뒤섞이면 어디까지가 한 항목인지 읽히지 않는다.
// 항목마다 한 행, 배지는 왼쪽에 세로로 맞춰 눈이 배지 열만 훑어도 찾게 한다.
// 제목(「표시 읽는 법」·「상태 읽는 법」)은 두지 않는다 — 담당자 요청(2026-10-22, 사용자 전달) 「그 텍스트가 없어도 이해가 잘
// 되도록 구성되어 있어서」.
import { Fragment, type ReactNode } from 'react'
import { Badge } from '@/components/Badge'

// 배지 칸 고정 폭 — 윗줄과 목록이 같은 선에서 설명을 시작하게(아래 dl 주석)
const BADGE_COL = 'grid-cols-[10rem_1fr] sm:grid-cols-[10rem_1fr_auto]'
const DL_COLS_1 = 'grid-cols-[10rem_1fr]'
const DL_COLS_2 = 'grid-cols-[10rem_1fr] sm:grid-cols-[10rem_1fr_10rem_1fr]'

export function BadgeLegend({ items, note, columns = 2 }: {
  items: { badge: ReactNode; desc: ReactNode }[]
  /** 배지로는 설명되지 않는 보충 (예: 진행률 분모 기준) — 펼쳤을 때만 보인다 */
  note?: ReactNode
  /**
   * 넓은 화면에서의 열 수. 설명이 한 문장이면 2열이 좋고(세로로 길어지지 않는다),
   * 여러 문장이면 1열이라야 한다 — 2열로 쪼개면 폭이 반으로 줄어 한 항목이 대여섯 줄로 접힌다.
   */
  columns?: 1 | 2
}) {
  return (
    <details className="group border-t border-line bg-well px-4 py-3">
      {/* 접힌 줄 — 「채점 전」 오독 방지 문장은 여기 있어 늘 보인다. 아래 항목과 **같은 두 칸**(배지 | 설명)이다 — 문장 속에
          배지를 넣으면 설명 시작이 아래 항목들과 어긋나고, 배지와 떨어진 설명이 「은 …」으로 시작해 어색했다(사용자 확정 2026-10-27).
          이 줄은 접었을 때와 펼쳤을 때 똑같다(화살표만 뒤집힌다) — 펼칠 때마다 윗줄 문구가 바뀌면 화면이 휙 바뀌어 보였다 */}
      <summary className={`grid cursor-pointer list-none items-baseline gap-x-4 gap-y-1 text-[12.5px] leading-[1.7] text-ink-soft
        [&::-webkit-details-marker]:hidden ${BADGE_COL}`}>
        <span><Badge tone="mute">채점 전</Badge></span>
        {/* 「마우스를 올리면 뜻이 보여요」 같은 사용법 안내는 두지 않는다 — 이 줄은 「채점 전」 오독을 막는 자리이고,
            배지 위 커서(cursor-help)가 설명이 있다는 것을 알린다(사용자 확정 2026-10-27) */}
        <span>아직 채점하지 않았어요. <b className="text-rec-deep">0점이 아니에요.</b></span>
        <span className="col-start-2 whitespace-nowrap font-bold text-blue sm:col-start-auto">
          배지 설명 <span aria-hidden className="inline-block transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      {/* 넓은 화면에서 2열 — 항목이 3~4개라 한 열로 두면 세로로 길어지기만 한다.
          배지 칸은 고정 폭(BADGE_COL)이다 — 윗줄(summary)과 이 목록은 다른 grid라 auto로 두면 폭이 따로 잡혀 설명의 왼쪽 끝이
          어긋난다. 고정 폭이면 윗줄·목록·보충 설명의 시작이 한 줄로 맞는다. 가장 넓은 배지(양호·주의·위험 셋)가 들어가는 폭이다.
          항목 사이는 줄 사이보다 넉넉히(gap-y-4) — 여러 줄 설명이 다음 항목과 붙어 한 덩어리로 읽혔다 */}
      <dl className={`mt-4 grid items-baseline gap-x-4 gap-y-4 ${columns === 2 ? DL_COLS_2 : DL_COLS_1}`}>
        {items.map((it, i) => (
          <Fragment key={i}>
            <dt>{it.badge}</dt>
            <dd className={`text-[12.5px] leading-[1.7] text-ink-soft ${columns === 2 ? 'sm:mr-8' : ''}`}>
              {it.desc}
            </dd>
          </Fragment>
        ))}
      </dl>
      {/* 보충은 선으로 끊어 따로 두되, 시작은 설명 칸에 맞춘다(배지 칸 10rem + 사이 1rem) */}
      {note && <p className="mt-4 border-t border-line pt-3 pl-[11rem] text-[12px] leading-[1.7] text-ink-mute">{note}</p>}
    </details>
  )
}
