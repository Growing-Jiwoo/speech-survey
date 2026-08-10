// components/admin/BadgeLegend.tsx — 화면에 쓰인 배지가 무엇을 뜻하는지 적어 두는 범례.
//
// 관리자 화면의 배지 중 두 개는 이름만으로 알 수 없다:
//  · "채점 전"        — 실시하지 않은 과제와 아직 채점하지 않은 과제를 겸한다. 0점이 아니다.
//  · "제출 · 미완료 있음" — 중단 규칙대로 끝난 검사는 여기 걸리지 않는다는 게 드러나지 않는다.
// 오독하면 치르지도 않은 과제에서 낙제한 아동으로 읽히므로, 화면에 상시 둔다.
//
// 한 줄로 이어 붙이지 않는다 — 배지와 설명이 뒤섞이면 어디까지가 한 항목인지 읽히지 않는다.
// 항목마다 한 행, 배지는 왼쪽에 세로로 맞춰 눈이 배지 열만 훑어도 찾게 한다.
import { Fragment, type ReactNode } from 'react'

export function BadgeLegend({ title = '표시 읽는 법', items, note, columns = 2 }: {
  title?: string
  items: { badge: ReactNode; desc: ReactNode }[]
  /** 배지로는 설명되지 않는 보충 (예: 진행률 분모 기준) */
  note?: ReactNode
  /**
   * 넓은 화면에서의 열 수. 설명이 한 문장이면 2열이 좋고(세로로 길어지지 않는다),
   * 여러 문장이면 1열이라야 한다 — 2열로 쪼개면 폭이 반으로 줄어 한 항목이 대여섯 줄로 접힌다.
   */
  columns?: 1 | 2
}) {
  return (
    <div className="border-t border-line bg-well px-4 py-3.5">
      <p className="text-[12.5px] font-bold text-ink-soft">{title}</p>
      {/* 넓은 화면에서 2열 — 항목이 3~4개라 한 열로 두면 세로로 길어지기만 한다.
          배지 열을 dl 전체가 공유하는 auto 트랙으로 둬야(항목마다 별도 grid로 두지 않고)
          배지 폭이 제각각이어도 설명의 왼쪽 끝이 한 줄로 맞는다 — 눈이 설명 열만 훑을 수 있다. */}
      <dl className={`mt-2 grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-2 ${
        columns === 2 ? 'sm:grid-cols-[auto_1fr_auto_1fr]' : ''}`}>
        {items.map((it, i) => (
          <Fragment key={i}>
            <dt>{it.badge}</dt>
            <dd className={`text-[12.5px] leading-relaxed text-ink-soft ${columns === 2 ? 'sm:mr-6' : ''}`}>
              {it.desc}
            </dd>
          </Fragment>
        ))}
      </dl>
      {note && <p className="mt-2.5 text-[12px] leading-relaxed text-ink-soft">{note}</p>}
    </div>
  )
}
