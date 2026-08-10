// components/admin/sheet/TaskSection.tsx — 과제(낱말 해독 / 문장 읽기유창성 / 쓰기) 한 덩어리.
//
// 과제 사이를 얇은 실선 하나로만 나눴더니 채점표 끝과 다음 과제 시작이 붙어 보였다.
// 페이지 배경색으로 두꺼운 띠를 넣어 "여기서 한 과제가 끝난다"를 눈으로 끊고, 제목은
// 연한 배경 밴드에 얹어 그 아래 그룹 머리(의미/무의미)와 위계가 구분되게 한다.
//   과제 제목  = 페이지 배경색 밴드 + 16px 굵게 (위 띠와 같은 색이라 하나의 구분 영역으로 읽힌다)
//   그룹 머리  = 흰 배경 + 14px 굵게 (WordScoreRows의 sticky 바)
// bg-well(#F7F9FE)은 흰색과 거의 구분되지 않아 밴드 구실을 못 했다 — bg(#F4F6FB)를 쓴다.
import type { ReactNode } from 'react'

export function TaskSection({ title, hint, children }: {
  title: string
  /** 채점 기준 한 줄 (예: '30초 동안 정확하게 읽은 낱말 수') */
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="border-t-[10px] border-bg">
      {/* 가운데 정렬 — 화면이 넓어지면 왼쪽 끝에 붙은 제목이 아래 채점표와 멀어져
          장(章) 머리 구실을 못 한다. 띠 한가운데 두면 폭과 무관하게 구분점으로 읽힌다. */}
      <h2 className="flex flex-wrap items-baseline justify-center gap-x-2.5 bg-bg px-4 py-3 text-center">
        <span className="text-[16px] font-bold">{title}</span>
        {hint && <span className="text-[12px] text-ink-mute">{hint}</span>}
      </h2>
      {children}
    </section>
  )
}
